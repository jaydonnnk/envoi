import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MerchantOrder, OutletOrders } from "@/domain/purchases/orders";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { jsonRequest } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// S8: a merchant's orders with payment states derived on read, and acknowledgment as its own field.
// Real route handlers run as envoi_web against a migrated disposable database; merchants publish
// their own FIXTURE shops, and PayPal is the labeled FIXTURE fake, so every order and capture id is
// FIXTURE-*, never a sandbox record.
describe("merchant orders and acknowledgment", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    orders: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/route");
    acknowledge: typeof import("@/app/api/v1/merchant/orders/[id]/acknowledge/route");
  };
  let api: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("orders");
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      orders: await import("@/app/api/v1/merchant/outlets/[id]/orders/route"),
      acknowledge: await import("@/app/api/v1/merchant/orders/[id]/acknowledge/route"),
    };
    api = shopApi(fixture.database, routes);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  type Bought = { buyer: string; purchaseId: string };

  // A buyer's review of one of each published item, then as far through PayPal as `until` says.
  async function buy(shop: Shop, until: "review" | "started" | "paid" | "uncertain"): Promise<Bought> {
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    expect(created.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    if (until === "review") return { buyer, purchaseId };

    // A fresh fake per purchase, so a fault queued for one never reaches the next.
    fake = createFakePayPal();
    paypal.client = fake.client;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    if (until === "started") return { buyer, purchaseId };

    fake.approve(fake.calls[0]!.orderId!);
    // A capture request lost before PayPal acted leaves the payment unknown: uncertain, not paid.
    if (until === "uncertain") fake.fail("captureOrder", "lose_request", 5);
    expect((await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId))).status).toBe(200);
    const [row] = await fixture.database.admin<{ state: string }[]>`select state from purchases where id = ${purchaseId}`;
    expect(row!.state).toBe(until);
    return { buyer, purchaseId };
  }

  const listOrders = (shop: Shop, cookie = shop.cookie) =>
    routes.orders.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${shop.outletId}/orders`, cookie), routeParams(shop.outletId));

  const acknowledge = (cookie: string, purchaseId: string) =>
    routes.acknowledge.POST(jsonRequest("POST", `/api/v1/merchant/orders/${purchaseId}/acknowledge`, cookie, {}), routeParams(purchaseId));

  const purchaseRow = async (purchaseId: string) => (await fixture.database.admin`select * from purchases where id = ${purchaseId}`)[0]!;
  const attemptRows = (purchaseId: string) => fixture.database.admin`select * from payment_attempts where purchase_id = ${purchaseId} order by id`;
  const acknowledgedAudits = async (purchaseId: string) =>
    (await fixture.database.admin<{ n: number }[]>`select count(*)::int as n from audit_events where purchase_id = ${purchaseId} and action = 'order_acknowledged'`)[0]!.n;

  it("acknowledgment requires a verified payment", async () => {
    const { shop } = await api.publishedShop("ack-unverified");
    const pending = await buy(shop, "started");
    const uncertain = await buy(shop, "uncertain");

    for (const [order, state] of [
      [pending, "pending_payment"],
      [uncertain, "uncertain"],
    ] as const) {
      const response = await acknowledge(shop.cookie, order.purchaseId);
      expect(response.status).toBe(400);
      expect((await envelope(response)).error).toMatchObject({ code: "validation_failed", details: { reason: "payment_not_verified", state } });
      const row = await purchaseRow(order.purchaseId);
      expect(row.state).toBe(state);
      expect(row.acknowledged_at).toBeNull();
      expect(row.acknowledged_by_user_id).toBeNull();
      expect(await acknowledgedAudits(order.purchaseId)).toBe(0);
    }
  });

  it("acknowledgment never changes payment state", async () => {
    const { shop } = await api.publishedShop("ack-paid");
    const paid = await buy(shop, "paid");
    const before = await purchaseRow(paid.purchaseId);
    const attemptsBefore = await attemptRows(paid.purchaseId);

    const response = await acknowledge(shop.cookie, paid.purchaseId);
    expect(response.status).toBe(200);
    const { data } = await envelope<{ order: MerchantOrder; changed: boolean }>(response);
    expect(data.changed).toBe(true);
    expect(data.order).toMatchObject({ id: paid.purchaseId, state: "paid", canAcknowledge: false });

    // Only the two acknowledgment columns changed; the payment state and its evidence did not.
    const after = await purchaseRow(paid.purchaseId);
    expect(after.acknowledged_at).not.toBeNull();
    expect(after.acknowledged_by_user_id).toBe(shop.merchant.userId);
    expect({ ...after, acknowledged_at: null, acknowledged_by_user_id: null }).toEqual(before);
    expect(await attemptRows(paid.purchaseId)).toEqual(attemptsBefore);
    expect(await acknowledgedAudits(paid.purchaseId)).toBe(1);

    // The buyer's receipt read shows paid and, separately, the acknowledgment.
    const receipt = await routes.purchase.GET(jsonRequest("GET", `/api/v1/purchases/${paid.purchaseId}`, paid.buyer), routeParams(paid.purchaseId));
    const read = (await envelope<{ state: string; payment: { captureId: string }; acknowledgment: { acknowledgedAt: string } | null }>(receipt)).data;
    expect(read.state).toBe("paid");
    expect(read.payment.captureId).toBe(attemptsBefore[0]!.capture_id);
    expect(read.acknowledgment).toEqual({ acknowledgedAt: new Date(after.acknowledged_at as string).toISOString() });

    // A repeat changes nothing.
    const again = await acknowledge(shop.cookie, paid.purchaseId);
    expect(again.status).toBe(200);
    expect((await envelope<{ changed: boolean }>(again)).data.changed).toBe(false);
    expect(await purchaseRow(paid.purchaseId)).toEqual(after);
    expect(await acknowledgedAudits(paid.purchaseId)).toBe(1);
  });

  it("the orders list shows only the outlet's orders, with states derived on read", async () => {
    const { shop } = await api.publishedShop("list-own");
    const { shop: other } = await api.publishedShop("list-other");
    const paid = await buy(shop, "paid");
    const started = await buy(shop, "started");
    const elsewhere = await buy(other, "paid");

    const now = await listOrders(shop);
    expect(now.status).toBe(200);
    const listed = (await envelope<OutletOrders>(now)).data;
    expect(listed.outlet.id).toBe(shop.outletId);
    expect(listed.orders.map((order) => order.id).sort()).toEqual([paid.purchaseId, started.purchaseId].sort());
    expect(listed.orders.map((order) => order.id)).not.toContain(elsewhere.purchaseId);
    const paidOrder = listed.orders.find((order) => order.id === paid.purchaseId)!;
    expect(paidOrder).toMatchObject({ state: "paid", canAcknowledge: true, acknowledgedAt: null });
    expect(paidOrder.payment!.captureId).toMatch(/^FIXTURE-/);
    expect(listed.orders.find((order) => order.id === started.purchaseId)).toMatchObject({
      state: "pending_payment",
      canAcknowledge: false,
      payment: { attemptState: "order_created", captureId: null },
    });

    // Past T_REVIEW the never-approved order reads closed unpaid before any maintenance run.
    const [created] = await fixture.database.admin<{ ms: number }[]>`select (extract(epoch from created_at) * 1000)::float8 as ms from purchases where id = ${started.purchaseId}`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(created!.ms + 300_000 + 1_000));
    const later = (await envelope<OutletOrders>(await listOrders(shop))).data;
    expect(later.orders.find((order) => order.id === started.purchaseId)).toMatchObject({ state: "unpaid_closed", payment: { attemptState: "abandoned" } });
    expect(later.orders.find((order) => order.id === paid.purchaseId)).toMatchObject({ state: "paid" });
  });

  it("a merchant reaches only its own outlets' orders", async () => {
    const { shop } = await api.publishedShop("reach-own");
    const { shop: intruder } = await api.publishedShop("reach-intruder");
    const paid = await buy(shop, "paid");

    const listed = await listOrders(shop, intruder.cookie);
    expect(listed.status).toBe(403);
    expect((await envelope(listed)).error.code).toBe("forbidden_membership");

    // Another outlet's order answers exactly like a missing one, and nothing is written.
    const refused = await acknowledge(intruder.cookie, paid.purchaseId);
    expect(refused.status).toBe(404);
    const refusedError = (await envelope(refused)).error;
    expect(refusedError.code).toBe("not_found");
    const missing = await acknowledge(intruder.cookie, "pur_fixturemissing");
    expect(missing.status).toBe(404);
    expect((await envelope(missing)).error).toEqual(refusedError);
    // FIXTURE: a revoked membership of the intruder on this outlet grants nothing.
    await fixture.database.admin`
      insert into merchant_memberships (id, user_id, outlet_id, role, is_demo, approved_at, revoked_at)
      values ('mbr_fixture_revoked', ${intruder.merchant.userId}, ${shop.outletId}, 'owner', true, now(), now())`;
    const revoked = await acknowledge(intruder.cookie, paid.purchaseId);
    expect(revoked.status).toBe(404);
    expect((await envelope(revoked)).error).toEqual(refusedError);
    expect((await purchaseRow(paid.purchaseId)).acknowledged_at).toBeNull();
    expect(await acknowledgedAudits(paid.purchaseId)).toBe(0);

    // The outlet's own merchant is admitted.
    expect((await acknowledge(shop.cookie, paid.purchaseId)).status).toBe(200);
  });
});
