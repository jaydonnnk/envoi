import { describe, expect, it } from "vitest";
import { purchaseIdFromReturn } from "@/app/paypal/purchase-param";

describe("the purchase id on PayPal's return", () => {
  it("drops the token PayPal's crypto page appends with a second question mark", () => {
    expect(purchaseIdFromReturn("pur_x?token=FIXTURE")).toBe("pur_x");
  });
  it("keeps a plain id and refuses anything else", () => {
    expect(purchaseIdFromReturn("pur_x")).toBe("pur_x");
    for (const value of [undefined, ["pur_x"], "", "?token=FIXTURE"]) expect(purchaseIdFromReturn(value)).toBeNull();
  });
});
