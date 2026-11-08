import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { feeText, netText } from "@/app/merchant/orders/order-copy";
import type { OutletOrders } from "@/domain/purchases/orders";
import type { PayPalOrder } from "@/domain/purchases/reconcile";
import type { SalesSummary } from "@/domain/purchases/sales-summary";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { jsonRequest } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie } from "../support/session";

// S46, the Tourist Sales Desk: named tests 73, 74 and 75 through the real purchase, completion,
// orders and sales-summary routes on a disposable database. PayPal is the labeled FIXTURE fake at
// PayPalWriteClient; its `tamper` adds the fee, net and payer country PayPal's order read carries.

const platform = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => platform.client!,
}));

type Figures = { feeMinor: number | null; netMinor: number | null; payerCountry: string | null };
const withFigures = (figures: Figures) => (order: PayPalOrder): PayPalOrder => ({
  ...order,
  payerCountry: figures.payerCountry,
  captures: order.captures.map((capture) => ({ ...capture, feeMinor: figures.feeMinor, netMinor: figures.netMinor })),
});

describe("the sales desk", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let shop: Shop;
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    orders: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/route");
    summary: typeof import("@/app/api/v1/merchant/outlets/[id]/sales-summary/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("salesdesk");
    fake = createFakePayPal();
    platform.client = fake.client;
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      orders: await import("@/app/api/v1/merchant/outlets/[id]/orders/route"),
      summary: await import("@/app/api/v1/merchant/outlets/[id]/sales-summary/route"),
    };
  });

  // A fresh shop per test, so each test's totals hold only its own orders.
  beforeEach(async () => {
    fake.tamper = null;
    shop = (await shopApi(fixture.database, routes).publishedShop(`desk-${Math.random().toString(36).slice(2, 8)}`)).shop;
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  // A buyer's PayPal order of one of each published item, approved in the fake; `complete` decides it.
  async function startedOrder(): Promise<{ buyer: string; purchaseId: string }> {
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    expect(created.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    const [attempt] = await fixture.database.admin<{ order_id: string }[]>`select order_id from payment_attempts where purchase_id = ${purchaseId}`;
    fake.approve(attempt!.order_id);
    return { buyer, purchaseId };
  }

  async function completed(figures: Figures | null): Promise<{ purchaseId: string; state: string; status: string }> {
    const { buyer, purchaseId } = await startedOrder();
    fake.tamper = figures ? withFigures(figures) : null;
    const response = await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId));
    fake.tamper = null;
    const [row] = await fixture.database.admin<{ state: string }[]>`select state from purchases where id = ${purchaseId}`;
    return { purchaseId, state: row!.state, status: (await envelope<{ status: string }>(response)).data.status };
  }

  const orders = async (): Promise<OutletOrders> => {
    const response = await routes.orders.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${shop.outletId}/orders`, shop.cookie), routeParams(shop.outletId));
    expect(response.status).toBe(200);
    return (await envelope<OutletOrders>(response)).data;
  };
  const summaries = async (): Promise<SalesSummary[]> => {
    const response = await routes.summary.GET(jsonRequest("GET", `/api/v1/merchant/outlets/${shop.outletId}/sales-summary`, shop.cookie), routeParams(shop.outletId));
    expect(response.status).toBe(200);
    return (await envelope<{ summaries: SalesSummary[] }>(response)).data.summaries;
  };
  const gross = async (purchaseId: string) => (await fixture.database.admin<{ g: number }[]>`select capture_gross_minor as g from payment_attempts where purchase_id = ${purchaseId}`)[0]!.g;

  describe("73 a missing fee shows as unknown, never zero", () => {
    it("keeps PayPal's missing fee, net and country null on the row and out of the known totals", async () => {
      const known = await completed({ feeMinor: 83, netMinor: 497, payerCountry: "US" });
      const missing = await completed(null);
      expect([known.state, missing.state]).toEqual(["paid", "paid"]);

      const rows = (await orders()).orders;
      const missingRow = rows.find((order) => order.id === missing.purchaseId)!;
      const knownRow = rows.find((order) => order.id === known.purchaseId)!;
      expect(missingRow.payment).toMatchObject({ captureFeeMinor: null, captureNetMinor: null, payerCountry: null });
      expect(knownRow.payment).toMatchObject({ captureFeeMinor: 83, captureNetMinor: 497, payerCountry: "US" });
      expect([feeText(missingRow), netText(missingRow)]).toEqual(["Unknown", "Unknown"]);

      const [sgd] = await summaries();
      expect(sgd).toMatchObject({ currency: "SGD", paidCount: 2, knownFeeMinor: 83, knownNetMinor: 497, unknownFeeCount: 1 });
      expect(sgd!.paidMinor).toBe((await gross(known.purchaseId)) + (await gross(missing.purchaseId)));
    });
  });

  describe("74 a missing fee never blocks Paid", () => {
    it("reaches Paid with no fee, net or country, as a capture with them does", async () => {
      const bare = await completed(null);
      const full = await completed({ feeMinor: 62, netMinor: 518, payerCountry: "GB" });
      expect([bare.status, bare.state]).toEqual(["paid", "paid"]);
      expect([full.status, full.state]).toEqual(["paid", "paid"]);
    });
  });

  describe("75 totals count paid orders only", () => {
    it("adds nothing for a pending order or an uncertain capture", async () => {
      const paid = await completed({ feeMinor: 62, netMinor: 518, payerCountry: "US" });
      await startedOrder();
      // FIXTURE: PayPal reports a capture of one minor unit less than the stored total.
      const { buyer, purchaseId } = await startedOrder();
      fake.tamper = (order) => ({ ...withFigures({ feeMinor: 1, netMinor: 1, payerCountry: "US" })(order), captures: order.captures.map((capture) => ({ ...capture, amount: capture.amount && { ...capture.amount, minor: (capture.amount.minor ?? 0) - 1 }, feeMinor: 1, netMinor: 1 })) });
      await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId));
      fake.tamper = null;

      const states = (await orders()).orders.map((order) => order.state).sort();
      expect(states).toEqual(["paid", "pending_payment", "uncertain"]);
      const [sgd] = await summaries();
      expect(sgd).toMatchObject({ paidCount: 1, paidMinor: await gross(paid.purchaseId), knownFeeMinor: 62, knownNetMinor: 518, unknownFeeCount: 0 });
    });
  });

  describe("75 totals count paid orders only, without completed refunds", () => {
    it("leaves out an order whose refund PayPal completed, and keeps one whose refund is still sent", async () => {
      const kept = await completed({ feeMinor: 62, netMinor: 518, payerCountry: "US" });
      const refunded = await completed({ feeMinor: 83, netMinor: 897, payerCountry: "GB" });
      const pendingRefund = await completed({ feeMinor: 10, netMinor: 90, payerCountry: "AU" });
      const [user] = await fixture.database.admin<{ id: string }[]>`select id from "user" limit 1`;
      // FIXTURE refund rows, as S45's confirmed refund writes them.
      for (const [purchaseId, state] of [[refunded.purchaseId, "completed"], [pendingRefund.purchaseId, "sent"]] as const) {
        const [attempt] = await fixture.database.admin<{ id: string; capture_id: string; g: number }[]>`select id, capture_id, capture_gross_minor as g from payment_attempts where purchase_id = ${purchaseId}`;
        await fixture.database.admin`insert into refunds (id, attempt_id, purchase_id, outlet_id, capture_id, paypal_refund_id, amount_minor, currency, state, confirmed_by_user_id, idempotency_key) values (${`ref_${purchaseId}`}, ${attempt!.id}, ${purchaseId}, ${shop.outletId}, ${attempt!.capture_id}, ${state === "completed" ? `FIXTURE-${purchaseId}` : null}, ${attempt!.g}, 'SGD', ${state}, ${user!.id}, ${`key_${purchaseId}`})`;
      }

      expect((await orders()).orders.filter((order) => order.state === "paid")).toHaveLength(3);
      const [sgd] = await summaries();
      expect(sgd).toMatchObject({ paidCount: 2, paidMinor: (await gross(kept.purchaseId)) + (await gross(pendingRefund.purchaseId)), knownFeeMinor: 72, knownNetMinor: 608, unknownFeeCount: 0 });
    });
  });

  describe("0033 grants", () => {
    let web: postgres.Sql;
    let maintenance: postgres.Sql;
    beforeAll(() => {
      web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
      maintenance = postgres(fixture.database.maintenanceUrl, { max: 1, onnotice: () => {} });
    });
    afterAll(async () => {
      await web?.end({ timeout: 5 });
      await maintenance?.end({ timeout: 5 });
    });
    const outcome = (query: Promise<unknown>) => query.then(() => "ok", (err: { code?: string }) => err.code ?? "no_code");

    it("lets both roles that verify a capture store its fee, net and payer country", async () => {
      for (const role of [web, maintenance]) {
        expect(await outcome(role`update payment_attempts set capture_fee_minor = 1, capture_net_minor = 1, payer_country = 'US' where false`)).toBe("ok");
      }
    });
  });
});
