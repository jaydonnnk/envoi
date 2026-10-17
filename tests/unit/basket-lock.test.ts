import { describe, expect, it } from "vitest";
import { computeBasketLockKey } from "@/domain/purchases/checkout-key";
import { moneyCanStillMove, type PurchaseLockView } from "@/domain/purchases/state";

const base = {
  buyerUserId: "user_1",
  outletId: "out_1",
  lines: [
    { itemKey: "itm_b", quantity: 2 },
    { itemKey: "itm_a", quantity: 1 },
  ],
};

describe("basket lock key", () => {
  it("is the same for the same items in any order", () => {
    expect(computeBasketLockKey({ ...base, lines: [...base.lines].reverse() })).toBe(computeBasketLockKey(base));
  });

  it("differs by buyer, outlet, item and quantity", () => {
    const key = computeBasketLockKey(base);
    expect(computeBasketLockKey({ ...base, buyerUserId: "user_2" })).not.toBe(key);
    expect(computeBasketLockKey({ ...base, outletId: "out_2" })).not.toBe(key);
    expect(computeBasketLockKey({ ...base, lines: [{ itemKey: "itm_a", quantity: 1 }] })).not.toBe(key);
    expect(computeBasketLockKey({ ...base, lines: [{ itemKey: "itm_a", quantity: 1 }, { itemKey: "itm_b", quantity: 3 }] })).not.toBe(key);
  });

  it("refuses a quantity outside 1..20", () => {
    expect(() => computeBasketLockKey({ ...base, lines: [{ itemKey: "itm_a", quantity: 0 }] })).toThrow(RangeError);
  });
});

describe("money can still move", () => {
  // T_REVIEW is 300,000 ms; the review below was created at 12:00 SGT.
  const created = Date.parse("2026-10-14T04:00:00.000Z");
  const reviewExpiresAt = new Date(created + 300_000);
  const inside = new Date(created + 299_999);
  const after = new Date(created + 300_000);
  const view = (paypalAttempt: PurchaseLockView["paypalAttempt"], purchaseState: PurchaseLockView["purchaseState"] = "pending_payment"): PurchaseLockView => ({
    purchaseState,
    reviewExpiresAt,
    paypalAttempt,
    pyusdAttempt: null,
  });

  it("holds while a capture was dispatched or its outcome is unknown, whatever the time", () => {
    expect(moneyCanStillMove(view("capture_dispatched"), after)).toBe("paypal_capture_in_flight");
    expect(moneyCanStillMove(view("capture_unknown", "uncertain"), after)).toBe("paypal_capture_in_flight");
  });

  it("holds for an attempt that never dispatched a capture only inside T_REVIEW", () => {
    for (const state of ["created", "create_unknown", "order_created", "externally_approved"] as const) {
      expect(moneyCanStillMove(view(state), inside), state).toBe("paypal_review_window");
      expect(moneyCanStillMove(view(state), after), state).toBeNull();
    }
  });

  it("holds while the purchase is uncertain", () => {
    expect(moneyCanStillMove(view("capture_failed", "uncertain"), after)).toBe("purchase_uncertain");
  });

  it("does not hold for an open review, a paid purchase or a terminal attempt", () => {
    expect(moneyCanStillMove(view(null, "review_open"), inside)).toBeNull();
    expect(moneyCanStillMove(view("capture_confirmed", "paid"), inside)).toBeNull();
    expect(moneyCanStillMove(view("abandoned", "unpaid_closed"), inside)).toBeNull();
  });
});
