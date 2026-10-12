import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// D10: with PAYMENTS_ENABLED false, PayPal start and completion refuse before any provider call.
describe("payments kill switch refuses PayPal start and completion", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("killswitch", { PAYMENTS_ENABLED: "false" });
    fake = createFakePayPal();
    paypal.client = fake.client;
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    };
  });

  afterAll(async () => {
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
});
