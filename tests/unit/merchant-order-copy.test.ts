import { describe, expect, it } from "vitest";
import { orderStatus } from "@/app/merchant/orders/order-copy";
import type { MerchantOrder } from "@/domain/purchases/orders";

// S8 review fixes: a merchant's order status says only what is known, as the approved literals.
describe("merchant order status copy", () => {
  const pending = (attemptState: string) => ({ state: "pending_payment", payment: { attemptState } }) as unknown as MerchantOrder;

  it("an unpaid order's status claims nothing that has not happened", () => {
    // The buyer approved in PayPal but no capture was sent: never "has not approved".
    expect(orderStatus(pending("externally_approved"))).toEqual({
      chip: "Not paid yet",
      tone: "warn",
      body: "The buyer approved in PayPal, but the payment has not been captured. Nothing has been charged yet.",
    });
    expect(orderStatus(pending("order_created")).body).toBe("The buyer has not approved this payment in PayPal. Nothing has been charged.");

    // A capture that may have happened promises no check that nothing runs.
    const checking = {
      chip: "Checking payment",
      tone: "warn",
      body: "PayPal has not confirmed this payment, so it is not paid. Its result is not known yet; do not treat it as paid unless it shows Paid.",
    };
    expect(orderStatus(pending("capture_unknown"))).toEqual(checking);
    expect(orderStatus({ state: "uncertain", payment: { attemptState: "capture_unknown" } } as unknown as MerchantOrder)).toEqual(checking);
  });
});
