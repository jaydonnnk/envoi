import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, formatMoney, fromDecimalString, money, multiply, requireSgd, sameAmount, sum, toDecimalString } from "@/lib/money";

// S27: currency-explicit money. Every amount carries its currency, and two currencies never meet in
// arithmetic or comparison, so a USD price can never be read as SGD.
describe("money", () => {
  it("money of two currencies cannot be summed or compared", () => {
    const sgd = money("SGD", 440);
    const usd = money("USD", 440);

    expect(sum("SGD", [sgd, money("SGD", 60)])).toEqual({ currency: "SGD", minor: 500 });
    expect(() => sum("SGD", [sgd, usd])).toThrow(CurrencyMismatchError);
    expect(() => sum("USD", [usd, sgd])).toThrow(CurrencyMismatchError);

    expect(sameAmount(usd, money("USD", 440))).toBe(true);
    expect(sameAmount(usd, money("USD", 441))).toBe(false);
    expect(() => sameAmount(sgd, usd)).toThrow(CurrencyMismatchError);

    expect(requireSgd(sgd)).toBe(sgd);
    expect(() => requireSgd(usd)).toThrow(CurrencyMismatchError);
  });

  it("keeps the currency through arithmetic, parsing and formatting", () => {
    expect(multiply(money("USD", 700), 2)).toEqual({ currency: "USD", minor: 1400 });
    expect(fromDecimalString("USD", "11.25")).toEqual({ currency: "USD", minor: 1125 });
    expect(fromDecimalString("SGD", "5.600")).toBeNull();
    expect(toDecimalString(money("USD", 1125))).toBe("11.25");
    expect(formatMoney(money("USD", 1125))).toBe("US$11.25");
    expect(formatMoney(money("SGD", 440))).toBe("S$4.40");
    expect(() => money("SGD", 4.5)).toThrow(RangeError);
  });
});
