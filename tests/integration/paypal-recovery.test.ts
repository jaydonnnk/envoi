import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { completePayPal, reconcileAttempt } from "@/domain/payments/attempts";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { systemNow } from "@/lib/time";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";
import { transcript } from "../support/transcript";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
// The receipt page reads the buyer's cookie through next/headers, and its live status uses the
// App Router, as inside a Next.js request.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, replace() {}, push() {} }),
}));

type Rows = { purchase: string; attempts: { id: string; state: string; order_id: string | null; capture_request_id: string | null; capture_id: string | null; outcome_reason: string | null; create_request_id: string }[] };

// S3 recovery against the real schema as envoi_web. PayPal is the labeled fixture fake with injected
// faults, so every order and capture id below is FIXTURE-*, never a sandbox record.
describe("PayPal recovery (fixture fault injection)", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    cancel: typeof import("@/app/api/v1/purchases/[id]/cancel/route");
    reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("recovery");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      cancel: await import("@/app/api/v1/purchases/[id]/cancel/route"),
      reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const post = (path: string, cookie: string, id: string, handler: (req: Request, ctx: ReturnType<typeof routeParams>) => Promise<Response>) =>
    handler(jsonPost(`/api/v1/purchases/${id}/${path}`, cookie), routeParams(id));
  const start = (cookie: string, id: string) => post("paypal/start", cookie, id, routes.start.POST);
  const complete = (cookie: string, id: string) => post("paypal/complete", cookie, id, routes.complete.POST);
  const cancel = (cookie: string, id: string) => post("cancel", cookie, id, routes.cancel.POST);
  const reconcile = async (cookie: string, id: string) => {
    const response = await post("reconcile", cookie, id, routes.reconcile.POST);
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: { check: string; purchase: { state: string; payment: { captureId: string | null } | null } } }).data;
  };

  async function openReview(quantity: number): Promise<{ cookie: string; purchaseId: string }> {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const created = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[0]!.id, quantity }] }),
    );
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { purchaseId: string } };
    return { cookie, purchaseId: data.purchaseId };
  }

  async function approvedPurchase(quantity: number): Promise<{ cookie: string; purchaseId: string; orderId: string }> {
    const { cookie, purchaseId } = await openReview(quantity);
    expect((await start(cookie, purchaseId)).status).toBe(200);
    const orderId = fake.calls[0]!.orderId!;
    fake.approve(orderId);
    return { cookie, purchaseId, orderId };
  }

  async function rows(purchaseId: string): Promise<Rows> {
    const [purchase] = await fixture.database.admin`select state from purchases where id = ${purchaseId}`;
    const attempts = await fixture.database.admin`
      select id, state, order_id, capture_request_id, capture_id, outcome_reason, create_request_id
      from payment_attempts where purchase_id = ${purchaseId} order by created_at, id`;
    return { purchase: purchase!.state as string, attempts: [...attempts] as unknown as Rows["attempts"] };
  }

  // The buyer's receipt, rendered by the real page for the owning session.
  async function receiptTitle(cookie: string, purchaseId: string): Promise<string> {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: ReceiptPage } = await import("@/app/receipt/[purchaseId]/page");
    request.cookie = cookie;
    const html = renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ purchaseId }) }));
    return /<h1>(.*?)<\/h1>/.exec(html)?.[1] ?? "";
  }

  // What the receipt's polling reads: stored state only, never a provider call.
  async function polledState(cookie: string, purchaseId: string): Promise<string> {
    const readsBefore = fake.reads().length;
    const response = await routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { cookie } }), routeParams(purchaseId));
    const { data } = (await response.json()) as { data: { state: string } };
    expect(fake.reads()).toHaveLength(readsBefore);
    return data.state;
  }

  it("lost create response replays the same key", async () => {
    const log = transcript("lost create response");
    const { cookie, purchaseId } = await openReview(1);
    fake.fail("createOrder", "lose_response");
    const first = await start(cookie, purchaseId);
    expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ ok: false, error: { code: "provider_unreachable" } });
    const lost = await rows(purchaseId);
    expect(lost.attempts).toHaveLength(1);
    expect(lost.attempts[0]).toMatchObject({ state: "create_unknown", order_id: null });
    log.step(`start: PayPal created the order but the response was lost; attempt ${lost.attempts[0]!.state}, no order id, receipt "${await receiptTitle(cookie, purchaseId)}"`);

    const second = await start(cookie, purchaseId);
    expect(second.status).toBe(200);
    const creates = fake.calls.filter((call) => call.op === "createOrder");
    expect(creates).toHaveLength(2);
    expect(creates[1]!.requestId).toBe(lost.attempts[0]!.create_request_id);
    expect(creates[1]!.orderId).toBe(creates[0]!.orderId);
    const recovered = await rows(purchaseId);
    expect(recovered.attempts).toHaveLength(1);
    expect(recovered.attempts[0]).toMatchObject({ state: "order_created", order_id: creates[0]!.orderId });
    log.calls("both starts", creates);
    log.step(`second start replayed the same key: attempt ${recovered.attempts[0]!.state} with order ${recovered.attempts[0]!.order_id}; no second order exists`);
    log.print();
  });

  it("a create replay PayPal refuses outright is recreated under a new key", async () => {
    const { cookie, purchaseId } = await openReview(2);
    fake.fail("createOrder", "lose_request");
    expect((await start(cookie, purchaseId)).status).toBe(502);
    fake.fail("createOrder", "refuse");
    const retried = await start(cookie, purchaseId);
    expect(retried.status).toBe(200);
    const creates = fake.calls.filter((call) => call.op === "createOrder");
    expect(creates.map((call) => call.requestId)).toEqual([creates[0]!.requestId, creates[0]!.requestId, expect.any(String)]);
    expect(creates[2]!.requestId).not.toBe(creates[0]!.requestId);
    const { attempts } = await rows(purchaseId);
    expect(attempts.map((attempt) => [attempt.state, attempt.outcome_reason])).toEqual([
      ["abandoned", "create_recreated"],
      ["order_created", null],
    ]);
  });

  it("lost capture response replays the same capture key", async () => {
    const log = transcript("lost capture request, recovered by Check status");
    const { cookie, purchaseId } = await approvedPurchase(1);
    fake.fail("captureOrder", "lose_request");
    expect((await complete(cookie, purchaseId)).status).toBe(200);
    const lost = await rows(purchaseId);
    expect(lost).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown", capture_id: null }] });
    const key = lost.attempts[0]!.capture_request_id!;
    expect(key).toBeTruthy();
    expect(await receiptTitle(cookie, purchaseId)).toBe("Checking payment");
    expect(await polledState(cookie, purchaseId)).toBe("uncertain");
    log.step(`complete: capture request lost before PayPal acted; purchase ${lost.purchase}, receipt "Checking payment", polling made no provider call`);

    const checked = await reconcile(cookie, purchaseId);
    expect(checked.check).toBe("read");
    const captures = fake.captures();
    expect(captures).toHaveLength(2);
    expect(captures.map((call) => call.requestId)).toEqual([key, key]);
    const after = await rows(purchaseId);
    expect(after).toMatchObject({ purchase: "paid", attempts: [{ state: "capture_confirmed", capture_request_id: key }] });
    expect(checked.purchase).toMatchObject({ state: "paid", payment: { captureId: after.attempts[0]!.capture_id } });
    expect(await receiptTitle(cookie, purchaseId)).toBe("Paid");
    log.calls("captures", captures);
    log.step(`Check status replayed the persisted key ${key}; provider read decided paid with capture ${after.attempts[0]!.capture_id}`);
    log.print();
  });

  it("Check status converges on the same capture id", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const log = transcript("lost capture response, converged by Check status");
    const { cookie, purchaseId } = await approvedPurchase(2);
    fake.fail("captureOrder", "lose_response");
    expect((await complete(cookie, purchaseId)).status).toBe(200);
    expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown", capture_id: null }] });
    expect(await receiptTitle(cookie, purchaseId)).toBe("Checking payment");
    log.step('complete: PayPal captured but the response was lost; receipt "Checking payment", never Paid or Canceled');

    const first = await reconcile(cookie, purchaseId);
    const captureId = first.purchase.payment?.captureId;
    expect(captureId).toMatch(/^FIXTURE-CAPTURE-/);
    vi.setSystemTime(Date.now() + 31_000);
    const second = await reconcile(cookie, purchaseId);
    expect(second).toMatchObject({ check: "read", purchase: { state: "paid", payment: { captureId } } });
    expect(fake.captures()).toHaveLength(1);
    expect((await rows(purchaseId)).attempts).toHaveLength(1);
    log.calls("captures", fake.captures());
    log.step(`Check status read the order: paid with capture ${captureId}; a second check 31 s later read the same capture, and no second capture was sent`);
    log.print();
  });

  it("cancel after dispatch reports uncertain", async () => {
    const log = transcript("cancel races capture");
    const { cookie, purchaseId } = await approvedPurchase(3);
    request.cookie = cookie;
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no principal");
    fake.fail("captureOrder", "lose_response");

    let during: { status: number; body: unknown; purchase: string; attempt: string; receipt: string } | null = null;
    await completePayPal({ db: webDb(), paypal: fake.client, now: systemNow, appBaseUrl: TEST_BASE_URL }, principal, purchaseId, {
      afterDispatch: async () => {
        const response = await cancel(cookie, purchaseId);
        const state = await rows(purchaseId);
        during = { status: response.status, body: await response.json(), purchase: state.purchase, attempt: state.attempts[0]!.state, receipt: await receiptTitle(cookie, purchaseId) };
      },
    });
    expect(during).toMatchObject({
      status: 409,
      body: { ok: false, error: { code: "payment_uncertain" } },
      purchase: "pending_payment",
      attempt: "capture_dispatched",
      receipt: "Checking payment",
    });
    log.step('cancel while the capture was dispatched: 409 payment_uncertain, purchase pending_payment, receipt "Checking payment"');

    const after = await cancel(cookie, purchaseId);
    expect(after.status).toBe(409);
    expect(await after.json()).toMatchObject({ ok: false, error: { code: "payment_uncertain" } });
    expect((await rows(purchaseId)).purchase).toBe("uncertain");
    expect(await receiptTitle(cookie, purchaseId)).toBe("Checking payment");
    const { default: CancelPage } = await import("@/app/paypal/cancel/page");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(await CancelPage({ searchParams: Promise.resolve({ purchase: purchaseId }) }));
    expect(html).toContain("<h1>Checking payment</h1>");
    expect(html).not.toMatch(/canceled/i);
    log.step('cancel after the lost capture response: 409 payment_uncertain, purchase uncertain; receipt and PayPal cancel page both say "Checking payment"');
    log.print();
  });

  it("a status check that began before dispatch never replays the capture key", async () => {
    const { cookie, purchaseId } = await approvedPurchase(8);
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no principal");
    const [attempt] = (await rows(purchaseId)).attempts;
    fake.fail("captureOrder", "lose_request");
    const db = webDb();
    // The check starts while the order is only approved, so it takes no lease; a completion then
    // dispatches the capture, loses its request and leaves capture_unknown before the check reads.
    const check = await reconcileAttempt({ db, read: fake.client, replay: fake.client, now: systemNow, actor: "test" }, attempt!.id, {
      afterLeaseDecision: async () => {
        await completePayPal({ db, paypal: fake.client, now: systemNow, appBaseUrl: TEST_BASE_URL }, principal, purchaseId, {
          afterDispatch: async () => {
            await fixture.database.admin`update payment_attempts set lease_owner = 'another-holder', lease_expires_at = now() + interval '5 minutes' where id = ${attempt!.id}`;
          },
        });
      },
    });
    expect(check).toBe("in_flight");
    expect(fake.captures()).toHaveLength(1);
    expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown" }] });
  });

  it("provider reads are debounced by T_PROVIDER_READ_DEBOUNCE", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { cookie, purchaseId } = await openReview(4);
    expect((await start(cookie, purchaseId)).status).toBe(200);
    expect((await reconcile(cookie, purchaseId)).check).toBe("read");
    vi.setSystemTime(Date.now() + 29_000);
    expect((await reconcile(cookie, purchaseId)).check).toBe("debounced");
    expect(fake.reads()).toHaveLength(1);
    vi.setSystemTime(Date.now() + 2_000);
    expect((await reconcile(cookie, purchaseId)).check).toBe("read");
    expect(fake.reads()).toHaveLength(2);
    // Before any capture was dispatched a read changes nothing and never captures.
    expect(fake.captures()).toHaveLength(0);
    expect(await rows(purchaseId)).toMatchObject({ purchase: "pending_payment", attempts: [{ state: "order_created" }] });
  });

  describe("a verified failure needs an outright refusal and no capture at all", () => {
    it("a refused same-key replay whose order shows no capture closes unpaid", async () => {
      const log = transcript("capture refused by PayPal, verified failure");
      const { cookie, purchaseId } = await approvedPurchase(5);
      fake.refuseCapture = { status: 403, issues: "NOT_AUTHORIZED,PAYEE_NOT_CONSENTED" };
      expect((await complete(cookie, purchaseId)).status).toBe(200);
      const refused = await rows(purchaseId);
      expect(refused).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown", outcome_reason: "capture_http_403:NOT_AUTHORIZED,PAYEE_NOT_CONSENTED" }] });
      log.step('complete: PayPal refused the capture with 403 NOT_AUTHORIZED,PAYEE_NOT_CONSENTED; purchase uncertain, receipt "Checking payment"');

      expect((await reconcile(cookie, purchaseId)).check).toBe("read");
      const key = refused.attempts[0]!.capture_request_id;
      expect(fake.captures().map((call) => call.requestId)).toEqual([key, key]);
      expect(await rows(purchaseId)).toMatchObject({ purchase: "unpaid_closed", attempts: [{ state: "capture_failed", outcome_reason: "capture_refused_403:NOT_AUTHORIZED,PAYEE_NOT_CONSENTED" }] });
      expect(await receiptTitle(cookie, purchaseId)).toBe("Not paid");
      log.step(`Check status replayed key ${key}: refused again, and the order read shows no capture; attempt capture_failed, purchase unpaid_closed, receipt "Not paid"`);
      log.print();
    });

    it("a replay that gets no answer stays checking payment", async () => {
      const { cookie, purchaseId } = await approvedPurchase(6);
      fake.fail("captureOrder", "lose_request", 2);
      expect((await complete(cookie, purchaseId)).status).toBe(200);
      expect((await reconcile(cookie, purchaseId)).check).toBe("read");
      expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown", outcome_reason: "capture_timeout" }] });
      const [alert] = await fixture.database.admin`
        select operator_visible, details->>'reason' as reason from audit_events
        where purchase_id = ${purchaseId} and action = 'paypal_recovery_inconclusive'`;
      expect(alert).toMatchObject({ operator_visible: true, reason: "capture_replay_timeout" });
    });

    it("a check PayPal never answers reports provider_unreachable and changes nothing", async () => {
      const { cookie, purchaseId } = await approvedPurchase(9);
      fake.fail("captureOrder", "lose_request", 2);
      expect((await complete(cookie, purchaseId)).status).toBe(200);
      fake.fail("readOrder", "lose_request", 2);
      const checked = await reconcile(cookie, purchaseId);
      expect(checked).toMatchObject({ check: "provider_unreachable", purchase: { state: "uncertain" } });
      expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown" }] });
    });

    it("an order PayPal no longer holds stays checking payment", async () => {
      const { cookie, purchaseId, orderId } = await approvedPurchase(10);
      fake.refuseCapture = { status: 403, issues: "NOT_AUTHORIZED,PAYEE_NOT_CONSENTED" };
      expect((await complete(cookie, purchaseId)).status).toBe(200);
      // Both the read and the same-key replay now answer 404 RESOURCE_NOT_FOUND.
      fake.forget(orderId);
      fake.refuseCapture = null;
      const checked = await reconcile(cookie, purchaseId);
      expect(checked).toMatchObject({ check: "no_record", purchase: { state: "uncertain" } });
      expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown" }] });
    });

    it("a refused replay is not a failure while PayPal shows any capture", async () => {
      const { cookie, purchaseId } = await approvedPurchase(7);
      fake.fail("captureOrder", "lose_request");
      expect((await complete(cookie, purchaseId)).status).toBe(200);
      // The first read is lost, the replay is refused, and the next read shows a pending capture.
      fake.fail("readOrder", "lose_request");
      fake.refuseCapture = { status: 422, issues: "UNPROCESSABLE_ENTITY,ORDER_NOT_APPROVED" };
      fake.tamper = (order) => ({ ...order, captures: [{ id: "FIXTURE-CAPTURE-PENDING", status: "PENDING", amount: order.amount }] });
      expect((await reconcile(cookie, purchaseId)).check).toBe("read");
      expect(await rows(purchaseId)).toMatchObject({ purchase: "uncertain", attempts: [{ state: "capture_unknown", capture_id: null }] });
    });
  });
});
