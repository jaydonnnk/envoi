import { loadLocalEnvFile } from "@/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureMcp, seedFixtureMenus } from "../../docs/plans/envoi/evidence/s32-language-eval.mjs";
import { suggestFromText } from "@/domain/suggestions/suggest";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase } from "../support/db";
import { createFakeOpenAI, proposal, type FakeTurn } from "../support/fake-openai";

// FIXTURE local PostgreSQL plus fake OpenAI at fetch. No real model or external service call.
describe("S32 FIXTURE evaluation wiring", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let web: ReturnType<typeof connectWeb>;
  let menus: Awaited<ReturnType<typeof seedFixtureMenus>>;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) loadLocalEnvFile();
    expect(process.env.TEST_DATABASE_URL).toMatch(/^postgres:\/\/postgres@127\.0\.0\.1:5432\//);
    database = await createTestDatabase("s32wiring");
    web = connectWeb(database.webUrl, 2);
    menus = await seedFixtureMenus(database, web);
  });
  afterAll(async () => { await web?.close(); await database?.drop(); });

  it("runs the assistant through the S32 fixture MCP backend", async () => {
    const menu = menus.find((menu) => menu.outlet.name === "Lorong Demo Kopi")!;
    const item = menu.items.find((item) => item.name === "Kopi O")!;
    const turns: FakeTurn[] = [
      { kind: "tools", calls: [{ name: "list_shops", args: {} }] },
      { kind: "tools", calls: [{ name: "read_menu", args: { outletId: menu.outlet.id } }] },
      { kind: "tools", calls: [{ name: "propose_basket", args: { outletId: menu.outlet.id, lines: [{ menuItemId: item.id, quantity: 2 }] } }] },
      { kind: "text", text: "FIXTURE：请打开链接确认两杯 Kopi O。" },
    ];
    const fake = createFakeOpenAI((index) => turns[index]!);
    const fixture = fixtureMcp(menus);
    const result = await runAssistantTurn({ baseUrl: "https://fixture.envoi.test", agentToken: "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken", openaiApiKey: "FIXTURE-no-key", model: "gpt-6-sol", envoiFetch: fixture.fetch, openaiFetch: fake.fetch }, [{ role: "buyer", text: "我要在 Lorong Demo Kopi 买两杯黑咖啡（Kopi O）。" }]);
    expect(result.kind).toBe("link");
    expect(fixture.baskets).toEqual([{ shop: "Lorong Demo Kopi", lines: [["Kopi O", 2]] }]);
    expect(fake.calls).toHaveLength(4);
    expect(fake.toolOutputs().join("\n")).toContain('"unitMinor":160');
  });

  it("runs the real box adapter and settlement on the S32 local seed", async () => {
    const menu = menus.find((menu) => menu.outlet.name === "Lorong Demo Kopi")!;
    const item = menu.items.find((item) => item.name === "Kopi O")!;
    const turns: FakeTurn[] = [
      { kind: "tools", calls: [{ name: "search_outlets", args: { area: null, name: "Lorong Demo Kopi" } }] },
      { kind: "tools", calls: [{ name: "get_published_menu", args: { outletId: menu.outlet.id } }] },
      { kind: "answer", proposal: proposal({ kind: "basket", outletId: menu.outlet.id, lines: [{ itemId: item.id, quantity: 2 }] }) },
    ];
    const fake = createFakeOpenAI((index) => turns[index]!);
    const result = await suggestFromText(web.db, { kind: "buyer", userId: "FIXTURE-s32-wiring", isAnonymous: true }, { text: "我要在 Lorong Demo Kopi 买两杯黑咖啡（Kopi O）。" }, new Date(), createOpenAISuggestionModel({ apiKey: "FIXTURE-no-key", model: "gpt-6-sol", fetch: fake.fetch }));
    expect(result.kind).toBe("basket");
    if (result.kind !== "basket") throw new Error("FIXTURE box did not return its basket");
    expect(result.outlet.name).toBe("Lorong Demo Kopi");
    expect(result.lines.map(({ item, quantity }) => [item.name, item.unitMinor, quantity])).toEqual([["Kopi O", 160, 2]]);
    expect(fake.calls).toHaveLength(3);
  });
});
