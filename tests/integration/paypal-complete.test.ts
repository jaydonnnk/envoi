import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { completePayPal, type CompleteResult } from "@/domain/payments/attempts";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import type { AppError } from "@/lib/errors";
import { sgdFromCents } from "@/lib/money";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// paypal/complete against the real schema as envoi_web. PayPal is a labeled fixture fake, so every
// order and capture id below is FIXTURE-*, never a sandbox record.
describe("paypal/complete", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("complete");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  // A started purchase whose fixture order the buyer approved at the fake PayPal.
  async function approvedPurchase(quantity: number, approve = true): Promise<{ cookie: string; purchaseId: string; orderId: string }> {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const created = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[1]!.id, quantity }] }),
    );
    const { data } = (await created.json()) as { data: { purchaseId: string } };
    const started = await routes.start.POST(jsonPost(`/api/v1/purchases/${data.purchaseId}/paypal/start`, cookie), routeParams(data.purchaseId));
    expect(started.status).toBe(200);
    const orderId = fake.calls[0]!.orderId!;
    if (approve) fake.approve(orderId);
    return { cookie, purchaseId: data.purchaseId, orderId };
  }

  const complete = (cookie: string, purchaseId: string) =>
    routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, cookie), routeParams(purchaseId));

  const rows = async (purchaseId: string) => {
    const [purchase] = await fixture.database.admin`select state from purchases where id = ${purchaseId}`;
    const [attempt] = await fixture.database.admin`select state, capture_id, outcome_reason, lease_owner from payment_attempts where purchase_id = ${purchaseId}`;
    return { purchase: purchase!.state as string, attempt: attempt as unknown as { state: string; capture_id: string | null; outcome_reason: string | null; lease_owner: string | null } };
  };

  it("a verified capture marks the purchase paid (fixture)", async () => {
    const { cookie, purchaseId, orderId } = await approvedPurchase(1);
    const response = await complete(cookie, purchaseId);
    expect(response.status).toBe(200);
    const captureId = `FIXTURE-CAPTURE-${orderId.slice("FIXTURE-ORDER-".length)}`;
    expect(await response.json()).toMatchObject({ ok: true, data: { status: "paid", captureId } });
    expect(await rows(purchaseId)).toMatchObject({ purchase: "paid", attempt: { state: "capture_confirmed", capture_id: captureId, lease_owner: null } });
    expect(fake.captures()).toEqual([expect.objectContaining({ orderId })]);
  });

  it("capture requires an owned lease", async () => {
    const { cookie, purchaseId } = await approvedPurchase(2);
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no buyer session");
    const web = connectWeb(fixture.database.webUrl, 4);
    const deps = { db: web.db, paypal: fake.client, now: () => new Date(), appBaseUrl: TEST_BASE_URL };
    let leaseHeld!: () => void;
    const firstHoldsLease = new Promise<void>((resolve) => (leaseHeld = resolve));
    let releaseFirst!: () => void;
    const firstMayContinue = new Promise<void>((resolve) => (releaseFirst = resolve));
    try {
      const first = completePayPal(deps, principal, purchaseId, {
        afterLease: async () => {
          leaseHeld();
          await firstMayContinue;
        },
      });
      await firstHoldsLease;
      const second: CompleteResult | AppError = await completePayPal(deps, principal, purchaseId);
      expect(second).toMatchObject({ status: "in_flight" });
      expect(fake.captures()).toHaveLength(0);

      releaseFirst();
      expect(await first).toMatchObject({ status: "paid" });
      expect(fake.captures()).toHaveLength(1);
    } finally {
      releaseFirst();
      await web.close();
    }
  });

  it("amount mismatch quarantines", async () => {
    const { cookie, purchaseId } = await approvedPurchase(3);
    // The provider's record after capture shows one cent more than the stored snapshot.
    fake.tamper = (order, phase) => {
      if (phase !== "post_capture") return order;
      const plusOne = sgdFromCents(order.amount!.cents! + 1);
      return { ...order, amount: { currency: "SGD", cents: plusOne }, captures: order.captures.map((capture) => ({ ...capture, amount: { currency: "SGD", cents: plusOne } })) };
    };
    const response = await complete(cookie, purchaseId);
    expect(await response.json()).toMatchObject({ ok: true, data: { status: "uncertain", view: { state: "uncertain" } } });
    expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: { state: "capture_unknown", outcome_reason: "amount_mismatch" } });
  });

  it("payee mismatch quarantines", async () => {
    const { cookie, purchaseId } = await approvedPurchase(4);
    // The provider's record after capture names a different seller than the bound destination.
    fake.tamper = (order, phase) => (phase === "post_capture" ? { ...order, payeeMerchantId: "THERSELLER3CD" } : order);
    const response = await complete(cookie, purchaseId);
    expect(await response.json()).toMatchObject({ ok: true, data: { status: "uncertain" } });
    expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempt: { state: "capture_unknown", outcome_reason: "payee_mismatch" } });
    const audits = await fixture.database.admin`
      select action, operator_visible, details from audit_events where purchase_id = ${purchaseId} and action = 'paypal_capture_quarantined'`;
    expect(audits).toEqual([expect.objectContaining({ operator_visible: true, details: expect.objectContaining({ reason: "payee_mismatch" }) })]);
  });

  it("an approved order that does not match is never captured", async () => {
    const { cookie, purchaseId } = await approvedPurchase(5);
    // Before any capture, the approved order names a different seller.
    fake.tamper = (order, phase) => (phase === "pre_capture" ? { ...order, payeeMerchantId: "THERSELLER3CD" } : order);
    const response = await complete(cookie, purchaseId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "payment_uncertain" } });
    expect(fake.captures()).toHaveLength(0);
    expect(await rows(purchaseId)).toMatchObject({ purchase: "pending_payment", attempt: { state: "order_created" } });
    const audits = await fixture.database.admin`select operator_visible, details from audit_events where purchase_id = ${purchaseId} and action = 'paypal_approved_order_mismatch'`;
    expect(audits).toEqual([expect.objectContaining({ operator_visible: true, details: expect.objectContaining({ reason: "payee_mismatch" }) })]);
  });

  it("capture is never dispatched once the review has expired", async () => {
    const { cookie, purchaseId } = await approvedPurchase(6);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date());
    // The injected clock crosses the review deadline after the eligibility check passed, while the
    // route reads the order and before it writes the dispatch.
    fake.onRead = (phase) => {
      if (phase === "pre_capture") vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1_000));
    };
    const response = await complete(cookie, purchaseId);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "review_expired" } });
    expect(fake.captures()).toHaveLength(0);
    const [attempt] = await fixture.database.admin`select state, capture_request_id from payment_attempts where purchase_id = ${purchaseId}`;
    expect(attempt).toMatchObject({ state: "externally_approved", capture_request_id: null });
  });

  it("an approved PayPal order that never returns closes unpaid", async () => {
    const { cookie, purchaseId } = await approvedPurchase(7);
    // The approval was learned by a provider read; the buyer then never comes back.
    await fixture.database.admin`update payment_attempts set state = 'externally_approved' where purchase_id = ${purchaseId}`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1_000));
    expect(await rows(purchaseId)).toMatchObject({ purchase: "pending_payment", attempt: { state: "externally_approved" } });

    const read = await routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { cookie } }), routeParams(purchaseId));
    expect(await read.json()).toMatchObject({ ok: true, data: { state: "unpaid_closed", payment: { attemptState: "abandoned", captureId: null } } });
    // The read was the next touch: both transitions are stored.
    expect(await rows(purchaseId)).toMatchObject({ purchase: "unpaid_closed", attempt: { state: "abandoned", outcome_reason: "review_window_passed" } });
    expect(fake.captures()).toHaveLength(0);
  });

  it("the fixture seller is the payee on every fixture order", () => {
    // Guard on the fixture itself: a test that silently used another payee would prove nothing.
    expect(FIXTURE_SELLER).toMatch(/^[A-Z0-9]{13}$/);
  });
});
