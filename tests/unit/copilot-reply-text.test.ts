import { describe, expect, it } from "vitest";
import { plainReply } from "@/app/merchant/orders/order-copy";

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
