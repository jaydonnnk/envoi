import { describe, expect, it } from "vitest";
import { computeCheckoutKey, type CheckoutKeyInput } from "@/domain/purchases/checkout-key";

const base: CheckoutKeyInput = {
  buyerUserId: "user_1",
  outletId: "out_1",
  menuRevisionId: "mrv_1",
  destinationId: "dst_1",
  rail: "paypal",
  currency: "SGD",
  lines: [
    { menuItemId: "itm_b", quantity: 2 },
    { menuItemId: "itm_a", quantity: 1 },
  ],
  pyusdRateVersionId: null,
};

describe("checkout identity", () => {
  it("a changed menu revision is a new checkout", () => {
    expect(computeCheckoutKey({ ...base, menuRevisionId: "mrv_2" })).not.toBe(computeCheckoutKey(base));
  });

  it("the same basket in any line order is the same checkout", () => {
    expect(computeCheckoutKey({ ...base, lines: [...base.lines].reverse() })).toBe(computeCheckoutKey(base));
  });

  it("refuses a quantity outside 1..20", () => {
    expect(() => computeCheckoutKey({ ...base, lines: [{ menuItemId: "itm_a", quantity: 21 }] })).toThrow(RangeError);
  });
});
