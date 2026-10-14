import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startPayPal, type StartResult } from "@/domain/payments/attempts";
import { computeBasketLockKey } from "@/domain/purchases/checkout-key";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession, type BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import type { AppError } from "@/lib/errors";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";
import { waitFor } from "../support/wait";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// S7: the PayPal half of the basket lock across a republished menu. The lock key leaves out the menu
// revision, so the same items on the republished menu are the same basket; it holds exactly while
// money can still move, derived on read, with no maintenance run. Real route handlers run as
// envoi_web against a migrated disposable database; PayPal is the labeled FIXTURE fake.
describe("PayPal basket lock across republication", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
  };
  let api: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("basketlock");
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    };
    api = shopApi(fixture.database, routes);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  // The basket: one of each published item, by its id on the menu the buyer is reading now.
  const basketOn = async (shop: Shop) => (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));

  async function openReview(cookie: string, shop: Shop) {
    const response = await routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId: shop.outletId, rail: "paypal", lines: await basketOn(shop) }));
    return { status: response.status, body: await envelope<{ purchaseId: string }>(response) };
  }

  const post = (cookie: string, purchaseId: string, path: string, handler: (request: Request, params: ReturnType<typeof routeParams>) => Promise<Response>) =>
    handler(jsonPost(`/api/v1/purchases/${purchaseId}/${path}`, cookie), routeParams(purchaseId));

  const raisePrice = (items: { id: string; name: string; priceSgdCents: number | null }[]) =>
    items.map((item) => ({ id: item.id, name: item.name, priceSgdCents: (item.priceSgdCents ?? 0) + 20 }));

  async function principalOf(cookie: string): Promise<BuyerPrincipal> {
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no buyer session");
    return principal;
  }

  function freshFake() {
    fake = createFakePayPal();
    paypal.client = fake.client;
  }

  it("a payment that can still move blocks the same basket on a republished menu", async () => {
    freshFake();
    const { shop } = await api.publishedShop("lock-capture-unknown");
    const buyer = await anonymousCookie(routes.auth.POST);
    const old = await openReview(buyer, shop);
    expect(old.status).toBe(201);
    const oldId = old.body.data.purchaseId;

    // The capture request is lost before PayPal acts: the attempt is capture_unknown.
    expect((await post(buyer, oldId, "paypal/start", routes.start.POST)).status).toBe(200);
    fake.approve(fake.calls[0]!.orderId!);
    fake.fail("captureOrder", "lose_request", 5);
    expect((await post(buyer, oldId, "paypal/complete", routes.complete.POST)).status).toBe(200);
    const [attempt] = await fixture.database.admin`select state from payment_attempts where purchase_id = ${oldId}`;
    expect(attempt!.state).toBe("capture_unknown");

    await api.republish(shop, raisePrice);

    const blocked = await openReview(buyer, shop);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "execution_locked", details: { purchaseId: oldId, reason: "paypal_capture_in_flight" } });
    const [count] = await fixture.database.admin<{ n: number }[]>`select count(*)::int as n from purchases where outlet_id = ${shop.outletId}`;
    expect(count!.n).toBe(1);
  });

  it("a PayPal order abandoned before capture does not lock a republished basket", async () => {
    freshFake();
    const { shop } = await api.publishedShop("lock-abandoned");
    const buyer = await anonymousCookie(routes.auth.POST);
    const old = await openReview(buyer, shop);
    const oldId = old.body.data.purchaseId;
    expect((await post(buyer, oldId, "paypal/start", routes.start.POST)).status).toBe(200);
    await api.republish(shop, raisePrice);

    // Inside the review window the order can still be approved and captured, so the basket is locked.
    const inWindow = await openReview(buyer, shop);
    expect(inWindow.status).toBe(409);
    expect(inWindow.body.error).toMatchObject({ code: "execution_locked", details: { reason: "paypal_review_window" } });

    // T_REVIEW (300,000 ms) passes with no capture sent and no maintenance run.
    const [created] = await fixture.database.admin<{ ms: number }[]>`select (extract(epoch from created_at) * 1000)::float8 as ms from purchases where id = ${oldId}`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(created!.ms + 300_000 + 1_000));
    const [stored] = await fixture.database.admin`
      select p.state as purchase, a.state as attempt from purchases p join payment_attempts a on a.purchase_id = p.id where p.id = ${oldId}`;
    expect(stored).toEqual({ purchase: "pending_payment", attempt: "order_created" });
    const [maintenance] = await fixture.database.admin<{ runs: number }[]>`select count(*)::int as runs from maintenance_runs`;
    expect(maintenance!.runs).toBe(0);

    const reopened = await openReview(buyer, shop);
    expect(reopened.status).toBe(201);
    expect(reopened.body.data.purchaseId).not.toBe(oldId);
    expect(fake.captures()).toHaveLength(0);
  });

  it("two PayPal reviews of one basket across a republish cannot both start", async () => {
    freshFake();
    const { shop } = await api.publishedShop("lock-race");
    const buyer = await anonymousCookie(routes.auth.POST);
    const principal = await principalOf(buyer);
    const p1 = await openReview(buyer, shop);
    expect(p1.status).toBe(201);
    const p1Id = p1.body.data.purchaseId;

    const web = connectWeb(fixture.database.webUrl, 4);
    const deps = { db: web.db, paypal: fake.client, now: () => new Date(), appBaseUrl: TEST_BASE_URL };
    const admin = fixture.database.admin;
    const waitingOnLock = async () =>
      (await admin`select count(*)::int as n from pg_stat_activity where datname = ${fixture.database.name} and wait_event_type = 'Lock'`)[0]!.n > 0;

    let p1Held!: () => void;
    const p1InBarrier = new Promise<void>((resolve) => (p1Held = resolve));
    let p2Returned = false;
    try {
      // P1 holds after its locks and eligibility check, before its attempt is saved, until P2's start
      // has returned or is waiting on a lock.
      const first = startPayPal(deps, principal, p1Id, {
        beforeAttemptSaved: async () => {
          p1Held();
          await waitFor(async () => p2Returned || (await waitingOnLock()), 10_000, "P2's start to return or wait on a lock");
        },
      });
      await p1InBarrier;

      await api.republish(shop, raisePrice);
      const p2 = await openReview(buyer, shop);
      expect(p2.status).toBe(201);
      const p2Id = p2.body.data.purchaseId;
      const [revisions] = await admin`select count(distinct menu_revision_id)::int as n from purchases where id in (${p1Id}, ${p2Id})`;
      expect(revisions!.n).toBe(2);

      const second = startPayPal(deps, principal, p2Id).finally(() => {
        p2Returned = true;
      });
      const [r1, r2]: Array<StartResult | AppError> = await Promise.all([first, second]);

      expect(r1).not.toHaveProperty("code");
      expect(r2).toMatchObject({ code: "execution_locked", details: { purchaseId: p1Id } });
      const attempts = await admin`select purchase_id from payment_attempts where purchase_id in (${p1Id}, ${p2Id})`;
      expect(attempts).toEqual([{ purchase_id: p1Id }]);
      expect(fake.writes()).toHaveLength(1);
    } finally {
      await web.close();
    }
  });

  it("the migration backfill computes the application's basket lock key", async () => {
    freshFake();
    const { shop } = await api.publishedShop("lock-backfill");
    // On a republished menu each item's id differs from its key, so the backfill must join for it.
    await api.republish(shop, raisePrice);
    const buyer = await anonymousCookie(routes.auth.POST);
    const review = await openReview(buyer, shop);
    const purchaseId = review.body.data.purchaseId;
    const [row] = await fixture.database.admin<{ key: string; buyer: string; lines: { menuItemId: string; quantity: number }[] }[]>`
      select basket_lock_key as key, buyer_user_id as buyer, lines from purchases where id = ${purchaseId}`;
    const items = await publishedItems(fixture.database, shop.outletId);
    const keyOf = new Map(items.map((item) => [item.id, item.itemKey]));
    expect(items.every((item) => item.id !== item.itemKey)).toBe(true);
    expect(row!.key).toBe(
      computeBasketLockKey({ buyerUserId: row!.buyer, outletId: shop.outletId, lines: row!.lines.map((line) => ({ itemKey: keyOf.get(line.menuItemId)!, quantity: line.quantity })) }),
    );

    // The backfill statement of migration 0017, run on this purchase with its key cleared.
    const migration = readFileSync(new URL("../../drizzle/0017_s7_publication_guards.sql", import.meta.url), "utf8");
    const backfill = migration.split("--> statement-breakpoint").find((statement) => statement.includes('UPDATE "purchases" SET "basket_lock_key"'));
    expect(backfill).toBeDefined();
    await fixture.database.admin`update purchases set basket_lock_key = null where id = ${purchaseId}`;
    await fixture.database.admin.unsafe(backfill!);
    const [after] = await fixture.database.admin<{ key: string }[]>`select basket_lock_key as key from purchases where id = ${purchaseId}`;
    expect(after!.key).toBe(row!.key);
  });
});
