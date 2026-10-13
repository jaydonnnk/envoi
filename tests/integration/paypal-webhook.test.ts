import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { captureEvent, delivery, fakeVerificationFetch, orderEvent, type VerificationCall } from "../support/fake-webhooks";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";
import { transcript } from "../support/transcript";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
vi.mock("@/integrations/paypal/orders-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders-read")>()),
  paypalReadClient: () => paypal.client,
}));

// The webhook inbox against the real schema as envoi_web. Deliveries and PayPal's verification
// postback are fixture fakes (see fake-webhooks.ts); orders come from the fixture PayPal fake.
describe("PayPal webhook inbox (fixture deliveries)", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  const verifications: VerificationCall[] = [];
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
    webhook: typeof import("@/app/api/v1/integrations/paypal/webhook/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("webhook");
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

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  // A purchase whose capture was dispatched. "landed": PayPal captured and the answer was lost;
  // "not_landed": the capture request never reached PayPal; "paid": an ordinary verified capture.
  async function purchaseAfterCapture(kind: "landed" | "not_landed" | "paid", quantity: number) {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const created = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[1]!.id, quantity }] }),
    );
    const { data } = (await created.json()) as { data: { purchaseId: string } };
    const purchaseId = data.purchaseId;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, cookie), routeParams(purchaseId))).status).toBe(200);
    const orderId = fake.calls[0]!.orderId!;
    fake.approve(orderId);
    if (kind !== "paid") fake.fail("captureOrder", kind === "landed" ? "lose_response" : "lose_request");
    expect((await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, cookie), routeParams(purchaseId))).status).toBe(200);
    expect((await state(purchaseId)).purchase).toBe(kind === "paid" ? "paid" : "uncertain");
    return { cookie, purchaseId, orderId, captureId: `FIXTURE-CAPTURE-${orderId.slice("FIXTURE-ORDER-".length)}` };
  }

  async function state(purchaseId: string) {
    const [purchase] = await fixture.database.admin`select state from purchases where id = ${purchaseId}`;
    const [attempt] = await fixture.database.admin`select state, capture_id, provider_read_due_at from payment_attempts where purchase_id = ${purchaseId}`;
    return { purchase: purchase!.state as string, attempt: attempt!.state as string, captureId: attempt!.capture_id as string | null, due: attempt!.provider_read_due_at as Date | null };
  }

  const events = (eventId: string) => fixture.database.admin`select disposition, order_id, attempt_id from provider_events where event_id = ${eventId}`;
  const send = (request: Request) => routes.webhook.POST(request);

  it("a verified webhook triggers a provider read that confirms a lost capture", async () => {
    const log = transcript("webhook after a lost capture response");
    const { purchaseId, orderId, captureId } = await purchaseAfterCapture("landed", 1);
    const event = captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, captureId);
    const before = { reads: fake.reads().length, captures: fake.captures().length };
    const response = await send(delivery(event));
    expect(response.status).toBe(200);
    expect(verifications.at(-1)).toEqual({ webhookId: "FIXTURE-WEBHOOK-ID", status: "SUCCESS" });
    expect(await events(event.id)).toEqual([expect.objectContaining({ disposition: "read_due", order_id: orderId })]);
    expect(fake.reads().length).toBe(before.reads + 1);
    expect(fake.captures().length).toBe(before.captures);
    expect(await state(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", captureId, due: null });
    log.step(`verified ${event.event_type} ${event.id}: inbox row read_due, one read-only provider read, no capture call; purchase paid with ${captureId}`);
    log.print();
  });

  it("unverified webhook signature is rejected", async () => {
    const { purchaseId, orderId, captureId } = await purchaseAfterCapture("landed", 2);
    const event = captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, captureId);
    const forged = delivery(event, { forge: (raw) => raw.replace("999.00", "1.00") });
    const before = { reads: fake.reads().length, purchase: await state(purchaseId) };
    const response = await send(forged);
    expect(response.status).toBe(400);
    expect(verifications.at(-1)?.status).toBe("FAILURE");
    expect(await events(event.id)).toEqual([]);
    expect(fake.reads()).toHaveLength(before.reads);
    expect(await state(purchaseId)).toEqual(before.purchase);
    // Signed for another app's webhook id: also refused.
    expect((await send(delivery(event, { webhookId: "FIXTURE-OTHER-WEBHOOK" }))).status).toBe(400);
    expect(await state(purchaseId)).toEqual(before.purchase);
  });

  it("duplicate webhook changes nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { purchaseId, orderId, captureId } = await purchaseAfterCapture("not_landed", 3);
    const event = captureEvent("PAYMENT.CAPTURE.PENDING", orderId, captureId);
    expect((await send(delivery(event))).status).toBe(200);
    const afterFirst = { reads: fake.reads().length, purchase: await state(purchaseId), audits: await fixture.database.admin`select id from audit_events where purchase_id = ${purchaseId}` };
    // Past the debounce window, so only the inbox can stop a second read.
    vi.setSystemTime(Date.now() + 31_000);
    expect((await send(delivery(event))).status).toBe(200);
    expect(await events(event.id)).toHaveLength(1);
    expect(fake.reads()).toHaveLength(afterFirst.reads);
    expect(await state(purchaseId)).toEqual(afterFirst.purchase);
    expect(await fixture.database.admin`select id from audit_events where purchase_id = ${purchaseId}`).toHaveLength(afterFirst.audits.length);
  });

  it("webhook content alone cannot mark paid", async () => {
    const { purchaseId, orderId, captureId } = await purchaseAfterCapture("not_landed", 4);
    const event = captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, captureId);
    expect((await send(delivery(event))).status).toBe(200);
    // The read found no capture, and the webhook path cannot replay or capture.
    expect(fake.captures()).toHaveLength(1);
    expect(await state(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: "capture_unknown", captureId: null });
  });

  it("unknown-order webhook is quarantined", async () => {
    await purchaseAfterCapture("not_landed", 5);
    const purchasesBefore = await fixture.database.admin`select id, state from purchases order by id`;
    const attemptsBefore = await fixture.database.admin`select id, state, provider_read_due_at from payment_attempts order by id`;
    const readsBefore = fake.reads().length;
    const event = orderEvent("CHECKOUT.ORDER.APPROVED", "FIXTURE-ORDER-NEVER-CREATED");
    expect((await send(delivery(event))).status).toBe(200);
    expect(await events(event.id)).toEqual([{ disposition: "quarantined_unknown_order", order_id: "FIXTURE-ORDER-NEVER-CREATED", attempt_id: null }]);
    const alerts = await fixture.database.admin`
      select operator_visible, purchase_id, details->>'eventId' as event_id from audit_events where action = 'paypal_webhook_unknown_order'`;
    expect(alerts).toEqual([{ operator_visible: true, purchase_id: null, event_id: event.id }]);
    expect(fake.reads()).toHaveLength(readsBefore);
    expect(await fixture.database.admin`select id, state from purchases order by id`).toEqual(purchasesBefore);
    expect(await fixture.database.admin`select id, state, provider_read_due_at from payment_attempts order by id`).toEqual(attemptsBefore);
  });

  it("no callback downgrades paid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cookie, purchaseId, orderId, captureId } = await purchaseAfterCapture("paid", 6);
    // From now on PayPal's record reports the capture reversed.
    fake.tamper = (order) => ({ ...order, status: "COMPLETED", captures: order.captures.map((capture) => ({ ...capture, status: "REVERSED" })) });
    const event = captureEvent("PAYMENT.CAPTURE.REVERSED", orderId, captureId);
    const readsBefore = fake.reads().length;
    expect((await send(delivery(event))).status).toBe(200);
    expect(fake.reads()).toHaveLength(readsBefore + 1);
    expect(await state(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", captureId });
    // A buyer's Check status reading the same record changes nothing either.
    vi.setSystemTime(Date.now() + 31_000);
    expect((await routes.reconcile.POST(jsonPost(`/api/v1/purchases/${purchaseId}/reconcile`, cookie), routeParams(purchaseId))).status).toBe(200);
    expect(await state(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", captureId });
    const alerts = await fixture.database.admin`select operator_visible from audit_events where purchase_id = ${purchaseId} and action = 'paypal_paid_read_mismatch'`;
    expect(alerts).toEqual([{ operator_visible: true }, { operator_visible: true }]);
  });
});
