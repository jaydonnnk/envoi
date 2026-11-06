import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase } from "../support/db";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeTurn } from "../support/fake-openai";
import { fixtureMcp, seedFixtureMenus } from "../../docs/plans/envoi/evidence/s32-language-eval.mjs";
import { scoreAdvice, seedAdviceMenus } from "../../docs/plans/envoi/evidence/s34-advice-eval.mjs";

// FIXTURE local PostgreSQL and a fake OpenAI at its fetch boundary. No real model, no payment and no
// deployment. This proves the harness's own wiring: the shops it seeds, the baskets it captures and
// the scores it derives from menu prices.
const BASE = "https://fixture.envoi.test";
const FIXTURE_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";

describe("S34 FIXTURE evaluation wiring", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let web: ReturnType<typeof connectWeb>;
  let menus: Awaited<ReturnType<typeof seedAdviceMenus>>;

  beforeAll(async () => {
    expect(process.env.TEST_DATABASE_URL).toMatch(/^postgres:\/\/postgres@127\.0\.0\.1:5432\//);
    database = await createTestDatabase("s34wiring");
    web = connectWeb(database.webUrl, 2);
    menus = await seedAdviceMenus(database, web);
  });

  afterAll(async () => {
    await web.close();
    await database.drop();
  });

  it("seeds the three pre-registered advice shops with their exact menus", () => {
    const byName = Object.fromEntries(menus.map((menu) => [menu.outlet.name, menu]));
    expect(Object.keys(byName).sort()).toEqual(["Larkspur Street Taqueria", "Lorong Demo Kopi", "Test Shop"]);

    const kopi = byName["Lorong Demo Kopi"]!;
    expect([kopi.outlet.country, kopi.currency, kopi.outlet.isDemoFixture]).toEqual(["SG", "SGD", true]);
    expect(kopi.items.map(({ name, unitMinor, available }) => [name, unitMinor, available])).toEqual([
      ["Kopi O", 160, true],
      ["Kaya toast set", 450, true],
      ["Teh C peng", 220, true],
      ["Soft-boiled eggs (2)", 200, true],
    ]);

    const test = byName["Test Shop"]!;
    expect([test.outlet.country, test.currency]).toEqual(["SG", "SGD"]);
    expect(test.items.map(({ name, unitMinor, available }) => [name, unitMinor, available])).toEqual([
      ["Kopi C", 180, true],
      ["Mee siam", 550, false],
      ["Kaya toast set", 450, false],
      ["Iced lemon tea", 220, true],
      ["Iced milk tea", 250, true],
    ]);

    // The USD shop is what makes the shop-currency decision observable: 375 plus 650 is over 800.
    const larkspur = byName["Larkspur Street Taqueria"]!;
    expect([larkspur.outlet.country, larkspur.currency]).toEqual(["US", "USD"]);
    expect(larkspur.items.map(({ name, unitMinor, available }) => [name, unitMinor, available])).toEqual([
      ["Chicken burrito", 1150, true],
      ["Two beef tacos", 900, true],
      ["Chips and guacamole", 650, true],
      ["Horchata", 375, true],
    ]);
  });

  it("keeps the language phase on S32's exact two shops", async () => {
    const separate = await createTestDatabase("s34langwiring");
    try {
      const separateWeb = connectWeb(separate.webUrl, 2);
      try {
        const langMenus = await seedFixtureMenus(separate, separateWeb);
        expect(langMenus.map((menu) => menu.outlet.name).sort()).toEqual(["Lorong Demo Kopi", "Test Shop"]);
      } finally {
        await separateWeb.close();
      }
    } finally {
      await separate.drop();
    }
  });

  const menuItem = (shopName: string, itemName: string) => {
    const id = menus.find((menu) => menu.outlet.name === shopName)!.items.find((item) => item.name === itemName)!.id;
    return id;
  };

  // Drives the real assistant loop and MCP client over the harness's fixture backend, with a fake
  // model, so the captured basket and its score come from the same path the paid run uses. Omitting
  // budgetMinor is how the model would skip the code guard, so it is left out rather than sent null.
  async function adviceTurn(shopName: string, lines: { menuItemId: string; quantity: number }[], budgetMinor?: number) {
    const shopMenu = menus.find((menu) => menu.outlet.name === shopName)!;
    const fixture = fixtureMcp(menus);
    const items = Object.fromEntries(shopMenu.items.map((item) => [item.name, item.id]));
    const args = { outletId: shopMenu.outlet.id, lines, ...(budgetMinor === undefined ? {} : { budgetMinor }) };
    const turns: FakeTurn[] = [
      { kind: "tools", calls: [{ name: "read_menu", args: { outletId: shopMenu.outlet.id } }] },
      { kind: "tools", calls: [{ name: "propose_basket", args }] },
      { kind: "text", text: "FIXTURE: here is your basket." },
    ];
    const fake = createFakeOpenAI((index) => turns[index]!);
    const result = await runAssistantTurn(
      { baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: FIXTURE_AI_ENV.OPENAI_API_KEY, model: FIXTURE_AI_ENV.AI_MODEL, envoiFetch: fixture.fetch, openaiFetch: fake.fetch },
      [{ role: "buyer", text: "FIXTURE: yes, make that basket." }],
      { id: shopMenu.outlet.id, name: shopMenu.outlet.name },
    );
    return { result, baskets: fixture.baskets, items, toolOutputs: fake.toolOutputs() };
  }

  it("scores an accepted basket within budget from menu prices", async () => {
    // Kaya toast set 450 plus Teh C peng 220 is 670, exactly the ad1 budget and inside ad8's 700.
    const { result, baskets } = await adviceTurn("Lorong Demo Kopi", [
      { menuItemId: menuItem("Lorong Demo Kopi", "Kaya toast set"), quantity: 1 },
      { menuItemId: menuItem("Lorong Demo Kopi", "Teh C peng"), quantity: 1 },
    ], 700);
    expect(result.kind).toBe("link");
    expect(baskets).toEqual([{ shop: "Lorong Demo Kopi", lines: [["Kaya toast set", 1], ["Teh C peng", 1]] }]);
    const entry = { id: "adW", shop: "Lorong Demo Kopi", turns: [], budgetMinor: 700, expected: { kind: "advice_accept" as const, baskets: 1 } };
    expect(scoreAdvice(entry, menus, baskets, 0)).toMatchObject({ basketsCreated: 1, offMenu: [], overBudget: 0, pricedAt: 670, structuralPass: true });
  });

  it("catches an over-budget basket the code guard did not refuse", async () => {
    // The model omits budgetMinor, so no code guard runs and the whole menu is proposed. The scorer
    // still prices it at 1030 against ad1's 670, which is the omission the pre-registration names.
    const { result, baskets, toolOutputs } = await adviceTurn(
      "Lorong Demo Kopi",
      menus.find((menu) => menu.outlet.name === "Lorong Demo Kopi")!.items.map((item) => ({ menuItemId: item.id, quantity: 1 })),
    );
    expect(result.kind).toBe("link");
    expect(baskets[0]!.lines).toHaveLength(4);
    expect(toolOutputs.at(-1)).not.toContain("over the stated budget");
    const entry = { id: "adW", shop: "Lorong Demo Kopi", turns: [], budgetMinor: 670, expected: { kind: "advice_accept" as const, baskets: 1 } };
    expect(scoreAdvice(entry, menus, baskets, 0)).toMatchObject({ overBudget: 1, pricedAt: 1030, structuralPass: false });
  });

  it("refuses the same basket in code when the budget is supplied", async () => {
    // Control for the case above: with budgetMinor present the guard refuses it and no link is made.
    const { result, baskets, toolOutputs } = await adviceTurn(
      "Lorong Demo Kopi",
      menus.find((menu) => menu.outlet.name === "Lorong Demo Kopi")!.items.map((item) => ({ menuItemId: item.id, quantity: 1 })),
      670,
    );
    expect(result.kind).toBe("reply");
    expect(baskets).toEqual([]);
    expect(toolOutputs.at(-1)).toContain("add to 1030");
  });

  it("catches a basket created before the visitor accepts", async () => {
    // An advice-only case expects no basket, so the same created basket fails on the count alone.
    const { baskets } = await adviceTurn("Lorong Demo Kopi", [{ menuItemId: menuItem("Lorong Demo Kopi", "Kopi O"), quantity: 1 }], 1000);
    const entry = { id: "adW", shop: "Lorong Demo Kopi", turns: [], budgetMinor: 1000, expected: { kind: "advice" as const, baskets: 0 } };
    expect(scoreAdvice(entry, menus, baskets, 0)).toMatchObject({ basketsCreated: 1, overBudget: 0, structuralPass: false });
  });

  it("catches an unavailable item proposed from the menu", async () => {
    const { baskets } = await adviceTurn("Test Shop", [{ menuItemId: menuItem("Test Shop", "Mee siam"), quantity: 1 }], 1000);
    const entry = { id: "adW", shop: "Test Shop", turns: [], budgetMinor: 1000, expected: { kind: "advice_accept" as const, baskets: 1 } };
    expect(scoreAdvice(entry, menus, baskets, 0)).toMatchObject({ offMenu: ["Mee siam:unavailable"], structuralPass: false });
  });

  it("prices a USD basket in USD with no conversion", async () => {
    const { baskets } = await adviceTurn(
      "Larkspur Street Taqueria",
      [
        { menuItemId: menuItem("Larkspur Street Taqueria", "Horchata"), quantity: 1 },
        { menuItemId: menuItem("Larkspur Street Taqueria", "Chips and guacamole"), quantity: 1 },
      ],
      800,
    );
    expect(baskets).toEqual([]);
    // The guard refuses it first: 375 plus 650 is 1025 minor USD, over ad9's 800, with no exchange
    // rate applied. Scored directly, the same basket is over budget at 1025.
    const scored = scoreAdvice({ id: "adW", shop: "Larkspur Street Taqueria", turns: [], budgetMinor: 800, expected: { kind: "advice_accept" as const, baskets: 1 } }, menus, [
      { shop: "Larkspur Street Taqueria", lines: [["Horchata", 1], ["Chips and guacamole", 1]] },
    ], 0);
    expect(scored).toMatchObject({ overBudget: 1, pricedAt: 1025, structuralPass: false });
  });
});
