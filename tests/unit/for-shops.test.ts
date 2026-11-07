import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { feeOn, feePercentLabel, PAYPAL_SG_DOMESTIC, PAYPAL_SG_INTERNATIONAL, type PayPalRate } from "@/domain/fees/paypal-rates";
import { SAVINGS_CLAIMS, savingsClaimsIn } from "../support/savings-claim";

// S44: the public shops page, its fee calculator and the rates. The page must read no database, so
// importing the web database at all fails this file.
vi.mock("next/navigation", () => ({ usePathname: () => "/for-shops" }));
vi.mock("@/integrations/ai/openai", () => ({ assistantEnabled: () => true }));
vi.mock("@/lib/db/web", () => {
  throw new Error("/for-shops must read no database");
});

const { default: ForShops } = await import("@/app/for-shops/page");
const { FeeCalculator } = await import("@/app/for-shops/fee-calculator");
const { default: Home } = await import("@/app/page");

const page = () => renderToStaticMarkup(createElement(ForShops));

describe("the fee calculator matches the rate exactly", () => {
  it.each([
    ["international", 450, PAYPAL_SG_INTERNATIONAL, 70, 380],
    ["international", 1500, PAYPAL_SG_INTERNATIONAL, 116, 1384],
    ["international", 5000, PAYPAL_SG_INTERNATIONAL, 270, 4730],
    ["domestic", 450, PAYPAL_SG_DOMESTIC, 68, 382],
    ["domestic", 1500, PAYPAL_SG_DOMESTIC, 109, 1391],
    ["domestic", 5000, PAYPAL_SG_DOMESTIC, 245, 4755],
  ] as const)("%s %i", (_name, order, rate, feeMinor, netMinor) => {
    expect(feeOn(order, rate)).toEqual({ kind: "known", feeMinor, netMinor });
  });

  it("holds the rates read from PayPal's own page", () => {
    expect(PAYPAL_SG_INTERNATIONAL).toMatchObject({ percentBasisPoints: 440, fixedMinor: 50, readOn: "2026-11-07" });
    expect(PAYPAL_SG_DOMESTIC).toMatchObject({ percentBasisPoints: 390, fixedMinor: 50, readOn: "2026-11-07" });
    expect(PAYPAL_SG_INTERNATIONAL.source).toBe("https://www.paypal.com/sg/business/paypal-business-fees");
    expect(PAYPAL_SG_DOMESTIC.source).toBe("https://www.paypal.com/sg/business/paypal-business-fees");
  });

  it("states the fee as a share of the order, before rounding to the cent", () => {
    expect(feePercentLabel(450, PAYPAL_SG_INTERNATIONAL)).toBe("15.5%");
    expect(feePercentLabel(1500, PAYPAL_SG_INTERNATIONAL)).toBe("7.7%");
    expect(feePercentLabel(5000, PAYPAL_SG_INTERNATIONAL)).toBe("5.4%");
  });

  it("shows the approved worked orders on the page", () => {
    const markup = page();
    for (const cell of ["S$4.50", "S$0.70 (15.5%)", "S$3.80", "S$1.16 (7.7%)", "S$13.84", "S$2.70 (5.4%)", "S$47.30"]) {
      expect(markup, cell).toContain(cell);
    }
    // The typed order, 15.00 by default, at the Singapore account's rate.
    expect(markup).toContain("S$1.09 (7.2%)");
    expect(markup).toContain("S$13.91");
  });

  it("gives no number for an order that is not a positive whole amount", () => {
    for (const order of [0, -450, 4.5, Number.NaN]) {
      expect(feeOn(order, PAYPAL_SG_INTERNATIONAL), String(order)).toEqual({ kind: "unknown" });
    }
  });

  it("gives no number when the fee would pass the order", () => {
    // 4.40% + S$0.50 on S$0.40 is more than the order; how PayPal treats that is not on its page.
    expect(feeOn(40, PAYPAL_SG_INTERNATIONAL)).toEqual({ kind: "unknown" });
  });
});

describe("no shops or landing copy says cheaper", () => {
  it("finds no savings claim on the served pages", () => {
    expect(savingsClaimsIn(page())).toEqual([]);
    expect(savingsClaimsIn(renderToStaticMarkup(createElement(Home)))).toEqual([]);
  });

  // The scanner has to see its needle on the same serialized surface, or its silence proves nothing.
  it.each([
    "Cheaper than cards",
    "cheapest way to pay",
    "Save money on every sale",
    "real savings for your stall",
    "A 10% discount",
    "lower card fees",
    "less than a card",
    "no hidden fees",
    "fee-free for visitors",
    "beats card rates",
  ])("the scanner catches %s inside the page's markup", (needle) => {
    const planted = page().replace("<h2>What you get</h2>", `<h2>${needle}</h2>`);
    expect(planted).toContain(needle);
    expect(savingsClaimsIn(planted).length, needle).toBeGreaterThan(0);
  });

  it("every scanner rule catches at least one needle of its own", () => {
    const needles = ["cheap", "savings", "discount", "lower fees", "less than", "no fees", "fee-free", "beats cards"];
    for (const rule of SAVINGS_CLAIMS) {
      expect(needles.some((needle) => rule.test(needle)), String(rule)).toBe(true);
    }
  });
});

describe("a rate shows its date or reads unknown", () => {
  const unread: PayPalRate = { percentBasisPoints: null, fixedMinor: null, source: "https://www.paypal.com/sg/business/paypal-business-fees", readOn: "" };

  it("a null percent gives unknown, never zero", () => {
    expect(feeOn(1500, { ...PAYPAL_SG_INTERNATIONAL, percentBasisPoints: null })).toEqual({ kind: "unknown" });
  });

  it("a null fixed fee gives unknown, never zero", () => {
    expect(feeOn(1500, { ...PAYPAL_SG_INTERNATIONAL, fixedMinor: null })).toEqual({ kind: "unknown" });
  });

  it("a rate with no read date gives unknown", () => {
    expect(feeOn(1500, { ...PAYPAL_SG_INTERNATIONAL, readOn: "" })).toEqual({ kind: "unknown" });
  });

  it("the page shows each read rate with its source and date", () => {
    const markup = page();
    expect(markup).toContain("Visitor’s PayPal: 4.40% + S$0.50, read on 7 Nov 2026.");
    expect(markup).toContain("Singapore PayPal: 3.90% + S$0.50, read on 7 Nov 2026.");
    expect(markup).toContain('href="https://www.paypal.com/sg/business/paypal-business-fees"');
    expect(markup).toContain("last updated 28 Oct 2026");
  });

  it("the calculator prints Unknown and no amount for an unread rate", () => {
    const markup = renderToStaticMarkup(createElement(FeeCalculator, { international: unread, domestic: unread }));
    expect(markup).toContain("Visitor’s PayPal: rate unknown.");
    expect(markup).toContain("Singapore PayPal: rate unknown.");
    expect(markup).toContain(">Unknown<");
    expect(markup).not.toContain("S$0.00");
    expect(markup).not.toContain("S$0.50");
    expect(markup).not.toContain("S$13.84");
    expect(markup).not.toContain("read on");
  });
});

describe("the shops page", () => {
  it("states the approved pitch and what it costs", () => {
    const markup = page();
    expect(markup).toContain("<h1>Take PayPal from visitors whose cards do not work at your stall.</h1>");
    expect(markup).toContain("Keep your SGQR. Visitors scan it in Envoi and pay your own PayPal. Envoi never holds your money. It adds no hardware.");
    expect(markup).toContain("PayPal charges you per sale. Envoi adds nothing. On small orders the fee is large, so compare it with your margin, and set a minimum order if you need to.");
  });

  it("promises no public sign-up and no poster before their slices exist", () => {
    const markup = page();
    expect(markup).toContain('<a class="button" href="/merchant/setup">Set up my shop</a>');
    expect(markup).toContain("Shops on this test build use an account made by Envoi’s operator. There is no public sign-up yet.");
    expect(markup.toLowerCase()).not.toContain("poster");
    expect(markup).not.toContain("merchant-signup");
  });
});
