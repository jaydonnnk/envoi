import { describe, expect, it } from "vitest";
import { collectFigures, replyAmounts, uncheckedAmounts } from "@/integrations/assistant/copilot-figures";

// S54, the copilot figure guard (Gate 3 amendment). Pure functions only: no model, PayPal or
// database is involved, and every expected amount is derived by hand from the text beside it.

const cents = (...values: string[]) => new Set(values);

describe("the copilot figure guard", () => {
  it("collects PayPal money objects and Envoi's formatted amounts as integer cents", () => {
    expect([...collectFigures({ amount: { currency_code: "SGD", value: "16.70" }, note: "paid S$3.50" })].sort()).toEqual(["1670", "350"]);
    expect([...collectFigures({ fee_amount: { currency_code: "SGD", value: "-0.62" } })]).toEqual(["-62"]);
    expect([...collectFigures([{ total: { currency_code: "USD", value: "1,234.50" } }])]).toEqual(["123450"]);
    expect([...collectFigures({ refund: "-S$0.62" })]).toEqual(["-62"]);
  });

  it("extracts money mentions in either order and never a count, date or order id", () => {
    expect(replyAmounts("This week (2–8 November), Envoi shows S$16.70 in paid orders across 3 orders.")).toEqual(["1670"]);
    expect(replyAmounts("Order pur_lrvnxn5se2uq4srgeqzk6tgx7a was S$3.50.")).toEqual(["350"]);
    expect(replyAmounts("S$1,234.50, US$7.75, $5.00, 16.70 SGD and -S$0.62")).toEqual(["123450", "775", "500", "1670", "-62"]);
    expect(replyAmounts("3 orders on 8 November, order pur_abc123")).toEqual([]);
    expect(replyAmounts("S$1.234")).toEqual([]);
  });

  it("keeps each fee mention, including a repeated amount", () => {
    expect(replyAmounts("PayPal shows fees of SGD -0.62, SGD -0.62, and SGD -0.83 for the three transactions returned.")).toEqual(["-62", "-62", "-83"]);
  });

  it("accepts the recorded S45 replies with the figures their turns held", () => {
    expect(uncheckedAmounts("This week (2–8 November), Envoi shows S$16.70 in paid orders across 3 orders.", cents("1670", "980", "350", "340"))).toEqual([]);
    expect(uncheckedAmounts('Latest order "2 × Ebi fry, total S$9.80" is marked Paid in Envoi, Paid after a verified capture', cents("980"))).toEqual([]);
    expect(uncheckedAmounts("Order pur_lrvnxn5se2uq4srgeqzk6tgx7a was S$3.50.", cents("350", "580"))).toEqual([]);
    expect(uncheckedAmounts('Card "Refund S$9.80 to the customer?" for the last paid order; "Nothing is sent unless you tap Confirm."', cents("980"))).toEqual([]);
    expect(uncheckedAmounts("PayPal shows fees of SGD -0.62, SGD -0.62, and SGD -0.83 for the three transactions returned.", cents("-62", "-83"))).toEqual([]);
    expect(uncheckedAmounts("Which paid order would you like refunded? I can show a confirmation card for it, but nothing is sent until you tap Confirm.", cents())).toEqual([]);
    expect(uncheckedAmounts("I can see only Judge Demo Cafe’s orders, not the shop next door’s.", cents())).toEqual([]);
  });

  it("flags an amount no figure holds, and compares values rather than currency labels", () => {
    expect(uncheckedAmounts("This week you took S$99.99.", cents("1670"))).toEqual(["9999"]);
    expect(uncheckedAmounts("SGD 16.70", cents("1670"))).toEqual([]);
    expect(uncheckedAmounts("S$1.234", cents("123"))).toEqual([]);
  });
});
