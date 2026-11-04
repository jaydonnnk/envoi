import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// S15 amendment, 2026-10-21: the landing page at the root address, rendered as the server first paints
// it, with the page's path supplied to the notice and footer. S41, 2026-11-04: it leads with the
// approved pitch and offers Ask Envoi first, but only while the assistant is on, because /buy/ask
// answers 404 when it is off.
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
  it("leads with the approved pitch line", () => {
    expect(landing(true)).toContain("<h1>Any language. One scan. PayPal.</h1>");
  });

  it("says the AI never sets a price and never pays", () => {
    const markup = landing(true);
    expect(markup).toContain("AI reads the menu with you.");
    expect(markup).toContain("It never sets a price and never pays.");
  });

  it("offers Ask Envoi first, as the one primary action", () => {
    const markup = landing(true);
    expect(markup).toContain('<a class="button" href="/buy/ask">Ask Envoi</a>');
    expect(markup).toContain('<a class="button secondary" href="/buy">Find a shop</a>');
    expect(markup.indexOf('href="/buy/ask"')).toBeLessThan(markup.indexOf('href="/buy"'));
  });

  it("offers no Ask Envoi link while the assistant is off, and Find a shop stays primary", () => {
    const markup = landing(false);
    expect(markup).not.toContain("/buy/ask");
    expect(markup).toContain('<a class="button" href="/buy">Find a shop</a>');
  });

  it("links merchants to merchant setup", () => {
    expect(landing(true)).toContain('<a class="button secondary" href="/merchant/setup">I run a shop</a>');
  });

  it("says a scan is never a payment code", () => {
    expect(landing(true)).toContain("It is never a payment code.");
  });

  it("says test money only", () => {
    expect(landing(true)).toContain('<div class="notice" role="note">Test money only. No real money moves.</div>');
  });

  it("shows no demo fixture wording", () => {
    expect(landing(true).toLowerCase()).not.toContain("fixture");
  });

  it("names no language, because none is measured yet", () => {
    const markup = landing(true).toLowerCase();
    const languages = ["mandarin", "chinese", "japanese", "korean", "spanish", "malay", "bahasa", "hindi", "thai", "vietnamese", "indonesian", "french", "german", "tamil"];
    for (const language of languages) {
      expect(markup, language).not.toContain(language);
    }
    expect(markup).not.toContain("any language works");
    expect(markup).toContain("any language. one scan. paypal.");
  });

  it("every other page keeps the demo fixture notice and footer", () => {
    const buy = render("/buy");
    expect(buy).toContain("Demo fixture shops, PayPal sandbox test money and Solana devnet test tokens only.");
    expect(buy).toContain("<footer>Envoi test build. Shops shown here are labeled demo fixtures");
  });
});
