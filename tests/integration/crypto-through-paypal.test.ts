import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cryptoAllowed } from "@/domain/payments/attempts";
import { canTransitionAttempt } from "@/domain/payments/state";
import { canTransitionPurchase } from "@/domain/purchases/state";
import { createOrderBody, type CreateOrderInput, type PayPalWriteClient } from "@/integrations/paypal/orders";
import { isSandboxApprovalUrl } from "@/integrations/paypal/client";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { captureEvent, delivery, fakeVerificationFetch, type VerificationCall } from "../support/fake-webhooks";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { FIXTURE_MENU, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
vi.mock("@/integrations/paypal/orders-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders-read")>()),
  paypalReadClient: () => paypal.client,
}));
const state = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});

const PAST_REVIEW_MS = 6 * 60_000;

// S38: crypto through PayPal, against the real schema as envoi_web. PayPal is the labeled fixture
// fake: every order and capture id is FIXTURE-*, and PayPal's own capture on approval is modeled by
// fake.payCrypto, with no capture call from Envoi.
describe("crypto through PayPal (S38)", () => {
  let fixture: PaymentsFixture;
  let us: { shop: Shop; itemId: string; seller: string };
  const verifications: VerificationCall[] = [];
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    cancel: typeof import("@/app/api/v1/purchases/[id]/cancel/route");
    webhook: typeof import("@/app/api/v1/integrations/paypal/webhook/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("crypto_paypal");
    vi.stubGlobal("fetch", fakeVerificationFetch(verifications));
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      cancel: await import("@/app/api/v1/purchases/[id]/cancel/route"),
      webhook: await import("@/app/api/v1/integrations/paypal/webhook/route"),
    };
    const { shop } = await shopApi(fixture.database, routes).publishedShop("us_crypto", FIXTURE_MENU, "US");
    const items = await publishedItems(fixture.database, shop.outletId);
    const [destination] = await fixture.database.admin<{ seller: string }[]>`
      select d.seller_merchant_id as seller from payment_destinations d where d.outlet_id = ${shop.outletId} and d.seller_merchant_id is not null`;
    us = { shop, itemId: items[0]!.id, seller: destination!.seller };
  });

  afterEach(() => {
    vi.useRealTimers();
    state.env = {};
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  const admin = () => fixture.database.admin;
  const post = (path: string, cookie: string, id: string, handler: (req: Request, ctx: ReturnType<typeof routeParams>) => Promise<Response>, body: unknown = {}) =>
    handler(jsonPost(`/api/v1/purchases/${id}/${path}`, cookie, body), routeParams(id));

  async function review(fake: FakePayPal, outletId: string, itemId: string) {
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId, rail: "paypal", lines: [{ menuItemId: itemId, quantity: 1 }] }));
    expect(response.status).toBe(201);
    return { cookie, purchaseId: ((await response.json()) as { data: { purchaseId: string } }).data.purchaseId };
  }

  // A crypto order, created and waiting for the buyer at PayPal.
  async function started(fake: FakePayPal) {
    state.env = { PAYPAL_CRYPTO_ENABLED: [us.seller] };
    const { cookie, purchaseId } = await review(fake, us.shop.outletId, us.itemId);
    expect((await post("paypal/start", cookie, purchaseId, routes.start.POST, { funding: "crypto" })).status).toBe(200);
    return { cookie, purchaseId, orderId: fake.calls.find((call) => call.op === "createOrder")!.orderId! };
  }

  async function outcome(purchaseId: string) {
    const [row] = await admin()<{ purchase: string; attempt: string; captureId: string | null; captureKey: string | null; funding: string }[]>`
      select p.state as purchase, a.state as attempt, a.capture_id as "captureId", a.capture_request_id as "captureKey", a.paypal_funding as funding
      from purchases p join payment_attempts a on a.purchase_id = p.id where p.id = ${purchaseId}`;
    return row!;
  }

  const pastReview = () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + PAST_REVIEW_MS));
  };

  it("a crypto attempt never calls capture", async () => {
    const fake = createFakePayPal();
    const { cookie, purchaseId, orderId } = await started(fake);
    fake.payCrypto(orderId);
    expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(200);
    expect(await outcome(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", funding: "crypto", captureKey: null });
    expect((await outcome(purchaseId)).captureId).toContain("FIXTURE-CAPTURE-CRYPTO");
    expect(fake.captures()).toEqual([]);
    expect(await admin()`select 1 from payment_attempts where purchase_id = ${purchaseId} and capture_request_id is not null`).toEqual([]);
  });

  describe("crypto is refused for a Singapore shop and an unlisted seller", () => {
    it("a Singapore shop, even with its seller listed", async () => {
      const fake = createFakePayPal();
      state.env = { PAYPAL_CRYPTO_ENABLED: ["FXTRSELLER2AB"] };
      const { cookie, purchaseId } = await review(fake, fixture.outletId, fixture.items[0]!.id);
      expect((await post("paypal/start", cookie, purchaseId, routes.start.POST, { funding: "crypto" })).status).toBe(400);
      expect(fake.writes()).toEqual([]);
    });

    it("an unlisted seller, and an empty allowlist", async () => {
      for (const allowlist of [["OTHERSELLER99"], []]) {
        const fake = createFakePayPal();
        state.env = { PAYPAL_CRYPTO_ENABLED: allowlist };
        const { cookie, purchaseId } = await review(fake, us.shop.outletId, us.itemId);
        expect((await post("paypal/start", cookie, purchaseId, routes.start.POST, { funding: "crypto" })).status).toBe(400);
        expect(fake.writes()).toEqual([]);
      }
    });

    it("the rule itself", () => {
      expect(cryptoAllowed({ country: "US" }, "A", ["A"])).toBe(true);
      expect(cryptoAllowed({ country: "SG" }, "A", ["A"])).toBe(false);
      expect(cryptoAllowed({ country: "US" }, "A", ["B"])).toBe(false);
    });
  });

  describe("a crypto order that is not COMPLETED never reads paid", () => {
    it("Failed or abandoned at PayPal: the order still waits for the buyer", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await started(fake);
      expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(202);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "pending_payment", attempt: "order_created", captureId: null });
    });

    it("Cancelled at PayPal: the purchase closes unpaid", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await started(fake);
      expect((await post("cancel", cookie, purchaseId, routes.cancel.POST)).status).toBe(200);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "unpaid_closed", attempt: "abandoned", captureId: null });
    });

    it("a capture that is still pending", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      fake.payCrypto(orderId);
      fake.tamper = (order) => ({ ...order, captures: order.captures.map((capture) => ({ ...capture, status: "PENDING" })) });
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: "capture_unknown", captureId: null });
    });

    it("a declined capture closes unpaid", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      fake.payCrypto(orderId);
      fake.tamper = (order) => ({ ...order, captures: order.captures.map((capture) => ({ ...capture, status: "DECLINED" })) });
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "unpaid_closed", attempt: "capture_failed", captureId: null });
    });
  });

  describe("a crypto order with a wrong payee or amount never reads paid", () => {
    it("a wrong payee", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      fake.payCrypto(orderId);
      fake.tamper = (order) => ({ ...order, payeeMerchantId: "ANOTHERSELLER" });
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: "capture_unknown", captureId: null });
    });

    it("a wrong amount", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      fake.payCrypto(orderId);
      fake.tamper = (order) => ({ ...order, captures: order.captures.map((capture) => ({ ...capture, amount: { currency: "USD", minor: 1 } })) });
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: "capture_unknown", captureId: null });
    });

    it("a wrong payee after the purchase closed reopens it as uncertain, not paid", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      await post("cancel", cookie, purchaseId, routes.cancel.POST);
      fake.payCrypto(orderId);
      fake.tamper = (order) => ({ ...order, payeeMerchantId: "ANOTHERSELLER" });
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: "capture_unknown", captureId: null });
    });
  });

  it("a PayPal attempt's order body is unchanged", () => {
    const input: CreateOrderInput = {
      purchaseId: "pur_1",
      attemptId: "att_1",
      correlationId: "pur_1",
      payeeMerchantId: "SELLER",
      lines: [{ name: "Tea", quantity: 2, unitMinor: 150 }],
      totalMinor: 300,
      currency: "USD",
      returnUrl: "https://envoi.test/r",
      cancelUrl: "https://envoi.test/c",
      funding: "paypal",
    };
    const amount = { currency_code: "USD", value: "3.00" };
    expect(createOrderBody(input)).toEqual({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "pur_1",
          custom_id: "pur_1",
          invoice_id: "att_1",
          payee: { merchant_id: "SELLER" },
          amount: { ...amount, breakdown: { item_total: amount } },
          items: [{ name: "Tea", quantity: "2", unit_amount: { currency_code: "USD", value: "1.50" } }],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: { brand_name: "Envoi sandbox", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: "https://envoi.test/r", cancel_url: "https://envoi.test/c" },
        },
      },
    });
    const crypto = createOrderBody({ ...input, funding: "crypto" }) as { processing_instruction: string; payment_source: { crypto: { name: unknown }; paypal?: unknown } };
    expect(crypto.processing_instruction).toBe("ORDER_COMPLETE_ON_PAYMENT_APPROVAL");
    expect(crypto.payment_source.paypal).toBeUndefined();
    expect(crypto.payment_source.crypto.name).toEqual({ given_name: "Envoi", surname: "Fixture" });
  });

  describe("a crypto approval after the review window reads paid", () => {
    it("on the buyer's return, after the window closed it", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      pastReview();
      await post("cancel", cookie, purchaseId, routes.cancel.POST);
      expect((await outcome(purchaseId)).purchase).toBe("unpaid_closed");
      fake.payCrypto(orderId);
      expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(200);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", captureKey: null });
      expect(fake.captures()).toEqual([]);
      expect(await admin()`select action from audit_events where purchase_id = ${purchaseId} and action = 'crypto_settled_after_close'`).toHaveLength(1);
    });

    it("with the kill switch off, because the money already moved", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await started(fake);
      state.env = { ...state.env, PAYMENTS_ENABLED: false };
      fake.payCrypto(orderId);
      expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(200);
      expect((await outcome(purchaseId)).purchase).toBe("paid");
    });

    it("by the webhook, for a buyer who never returns", async () => {
      const fake = createFakePayPal();
      const { purchaseId, orderId } = await started(fake);
      pastReview();
      fake.payCrypto(orderId);
      const response = await routes.webhook.POST(delivery(captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, `FIXTURE-CAPTURE-CRYPTO-${orderId}`)));
      expect(response.status).toBe(200);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", captureKey: null });
      expect(fake.captures()).toEqual([]);
    });
  });

  describe("a PayPal attempt never leaves abandoned and a PayPal purchase never leaves unpaid_closed", () => {
    it("the tables", () => {
      for (const to of ["capture_confirmed", "capture_unknown", "capture_failed"] as const) {
        expect(canTransitionAttempt("abandoned", to)).toBe(false);
        expect(canTransitionAttempt("abandoned", to, "paypal")).toBe(false);
        expect(canTransitionAttempt("abandoned", to, "crypto")).toBe(true);
      }
      expect(canTransitionAttempt("order_created", "capture_confirmed")).toBe(false);
      expect(canTransitionPurchase({ from: "unpaid_closed", to: "paid", reason: "capture_confirmed" })).toBe(false);
      expect(canTransitionPurchase({ from: "unpaid_closed", to: "paid", reason: "capture_confirmed", funding: "paypal" })).toBe(false);
      expect(canTransitionPurchase({ from: "unpaid_closed", to: "paid", reason: "capture_confirmed", funding: "crypto" })).toBe(true);
      expect(canTransitionPurchase({ from: "unpaid_closed", to: "paid", reason: "buyer_said_so", funding: "crypto" })).toBe(false);
    });

    it("a completed read of a closed PayPal attempt changes nothing", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await review(fake, us.shop.outletId, us.itemId);
      expect((await post("paypal/start", cookie, purchaseId, routes.start.POST)).status).toBe(200);
      const orderId = fake.calls.find((call) => call.op === "createOrder")!.orderId!;
      await post("cancel", cookie, purchaseId, routes.cancel.POST);
      fake.payCrypto(orderId);
      await routes.webhook.POST(delivery(captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, `FIXTURE-CAPTURE-CRYPTO-${orderId}`)));
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "unpaid_closed", attempt: "abandoned", funding: "paypal", captureId: null });
    });
  });

  it("the approval link accepts sandbox.paypal.com and refuses any other host", () => {
    expect(isSandboxApprovalUrl("https://sandbox.paypal.com/payment/crypto?token=X")).toBe(true);
    expect(isSandboxApprovalUrl("https://www.sandbox.paypal.com/checkoutnow?token=X")).toBe(true);
    for (const url of ["https://paypal.com/payment/crypto?token=X", "https://sandbox.paypal.com.evil.test/x", "http://sandbox.paypal.com/x", "https://sandbox.paypal.com:8443/x"]) {
      expect(isSandboxApprovalUrl(url)).toBe(false);
    }
  });

  it("the database refuses a capture key on a crypto attempt and a confirmed PayPal attempt without one", async () => {
    const fake = createFakePayPal();
    const { purchaseId } = await started(fake);
    await expect(admin()`update payment_attempts set capture_request_id = 'fixture-key' where purchase_id = ${purchaseId}`).rejects.toThrow(/payment_attempts_crypto_no_capture_key_check/);
    const paypalFake = createFakePayPal();
    const other = await review(paypalFake, us.shop.outletId, us.itemId);
    expect((await post("paypal/start", other.cookie, other.purchaseId, routes.start.POST)).status).toBe(200);
    await expect(admin()`update payment_attempts set state = 'capture_unknown' where purchase_id = ${other.purchaseId}`).rejects.toThrow(/payment_attempts_capture_key_check/);
  });

  it("one review keeps the way to pay it started with", async () => {
    const fake = createFakePayPal();
    const { cookie, purchaseId } = await started(fake);
    expect((await post("paypal/start", cookie, purchaseId, routes.start.POST)).status).toBe(400);
    expect(fake.calls.filter((call) => call.op === "createOrder")).toHaveLength(1);
  });
});
