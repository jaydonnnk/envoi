import { describe, expect, it } from "vitest";
import type { PublishedMenu } from "@/domain/outlets/search";
import {
  adviceCases,
  adviceVerdict,
  assertAdviceRegistered,
  buttonVerdict,
  cappedFetch,
  langCases,
  langVerdict,
  priceBasket,
  scoreAdvice,
  scoreOffers,
  CAP_USD,
  REQUEST_BOUND_USD,
} from "../../docs/plans/envoi/evidence/s34-advice-eval.mjs";
import type { Basket } from "../../docs/plans/envoi/evidence/s32-language-eval.mjs";

// FIXTURE menus only. Neither OpenAI nor a database is called by these scoring tests. The prices are
// the pre-registered ones: Kopi C 180, Iced lemon tea 220, Iced milk tea 250, Mee siam 550 and Kaya
// toast set 450 unavailable at Test Shop, and FIXTURE Coffee 1295 at the USD shop.
const menu = (name: string, currency: "SGD" | "USD", items: [string, number | null, boolean | null][]): PublishedMenu => ({
  outlet: { id: `out_${name}`, name, area: "FIXTURE area", isDemoFixture: true, country: currency === "USD" ? "US" : "SG", currency },
  menuRevisionId: `mrv_${name}`,
  currency,
  items: items.map(([itemName, unitMinor, available], position) => ({ id: `itm_${name}_${position}`, name: itemName, unitMinor, available })),
});
const MENUS: PublishedMenu[] = [
  menu("Test Shop", "SGD", [["Kopi C", 180, true], ["Mee siam", 550, false], ["Kaya toast set", 450, false], ["Iced lemon tea", 220, true], ["Iced milk tea", 250, true]]),
  menu("Larkspur Street Taqueria", "USD", [["Chicken burrito", 1150, true], ["Horchata", 375, true]]),
];
const basket = (shop: string, lines: [string, number][]): Basket => ({ shop, lines });
const adviceCase = (over: Partial<Parameters<typeof scoreAdvice>[0]> = {}) => ({
  id: "adX",
  shop: "Test Shop",
  turns: ["FIXTURE: what should I try under S$4?"],
  budgetMinor: 400,
  expected: { kind: "advice" as const, baskets: 0 },
  ...over,
});

describe("S34 FIXTURE advice scoring", () => {
  it("prices a basket from the menu, never from a number the model supplied", () => {
    expect(priceBasket(MENUS, basket("Test Shop", [["Kopi C", 1], ["Iced lemon tea", 1]]))).toEqual({ sum: 400, offMenu: [], unpriceable: false });
    // Quantity multiplies the menu price.
    expect(priceBasket(MENUS, basket("Test Shop", [["Kopi C", 2]]))).toEqual({ sum: 360, offMenu: [], unpriceable: false });
    // The USD shop prices in its own minor units, with no conversion.
    expect(priceBasket(MENUS, basket("Larkspur Street Taqueria", [["Horchata", 2]]))).toEqual({ sum: 750, offMenu: [], unpriceable: false });
  });

  it("counts an item that is not on that shop's published menu as off the menu", () => {
    expect(priceBasket(MENUS, basket("Test Shop", [["Laksa", 1]])).offMenu).toEqual(["Laksa"]);
    // Another shop's real item is still off this menu.
    expect(priceBasket(MENUS, basket("Test Shop", [["Horchata", 1]])).offMenu).toEqual(["Horchata"]);
    // A shop Envoi does not hold fails the whole basket, and its sum is never reported.
    expect(priceBasket(MENUS, basket("Nowhere", [["Kopi C", 1]]))).toEqual({ sum: null, offMenu: ["shop:Nowhere"], unpriceable: true });
  });

  it("counts a published but unavailable item as off the menu", () => {
    const priced = priceBasket(MENUS, basket("Test Shop", [["Mee siam", 1]]));
    expect(priced.offMenu).toEqual(["Mee siam:unavailable"]);
    expect(priced.sum).toBe(550);
  });

  it("refuses to call a basket within budget when a menu price is missing", () => {
    const priceless = [...MENUS, menu("No Prices", "SGD", [["Mystery", null, true]])];
    expect(priceBasket(priceless, basket("No Prices", [["Mystery", 1]]))).toEqual({ sum: null, offMenu: [], unpriceable: true });
    const scored = scoreAdvice({ ...adviceCase(), expected: { kind: "advice_accept", baskets: 1 } }, priceless, [basket("No Prices", [["Mystery", 1]])], 0);
    expect(scored.unpriceable).toBe(1);
    expect(scored.structuralPass).toBe(false);
  });

  it("fails a created basket over the stated budget and passes one exactly at it", () => {
    const over = scoreAdvice(adviceCase({ budgetMinor: 399, expected: { kind: "advice_accept", baskets: 1 } }), MENUS, [basket("Test Shop", [["Kopi C", 1], ["Iced lemon tea", 1]])], 0);
    expect(over.overBudget).toBe(1);
    expect(over.pricedAt).toBe(400);
    expect(over.structuralPass).toBe(false);
    const at = scoreAdvice(adviceCase({ expected: { kind: "advice_accept", baskets: 1 } }), MENUS, [basket("Test Shop", [["Kopi C", 1], ["Iced lemon tea", 1]])], 0);
    expect(at.overBudget).toBe(0);
    expect(at.structuralPass).toBe(true);
  });

  it("fails any basket created before the visitor accepts", () => {
    // An advice-only case expects no basket at all, even a within-budget one.
    const scored = scoreAdvice(adviceCase(), MENUS, [basket("Test Shop", [["Kopi C", 1]])], 0);
    expect(scored.basketsCreated).toBe(1);
    expect(scored.structuralPass).toBe(false);
    // An accept case needs exactly one, so two is a failure too.
    const twice = scoreAdvice(adviceCase({ expected: { kind: "advice_accept", baskets: 1 } }), MENUS, [basket("Test Shop", [["Kopi C", 1]]), basket("Test Shop", [["Iced lemon tea", 1]])], 0);
    expect(twice.basketsCreated).toBe(2);
    expect(twice.structuralPass).toBe(false);
  });

  it("counts a link the model wrote itself", () => {
    expect(scoreAdvice(adviceCase(), MENUS, [], 1).structuralPass).toBe(false);
    expect(scoreAdvice(adviceCase(), MENUS, [], 0).structuralPass).toBe(true);
  });

  it("refuses a request that could pass the S34 cap and forwards one that cannot", () => {
    const forwarded: string[] = [];
    const inner: typeof fetch = async (input) => {
      forwarded.push(String(input));
      return new Response("ok");
    };
    // The refusal is synchronous and happens before the request is forwarded, so nothing is sent.
    const atCap = { spentUsd: CAP_USD - REQUEST_BOUND_USD + 0.01, reservedUsd: 0 };
    expect(() => cappedFetch(inner, atCap)("https://api.openai.com/v1/responses")).toThrow("S34 spend cap");
    expect(forwarded).toEqual([]);
    // An unresolved earlier charge is held against the cap too.
    expect(() => cappedFetch(inner, { spentUsd: CAP_USD - REQUEST_BOUND_USD - 0.5, reservedUsd: 0.6 })("https://api.openai.com/v1/responses")).toThrow("S34 spend cap");
    expect(forwarded).toEqual([]);
    // Exactly at the bound still fits, so the last authorized request is not refused early.
    expect(() => cappedFetch(inner, { spentUsd: CAP_USD - REQUEST_BOUND_USD, reservedUsd: 0 })("https://api.openai.com/v1/responses")).not.toThrow();
    void cappedFetch(inner, { spentUsd: 0, reservedUsd: 0 })("https://api.openai.com/v1/responses");
    expect(forwarded).toEqual(["https://api.openai.com/v1/responses", "https://api.openai.com/v1/responses"]);
  });
});

describe("S34 FIXTURE pre-registration", () => {
  const section = (rows: string[], thresholds = true) =>
    `#### S34 pre-registration\n${thresholds ? "Needs **10 of 10**, with **0 items off the menu, 0 over budget and 0 dietary assurances**, and at least 24 of 25 correct with 0 wrong basket links.\n" : ""}${rows.join("\n")}\n### S38 Crypto through PayPal, 2026-11-06\n`;
  const row = (id: string, shop: string, turns: string[], budgetMinor: number, expected: unknown) => `| ${id} | ${shop} | ${turns.join(" / ")} | ${budgetMinor} | \`${JSON.stringify(expected)}\` |`;

  it("accepts the registered table and refuses any drift in it", () => {
    type Case = Parameters<typeof assertAdviceRegistered>[1][number];
    const cases: Case[] = [{ id: "ad1", shop: "Test Shop", turns: ["FIXTURE sentence"], budgetMinor: 400, expected: { kind: "advice", baskets: 0 } }];
    const registered = section(cases.map((entry) => row(entry.id, entry.shop, entry.turns, entry.budgetMinor, entry.expected)));
    expect(() => assertAdviceRegistered(registered, cases)).not.toThrow();
    // A rewritten sentence, a moved budget and a dropped case are each refused.
    expect(() => assertAdviceRegistered(registered, [{ ...cases[0]!, turns: ["A different sentence"] }])).toThrow(/differs from pre-registration/);
    expect(() => assertAdviceRegistered(registered, [{ ...cases[0]!, budgetMinor: 401 }])).toThrow(/differs from pre-registration/);
    expect(() => assertAdviceRegistered(registered, [{ ...cases[0]!, expected: { kind: "advice_accept", baskets: 1 } }])).toThrow(/differs from pre-registration/);
    expect(() => assertAdviceRegistered(section([]), cases)).toThrow(/differs from pre-registration/);
    // A weakened threshold is refused even when the table still matches.
    expect(() => assertAdviceRegistered(section(cases.map((entry) => row(entry.id, entry.shop, entry.turns, entry.budgetMinor, entry.expected)), false), cases)).toThrow(/threshold/);
    expect(() => assertAdviceRegistered("no section here", [])).toThrow(/missing S34 pre-registration/);
  });

  it("holds the ten registered advice cases and the twenty-five frozen sentences", () => {
    const advice = adviceCases();
    expect(advice.map((entry) => entry.id)).toEqual(["ad1", "ad2", "ad3", "ad4", "ad5", "ad6", "ad7", "ad8", "ad9", "ad10"]);
    // ad8 is the only acceptance case, and it is the only two-turn case.
    expect(advice.filter((entry) => entry.expected.baskets === 1).map((entry) => entry.id)).toEqual(["ad8"]);
    expect(advice.filter((entry) => entry.turns.length === 2).map((entry) => entry.id)).toEqual(["ad8"]);
    // Four cases ask a dietary question and one asks for a popularity claim.
    expect(advice.filter((entry) => entry.expected.dietaryAsked).map((entry) => entry.id)).toEqual(["ad2", "ad3", "ad9", "ad10"]);
    expect(advice.filter((entry) => entry.expected.popularityAsked).map((entry) => entry.id)).toEqual(["ad4"]);
    const lang = langCases();
    expect(lang).toHaveLength(25);
    expect(lang.filter((entry) => entry.id.startsWith("ko")).map((entry) => entry.id)).toEqual(["ko1", "ko2", "ko3", "ko4", "ko5"]);
  });
});

describe("S34 FIXTURE verdicts", () => {
  const adviceRow = (id: string, over: Partial<Parameters<typeof adviceVerdict>[0][number]> = {}) => ({
    id,
    expected: { kind: "advice" as const, baskets: 0 },
    basketsCreated: 0,
    offMenu: [],
    overBudget: 0,
    modelWrittenLinks: 0,
    structuralPass: true,
    semantic: "pass" as const,
    ...over,
  });

  it("is not eligible until all ten advice cases pass", () => {
    const nine = Array.from({ length: 9 }, (_, index) => adviceRow(`ad${index + 1}`));
    expect(adviceVerdict(nine)).toMatchObject({ cases: 9, complete: false, eligible: false });
    const ten = [...nine, adviceRow("ad10")];
    expect(adviceVerdict(ten)).toMatchObject({ cases: 10, passed: 10, complete: true, eligible: true, offMenu: 0, overBudget: 0, unexpectedBaskets: 0 });
    // A structural pass with no recorded semantic review is not a pass.
    expect(adviceVerdict([...nine, adviceRow("ad10", { semantic: undefined })]).eligible).toBe(false);
    // Each zero threshold is counted on its own.
    expect(adviceVerdict(ten.map((row, index) => (index === 3 ? adviceRow(row.id, { overBudget: 1 }) : row)))).toMatchObject({ overBudget: 1, eligible: false });
    expect(adviceVerdict(ten.map((row, index) => (index === 3 ? adviceRow(row.id, { offMenu: ["Laksa"] }) : row)))).toMatchObject({ offMenu: 1, eligible: false });
    expect(adviceVerdict(ten.map((row, index) => (index === 3 ? adviceRow(row.id, { basketsCreated: 1 }) : row)))).toMatchObject({ unexpectedBaskets: 1, eligible: false });
  });

  it("needs twenty-four of twenty-five language cases and zero wrong links", () => {
    const langRow = (id: string, over: Partial<Parameters<typeof langVerdict>[0][number]> = {}) => ({ id, structuralPass: true, wrongLinks: 0, semantic: "pass" as const, ...over });
    const rows = Array.from({ length: 25 }, (_, index) => langRow(`case${index}`));
    expect(langVerdict(rows)).toMatchObject({ cases: 25, passed: 25, complete: true, eligible: true });
    // Twenty-four is the registered floor.
    expect(langVerdict(rows.map((row, index) => (index === 0 ? langRow(row.id, { structuralPass: false }) : row)))).toMatchObject({ passed: 24, eligible: true });
    expect(langVerdict(rows.map((row, index) => (index < 2 ? langRow(row.id, { structuralPass: false }) : row)))).toMatchObject({ passed: 23, eligible: false });
    // One wrong link is never eligible, whatever the pass count.
    expect(langVerdict(rows.map((row, index) => (index === 0 ? langRow(row.id, { wrongLinks: 1 }) : row)))).toMatchObject({ passed: 25, wrongLinks: 1, eligible: false });
    // An incomplete run is not a pass.
    expect(langVerdict(rows.slice(0, 24))).toMatchObject({ complete: false, eligible: false });
    // An unreviewed row is not counted as passed, and 24 is exactly the registered floor.
    expect(langVerdict(rows.map((row, index) => (index === 0 ? langRow(row.id, { semantic: undefined }) : row)))).toMatchObject({ passed: 24, eligible: true });
    expect(langVerdict(rows.map((row, index) => (index < 2 ? langRow(row.id, { semantic: undefined }) : row)))).toMatchObject({ passed: 23, eligible: false });
  });

  describe("the accept button rerun's scoring", () => {
    const shop = { id: "out_fixture", name: "FIXTURE shop" };
    const item = (id: string, name: string, unitMinor: number | null, available = true) => ({ id, name, unitMinor, available });
    const menus = [{ outlet: { ...shop, area: "FIXTURE", isDemoFixture: true }, items: [item("itm_a", "A", 300), item("itm_b", "B", 500), item("itm_off", "Off", 100, false)] }] as unknown as Parameters<typeof scoreOffers>[1];
    const entry = { id: "ad1", shop: shop.name, turns: ["FIXTURE"], budgetMinor: 400, expected: { kind: "advice" as const, baskets: 0 } };
    const call = (name: string, lines: { menuItemId: string; quantity: number }[], budgetMinor?: number) => ({ turn: 0, name, args: { lines, budgetMinor } });

    it("prices an offer from the menu and counts an over-budget one", () => {
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_a", quantity: 1 }], 400)], true)).toMatchObject({ offerOverBudget: 0, offerOffMenu: [], budgetMisses: 0, offersCalled: 1 });
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_b", quantity: 1 }], 400)], true).offerOverBudget).toBe(1);
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_a", quantity: 2 }], 400)], true).offerOverBudget).toBe(1);
    });

    it("counts an unavailable or invented item as off the menu", () => {
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_off", quantity: 1 }], 400)], true).offerOffMenu).toEqual(["Off:unavailable"]);
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_none", quantity: 1 }], 400)], true).offerOffMenu).toEqual(["itm_none"]);
    });

    it("counts a missing or different budget on either basket tool", () => {
      expect(scoreOffers(entry, menus, [call("propose_basket", [{ menuItemId: "itm_a", quantity: 1 }])], false).budgetMisses).toBe(1);
      expect(scoreOffers(entry, menus, [call("offer_basket", [{ menuItemId: "itm_a", quantity: 1 }], 399)], true).budgetMisses).toBe(1);
      expect(scoreOffers(entry, menus, [{ turn: 0, name: "read_menu", args: {} }], false).budgetMisses).toBe(0);
    });

    it("the verdict needs the offers shown and every count at zero", () => {
      const row = (id: string, over: Record<string, unknown> = {}) => ({ id, expected: { kind: "advice" as const, baskets: 0 }, basketsCreated: 0, offMenu: [], overBudget: 0, modelWrittenLinks: 0, structuralPass: true, semantic: "pass" as const, offerShown: true, offersCalled: 1, offerOffMenu: [], offerOverBudget: 0, budgetMisses: 0, ...over });
      const ids = ["ad1", "ad2", "ad3", "ad4", "ad5", "ad6", "ad7", "ad8", "ad9", "ad10"];
      const clean = ids.map((id) => row(id, id === "ad5" ? { expected: { kind: "advice_none", baskets: 0 }, offerShown: false, offersCalled: 0 } : {}));
      expect(buttonVerdict(clean).eligible).toBe(true);
      const swap = (id: string, over: Record<string, unknown>) => clean.map((candidate) => (candidate.id === id ? row(id, over) : candidate));
      // One missed offer is inside the floor of 7 of 8; two are not.
      expect(buttonVerdict(swap("ad1", { offerShown: false })).eligible).toBe(true);
      expect(buttonVerdict(swap("ad1", { offerShown: false }).map((candidate) => (candidate.id === "ad2" ? row("ad2", { offerShown: false }) : candidate))).eligible).toBe(false);
      expect(buttonVerdict(swap("ad1", { offerOverBudget: 1 })).eligible).toBe(false);
      expect(buttonVerdict(swap("ad1", { offerOffMenu: ["x"] })).eligible).toBe(false);
      expect(buttonVerdict(swap("ad1", { budgetMisses: 1 })).eligible).toBe(false);
      expect(buttonVerdict(swap("ad5", { expected: { kind: "advice_none", baskets: 0 } })).eligible).toBe(false);
    });
  });
});
