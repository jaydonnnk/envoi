import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// S15 amendment, 2026-10-21: the landing page at the root address, rendered as the server first paints
// it, with the page's path supplied to the notice and footer. S41, 2026-11-04: it leads with the
// approved pitch and offers Ask Envoi first, but only while the assistant is on, because /buy/ask
// answers 404 when it is off. S44, 2026-11-07: revised with the Gate 3 fourth build plan record, for the
// tourist headline, the scan-first buttons and the shops page.
let pathname = "/";
let askEnabled = true;
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/integrations/ai/openai", () => ({ assistantEnabled: () => askEnabled }));

const { default: Home } = await import("@/app/page");
const { SiteFooter, SiteNotice } = await import("@/app/site-chrome");

function render(path: string): string {
  pathname = path;
  const page = path === "/" ? createElement(Home) : null;
  return renderToStaticMarkup(createElement("div", null, createElement(SiteNotice), page, createElement(SiteFooter)));
}

function landing(enabled: boolean): string {
  askEnabled = enabled;
  return render("/");
}

describe("landing page", () => {
  it("leads with the approved tourist headline", () => {
    expect(landing(true)).toContain("<h1>Scan the stall&#x27;s SGQR. Pay with the PayPal you already have.</h1>");
    expect(landing(true)).not.toContain("Your language. One scan. PayPal.");
  });

  it("shows the approved order and human approval copy", () => {
    expect(landing(true)).toContain("At a participating shop, scan its SGQR sticker in Envoi. AI explains the dishes and helps you order. You see the exact amount and approve it in PayPal.");
  });

  it("offers the scan first, as the one primary action", () => {
    const markup = landing(true);
    expect(markup).toContain('<a class="button" href="/buy/scan">Scan a sticker</a>');
    expect(markup).toContain('<a class="button secondary" href="/buy/ask">Ask Envoi</a>');
    expect(markup.indexOf('href="/buy/scan"')).toBeLessThan(markup.indexOf('href="/buy/ask"'));
    expect(markup.match(/class="button"/g)).toHaveLength(1);
  });

  it("offers no Ask Envoi link while the assistant is off, and the scan stays primary", () => {
    const markup = landing(false);
    expect(markup).not.toContain("/buy/ask");
    expect(markup).toContain('<a class="button" href="/buy/scan">Scan a sticker</a>');
  });

  it("keeps a path to the shop list for a visitor with no sticker", () => {
    expect(landing(true)).toContain('<a href="/buy">See all shops</a>');
  });

  it("sends merchants to the shops page, not a sign-in form", () => {
    const markup = landing(true);
    expect(markup).toContain('<a class="button secondary" href="/for-shops">I run a shop</a>');
    expect(markup).not.toContain("/merchant/setup");
  });

  it("says a scan is never a payment code and only enrolled shops can be paid", () => {
    expect(landing(true)).toContain("It is never a payment code, and only enrolled shops can be paid.");
  });

  it("says the money goes to the shop's own PayPal and offers Show the stall after Paid", () => {
    const markup = landing(true);
    expect(markup).toContain("The money goes to the shop&#x27;s own PayPal.");
    expect(markup).toContain("<h2>Show the stall</h2>");
  });

  it("says test money only", () => {
    expect(landing(true)).toContain('<div class="notice" role="note">Test money only. No real money moves.</div>');
  });

  it("shows no demo fixture wording", () => {
    expect(landing(true).toLowerCase()).not.toContain("fixture");
  });

  it("names the passing languages separately", () => {
    expect(landing(true)).toContain('<p class="muted landing-languages">Also available in Japanese, Malay, Spanish and Chinese.</p>');
  });

  it("makes no unproven language ordering claim", () => {
    const markup = landing(true).toLowerCase();
    for (const language of ["mandarin", "korean", "bahasa", "hindi", "thai", "vietnamese", "indonesian", "french", "german", "tamil"]) {
      expect(markup, language).not.toContain(language);
    }
    expect(markup).not.toContain("any language");
  });

  it("every other page keeps the demo fixture notice and footer", () => {
    const buy = render("/buy");
    expect(buy).toContain("Demo fixture shops, PayPal sandbox test money and Solana devnet test tokens only.");
    expect(buy).toContain("<footer>Envoi test build. Shops shown here are labeled demo fixtures");
  });
});
