import { describe, expect, it } from "vitest";
import { paymentChips, plainReply } from "@/app/merchant/orders/order-copy";
import type { MerchantOrder } from "@/domain/purchases/orders";

// S45 evaluation, 2026-11-08: the model wrapped figures and item names in Markdown emphasis, and the
// panel, which shows plain text, printed the asterisks. The replies below are the ones it gave.
describe("copilot reply as plain text", () => {
  it("drops Markdown emphasis markers and keeps every word and amount", () => {
    expect(plainReply("This week (2–8 November), Envoi shows **S$16.70** in paid orders across 3 orders.")).toBe(
      "This week (2–8 November), Envoi shows S$16.70 in paid orders across 3 orders.",
    );
    expect(plainReply("the last paid order, *2 x Ebi fry* (S$9.80).")).toBe("the last paid order, 2 x Ebi fry (S$9.80).");
    expect(plainReply("is marked __Paid__ in Envoi, order `pur_abc`.")).toBe("is marked Paid in Envoi, order pur_abc.");
  });

  it("leaves text without emphasis unchanged, including a lone asterisk or multiplication", () => {
    const text = "I can see only Judge Demo Cafe’s orders. 2 * 3 is not a price, and snake_case_id stays.";
    expect(plainReply(text)).toBe(text);
  });
});

// S45 Render check, 2026-11-08: after Confirm refund the orders table kept the row's old Payment cell,
// because the grid re-renders a cell only when its value changes and the value was "Paid" both times.
describe("orders table payment value", () => {
  const paid = {
    state: "paid",
    rail: "paypal",
    payment: { attemptState: "capture_confirmed", captureGrossMinor: 180 },
    pyusd: null,
    refund: null,
  } as unknown as MerchantOrder;
  const refunded = { ...paid, refund: { state: "completed", amountMinor: 180, currency: "SGD", paypalRefundId: "FIXTURE-REFUND", createdAt: "2026-11-08T08:13:54.650Z" } } as unknown as MerchantOrder;
  const extra = { ...paid, pyusd: { extraTransfers: [{}] } } as unknown as MerchantOrder;

  it("changes when a refund or an extra transfer is added to a Paid order", () => {
    expect(paymentChips(paid)).toBe("Paid");
    expect(paymentChips(refunded)).toBe("Paid, Refunded");
    expect(paymentChips(extra)).toBe("Paid, Extra transfer");
  });
});
