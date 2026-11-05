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
  it("leads with the approved language headline", () => {
    expect(landing(true)).toContain("<h1>Your language. One scan. PayPal.</h1>");
  });

  it("shows the approved order and human approval copy", () => {
    expect(landing(true)).toContain("Scan the shop’s QR and say what you want in your own language. Envoi helps you read the menu and put your order together. Review the exact amount, then approve in PayPal.");
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

  it("names the passing languages separately", () => {
    expect(landing(true)).toContain('<p class="muted">Supported languages: Japanese, Malay, Spanish, Chinese.</p>');
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
