import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runMaintenance } from "@/domain/maintenance/tasks";
import type { MerchantOrder, OutletOrders } from "@/domain/purchases/orders";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import * as schema from "@/lib/db/schema";
import { exportArchivedOrders, issueAgentToken, unarchiveOrder } from "@/operator/cli";
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

// S18: Delete on /merchant/orders archives an order. Real route handlers run as envoi_web against a
// migrated disposable database; merchants publish their own FIXTURE shops and PayPal is the labeled
// FIXTURE fake, so every order and capture id is FIXTURE-*, never a sandbox record.
describe("merchant order archive", () => {
  let fixture: PaymentsFixture;
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    cancel: typeof import("@/app/api/v1/purchases/[id]/cancel/route");
    orders: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/route");
    acknowledge: typeof import("@/app/api/v1/merchant/orders/[id]/acknowledge/route");
    archive: typeof import("@/app/api/v1/merchant/orders/[id]/archive/route");
  };
  let api: ReturnType<typeof shopApi>;
  const fakes = new Map<string, FakePayPal>();

  beforeAll(async () => {
    fixture = await createPaymentsFixture("archive");
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      cancel: await import("@/app/api/v1/purchases/[id]/cancel/route"),
      orders: await import("@/app/api/v1/merchant/outlets/[id]/orders/route"),
      acknowledge: await import("@/app/api/v1/merchant/orders/[id]/acknowledge/route"),
      archive: await import("@/app/api/v1/merchant/orders/[id]/archive/route"),
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
  type Until = "started" | "paid" | "uncertain" | "uncertain_captured" | "unpaid_closed";

  // A buyer's order of one of each published item, taken as far through PayPal as `until` says.
  // "uncertain" loses the capture request, "uncertain_captured" loses only PayPal's answer.
  async function buy(shop: Shop, until: Until): Promise<Bought> {
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    expect(created.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    const fake = createFakePayPal();
    fakes.set(purchaseId, fake);
    paypal.client = fake.client;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    if (until === "started") return { buyer, purchaseId };
    if (until === "unpaid_closed") {
      expect((await routes.cancel.POST(jsonPost(`/api/v1/purchases/${purchaseId}/cancel`, buyer), routeParams(purchaseId))).status).toBe(200);
    } else {
      fake.approve(fake.calls[0]!.orderId!);
      if (until === "uncertain") fake.fail("captureOrder", "lose_request", 5);
      if (until === "uncertain_captured") fake.fail("captureOrder", "lose_response");
      expect((await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId))).status).toBe(200);
    }
    const expected = until === "uncertain_captured" ? "uncertain" : until;
    expect((await purchaseRow(purchaseId)).state).toBe(expected);
    return { buyer, purchaseId };
  }

  const listOrders = async (shop: Shop): Promise<OutletOrders> => {
    const response = await routes.orders.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${shop.outletId}/orders`, shop.cookie), routeParams(shop.outletId));
    expect(response.status).toBe(200);
    return (await envelope<OutletOrders>(response)).data;
  };
  const listedIds = async (shop: Shop) => (await listOrders(shop)).orders.map((order) => order.id);

  const archive = (purchaseId: string, cookie: string | null, headers: Record<string, string> = {}) =>
    routes.archive.POST(jsonRequest("POST", `/api/v1/merchant/orders/${purchaseId}/archive`, cookie, undefined, headers), routeParams(purchaseId));

  async function archived(shop: Shop, purchaseId: string): Promise<{ order: MerchantOrder; changed: boolean }> {
    const response = await archive(purchaseId, shop.cookie);
    expect(response.status).toBe(200);
    return (await envelope<{ order: MerchantOrder; changed: boolean }>(response)).data;
  }

  const purchaseRow = async (purchaseId: string) => (await fixture.database.admin`select * from purchases where id = ${purchaseId}`)[0]!;
  const attemptRows = (purchaseId: string) => fixture.database.admin`select * from payment_attempts where purchase_id = ${purchaseId} order by id`;
  const archiveAudits = async (purchaseId: string) =>
    (await fixture.database.admin<{ n: number }[]>`select count(*)::int as n from audit_events where purchase_id = ${purchaseId} and action = 'order_archived'`)[0]!.n;
  const withoutArchive = (row: Record<string, unknown>) => ({ ...row, merchant_archived_at: null, merchant_archived_by_user_id: null, merchant_archived_state: null });

  it("archive hides an order and keeps its record", async () => {
    const { shop } = await api.publishedShop("hide");
    const order = await buy(shop, "paid");
    const before = await purchaseRow(order.purchaseId);
    const attemptsBefore = await attemptRows(order.purchaseId);

    const { changed } = await archived(shop, order.purchaseId);
    expect(changed).toBe(true);

    expect(await listedIds(shop)).not.toContain(order.purchaseId);
    const after = await purchaseRow(order.purchaseId);
    expect(after.merchant_archived_at).not.toBeNull();
    expect(after.merchant_archived_by_user_id).toBe(shop.merchant.userId);
    expect(after.merchant_archived_state).toBe("paid");
    // Only the three archive columns changed; the purchase, its payment and its attempts did not.
    expect(withoutArchive(after)).toEqual(before);
    expect(await attemptRows(order.purchaseId)).toEqual(attemptsBefore);
    expect(await archiveAudits(order.purchaseId)).toBe(1);
  });

  it("archive works on every order state", async () => {
    const { shop } = await api.publishedShop("states");
    const acknowledged = await buy(shop, "paid");
    expect((await routes.acknowledge.POST(jsonRequest("POST", `/api/v1/merchant/orders/${acknowledged.purchaseId}/acknowledge`, shop.cookie, {}), routeParams(acknowledged.purchaseId))).status).toBe(200);
    const orders = [acknowledged, await buy(shop, "paid"), await buy(shop, "started"), await buy(shop, "uncertain"), await buy(shop, "unpaid_closed")];

    for (const order of orders) {
      const state = (await purchaseRow(order.purchaseId)).state;
      expect((await archived(shop, order.purchaseId)).changed).toBe(true);
      expect((await purchaseRow(order.purchaseId)).merchant_archived_state).toBe(state === "pending_payment" ? "pending_payment" : state);
    }
    expect(await listedIds(shop)).toEqual([]);
  });

  it("archive repeat changes nothing", async () => {
    const { shop } = await api.publishedShop("repeat");
    const order = await buy(shop, "paid");
    await archived(shop, order.purchaseId);
    const first = await purchaseRow(order.purchaseId);

    const again = await archived(shop, order.purchaseId);
    expect(again.changed).toBe(false);
    expect(await purchaseRow(order.purchaseId)).toEqual(first);
    expect(await archiveAudits(order.purchaseId)).toBe(1);
  });

  it("another outlet's order cannot be archived", async () => {
    const { shop } = await api.publishedShop("owner");
    const { shop: other } = await api.publishedShop("other");
    const order = await buy(shop, "paid");
    const before = await purchaseRow(order.purchaseId);

    const response = await archive(order.purchaseId, other.cookie);
    expect(response.status).toBe(404);
    expect((await envelope(response)).error.code).toBe("not_found");
    expect(await purchaseRow(order.purchaseId)).toEqual(before);
    expect(await archiveAudits(order.purchaseId)).toBe(0);
    expect(await listedIds(shop)).toContain(order.purchaseId);
  });

  it("an agent token or buyer session cannot archive", async () => {
    const { shop } = await api.publishedShop("strangers");
    const order = await buy(shop, "paid");
    const before = await purchaseRow(order.purchaseId);
    const { token } = await issueAgentToken(drizzle(fixture.database.admin, { schema }), "fixture agent");

    for (const response of [await archive(order.purchaseId, null, { authorization: `Bearer ${token}` }), await archive(order.purchaseId, order.buyer)]) {
      expect(response.status).toBe(403);
      expect((await envelope(response)).error.code).toBe("forbidden_membership");
    }
    // A merchant's own session from a foreign page is refused before anything is read.
    const foreign = await archive(order.purchaseId, shop.cookie, { origin: "https://attacker.example" });
    expect(foreign.status).toBe(403);
    expect((await envelope(foreign)).error.code).toBe("forbidden_origin");
    expect(await purchaseRow(order.purchaseId)).toEqual(before);
  });

  it("an order archived before it was paid comes back as Paid", async () => {
    const { shop } = await api.publishedShop("returns");
    const order = await buy(shop, "uncertain_captured");
    await archived(shop, order.purchaseId);
    expect(await listedIds(shop)).not.toContain(order.purchaseId);

    // PayPal had captured it; maintenance reads that and the order becomes paid.
    await runMaintenance(drizzle(fixture.database.admin, { schema }), { paypal: fakes.get(order.purchaseId)!.client, solana: null, now: () => new Date(Date.now() + 31_000), log: () => {} }, "manual");
    expect((await purchaseRow(order.purchaseId)).state).toBe("paid");

    const listed = await listOrders(shop);
    expect(listed.orders.find((each) => each.id === order.purchaseId)).toMatchObject({ state: "paid" });
    expect(listed.archivedCount).toBe(0);
  });

  it("a paid order archived stays hidden", async () => {
    const { shop } = await api.publishedShop("stays");
    const order = await buy(shop, "paid");
    await archived(shop, order.purchaseId);
    expect(await listedIds(shop)).not.toContain(order.purchaseId);
    // A hidden order is not a page cursor either.
    const response = await routes.orders.GET(
      jsonRequest("GET", `/api/v1/merchant/outlets/${shop.outletId}/orders?before=${order.purchaseId}`, shop.cookie),
      routeParams(shop.outletId),
    );
    expect(response.status).toBe(400);
    expect((await envelope(response)).error.details).toMatchObject({ reason: "unknown_before" });
  });

  it("archived count matches the hidden orders", async () => {
    const { shop } = await api.publishedShop("count");
    const kept = await buy(shop, "paid");
    const hidden = [await buy(shop, "paid"), await buy(shop, "unpaid_closed")];
    for (const order of hidden) await archived(shop, order.purchaseId);

    const listed = await listOrders(shop);
    expect(listed.orders.map((order) => order.id)).toEqual([kept.purchaseId]);
    expect(listed.archivedCount).toBe(2);
  });

  it("the web role cannot clear an archive", async () => {
    const { shop } = await api.publishedShop("clear");
    const order = await buy(shop, "paid");
    await archived(shop, order.purchaseId);
    const before = await purchaseRow(order.purchaseId);

    const web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
    try {
      await expect(
        web`update purchases set merchant_archived_at = null, merchant_archived_by_user_id = null, merchant_archived_state = null where id = ${order.purchaseId}`,
      ).rejects.toMatchObject({ code: "23514" });
      await expect(web`update purchases set merchant_archived_state = 'pending_payment' where id = ${order.purchaseId}`).rejects.toMatchObject({ code: "23514" });
    } finally {
      await web.end({ timeout: 5 });
    }
    expect(await purchaseRow(order.purchaseId)).toEqual(before);

    // The operator's act, on the migration role, restores it.
    expect((await unarchiveOrder(drizzle(fixture.database.admin, { schema }), order.purchaseId)).status).toBe("unarchived");
    expect(await listedIds(shop)).toContain(order.purchaseId);
  });

  it("maintenance still reconciles an archived uncertain order", async () => {
    const { shop } = await api.publishedShop("reconcile");
    const order = await buy(shop, "uncertain_captured");
    await archived(shop, order.purchaseId);

    const maintenance = postgres(fixture.database.maintenanceUrl, { max: 1, onnotice: () => {} });
    try {
      const fake = fakes.get(order.purchaseId)!;
      const capturesBefore = fake.captures().length;
      await runMaintenance(drizzle(maintenance, { schema }), { paypal: fake.client, solana: null, now: () => new Date(Date.now() + 31_000), log: () => {} }, "manual");
      expect(fake.captures()).toHaveLength(capturesBefore);
    } finally {
      await maintenance.end({ timeout: 5 });
    }
    const row = await purchaseRow(order.purchaseId);
    expect(row.state).toBe("paid");
    expect(row.merchant_archived_at).not.toBeNull();
  });

  it("export writes one receipt per archived order without buyer identity", async () => {
    const { shop } = await api.publishedShop("export");
    const orders = [await buy(shop, "paid"), await buy(shop, "unpaid_closed")];
    await buy(shop, "paid"); // not archived, so not exported
    for (const order of orders) await archived(shop, order.purchaseId);
    const buyers = await fixture.database.admin<{ id: string; email: string | null }[]>`
      select u.id, u.email from purchases p join "user" u on u.id = p.buyer_user_id where p.id in ${fixture.database.admin(orders.map((order) => order.purchaseId))}`;
    expect(buyers).toHaveLength(2);

    // The scanner finds a planted buyer id and email in a serialized receipt, raw and JSON-escaped,
    // before it is trusted on the real export.
    const needles = buyers.flatMap((buyer) => [buyer.id, ...(buyer.email ? [buyer.email] : [])]);
    const leaks = (text: string) => needles.filter((needle) => text.includes(needle) || text.includes(JSON.stringify(needle).slice(1, -1)));
    expect(leaks(JSON.stringify({ planted: { buyer: buyers[0]!.id, email: buyers[0]!.email } }, null, 2))).not.toEqual([]);

    const dir = mkdtempSync(join(tmpdir(), "envoi-archive-"));
    try {
      const files = await exportArchivedOrders(drizzle(fixture.database.admin, { schema }), { outletId: shop.outletId, dir });
      expect(readdirSync(dir).sort()).toEqual(orders.map((order) => `${order.purchaseId}.json`).sort());
      expect(files).toHaveLength(2);
      for (const order of orders) {
        const text = readFileSync(join(dir, `${order.purchaseId}.json`), "utf8");
        expect(leaks(text)).toEqual([]);
        expect(JSON.parse(text)).toMatchObject({ kind: "envoi_archived_order", purchaseId: order.purchaseId, outlet: { id: shop.outletId }, archivedByUserId: shop.merchant.userId });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
