import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BasketForm, type BasketItem, type MenuTranslation } from "@/app/buy/basket-form";
import { keepSafeTranslations, languageName, LANGUAGE_SUBTAG } from "@/domain/menu/translate";
import type { WebEnv } from "@/env";
import { menuTranslator } from "@/integrations/ai/openai";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));

// S29: the menu explained and translated, Gate 3 reopening 2026-10-29 named tests 23, 25, 26 and 27.
// Every menu, item id and translation here is a FIXTURE; no model is called.

const MENU = [
  { id: "itm_fixturekopi", name: "Kopi C siew dai" },
  { id: "itm_fixturekaya", name: "Kaya toast set" },
  { id: "itm_fixtureeggs", name: "Soft-boiled eggs (2)" },
];

describe("menu translation rules", () => {
  it("a translation language must be a primary language subtag", () => {
    for (const tag of ["zh", "ja", "ko", "de", "en", "fil"]) {
      expect(LANGUAGE_SUBTAG.test(tag), tag).toBe(true);
      expect(languageName(tag), tag).not.toBeNull();
    }
    expect(languageName("zh")).toBe("Chinese");
    // A whole browser tag, a capital letter, a script or region subtag, a longer tag, or a well-formed
    // subtag that names no language is refused.
    for (const tag of ["zh-CN", "ZH", "Zh", "zh_CN", "Hans", "CN", "z", "deut", "", " zh", "zh ", "zzz", "und", "qaa"]) {
      expect(languageName(tag), JSON.stringify(tag)).toBeNull();
    }
    for (const tag of ["zh-CN", "ZH", "zh_CN", "z", "deut", " zh", "zh\n"]) expect(LANGUAGE_SUBTAG.test(tag), JSON.stringify(tag)).toBe(false);
  });

  it("a translated item not on the menu revision is dropped", () => {
    const kept = keepSafeTranslations(MENU, [
      { itemId: "itm_fixturekopi", name: "咖啡C少糖", explanation: "加淡奶、少糖的本地咖啡。" },
      { itemId: "itm_fixtureinvented", name: "免费咖啡", explanation: "FIXTURE item the menu does not hold." },
      // A second answer for the same item is not a second item.
      { itemId: "itm_fixturekopi", name: "另一个咖啡", explanation: null },
    ]);
    expect(kept).toEqual([{ itemId: "itm_fixturekopi", name: "咖啡C少糖", explanation: "加淡奶、少糖的本地咖啡。" }]);
    // Bounds: a name of 1 to 80 characters and an explanation of at most 160, counted as characters.
    const bounded = keepSafeTranslations(MENU, [
      { itemId: "itm_fixturekopi", name: "咖".repeat(80), explanation: "啡".repeat(160) },
      { itemId: "itm_fixturekaya", name: "咖".repeat(81), explanation: null },
      { itemId: "itm_fixtureeggs", name: "  ", explanation: null },
    ]);
    expect(bounded.map((item) => item.itemId)).toEqual(["itm_fixturekopi"]);
    expect(keepSafeTranslations(MENU, [{ itemId: "itm_fixturekaya", name: "咖椰吐司", explanation: "啡".repeat(161) }])).toEqual([]);
    // An empty explanation is no explanation.
    expect(keepSafeTranslations(MENU, [{ itemId: "itm_fixturekaya", name: " 咖椰吐司 ", explanation: " " }])).toEqual([{ itemId: "itm_fixturekaya", name: "咖椰吐司", explanation: null }]);
  });

  it("a translation holding a digit or currency sign the original lacks is dropped", () => {
    const one = (name: string, explanation: string | null, itemId = "itm_fixturekopi") => keepSafeTranslations(MENU, [{ itemId, name, explanation }]);
    expect(one("咖啡C少糖", "加淡奶、少糖的本地咖啡。")).toHaveLength(1);
    // A number word is not a digit: "两个" (two) is kept.
    expect(one("咖椰吐司套餐", "配两个半熟蛋。", "itm_fixturekaya")).toHaveLength(1);
    for (const [name, explanation] of [
      ["咖啡C少糖 1.60", null],
      ["咖啡C少糖", "只要1元"],
      ["咖啡C少糖", "S$1.60"],
      ["咖啡C少糖", "US$2"],
      ["咖啡 $", null],
      ["咖啡", "¥"],
      ["咖啡", "€"],
      ["咖啡", "£"],
      ["咖啡", "一元"],
      // Full-width forms count as their plain forms.
      ["咖啡", "１杯"],
      ["咖啡", "＄"],
      ["咖啡", "￥"],
      // Another script's digit.
      ["咖啡", "٣"],
    ] as const) {
      expect(one(name, explanation), `${name} / ${explanation}`).toEqual([]);
    }
    // A digit the original name holds is the shop's own: "(2)" may stay.
    expect(keepSafeTranslations(MENU, [{ itemId: "itm_fixtureeggs", name: "半熟蛋(2)", explanation: "两个半熟蛋。" }])).toHaveLength(1);
    expect(keepSafeTranslations(MENU, [{ itemId: "itm_fixtureeggs", name: "半熟蛋(3)", explanation: null }])).toEqual([]);
  });

  it("a translation never changes a displayed price, availability or original name", () => {
    const items: BasketItem[] = [
      { id: "itm_fixturekopi", name: "Kopi C siew dai", unitMinor: 160, available: true },
      { id: "itm_fixturekaya", name: "Kaya toast set", unitMinor: 480, available: true },
      { id: "itm_fixturemilo", name: "Milo Dinosaur", unitMinor: 350, available: false },
      { id: "itm_fixtureunset", name: "Iced lemon tea", unitMinor: null, available: true },
    ];
    // A hostile FIXTURE translation that tries to read as a price, an availability and another name.
    const translation: MenuTranslation = {
      language: "zh",
      items: {
        itm_fixturekopi: { name: "咖啡C少糖", explanation: "加淡奶、少糖的本地咖啡。" },
        itm_fixturekaya: { name: "Free today", explanation: "Available now, Milo Dinosaur" },
        itm_fixturemilo: { name: "美禄恐龙", explanation: "冰美禄。" },
        itm_fixtureunset: { name: "冰柠檬茶", explanation: null },
      },
    };
    const render = (shown: MenuTranslation | null) =>
      renderToStaticMarkup(createElement(BasketForm, { outletId: "out_fixture", currency: "SGD", items, translation: shown }));
    const plain = render(null);
    const translated = render(translation);
    const facts = (html: string) => ({
      prices: [...html.matchAll(/<small>(S\$[\d.]+ each|Price not set, cannot be bought yet|Not available)<\/small>/g)].map((match) => match[1]),
      steppers: [...html.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]),
      disabled: [...html.matchAll(/<button[^>]*?(disabled="")?[^>]*aria-label="One more ([^"]+)"/g)].map((match) => `${match[2]}:${match[1] ?? ""}`),
      subtotal: html.match(/class="total money">([^<]+)</)?.[1],
    });
    expect(facts(translated)).toEqual(facts(plain));
    expect(facts(plain).prices).toEqual(["S$1.60 each", "S$4.80 each", "Not available", "Price not set, cannot be bought yet"]);
    // Every original name is still shown, each as its own line under the translation.
    for (const item of items) expect(translated).toContain(`<small class="orig">${item.name}</small>`);
    expect(translated).toContain('<strong lang="zh">咖啡C少糖</strong>');
    // An English explanation keeps the shop's name as the only name.
    const english = render({ language: "en", items: { itm_fixturekopi: { name: "Kopi C siew dai", explanation: "Local coffee with evaporated milk, less sugar." } } });
    expect(english).not.toContain('class="orig"');
    expect(english).toContain('<small lang="en">Local coffee with evaporated milk, less sugar.</small>');
    expect(facts(english)).toEqual(facts(plain));
  });

  it("translation is off unless the key and the model are set", () => {
    const env = (fields: Partial<WebEnv>) => ({ ...fields }) as WebEnv;
    expect(menuTranslator(env({ OPENAI_API_KEY: "fixture-openai-key", AI_MENU_TRANSLATION_MODEL: "FIXTURE-translation-model" }))?.model).toBe("FIXTURE-translation-model");
    expect(menuTranslator(env({ AI_MENU_TRANSLATION_MODEL: "FIXTURE-translation-model" }))).toBeNull();
    expect(menuTranslator(env({ OPENAI_API_KEY: "fixture-openai-key" }))).toBeNull();
    // The suggestion model is not the translation model.
    expect(menuTranslator(env({ OPENAI_API_KEY: "fixture-openai-key", AI_MODEL: "FIXTURE-model" }))).toBeNull();
  });
});
