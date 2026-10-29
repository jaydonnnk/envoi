import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";

// S25: the /buy list page as a buyer sees it when the deployment has no AI settings, Gate 3
// reopening 2026-10-29 named test 8. With text suggestions off the sticker is the first way in, so
// the page must not open on "Or scan the sticker", and Ask Envoi is not offered.
describe("buyer page without the AI", () => {
  let fixture: PaymentsFixture;

  beforeAll(async () => {
    for (const name of ["OPENAI_API_KEY", "AI_MODEL", "ASSISTANT_AGENT_TOKEN"]) delete process.env[name];
    fixture = await createPaymentsFixture("buytextoff");
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  it("the buyer page reads correctly with text suggestions off", async () => {
    const { default: BuyPage } = await import("@/app/buy/page");
    const html = renderToStaticMarkup(await BuyPage({ searchParams: Promise.resolve({}) }));
    const text = html.replace(/<[^>]+>/g, "\n").replace(/&#x27;/g, "'");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

    // The page rendered its real content: the seeded demo shop is listed.
    expect(lines).toContain("Lorong Demo Kopi");
    expect(lines).toContain("Scan the shop's sticker, or pick a shop to see its menu.");
    expect(lines).toContain("Scan the sticker");
    // Nothing reads as an alternative to a text box that is not there.
    expect(lines.filter((line) => line.startsWith("Or "))).toEqual([]);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('href="/buy/ask"');
  });
});
