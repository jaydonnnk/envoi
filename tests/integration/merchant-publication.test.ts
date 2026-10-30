import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import * as schema from "@/lib/db/schema";
import { approveEnrollment } from "@/operator/cli";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type PublicationCheck } from "../support/publication";
import { anonymousCookie } from "../support/session";
import { waitFor } from "../support/wait";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// S7: a merchant's own shop is published through the four preconditions, buyers keep the confirmed
// menu until republication, and a review pinned to a replaced revision or a changed destination
// fails at paypal/start. Real route handlers run as envoi_web against a migrated disposable
// database; PayPal is the labeled FIXTURE fake.
describe("merchant destination and publication", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    publicMenu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
  };
  let api: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("publication");
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      publicMenu: await import("@/app/api/v1/outlets/[id]/menu/route"),
    };
    api = shopApi(fixture.database, routes);
    fake = createFakePayPal();
    paypal.client = fake.client;
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const pointerOf = async (outletId: string) =>
    (await fixture.database.admin<{ published: string | null }[]>`select published_menu_revision_id as published from outlets where id = ${outletId}`)[0]!.published;

  const publicMenu = async (outletId: string) => {
    const response = await routes.publicMenu.GET(new Request(`http://localhost/api/v1/outlets/${outletId}/menu`), routeParams(outletId));
    return { status: response.status, body: (await response.json()) as { data?: { menuRevisionId: string; items: { id: string; name: string; unitMinor: number }[] } } };
  };

  async function openReview(cookie: string, outletId: string, lines: { menuItemId: string; quantity: number }[]) {
    const response = await routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId, rail: "paypal", lines }));
    return { status: response.status, body: await envelope<{ purchaseId: string }>(response) };
  }

  const start = (cookie: string, purchaseId: string) =>
    routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, cookie), routeParams(purchaseId));

  const attemptsOf = (purchaseId: string) => fixture.database.admin`select id from payment_attempts where purchase_id = ${purchaseId}`;

  // A refused publication answers; a guard that let it through would either switch the pointer or be
  // stopped by the database, which this records as no answer.
  const answer = (pending: Promise<Response>) => pending.catch(() => null);

  it("publication requires all four preconditions", async () => {
    const checks: PublicationCheck[] = ["enrollment", "outlet_details", "menu_confirmation", "destination"];
    for (const omit of checks) {
      const { shop, draft } = await api.readyShop(`omit-${omit.replace("_", "-")}`, omit);

      const refused = await answer(api.publish(shop, draft));
      expect(refused?.status, omit).toBe(400);
      expect((await envelope(refused!)).error, omit).toMatchObject({ code: "validation_failed", details: { reason: "preconditions", missing: omit } });
      expect(await pointerOf(shop.outletId), omit).toBeNull();
      expect((await publicMenu(shop.outletId)).status, omit).toBe(404);

      // Supplying the one missing precondition is enough.
      let current = draft;
      if (omit === "enrollment") await api.approve(shop);
      if (omit === "outlet_details") await api.confirmDetails(shop);
      if (omit === "menu_confirmation") current = await api.confirmDraft(shop, draft);
      if (omit === "destination") await api.acceptConnection(shop);
      expect((await api.publish(shop, current)).status, omit).toBe(200);
      expect(await pointerOf(shop.outletId), omit).toBe(current.revisionId);
    }
  });

  it("editing a published menu creates an unpublished revision", async () => {
    const { shop } = await api.publishedShop("edit-published");
    const before = await publishedItems(fixture.database, shop.outletId);
    const published = await api.getDraft(shop);
    expect(published).toMatchObject({ revisionId: before[0]!.revisionId, published: true, status: "confirmed" });

    const edited = await answer(
      api.putDraft(
        shop,
        published,
        published.items.map((item) => ({ id: item.id, name: item.name, priceMinor: item.name === "FIXTURE Kopi" ? 220 : item.priceMinor })),
      ),
    );
    expect(edited?.status).toBe(200);
    const draft = (await envelope<{ revisionId: string; published: boolean; status: string }>(edited!)).data;
    expect(draft).toMatchObject({ published: false, status: "draft" });
    expect(draft.revisionId).not.toBe(published.revisionId);

    // Buyers still read the previously confirmed revision, at its prices, and are priced from it.
    expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
    const menu = await publicMenu(shop.outletId);
    expect(menu.body.data!.menuRevisionId).toBe(published.revisionId);
    expect(menu.body.data!.items.map((item) => item.unitMinor)).toEqual([180, 400]);
    const buyer = await anonymousCookie(routes.auth.POST);
    const review = await openReview(buyer, shop.outletId, [{ menuItemId: before[0]!.id, quantity: 1 }]);
    expect(review.status).toBe(201);
    const [priced] = await fixture.database.admin`select total_minor, menu_revision_id from purchases where id = ${review.body.data.purchaseId}`;
    expect(priced).toMatchObject({ total_minor: 180, menu_revision_id: published.revisionId });

    // The new revision keeps each item's key, so the same items are the same basket after republication.
    const keys = await fixture.database.admin<{ itemKey: string }[]>`select item_key as "itemKey" from menu_items where menu_revision_id = ${draft.revisionId} order by position`;
    expect(keys.map((row) => row.itemKey)).toEqual(before.map((item) => item.itemKey));
  });

  it("two first edits of a published menu make one draft", async () => {
    const { shop } = await api.publishedShop("edit-concurrent");
    const published = await api.getDraft(shop);
    const priced = (cents: number) => published.items.map((item) => ({ id: item.id, name: item.name, priceMinor: cents }));
    const admin = fixture.database.admin;
    const lockWaiters = async () =>
      (await admin<{ n: number }[]>`select count(*)::int as n from pg_stat_activity where datname = ${fixture.database.name} and wait_event_type = 'Lock'`)[0]!.n;

    // Both saves start from the published menu while no draft exists. Each is held either at its
    // insert of the new revision, which this table lock blocks, or behind the other's outlet lock.
    let saves!: Promise<(Response | null)[]>;
    await admin.begin(async (sql) => {
      await sql`lock table menu_revisions in share mode`;
      saves = Promise.all([answer(api.putDraft(shop, published, priced(200))), answer(api.putDraft(shop, published, priced(210)))]);
      await waitFor(async () => (await lockWaiters()) >= 2, 10_000, "both saves to wait");
    });
    expect((await saves).map((response) => response?.status ?? null).sort()).toEqual([200, 409]);
    const drafts = await admin`select id from menu_revisions where outlet_id = ${shop.outletId} and published_at is null`;
    expect(drafts).toHaveLength(1);
  });

  it("republication invalidates an open review at execution", async () => {
    const { shop } = await api.publishedShop("republish-invalidates");
    const [kopi] = await publishedItems(fixture.database, shop.outletId);
    const buyer = await anonymousCookie(routes.auth.POST);
    const old = await openReview(buyer, shop.outletId, [{ menuItemId: kopi!.id, quantity: 1 }]);
    expect(old.status).toBe(201);

    await api.republish(shop, (items) => items.map((item) => ({ id: item.id, name: item.name, priceMinor: item.name === "FIXTURE Kopi" ? 260 : item.priceMinor })));

    const writesBefore = fake.writes().length;
    const refused = await start(buyer, old.body.data.purchaseId);
    expect(refused.status).toBe(409);
    expect((await envelope(refused)).error).toMatchObject({ code: "review_invalidated", details: { reason: "menu_changed" } });
    expect(await attemptsOf(old.body.data.purchaseId)).toHaveLength(0);
    expect(fake.writes()).toHaveLength(writesBefore);
    const [stored] = await fixture.database.admin`select state from purchases where id = ${old.body.data.purchaseId}`;
    expect(stored!.state).toBe("review_invalidated");

    // Reviewing again prices the republished menu, and that review starts.
    const [newKopi] = await publishedItems(fixture.database, shop.outletId);
    const fresh = await openReview(buyer, shop.outletId, [{ menuItemId: newKopi!.id, quantity: 1 }]);
    expect(fresh.status).toBe(201);
    const [repriced] = await fixture.database.admin`select total_minor from purchases where id = ${fresh.body.data.purchaseId}`;
    expect(repriced!.total_minor).toBe(260);
    expect((await start(buyer, fresh.body.data.purchaseId)).status).toBe(200);
  });

  it("destination change invalidates an open review", async () => {
    const { shop } = await api.publishedShop("destination-change");
    const [kopi] = await publishedItems(fixture.database, shop.outletId);
    const buyer = await anonymousCookie(routes.auth.POST);
    const old = await openReview(buyer, shop.outletId, [{ menuItemId: kopi!.id, quantity: 2 }]);
    expect(old.status).toBe(201);

    // FIXTURE: an operator-side change of the accepted connection. S7 gives no route that changes an
    // accepted destination, so the change is made directly; only its version moves.
    await fixture.database.admin`update payment_destinations set version = version + 1 where outlet_id = ${shop.outletId}`;

    const writesBefore = fake.writes().length;
    const refused = await start(buyer, old.body.data.purchaseId);
    expect(refused.status).toBe(409);
    expect((await envelope(refused)).error).toMatchObject({ code: "review_invalidated", details: { reason: "destination_changed" } });
    expect(await attemptsOf(old.body.data.purchaseId)).toHaveLength(0);
    expect(fake.writes()).toHaveLength(writesBefore);

    const fresh = await openReview(buyer, shop.outletId, [{ menuItemId: kopi!.id, quantity: 2 }]);
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.purchaseId).not.toBe(old.body.data.purchaseId);
    expect((await start(buyer, fresh.body.data.purchaseId)).status).toBe(200);
  });

  it("an open review pinned to a changed destination is replaced, not reused", async () => {
    const { shop } = await api.publishedShop("destination-replace");
    const [kopi] = await publishedItems(fixture.database, shop.outletId);
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = [{ menuItemId: kopi!.id, quantity: 3 }];
    const old = await openReview(buyer, shop.outletId, lines);
    expect(old.status).toBe(201);

    // FIXTURE: an operator-side change of the accepted connection, as above.
    await fixture.database.admin`update payment_destinations set version = version + 1 where outlet_id = ${shop.outletId}`;

    // The same basket reviewed again, before any start, is a new review on the current destination.
    const again = await openReview(buyer, shop.outletId, lines);
    expect(again.status).toBe(201);
    expect(again.body.data.purchaseId).not.toBe(old.body.data.purchaseId);
    const rows = await fixture.database.admin`
      select id, state, destination_version from purchases where id in (${old.body.data.purchaseId}, ${again.body.data.purchaseId}) order by created_at`;
    expect(rows.map((row) => [row.state, row.destination_version])).toEqual([
      ["review_invalidated", 2],
      ["review_open", 3],
    ]);
    expect((await start(buyer, again.body.data.purchaseId)).status).toBe(200);
  });

  it("arbitrary merchant id cannot connect", async () => {
    const shop = await api.newShop("arbitrary-id");
    const destinationRows = () =>
      fixture.database.admin`select seller_merchant_id, status, version, accepted_at, accepted_by_user_id from payment_destinations where outlet_id = ${shop.outletId}`;

    // Before the operator prepares a connection, no seller id connects and nothing is created.
    const unprepared = await api.putConnection(shop, { sellerMerchantId: FIXTURE_SELLER });
    expect(unprepared.status).toBe(400);
    expect((await envelope(unprepared)).error.details).toMatchObject({ reason: "no_prepared_connection" });
    expect(await destinationRows()).toHaveLength(0);

    await api.prepareConnection(shop);
    const before = await destinationRows();
    const pasted = await api.putConnection(shop, { sellerMerchantId: "PASTED2345678", outletId: shop.outletId, status: "active" });
    expect(pasted.status).toBe(400);
    expect((await envelope(pasted)).error).toMatchObject({ code: "validation_failed", details: { reason: "connection_not_assigned" } });
    expect(await destinationRows()).toEqual(before);
    expect(before[0]).toMatchObject({ seller_merchant_id: FIXTURE_SELLER, version: 1, accepted_at: null });

    // The operator-prepared connection is accepted once, raising its version.
    const accepted = await api.putConnection(shop, { sellerMerchantId: FIXTURE_SELLER });
    expect(accepted.status).toBe(200);
    expect((await envelope<{ outlet: { paypal: { accepted: boolean; version: number } } }>(accepted)).data.outlet.paypal).toMatchObject({ accepted: true, version: 2 });
    expect((await api.putConnection(shop, { sellerMerchantId: FIXTURE_SELLER })).status).toBe(200);
    expect((await destinationRows())[0]).toMatchObject({ seller_merchant_id: FIXTURE_SELLER, version: 2, accepted_by_user_id: shop.merchant.userId });
  });

  it("editing shop details clears their confirmation", async () => {
    const shop = await api.newShop("details");
    const confirmedAt = async () =>
      (await fixture.database.admin<{ at: Date | null }[]>`select details_confirmed_at as at from outlets where id = ${shop.outletId}`)[0]!.at;
    expect(await confirmedAt()).toBeNull();
    expect((await api.patchOutlet(shop, { name: "FIXTURE details kopi", area: "Tanjong Pagar", detailsConfirmed: true })).status).toBe(200);
    expect(await confirmedAt()).not.toBeNull();
    const renamed = await api.patchOutlet(shop, { name: "FIXTURE renamed kopi", area: "Tanjong Pagar" });
    expect(renamed.status).toBe(200);
    expect((await envelope<{ outlet: { detailsConfirmed: boolean } }>(renamed)).data.outlet.detailsConfirmed).toBe(false);
    expect(await confirmedAt()).toBeNull();
  });

  it("approve-enrollment approves once and repeats unchanged", async () => {
    const shop = await api.newShop("enrollment");
    const db = drizzle(fixture.database.admin, { schema });
    const first = await approveEnrollment(db, { outletId: shop.outletId, evidenceRef: "FIXTURE: demo authority" });
    expect(first.status).toBe("approved");
    const again = await approveEnrollment(db, { outletId: shop.outletId });
    expect(again).toMatchObject({ status: "unchanged", enrollmentId: first.enrollmentId });
    const rows = await fixture.database.admin`select status, evidence_ref from enrollments where outlet_id = ${shop.outletId}`;
    expect(rows).toEqual([{ status: "approved", evidence_ref: "FIXTURE: demo authority" }]);
    const audits = await fixture.database.admin`select action from audit_events where outlet_id = ${shop.outletId} and action = 'enrollment_approved'`;
    expect(audits).toHaveLength(1);
    // The demo fixture outlet has no enrollment, so there is nothing to approve.
    await expect(approveEnrollment(db, { outletId: fixture.outletId })).rejects.toThrow(/no enrollment/);
  });

  describe("database guards", () => {
    let web: postgres.Sql;

    beforeAll(() => {
      web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
    });

    afterAll(async () => {
      await web?.end({ timeout: 5 });
    });

    // The outcome of one statement as the web role: "ok" or the database's refusal message.
    const outcome = (query: Promise<unknown>) => query.then(() => "ok", (err: Error) => err.message);

    it("a published menu's items refuse every write", async () => {
      const { shop } = await api.publishedShop("items-immutable");
      const before = await publishedItems(fixture.database, shop.outletId);
      const kopi = before[0];
      const refused = /belongs to a published revision/;
      expect(await outcome(web`update menu_items set unit_minor = 1 where id = ${kopi!.id}`)).toMatch(refused);
      expect(await outcome(web`delete from menu_items where id = ${kopi!.id}`)).toMatch(refused);
      expect(await outcome(web`insert into menu_items (id, menu_revision_id, position, name, unit_minor, available) values ('itm_guard_insert', ${kopi!.revisionId}, 9, 'Extra', 100, true)`)).toMatch(refused);
      expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
    });

    it("a published revision refuses every change", async () => {
      const { draft } = await api.publishedShop("revision-immutable");
      const before = await fixture.database.admin`select status, version, confirmed_at from menu_revisions where id = ${draft.revisionId}`;
      // Still confirmed, so no check constraint objects: only the trigger can refuse it.
      expect(await outcome(web`update menu_revisions set version = version + 1, confirmed_at = now() where id = ${draft.revisionId}`)).toMatch(/was published and cannot change/);
      expect(await fixture.database.admin`select status, version, confirmed_at from menu_revisions where id = ${draft.revisionId}`).toEqual(before);
    });

    it("the published pointer names only a confirmed revision of its own outlet", async () => {
      const { shop } = await api.publishedShop("pointer-own");
      const other = await api.readyShop("pointer-other");
      const unconfirmed = await api.readyShop("pointer-unconfirmed", "menu_confirmation");
      const pointer = await pointerOf(shop.outletId);
      const refused = /may only publish a confirmed revision of its own/;
      expect(await outcome(web`update outlets set published_menu_revision_id = ${other.draft.revisionId} where id = ${shop.outletId}`)).toMatch(refused);
      expect(await outcome(web`update outlets set published_menu_revision_id = ${unconfirmed.draft.revisionId} where id = ${unconfirmed.shop.outletId}`)).toMatch(refused);
      expect(await pointerOf(shop.outletId)).toBe(pointer);
      expect(await pointerOf(unconfirmed.shop.outletId)).toBeNull();
    });

    it("a temporary table cannot shadow the published-menu guard", async () => {
      const { shop } = await api.publishedShop("temp-shadow");
      const before = await publishedItems(fixture.database, shop.outletId);
      // The web role holds TEMP on the database, and pg_temp comes first in its search path.
      await web`create temp table menu_revisions (id text, published_at timestamptz)`;
      try {
        expect(await outcome(web`update menu_items set unit_minor = 1 where id = ${before[0]!.id}`)).toMatch(/belongs to a published revision/);
      } finally {
        await web`drop table pg_temp.menu_revisions`;
      }
      expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
    });

    it("a published pointer is never cleared", async () => {
      const { shop } = await api.publishedShop("pointer-clear");
      const pointer = await pointerOf(shop.outletId);
      expect(await outcome(web`update outlets set published_menu_revision_id = null where id = ${shop.outletId}`)).toMatch(/cannot be unpublished/);
      expect(await pointerOf(shop.outletId)).toBe(pointer);
    });

    it("a published revision is never deleted", async () => {
      // Only the table owner may delete a revision, and a revision with items is also held by their
      // foreign key, so this published revision has none: only the trigger can refuse its deletion.
      const { shop, draft } = await api.publishedShop("revision-delete");
      const admin = fixture.database.admin;
      const empty = `mrv_guard_delete_${shop.outletId}`;
      await admin`insert into menu_revisions (id, outlet_id, status, version, confirmed_at) values (${empty}, ${shop.outletId}, 'confirmed', 1, now())`;
      await admin`update outlets set published_menu_revision_id = ${empty} where id = ${shop.outletId}`;
      await admin`update outlets set published_menu_revision_id = ${draft.revisionId} where id = ${shop.outletId}`;
      expect(await outcome(admin`delete from menu_revisions where id = ${empty}`)).toMatch(/was published and cannot change/);
      expect(await admin`select published_at is not null as published from menu_revisions where id = ${empty}`).toEqual([{ published: true }]);
    });

    it("a bound membership is never rebound", async () => {
      const shop = await api.newShop("bound");
      const [membership] = await fixture.database.admin<{ id: string }[]>`select id from merchant_memberships where user_id = ${shop.merchant.userId}`;
      expect(await outcome(web`update merchant_memberships set outlet_id = ${fixture.outletId} where id = ${membership!.id}`)).toMatch(/already bound to an outlet/);
      const [row] = await fixture.database.admin`select outlet_id from merchant_memberships where id = ${membership!.id}`;
      expect(row!.outlet_id).toBe(shop.outletId);
    });
  });
});
