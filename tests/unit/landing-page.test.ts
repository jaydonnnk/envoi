import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// S15 amendment, 2026-10-21: the landing page at the root address, rendered as the server first paints
// it, with the page's path supplied to the notice and footer.
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { default: Home } = await import("@/app/page");
const { SiteFooter, SiteNotice } = await import("@/app/site-chrome");

function render(path: string): string {
  pathname = path;
  const page = path === "/" ? createElement(Home) : null;
  return renderToStaticMarkup(createElement("div", null, createElement(SiteNotice), page, createElement(SiteFooter)));
}

describe("landing page", () => {
  it("links buyers to the buy page", () => {
    expect(render("/")).toContain('<a class="button" href="/buy">Find a shop</a>');
  });

  it("links merchants to merchant setup", () => {
    expect(render("/")).toContain('<a class="button secondary" href="/merchant/setup">I run a shop</a>');
  });

  it("says test money only", () => {
    expect(render("/")).toContain('<div class="notice" role="note">Test money only. No real money moves.</div>');
  });

  it("shows no demo fixture wording", () => {
    expect(render("/").toLowerCase()).not.toContain("fixture");
  });

  it("every other page keeps the demo fixture notice and footer", () => {
    const buy = render("/buy");
    expect(buy).toContain("Demo fixture shops, PayPal sandbox test money and Solana devnet test tokens only.");
    expect(buy).toContain("<footer>Envoi test build. Shops shown here are labeled demo fixtures");
  });
});
