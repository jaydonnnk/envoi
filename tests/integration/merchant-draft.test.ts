import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { issueAgentToken } from "@/operator/cli";
import { jsonRequest, newMerchant, signInCookie, type TestMerchant } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

type DraftJson = {
  outletId: string;
  revisionId: string;
  version: number;
  status: "draft" | "confirmed";
  confirmedAt: string | null;
  items: { id: string; name: string; portion: string | null; priceSgdCents: number | null; availability: string; source: string }[];
  completeness: { complete: boolean; incompleteItemIds?: string[]; reason?: string; itemCount?: number };
};

type Envelope<T> = { ok: boolean; data: T; error: { code: string; message: string; details: Record<string, string | number | boolean> } };

// S6: pre-provisioned merchant accounts sign in, create an unpublished outlet with one approved
// membership and type a menu draft. Real route handlers and the real Better Auth handler run as
// envoi_web against a migrated disposable database. FIXTURE accounts use passwords generated in
// memory for this run only.
describe("merchant sign-in and manual menu draft", () => {
  let fixture: PaymentsFixture;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    outlets: typeof import("@/app/api/v1/merchant/outlets/route");
    outlet: typeof import("@/app/api/v1/merchant/outlets/[id]/route");
    draft: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route");
    confirm: typeof import("@/app/api/v1/merchant/outlets/[id]/confirm/route");
    destination: typeof import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/route");
    publish: typeof import("@/app/api/v1/merchant/outlets/[id]/publish/route");
    orders: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/route");
    acknowledge: typeof import("@/app/api/v1/merchant/orders/[id]/acknowledge/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
    publicOutlets: typeof import("@/app/api/v1/outlets/route");
    publicMenu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("merchant");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      outlets: await import("@/app/api/v1/merchant/outlets/route"),
      outlet: await import("@/app/api/v1/merchant/outlets/[id]/route"),
      draft: await import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route"),
      confirm: await import("@/app/api/v1/merchant/outlets/[id]/confirm/route"),
      destination: await import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/route"),
      publish: await import("@/app/api/v1/merchant/outlets/[id]/publish/route"),
      orders: await import("@/app/api/v1/merchant/outlets/[id]/orders/route"),
      acknowledge: await import("@/app/api/v1/merchant/orders/[id]/acknowledge/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
      publicOutlets: await import("@/app/api/v1/outlets/route"),
      publicMenu: await import("@/app/api/v1/outlets/[id]/menu/route"),
    };
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const body = async <T,>(response: Response) => (await response.json()) as Envelope<T>;

  async function merchantWithOutlet(label: string): Promise<{ merchant: TestMerchant; cookie: string; outletId: string }> {
    const merchant = await newMerchant(fixture.database, label, { membership: true });
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const created = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: `FIXTURE ${label} kopi`, area: "Tanjong Pagar" }));
    expect(created.status).toBe(201);
    const { data } = await body<{ outlet: { id: string } }>(created);
    return { merchant, cookie, outletId: data.outlet.id };
  }

  const getDraft = (outletId: string, cookie: string | null, headers: Record<string, string> = {}) =>
    routes.draft.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${outletId}/menu-draft`, cookie, undefined, headers), routeParams(outletId));
  const putDraft = (outletId: string, cookie: string | null, payload: unknown, headers: Record<string, string> = {}) =>
    routes.draft.PUT(jsonRequest("PUT", `/api/v1/merchant/outlets/${outletId}/menu-draft`, cookie, payload, headers), routeParams(outletId));
  const confirm = (outletId: string, cookie: string | null, payload: unknown, headers: Record<string, string> = {}) =>
    routes.confirm.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${outletId}/confirm`, cookie, payload, headers), routeParams(outletId));
  const patchOutlet = (outletId: string, cookie: string | null, payload: unknown, headers: Record<string, string> = {}) =>
    routes.outlet.PATCH(jsonRequest("PATCH", `/api/v1/merchant/outlets/${outletId}`, cookie, payload, headers), routeParams(outletId));

  async function draftOf(outletId: string, cookie: string): Promise<DraftJson> {
    const response = await getDraft(outletId, cookie);
    expect(response.status).toBe(200);
    return (await body<DraftJson>(response)).data;
  }

  // Every merchant route, for one outlet: what a client without the right membership must be refused.
  async function everyMerchantRoute(outletId: string, cookie: string | null, headers: Record<string, string> = {}): Promise<Response[]> {
    const draft = (await fixture.database.admin<{ id: string; version: number }[]>`
      select id, version from menu_revisions where outlet_id = ${outletId} order by created_at desc limit 1`)[0]!;
    return [
      await routes.outlets.GET(jsonRequest("GET", "/api/v1/merchant/outlets", cookie, undefined, headers)),
      await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: "Intruder", area: "Anywhere" }, headers)),
      await patchOutlet(outletId, cookie, { name: "Renamed", area: "Elsewhere" }, headers),
      await getDraft(outletId, cookie, headers),
      await putDraft(outletId, cookie, { revisionId: draft.id, version: draft.version, items: [] }, headers),
      await confirm(outletId, cookie, { revisionId: draft.id, version: draft.version }, headers),
      // S7
      await routes.destination.PUT(jsonRequest("PUT", `/api/v1/merchant/outlets/${outletId}/destinations/paypal`, cookie, { sellerMerchantId: "FXTRSELLER2AB" }, headers), routeParams(outletId)),
      await routes.publish.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${outletId}/publish`, cookie, { revisionId: draft.id, version: draft.version }, headers), routeParams(outletId)),
      // S8
      await routes.orders.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${outletId}/orders`, cookie, undefined, headers), routeParams(outletId)),
      await routes.acknowledge.POST(jsonRequest("POST", "/api/v1/merchant/orders/pur_fixtureprobe/acknowledge", cookie, {}, headers), routeParams("pur_fixtureprobe")),
    ];
  }

  const merchantState = () => fixture.database.admin`
    select (select count(*)::int from outlets) as outlets,
      (select count(*)::int from merchant_memberships) as memberships,
      (select json_agg(json_build_object('id', id, 'name', name, 'area', area) order by id) from outlets) as outlet_rows,
      (select json_agg(json_build_object('id', id, 'version', version, 'status', status) order by id) from menu_revisions) as revisions,
      (select count(*)::int from menu_items) as items,
      (select count(*)::int from purchases where acknowledged_at is not null) as acknowledged`;

  async function expectForbidden(responses: Response[]) {
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await body(response)).error.code).toBe("forbidden_membership");
    }
  }

  it("anonymous buyer cannot reach a merchant route", async () => {
    const { outletId } = await merchantWithOutlet("anon-target");
    const buyer = await anonymousCookie(routes.auth.POST);
    const before = await merchantState();
    const responses = await everyMerchantRoute(outletId, buyer);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await body(response)).error).toMatchObject({ code: "forbidden_membership", details: { reason: "anonymous_session" } });
    }
    expect(await merchantState()).toEqual(before);
  });

  it("an anonymous session is refused even when it holds membership rows", async () => {
    const { outletId } = await merchantWithOutlet("anon-rows-target");
    const buyer = await anonymousCookie(routes.auth.POST);
    const session = (await (await routes.auth.GET(jsonRequest("GET", "/api/auth/get-session", buyer))).json()) as { user: { id: string; isAnonymous: boolean } };
    expect(session.user.isAnonymous).toBe(true);
    // FIXTURE: membership rows no supported path creates for an anonymous user, one bound to the
    // outlet and one unbound, standing in for a broken data invariant.
    await fixture.database.admin`
      insert into merchant_memberships (id, user_id, outlet_id, role, is_demo, approved_at) values
        ('mbr_anon_bound', ${session.user.id}, ${outletId}, 'owner', true, now()),
        ('mbr_anon_unbound', ${session.user.id}, null, 'owner', true, now())`;
    const before = await merchantState();
    const responses = await everyMerchantRoute(outletId, buyer);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await body(response)).error).toMatchObject({ code: "forbidden_membership", details: { reason: "anonymous_session" } });
    }
    expect(await merchantState()).toEqual(before);
  });

  it("an agent token cannot reach a merchant route", async () => {
    const { outletId } = await merchantWithOutlet("agent-target");
    const { token } = await issueAgentToken(drizzle(fixture.database.admin, { schema }), "fixture agent");
    const before = await merchantState();
    const responses = await everyMerchantRoute(outletId, null, { authorization: `Bearer ${token}` });
    await expectForbidden(responses);
    expect(await merchantState()).toEqual(before);
  });

  it("linking an anonymous account creates no membership", async () => {
    const { outletId } = await merchantWithOutlet("link-target");
    // A permanent account the operator created but never approved.
    const account = await newMerchant(fixture.database, "unapproved", { membership: false });
    const buyer = await anonymousCookie(routes.auth.POST);
    const signedIn = await signInCookie(routes.auth.POST, account, buyer);

    // The sign-in linked the buyer session: Better Auth ran onLinkAccount.
    const [link] = await fixture.database.admin<{ details: { anonymousUserId: string; userId: string } }[]>`
      select details from audit_events where action = 'anonymous_session_linked' and details->>'userId' = ${account.userId}`;
    expect(link).toBeDefined();

    await expectForbidden(await everyMerchantRoute(outletId, signedIn));
    const memberships = await fixture.database.admin`
      select id from merchant_memberships where user_id in (${account.userId}, ${link!.details.anonymousUserId})`;
    expect(memberships).toHaveLength(0);
  });

  it("linking preserves purchase ownership", async () => {
    const buyer = await anonymousCookie(routes.auth.POST);
    const [kopi] = fixture.items;
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: kopi!.id, quantity: 1 }] }));
    expect(created.status).toBe(201);
    const { purchaseId } = (await body<{ purchaseId: string }>(created)).data;
    const [owner] = await fixture.database.admin<{ buyer_user_id: string }[]>`select buyer_user_id from purchases where id = ${purchaseId}`;

    const merchant = await newMerchant(fixture.database, "receipt-browser", { membership: true });
    const merchantCookie = await signInCookie(routes.auth.POST, merchant, buyer);
    const read = (cookie: string) => routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { cookie } }), routeParams(purchaseId));

    // The buyer session survives the link and still reads its receipt.
    const mine = await read(buyer);
    expect(mine.status).toBe(200);
    expect((await body<{ id: string }>(mine)).data.id).toBe(purchaseId);
    const [after] = await fixture.database.admin<{ buyer_user_id: string; is_anonymous: boolean }[]>`
      select p.buyer_user_id, u.is_anonymous from purchases p join "user" u on u.id = p.buyer_user_id where p.id = ${purchaseId}`;
    expect(after).toEqual({ buyer_user_id: owner!.buyer_user_id, is_anonymous: true });

    // The merchant account gains nothing: the receipt answers it like a missing one.
    const theirs = await read(merchantCookie);
    expect(theirs.status).toBe(404);
  });

  it("membership is per outlet", async () => {
    const a = await merchantWithOutlet("member-a");
    const b = await merchantWithOutlet("member-b");
    const bDraft = await draftOf(b.outletId, b.cookie);
    const before = await merchantState();

    const refused = [
      await patchOutlet(b.outletId, a.cookie, { name: "Taken over", area: "Elsewhere" }),
      await getDraft(b.outletId, a.cookie),
      await putDraft(b.outletId, a.cookie, { revisionId: bDraft.revisionId, version: bDraft.version, items: [{ name: "Intruder item", portion: null, priceSgdCents: 100, availability: "available" }] }),
      await confirm(b.outletId, a.cookie, { revisionId: bDraft.revisionId, version: bDraft.version }),
    ];
    await expectForbidden(refused);
    expect(await merchantState()).toEqual(before);

    // The same member is admitted on its own outlet.
    expect((await getDraft(a.outletId, a.cookie)).status).toBe(200);
  });

  it("an approved membership creates exactly one outlet", async () => {
    const merchant = await newMerchant(fixture.database, "one-outlet", { membership: true });
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const first = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: "FIXTURE first", area: "Bugis" }));
    expect(first.status).toBe(201);
    const second = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: "FIXTURE second", area: "Bugis" }));
    expect(second.status).toBe(403);
    expect((await body(second)).error.code).toBe("forbidden_membership");

    const rows = await fixture.database.admin<{ outlet_id: string | null; name: string; published_menu_revision_id: string | null; is_demo_fixture: boolean; enrollment: string }[]>`
      select m.outlet_id, o.name, o.published_menu_revision_id, o.is_demo_fixture, e.status as enrollment
      from merchant_memberships m join outlets o on o.id = m.outlet_id join enrollments e on e.outlet_id = o.id
      where m.user_id = ${merchant.userId}`;
    expect(rows).toEqual([{ outlet_id: (await body<{ outlet: { id: string } }>(first)).data.outlet.id, name: "FIXTURE first", published_menu_revision_id: null, is_demo_fixture: true, enrollment: "pending" }]);
    const list = await body<{ outlets: unknown[]; canCreateOutlet: boolean }>(await routes.outlets.GET(jsonRequest("GET", "/api/v1/merchant/outlets", cookie)));
    expect(list.data).toMatchObject({ outlets: [{ name: "FIXTURE first", published: false, enrollment: "pending", isDemoFixture: true }], canCreateOutlet: false });
  });

  it("a new outlet comes back with its empty draft", async () => {
    const merchant = await newMerchant(fixture.database, "created-draft", { membership: true });
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const created = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: "FIXTURE drafted", area: "Bugis" }));
    expect(created.status).toBe(201);
    const { data } = await body<{ outlet: { id: string }; draft: DraftJson }>(created);
    expect(data.draft).toMatchObject({ outletId: data.outlet.id, version: 1, status: "draft", confirmedAt: null, items: [] });
    // The setup page renders this draft at once, so it must be the one the draft route serves.
    expect(data.draft).toEqual(await draftOf(data.outlet.id, cookie));
  });

  it("a blank price stays blank and blocks confirmation until it is supplied", async () => {
    const { cookie, outletId } = await merchantWithOutlet("blank-price");
    const empty = await draftOf(outletId, cookie);
    expect(empty).toMatchObject({ version: 1, status: "draft", items: [] });

    const saved = await putDraft(outletId, cookie, {
      revisionId: empty.revisionId,
      version: 1,
      items: [
        { name: "Kopi C", portion: "Hot", priceSgdCents: 180, availability: "available" },
        { name: "Mee siam", portion: null, priceSgdCents: null, availability: "available" },
      ],
    });
    expect(saved.status).toBe(200);
    const draft = (await body<DraftJson>(saved)).data;
    const meeSiam = draft.items.find((item) => item.name === "Mee siam")!;
    expect(meeSiam.priceSgdCents).toBeNull();
    const [stored] = await fixture.database.admin<{ unit_sgd_cents: number | null }[]>`select unit_sgd_cents from menu_items where id = ${meeSiam.id}`;
    expect(stored!.unit_sgd_cents).toBeNull();
    expect(draft.completeness).toEqual({ complete: false, incompleteItemIds: [meeSiam.id], reason: "missing_price" });

    const refused = await confirm(outletId, cookie, { revisionId: draft.revisionId, version: draft.version });
    expect(refused.status).toBe(400);
    expect((await body(refused)).error).toMatchObject({ code: "validation_failed", details: { reason: "missing_price", incompleteItemIds: meeSiam.id } });
    const [unconfirmed] = await fixture.database.admin<{ status: string }[]>`select status from menu_revisions where id = ${draft.revisionId}`;
    expect(unconfirmed!.status).toBe("draft");

    const filled = await putDraft(outletId, cookie, {
      revisionId: draft.revisionId,
      version: draft.version,
      items: draft.items.map((item) => ({ id: item.id, name: item.name, portion: item.portion, priceSgdCents: item.priceSgdCents ?? 550, availability: item.availability })),
    });
    const complete = (await body<DraftJson>(filled)).data;
    expect(complete.completeness).toEqual({ complete: true, itemCount: 2 });

    const confirmed = await confirm(outletId, cookie, { revisionId: complete.revisionId, version: complete.version });
    expect(confirmed.status).toBe(200);
    expect((await body<DraftJson>(confirmed)).data).toMatchObject({ status: "confirmed", version: complete.version });
    const [revision] = await fixture.database.admin<{ status: string; version: number; confirmed_at: Date | null }[]>`
      select status, version, confirmed_at from menu_revisions where id = ${complete.revisionId}`;
    expect(revision).toMatchObject({ status: "confirmed", version: complete.version });
    expect(revision!.confirmed_at).not.toBeNull();
  });

  it("a zero price is refused and changes nothing", async () => {
    const { cookie, outletId } = await merchantWithOutlet("zero-price");
    const draft = await draftOf(outletId, cookie);
    const before = await merchantState();
    // The request schema refuses it with a 400 answer; a route that let it through to the database
    // would throw instead, which this test reports as a failed assertion.
    const refused = await putDraft(outletId, cookie, { revisionId: draft.revisionId, version: draft.version, items: [{ name: "Free kopi", portion: null, priceSgdCents: 0, availability: "available" }] }).catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(Response);
    expect((refused as Response).status).toBe(400);
    expect((await body(refused as Response)).error.code).toBe("validation_failed");
    expect(await merchantState()).toEqual(before);
  });

  it("the database refuses a zero price from the web role", async () => {
    const web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
    try {
      const { outletId } = await merchantWithOutlet("db-zero-price");
      const [revision] = await fixture.database.admin<{ id: string }[]>`select id from menu_revisions where outlet_id = ${outletId}`;
      const insert = (id: string, position: number, cents: number | null) =>
        web`insert into menu_items (id, menu_revision_id, position, name, unit_sgd_cents, available, portion, source)
          values (${id}, ${revision!.id}, ${position}, 'FIXTURE kopi', ${cents}, true, null, 'merchant')`.then(() => "inserted", (err: { message: string }) => err.message);
      // The same insert with a blank price succeeds, so the refusal below is the price check, not a grant.
      expect(await insert("itm_zero_control", 0, null)).toBe("inserted");
      expect(await insert("itm_zero_test", 1, 0)).toMatch(/violates check constraint "menu_items_price_check"/);
      expect(await fixture.database.admin`select id from menu_items where id = 'itm_zero_test'`).toHaveLength(0);
    } finally {
      await web.end({ timeout: 5 });
    }
  });

  it("stale draft write is rejected", async () => {
    const { cookie, outletId } = await merchantWithOutlet("stale");
    const loaded = await draftOf(outletId, cookie);

    // Two tabs loaded version 1; the first saves.
    const first = await putDraft(outletId, cookie, { revisionId: loaded.revisionId, version: loaded.version, items: [{ name: "Roti prata", portion: "Plain", priceSgdCents: 150, availability: "available" }] });
    expect(first.status).toBe(200);
    const afterFirst = await merchantState();

    const second = await putDraft(outletId, cookie, { revisionId: loaded.revisionId, version: loaded.version, items: [{ name: "Overwritten", portion: null, priceSgdCents: 999, availability: "unavailable" }] });
    expect(second.status).toBe(409);
    expect((await body(second)).error).toMatchObject({ code: "revision_conflict", details: { revisionId: loaded.revisionId, currentVersion: loaded.version + 1 } });
    expect(await merchantState()).toEqual(afterFirst);
    expect((await draftOf(outletId, cookie)).items.map((item) => item.name)).toEqual(["Roti prata"]);
  });

  it("a confirmation of an older version is rejected", async () => {
    const { cookie, outletId } = await merchantWithOutlet("stale-confirm");
    const loaded = await draftOf(outletId, cookie);
    const v2 = (await body<DraftJson>(await putDraft(outletId, cookie, { revisionId: loaded.revisionId, version: 1, items: [{ name: "Teh", portion: null, priceSgdCents: 140, availability: "available" }] }))).data;
    // Another tab changed the price after this one reviewed version 2.
    await putDraft(outletId, cookie, { revisionId: v2.revisionId, version: v2.version, items: [{ id: v2.items[0]!.id, name: "Teh", portion: null, priceSgdCents: 990, availability: "available" }] });

    const stale = await confirm(outletId, cookie, { revisionId: v2.revisionId, version: v2.version });
    expect(stale.status).toBe(409);
    expect((await body(stale)).error.code).toBe("revision_conflict");
    const [revision] = await fixture.database.admin<{ status: string; version: number }[]>`select status, version from menu_revisions where id = ${v2.revisionId}`;
    expect(revision).toEqual({ status: "draft", version: v2.version + 1 });
  });

  it("editing a confirmed draft invalidates its confirmation", async () => {
    const { cookie, outletId } = await merchantWithOutlet("reconfirm");
    const loaded = await draftOf(outletId, cookie);
    const saved = (await body<DraftJson>(await putDraft(outletId, cookie, { revisionId: loaded.revisionId, version: 1, items: [{ name: "Milo", portion: "Iced", priceSgdCents: 200, availability: "available" }] }))).data;
    expect((await confirm(outletId, cookie, { revisionId: saved.revisionId, version: saved.version })).status).toBe(200);

    const edited = await putDraft(outletId, cookie, { revisionId: saved.revisionId, version: saved.version, items: [{ id: saved.items[0]!.id, name: "Milo", portion: "Iced", priceSgdCents: 220, availability: "available" }] });
    expect(edited.status).toBe(200);
    expect((await body<DraftJson>(edited)).data).toMatchObject({ status: "draft", confirmedAt: null, version: saved.version + 1 });
    const [revision] = await fixture.database.admin<{ status: string; confirmed_at: Date | null }[]>`select status, confirmed_at from menu_revisions where id = ${saved.revisionId}`;
    expect(revision).toEqual({ status: "draft", confirmed_at: null });
  });

  it("a confirmed draft stays invisible to buyers", async () => {
    const { cookie, outletId } = await merchantWithOutlet("invisible");
    const loaded = await draftOf(outletId, cookie);
    const saved = (await body<DraftJson>(await putDraft(outletId, cookie, { revisionId: loaded.revisionId, version: 1, items: [{ name: "Chendol", portion: null, priceSgdCents: 300, availability: "available" }] }))).data;
    expect((await confirm(outletId, cookie, { revisionId: saved.revisionId, version: saved.version })).status).toBe(200);

    const listed = (await body<{ outlets: { id: string }[] }>(await routes.publicOutlets.GET())).data.outlets.map((outlet) => outlet.id);
    expect(listed).not.toContain(outletId);
    expect(listed).toContain(fixture.outletId);
    const menu = await routes.publicMenu.GET(new Request(`${TEST_BASE_URL}/api/v1/outlets/${outletId}/menu`), routeParams(outletId));
    expect(menu.status).toBe(404);

    const buyer = await anonymousCookie(routes.auth.POST);
    const review = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId, rail: "paypal", lines: [{ menuItemId: saved.items[0]!.id, quantity: 1 }] }));
    expect(review.ok).toBe(false);
    expect(await fixture.database.admin`select id from purchases where outlet_id = ${outletId}`).toHaveLength(0);
  });

  it("an empty menu cannot be confirmed", async () => {
    const { cookie, outletId } = await merchantWithOutlet("empty");
    const draft = await draftOf(outletId, cookie);
    const refused = await confirm(outletId, cookie, { revisionId: draft.revisionId, version: draft.version });
    expect(refused.status).toBe(400);
    expect((await body(refused)).error).toMatchObject({ code: "validation_failed", details: { reason: "no_items" } });
    const [revision] = await fixture.database.admin<{ status: string }[]>`select status from menu_revisions where id = ${draft.revisionId}`;
    expect(revision!.status).toBe("draft");
  });

  it("a revoked membership reaches nothing", async () => {
    const { merchant, cookie, outletId } = await merchantWithOutlet("revoked");
    await fixture.database.admin`update merchant_memberships set revoked_at = now() where user_id = ${merchant.userId}`;
    const before = await merchantState();
    await expectForbidden(await everyMerchantRoute(outletId, cookie));
    expect(await merchantState()).toEqual(before);
  });

  it("a published outlet's details are not edited here", async () => {
    // FIXTURE: a merchant whose membership the operator bound to the published demo fixture outlet.
    const merchant = await newMerchant(fixture.database, "published", { membership: true });
    await fixture.database.admin`update merchant_memberships set outlet_id = ${fixture.outletId} where user_id = ${merchant.userId}`;
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const before = await merchantState();
    const refused = await patchOutlet(fixture.outletId, cookie, { name: "Renamed fixture", area: "Elsewhere" });
    expect(refused.status).toBe(400);
    expect((await body(refused)).error).toMatchObject({ code: "validation_failed", details: { reason: "outlet_published" } });
    expect(await merchantState()).toEqual(before);
  });

  it("the web role cannot create a published outlet, an approved enrollment or a confirmed revision", async () => {
    const web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
    try {
      const [fixtureRevision] = await fixture.database.admin<{ id: string }[]>`select published_menu_revision_id as id from outlets where id = ${fixture.outletId}`;
      const { outletId } = await merchantWithOutlet("grants");
      const outcome = async (query: Promise<unknown>) => query.then(() => "inserted", (err: { message: string }) => err.message);

      expect(await outcome(web`insert into outlets (id, name, area, is_demo_fixture, created_at, published_menu_revision_id) values ('out_grant_test', 'Born published', 'Nowhere', true, now(), ${fixtureRevision!.id})`)).toMatch(/permission denied/);
      expect(await outcome(web`insert into enrollments (id, outlet_id, is_demo, created_at, status, approved_at) values ('enr_grant_test', ${fixture.outletId}, true, now(), 'approved', now())`)).toMatch(/permission denied/);
      expect(await outcome(web`insert into menu_revisions (id, outlet_id, status, version, created_at, confirmed_at) values ('mrv_grant_test', ${outletId}, 'confirmed', 1, now(), now())`)).toMatch(/permission denied/);
      expect(await fixture.database.admin`select id from outlets where id = 'out_grant_test' union all select id from enrollments where id = 'enr_grant_test' union all select id from menu_revisions where id = 'mrv_grant_test'`).toHaveLength(0);
    } finally {
      await web.end({ timeout: 5 });
    }
  });

  it("public signup is refused", async () => {
    const response = await routes.auth.POST(
      new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ email: "walk-in@merchant.example.test", password: "FIXTURE-not-a-real-password", name: "Walk in" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await fixture.database.admin`select id from "user" where email = 'walk-in@merchant.example.test'`).toHaveLength(0);
  });

  it("a merchant edits the name and area of its unpublished outlet", async () => {
    const { cookie, outletId } = await merchantWithOutlet("rename");
    const response = await patchOutlet(outletId, cookie, { name: "  FIXTURE renamed kopi ", area: "Telok Ayer" });
    expect(response.status).toBe(200);
    expect((await body<{ outlet: unknown }>(response)).data.outlet).toMatchObject({ id: outletId, name: "FIXTURE renamed kopi", area: "Telok Ayer", published: false });
    const [row] = await fixture.database.admin<{ name: string; area: string }[]>`select name, area from outlets where id = ${outletId}`;
    expect(row).toEqual({ name: "FIXTURE renamed kopi", area: "Telok Ayer" });
  });
});
