import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
// The page reads the buyer's cookie through next/headers, as it does inside a Next.js request.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));

describe("PayPal return landing", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("return");
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  it("GET return page cannot capture", async () => {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const auth = await import("@/app/api/auth/[...all]/route");
    const purchases = await import("@/app/api/v1/purchases/route");
    const start = await import("@/app/api/v1/purchases/[id]/paypal/start/route");
    const { default: ReturnPage } = await import("@/app/paypal/return/page");

    request.cookie = await anonymousCookie(auth.POST);
    const created = await purchases.POST(
      jsonPost("/api/v1/purchases", request.cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[0]!.id, quantity: 1 }] }),
    );
    const { data } = (await created.json()) as { data: { purchaseId: string } };
    await start.POST(jsonPost(`/api/v1/purchases/${data.purchaseId}/paypal/start`, request.cookie), routeParams(data.purchaseId));
    const orderId = fake.calls[0]!.orderId!;
    // Approved at PayPal, so a capture would succeed if the landing attempted one.
    fake.approve(orderId);
    const writesBefore = fake.writes().length;
    const [before] = await fixture.database.admin`select state, capture_request_id from payment_attempts where purchase_id = ${data.purchaseId}`;

    // Arbitrary query values, including PayPal's token and PayerID, and invented ones.
    await ReturnPage({ searchParams: Promise.resolve({ purchase: data.purchaseId, token: orderId, PayerID: "ANYPAYERID123", capture: "true", status: "COMPLETED" }) as never });

    expect(fake.writes()).toHaveLength(writesBefore);
    expect(fake.captures()).toHaveLength(0);
    const [after] = await fixture.database.admin`select state, capture_request_id from payment_attempts where purchase_id = ${data.purchaseId}`;
    expect(after).toEqual(before);
    const [purchase] = await fixture.database.admin`select state from purchases where id = ${data.purchaseId}`;
    expect(purchase!.state).toBe("pending_payment");
  });
});
