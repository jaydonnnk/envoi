import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { captureEvent, delivery, fakeVerificationFetch, type VerificationCall } from "../support/fake-webhooks";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
vi.mock("@/integrations/paypal/orders-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders-read")>()),
  paypalReadClient: () => paypal.client,
}));

// D10: with PAYMENTS_ENABLED false, PayPal start and completion refuse before any provider call,
// while Check status and verified webhooks, which move no new money, still converge.
describe("payments kill switch refuses PayPal start and completion", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
    webhook: typeof import("@/app/api/v1/integrations/paypal/webhook/route");
  };
  const verifications: VerificationCall[] = [];

  beforeAll(async () => {
    fixture = await createPaymentsFixture("killswitch", { PAYMENTS_ENABLED: "false" });
    fake = createFakePayPal();
    paypal.client = fake.client;
    vi.stubGlobal("fetch", fakeVerificationFetch(verifications));
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
      webhook: await import("@/app/api/v1/integrations/paypal/webhook/route"),
    };
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  async function openReview(quantity: number): Promise<{ cookie: string; purchaseId: string }> {
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[0]!.id, quantity }] }),
    );
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { purchaseId: string } };
    return { cookie, purchaseId: data.purchaseId };
  }

  it("paypal/start on an open review answers payments_disabled and saves no attempt", async () => {
    const { cookie, purchaseId } = await openReview(1);
    const response = await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, cookie), routeParams(purchaseId));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "payments_disabled" } });
    expect(await fixture.database.admin`select id from payment_attempts where purchase_id = ${purchaseId}`).toHaveLength(0);
    expect(fake.calls).toEqual([]);
  });

  it("paypal/complete on an externally_approved attempt answers payments_disabled, takes no lease and sends no capture", async () => {
    const { cookie, purchaseId } = await openReview(2);
    // FIXTURE: an attempt PayPal approved before the switch was turned off.
    await fixture.database.admin`update purchases set state = 'pending_payment' where id = ${purchaseId}`;
    await fixture.database.admin`
      insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_sgd_cents, currency, create_request_id, order_id, approval_url)
      select 'att_killswitch', id, 'externally_approved', ${FIXTURE_SELLER}, total_sgd_cents, 'SGD', 'fixture-create-key', 'FIXTURE-ORDER-KILL', 'https://www.sandbox.paypal.com/checkoutnow?token=FIXTURE-ORDER-KILL'
      from purchases where id = ${purchaseId}`;

    const response = await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, cookie), routeParams(purchaseId));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "payments_disabled" } });
    const [attempt] = await fixture.database.admin`select state, lease_owner, capture_request_id from payment_attempts where id = 'att_killswitch'`;
    expect(attempt).toEqual({ state: "externally_approved", lease_owner: null, capture_request_id: null });
    expect(fake.calls).toEqual([]);
  });

  // FIXTURE: a capture dispatched before the switch was turned off whose response was lost. The fake
  // PayPal holds the captured order; Envoi's attempt is capture_unknown and its purchase uncertain.
  async function lostCaptureBeforeSwitchOff(quantity: number): Promise<{ cookie: string; purchaseId: string; orderId: string; captureId: string }> {
    const { cookie, purchaseId } = await openReview(quantity);
    const [purchase] = await fixture.database.admin`select lines, total_sgd_cents from purchases where id = ${purchaseId}`;
    const lines = purchase!.lines as { name: string; quantity: number; unitSgdCents: number }[];
    const attemptId = `att_ks${quantity}`;
    const created = await fake.client.createOrder(
      {
        purchaseId,
        attemptId,
        correlationId: purchaseId,
        payeeMerchantId: FIXTURE_SELLER,
        lines,
        totalSgdCents: purchase!.total_sgd_cents as number,
        returnUrl: `${TEST_BASE_URL}/paypal/return`,
        cancelUrl: `${TEST_BASE_URL}/paypal/cancel`,
      },
      `fixture-create-key-${quantity}`,
    );
    if (created.kind !== "ok") throw new Error("fixture order not created");
    const orderId = created.value.id;
    fake.approve(orderId);
    const captured = await fake.client.captureOrder(orderId, `fixture-capture-key-${quantity}`);
    if (captured.kind !== "ok") throw new Error("fixture capture not made");
    await fixture.database.admin`update purchases set state = 'uncertain' where id = ${purchaseId}`;
    await fixture.database.admin`
      insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_sgd_cents, currency, create_request_id, order_id, capture_request_id)
      select ${attemptId}, id, 'capture_unknown', ${FIXTURE_SELLER}, total_sgd_cents, 'SGD', ${`fixture-create-key-${quantity}`}, ${orderId}, ${`fixture-capture-key-${quantity}`}
      from purchases where id = ${purchaseId}`;
    return { cookie, purchaseId, orderId, captureId: captured.value.captures[0]!.id! };
  }

  const settled = async (purchaseId: string) =>
    (await fixture.database.admin`select p.state, a.state as attempt, a.capture_id from purchases p join payment_attempts a on a.purchase_id = p.id where p.id = ${purchaseId}`)[0];

  it("Check status still converges with the payments switch off", async () => {
    const { cookie, purchaseId, captureId } = await lostCaptureBeforeSwitchOff(3);
    const capturesBefore = fake.captures().length;
    const response = await routes.reconcile.POST(jsonPost(`/api/v1/purchases/${purchaseId}/reconcile`, cookie), routeParams(purchaseId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { check: "read", purchase: { state: "paid" } } });
    expect(await settled(purchaseId)).toEqual({ state: "paid", attempt: "capture_confirmed", capture_id: captureId });
    expect(fake.captures()).toHaveLength(capturesBefore);
  });

  it("a verified webhook still triggers a provider read with the payments switch off", async () => {
    const { purchaseId, orderId, captureId } = await lostCaptureBeforeSwitchOff(4);
    const capturesBefore = fake.captures().length;
    const response = await routes.webhook.POST(delivery(captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, captureId)));
    expect(response.status).toBe(200);
    expect(verifications.at(-1)?.status).toBe("SUCCESS");
    expect(await settled(purchaseId)).toEqual({ state: "paid", attempt: "capture_confirmed", capture_id: captureId });
    expect(fake.captures()).toHaveLength(capturesBefore);
  });
});
