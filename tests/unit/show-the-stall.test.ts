import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStallTranslation, ShowTheStall, spokenOrder, StallCard, stallRows, voiceMatches, type StallStatus } from "@/app/receipt/[purchaseId]/show-the-stall";

// S42: the panel's own rules, Gate 3 third build plan. Every line, translation and amount here is a
// FIXTURE; no model is called and no payment exists.

const LINES = [
  { menuItemId: "itm_fixturekaya", name: "Kaya toast set", quantity: 1 },
  { menuItemId: "itm_fixtureteh", name: "Teh C peng", quantity: 2 },
];
const ZH = [
  { itemId: "itm_fixturekaya", name: "咖椰吐司套餐" },
  { itemId: "itm_fixtureteh", name: "冰奶茶" },
];

const card = (status: StallStatus, rows = stallRows(LINES, ZH), onPlay: (() => void) | null = null) =>
  renderToStaticMarkup(createElement(StallCard, { rows, language: "zh", choose: () => undefined, status, paidAmount: "S$6.70", onPlay }));

describe("show the stall card", () => {
  const opened = () => renderToStaticMarkup(createElement(ShowTheStall, { outletId: "out_fixture", lines: LINES, paidAmount: "S$6.70", translationAvailable: true }));

  it("presents the paid order as the handoff to the stall", () => {
    expect(opened()).toContain("Show this paid order to the stall");
  });

  it("lists the languages as English, Chinese, Malay, Tamil", () => {
    const labels = [...opened().matchAll(/class="stall-language"[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(["English", "中文", "Melayu", "தமிழ்"]);
  });

  it("opens on English with the shop's own names and no translation label", () => {
    const html = opened();
    expect(html).toMatch(/lang="en" aria-pressed="true"[^>]*>English</);
    expect(html).not.toContain("Translating the order.");
    expect(html).not.toContain("AI translation");
    expect(html).toContain("Kaya toast set × 1");
  });

  it("a translated order keeps the original names and amount, and is labeled as AI translation", () => {
    const html = card("translated");
    expect(html).toContain("AI translation.");
    for (const text of ["咖椰吐司套餐 × 1", "冰奶茶 × 2", "Kaya toast set × 1", "Teh C peng × 2", "S$6.70 paid", "Payment confirmed does not mean the shop has accepted the order."]) {
      expect(html, text).toContain(text);
    }
  });

  it("a failed translation shows the original names alone, without the AI label", () => {
    const html = card("failed", stallRows(LINES, []));
    expect(html).not.toContain("AI translation");
    expect(html).toContain("Kaya toast set × 1");
    expect(html.split("Kaya toast set × 1")).toHaveLength(2);
    expect(html).toContain("A translation could not be made.");
  });

  it("a line from another menu revision shows its original name alone", () => {
    const [kaya, teh] = stallRows(LINES, [{ itemId: "itm_otherrevision", name: "别的" }, ZH[1]!]);
    expect(kaya!.translated).toBeNull();
    expect(teh!.translated).toBe("冰奶茶");
  });

  it("Play aloud appears only when the panel is given something to play", () => {
    expect(card("translated")).not.toContain("Play aloud");
    expect(card("translated", undefined, () => undefined)).toContain("Play aloud");
  });

  it("a voice matches its primary language, in either browser spelling", () => {
    expect(voiceMatches("zh-CN", "zh")).toBe(true);
    expect(voiceMatches("ZH_cn", "zh")).toBe(true);
    expect(voiceMatches("ms-MY", "zh")).toBe(false);
    expect(voiceMatches("", "zh")).toBe(false);
  });

  it("never offers Tamil audio, because a listed Tamil voice was heard reading only the digits", () => {
    expect(voiceMatches("ta-IN", "ta")).toBe(false);
    expect(voiceMatches("ms-MY", "ms")).toBe(true);
  });

  it("audio reads the order and never an amount", () => {
    expect(spokenOrder(stallRows(LINES, ZH))).toBe("1 咖椰吐司套餐. 2 冰奶茶");
  });
});

describe("the panel's translation request", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answering = (response: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(response));

  it("asks the existing route with the outlet and language, and returns its names", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, data: { items: ZH } }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchStallTranslation("out_fixture", "zh")).toEqual(ZH);
    expect(fetch).toHaveBeenCalledWith("/api/v1/buyer/menu-translations", expect.objectContaining({ method: "POST", body: JSON.stringify({ outletId: "out_fixture", language: "zh" }) }));
  });

  it("a refusal, an unusable answer or a network failure answers null", async () => {
    answering(async () => Response.json({ ok: false, error: { code: "provider_unreachable", message: "x" } }, { status: 502 }));
    expect(await fetchStallTranslation("out_fixture", "zh")).toBeNull();
    answering(async () => Response.json({ ok: true, data: {} }));
    expect(await fetchStallTranslation("out_fixture", "zh")).toBeNull();
    answering(async () => {
      throw new TypeError("network");
    });
    expect(await fetchStallTranslation("out_fixture", "zh")).toBeNull();
  });
});
