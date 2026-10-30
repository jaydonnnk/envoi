import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuPhotoImport } from "@/app/merchant/setup/menu-import";

// S11 review fixes: with imports closed, the setup page says what Gate 1 (re-approved 2026-10-16)
// says, "Menu photo import is not available in this release", and offers no control that sends a
// photo or claims an AI draft.
describe("closed menu photo import", () => {
  it("the closed import panel says photo import is not available in this release", () => {
    const draft = { revisionId: "mrv_fixture", version: 1, status: "draft", published: false, items: [], latestImport: null };
    const html = renderToStaticMarkup(
      createElement(MenuPhotoImport, { outletId: "out_fixture", currency: "SGD", open: false, draft: draft as never, dirty: false, onImported: () => {}, onReload: () => {} }),
    );
    expect(html).toContain("Menu photo import is not available in this release.");
    expect(html).not.toMatch(/<input|<button|OpenAI|AI draft|switched off|not available yet/i);
  });

  // S27: a US shop's note names its own currency, never SGD.
  it("the closed import panel names the shop's currency", () => {
    const draft = { revisionId: "mrv_fixture", version: 1, status: "draft", published: false, items: [], latestImport: null };
    const html = renderToStaticMarkup(
      createElement(MenuPhotoImport, { outletId: "out_fixture", currency: "USD", open: false, draft: draft as never, dirty: false, onImported: () => {}, onReload: () => {} }),
    );
    expect(html).toContain("Enter each item and its USD price below.");
    expect(html).not.toContain("SGD");
  });
});
