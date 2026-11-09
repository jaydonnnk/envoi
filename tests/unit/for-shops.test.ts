import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { feeOn, PAYPAL_SG_DOMESTIC, PAYPAL_SG_INTERNATIONAL, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL, type PayPalRate } from "@/domain/fees/paypal-rates";
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
    ["micropayment", 450, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL, 35, 415],
    ["micropayment", 1500, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL, 98, 1402],
    ["micropayment", 5000, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL, 308, 4692],
  ] as const)("%s %i", (_name, order, rate, feeMinor, netMinor) => {
    expect(feeOn(order, rate)).toEqual({ kind: "known", feeMinor, netMinor });
  });

  it("holds the rates read from PayPal's own page", () => {
    expect(PAYPAL_SG_INTERNATIONAL).toMatchObject({ percentBasisPoints: 440, fixedMinor: 50, readOn: "2026-11-07" });
    expect(PAYPAL_SG_DOMESTIC).toMatchObject({ percentBasisPoints: 390, fixedMinor: 50, readOn: "2026-11-07" });
    expect(PAYPAL_SG_INTERNATIONAL.source).toBe("https://www.paypal.com/sg/business/paypal-business-fees");
    expect(PAYPAL_SG_DOMESTIC.source).toBe("https://www.paypal.com/sg/business/paypal-business-fees");
  });

  it("shows the typed order's fee and what the shop keeps", () => {
    const markup = page();
    expect(markup).toContain("S$1.16");
    expect(markup).toContain("S$13.84");
    expect(markup).toContain("S$0.98");
  });

  it("the micropayment rate costs more above the S$26 the pitch names", () => {
    const fee = (order: number, rate: PayPalRate) => (feeOn(order, rate) as { feeMinor: number }).feeMinor;
    expect(fee(2500, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL)).toBeLessThan(fee(2500, PAYPAL_SG_INTERNATIONAL));
    expect(fee(2700, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL)).toBeGreaterThan(fee(2700, PAYPAL_SG_INTERNATIONAL));
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
    const planted = page().replace("<h2>Why add Envoi</h2>", `<h2>${needle}</h2>`);
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

describe("a rate holds its date or reads unknown", () => {
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

  it("the page says each rate in plain words, with its source and no date", () => {
    const markup = page();
    expect(markup).toContain("Visitor with an overseas PayPal account: 4.40% of the order + S$0.50 per sale.");
    expect(markup).toContain("Buyer with a Singapore PayPal account: 3.90% of the order + S$0.50 per sale.");
    expect(markup).toContain('href="https://www.paypal.com/sg/business/paypal-business-fees"');
    expect(markup).not.toContain("2026");
  });

  it("the calculator prints Unknown and no amount for an unread rate", () => {
    const markup = renderToStaticMarkup(createElement(FeeCalculator, { international: unread, domestic: unread, micropayment: unread }));
    expect(markup).toContain("Visitor with an overseas PayPal account: rate unknown.");
    expect(markup).toContain("Buyer with a Singapore PayPal account: rate unknown.");
    expect(markup).toContain(">Unknown<");
    expect(markup).not.toContain("S$0.00");
    expect(markup).not.toContain("S$0.50");
    expect(markup).not.toContain("S$13.84");
  });
});

describe("the shops page", () => {
  it("states the approved pitch and what it costs", () => {
    const markup = page();
    expect(markup).toContain("<h1>Take PayPal from visitors whose cards do not work at your stall.</h1>");
    expect(markup).toContain("Keep your SGQR. Add no hardware. Under S$26, PayPal’s micropayment rate costs less.");
    expect(markup).toContain("Money goes straight to your own PayPal. Envoi never holds it.");
    expect(markup).toContain("Visitors whose cards and apps cannot pay your SGQR, can pay you with PayPal.");
    expect(markup).toContain("No card terminal.");
    expect(markup).toContain("PayPal takes a fee on each sale. Envoi adds nothing.");
    expect(markup).toContain("The micropayment rate needs PayPal’s approval, and it then applies to every sale.");
    expect(markup).toContain("Micropayment rate, overseas account: 6.00% of the order + S$0.08 per sale.");
  });

  // S43 decision 12: the sign-up line follows MERCHANT_SIGNUP_ENABLED; only "true" opens it.
  it.each([undefined, "false", "TRUE"])("with MERCHANT_SIGNUP_ENABLED=%s it promises no public sign-up and no poster", (value) => {
    vi.stubEnv("MERCHANT_SIGNUP_ENABLED", value);
    try {
      const markup = page();
      expect(markup).toContain('<a class="button" href="/merchant/setup">Set up my shop</a>');
      expect(markup).toContain("No public sign-up yet: Envoi’s operator makes test accounts.");
      expect(markup).not.toContain("An Envoi admin approves every shop");
      expect(markup.toLowerCase()).not.toContain("poster");
      expect(markup).not.toContain("merchant-signup");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("with the switch on and no mail settings it reports no public sign-up", () => {
    vi.stubEnv("MERCHANT_SIGNUP_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("MERCHANT_EMAIL_FROM", undefined);
    try {
      expect(page()).toContain("No public sign-up yet");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("with MERCHANT_SIGNUP_ENABLED=true and mail configured it says a test shop can be set up and an admin approves every shop", () => {
    vi.stubEnv("MERCHANT_SIGNUP_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "fixture-key");
    vi.stubEnv("MERCHANT_EMAIL_FROM", "fixture@example.test");
    try {
      const markup = page();
      expect(markup).toContain('<a class="button" href="/merchant/setup">Set up my shop</a>');
      expect(markup).toContain("Set up a test shop here. An Envoi admin approves every shop before it can sell.");
      expect(markup).not.toContain("No public sign-up");
      expect(markup.toLowerCase()).not.toContain("poster");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
