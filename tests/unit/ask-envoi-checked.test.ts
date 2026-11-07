import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskEnvoi } from "@/app/buy/ask/ask-envoi";

// S44: a visitor sees a conversation first. The calls behind it stay readable, closed, under one
// plain-language summary.
describe("Ask Envoi's steps", () => {
  const markup = renderToStaticMarkup(createElement(AskEnvoi));

  it("collapse under How this was checked, closed by default", () => {
    expect(markup).toContain("<summary>How this was checked</summary>");
    expect(markup).toContain("<details");
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
  });

  it("states the approved limits inside the summary", () => {
    expect(markup.slice(markup.indexOf("<details"))).toContain("Each step reads the shop&#x27;s published menu. The assistant cannot pay, approve or read your receipt.");
  });

  it("keeps developer wording out of the open conversation", () => {
    const open = markup.slice(0, markup.indexOf("<details"));
    for (const term of ["MCP", "published API", "What the assistant did", "No calls yet"]) {
      expect(open, term).not.toContain(term);
    }
    expect(markup.slice(markup.indexOf("<details"))).toContain("MCP");
  });
});
