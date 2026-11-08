import { describe, expect, it } from "vitest";
import { composeDigest, digestFigures, fillDigest, offeredPlaceholders, type DigestFigures } from "@/domain/purchases/digest";
import type { SalesSummary } from "@/domain/purchases/sales-summary";

// S47, the weekly summary: named test 78 and the guards of the Gate 3 S47 amendment, on the pure
// template rules. Every summary and template here is a FIXTURE.

const FIGURES: DigestFigures = { paid_total: "S$96.40", paid_count: "6", net_total: "S$88.15", fee_total: "S$8.25" };
const NO_FEES: DigestFigures = { ...FIGURES, net_total: null, fee_total: null };

const summary = (over: Partial<SalesSummary>): SalesSummary => ({ currency: "SGD", paidMinor: 9640, paidCount: 6, knownFeeMinor: 825, knownNetMinor: 8815, unknownFeeCount: 0, byRail: [], ...over });

describe("78 a digest holding a figure the code did not compute is refused", () => {
  it.each([
    ["an ASCII digit", "You sold {{paid_total}} across {{paid_count}} orders, up 5 from last week."],
    ["a Tamil digit", "இந்த வாரம் {{paid_total}} ௫ ஆர்டர்கள்."],
    ["a full-width digit", "本周收入{{paid_total}}，共３笔。"],
    ["a Chinese numeral", "本周共收入{{paid_total}}，比上周多三笔。"],
    ["an English number word", "Two of your {{paid_count}} orders paid {{paid_total}}."],
    ["an English number word in capitals", "ONE good week: {{paid_total}}."],
    ["a Malay number word", "Minggu ini {{paid_total}} daripada dua pesanan."],
    ["a Tamil number word", "இந்த வாரம் {{paid_total}}, ஐந்து ஆர்டர்கள்."],
    ["a Tamil number word with a suffix", "இந்த வாரம் {{paid_total}}, மூன்றாவது வாரம்."],
    ["a short Tamil number word", "இந்த வாரம் {{paid_total}}, ஆறு ஆர்டர்கள்."],
  ])("refuses %s as a digit", (_, template) => {
    expect(fillDigest(template, FIGURES)).toEqual({ kind: "refused", reason: "digit" });
  });

  it.each([
    ["a name it does not know", "You sold {{paid_total}}, or {{tip_total}} in tips."],
    ["a placeholder in another shape", "You sold {{ paid_total }} this week."],
    ["a stray opening brace", "You sold {{paid_total}} {{ this week."],
    ["a stray closing brace", "You sold {{paid_total}} }} this week."],
    ["a single brace", "You sold {paid_total} this week."],
  ])("refuses %s as an unknown placeholder", (_, template) => {
    expect(fillDigest(template, FIGURES)).toEqual({ kind: "refused", reason: "unknown_placeholder" });
  });

  it("keeps Tamil words that only begin like a short number", () => {
    expect(fillDigest("ஆறுதல்: இந்த வாரம் {{paid_total}}.", FIGURES)).toEqual({ kind: "ok", text: "ஆறுதல்: இந்த வாரம் S$96.40." });
  });

  it("refuses a fee or net placeholder whose figure code did not offer", () => {
    expect(fillDigest("You sold {{paid_total}}, and {{net_total}} reached you.", NO_FEES)).toEqual({ kind: "refused", reason: "unknown_placeholder" });
    expect(fillDigest("PayPal charged {{fee_total}}.", NO_FEES)).toEqual({ kind: "refused", reason: "unknown_placeholder" });
  });

  it.each([
    ["en", "Your Envoi sales were {{paid_total}} across {{paid_count}} paid orders, and {{net_total}} reached you after {{fee_total}} in PayPal fees.", "Your Envoi sales were S$96.40 across 6 paid orders, and S$88.15 reached you after S$8.25 in PayPal fees."],
    ["zh", "本周您通过Envoi收到{{paid_total}}，共{{paid_count}}笔已付订单，扣除PayPal手续费{{fee_total}}后到账{{net_total}}。", "本周您通过Envoi收到S$96.40，共6笔已付订单，扣除PayPal手续费S$8.25后到账S$88.15。"],
    ["ms", "Jualan Envoi anda minggu ini ialah {{paid_total}} daripada {{paid_count}} pesanan berbayar.", "Jualan Envoi anda minggu ini ialah S$96.40 daripada 6 pesanan berbayar."],
    ["ta", "இந்த வாரம் Envoi மூலம் {{paid_count}} ஆர்டர்களில் {{paid_total}} பெற்றீர்கள்.", "இந்த வாரம் Envoi மூலம் 6 ஆர்டர்களில் S$96.40 பெற்றீர்கள்."],
  ])("fills a clean %s template exactly from code's figures", (_, template, filled) => {
    expect(fillDigest(template, FIGURES)).toEqual({ kind: "ok", text: filled });
  });

  it("substitutes in one pass, so a figure that looks like a placeholder is not replaced again", () => {
    const tricky: DigestFigures = { ...FIGURES, paid_total: "{{paid_count}}" };
    expect(fillDigest("You sold {{paid_total}}.", tricky)).toEqual({ kind: "ok", text: "You sold {{paid_count}}." });
  });
});

describe("the digest's figures and placeholders", () => {
  it("offers fee and net only when every currency's fees are known", () => {
    expect(offeredPlaceholders([summary({}), summary({ currency: "USD" })])).toEqual(["paid_total", "paid_count", "net_total", "fee_total"]);
    expect(offeredPlaceholders([summary({}), summary({ currency: "USD", unknownFeeCount: 1 })])).toEqual(["paid_total", "paid_count"]);
  });

  it("formats each figure from its own summary's currency, and leaves fee and net null when not offered", () => {
    expect(digestFigures(summary({}), true)).toEqual(FIGURES);
    expect(digestFigures(summary({ currency: "USD", paidMinor: 1250, paidCount: 2 }), false)).toEqual({ paid_total: "US$12.50", paid_count: "2", net_total: null, fee_total: null });
  });

  it("fills one paragraph per currency and never adds SGD and USD together", () => {
    const digest = composeDigest([summary({}), summary({ currency: "USD", paidMinor: 1250, paidCount: 2, knownFeeMinor: 80, knownNetMinor: 1170 })], "You sold {{paid_total}} in {{paid_count}} orders; {{net_total}} reached you.");
    expect(digest).toEqual({
      kind: "ok",
      paragraphs: [
        { currency: "SGD", text: "You sold S$96.40 in 6 orders; S$88.15 reached you." },
        { currency: "USD", text: "You sold US$12.50 in 2 orders; US$11.70 reached you." },
      ],
    });
  });

  it("refuses the whole digest when one currency's fees are unknown and the template names net", () => {
    expect(composeDigest([summary({}), summary({ currency: "USD", unknownFeeCount: 1 })], "You sold {{paid_total}}; {{net_total}} reached you.")).toEqual({ kind: "refused", reason: "unknown_placeholder" });
  });
});
