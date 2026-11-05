import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMeter, seedFixtureMenus } from "../../docs/plans/envoi/evidence/s32-language-eval.mjs";
import { cappedFetch, chineseCases, MODEL, runOutcomes, verdict, type Row } from "../../docs/plans/envoi/evidence/s33-chinese-followup.mjs";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase } from "../support/db";
import { createFakeOpenAI, proposal, type FakeTurn } from "../support/fake-openai";

// FIXTURE local PostgreSQL, the real follow-up wiring and meter, and a fake OpenAI at fetch. No real model.
describe("S33 FIXTURE Chinese follow-up wiring", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let web: ReturnType<typeof connectWeb>;
  let menus: Awaited<ReturnType<typeof seedFixtureMenus>>;
  const dir = mkdtempSync(join(tmpdir(), "s33-FIXTURE-"));
  const [zh1] = chineseCases();

  beforeAll(async () => {
    database = await createTestDatabase("s33wiring");
    web = connectWeb(database.webUrl, 2);
    menus = await seedFixtureMenus(database, web);
  });
  afterAll(async () => {
    await web?.close();
    await database?.drop();
    rmSync(dir, { recursive: true, force: true });
  });

  // Gives the fake's answer the model, tier and usage the meter requires.
  const providerWith = (script: (index: number) => FakeTurn, usage: () => unknown): typeof fetch => {
    const fake = createFakeOpenAI(script);
    return async (input, init) => {
      const answer = (await (await fake.fetch(input, init)).json()) as Record<string, unknown>;
      return Response.json({ ...answer, model: MODEL, service_tier: "default", usage: usage() });
    };
  };
  const zh1Script = (): ((index: number) => FakeTurn) => {
    const menu = menus.find(({ outlet }) => outlet.name === "Lorong Demo Kopi")!;
    const item = menu.items.find(({ name }) => name === "Kopi O")!;
    const turns: FakeTurn[] = [
      { kind: "tools", calls: [{ name: "list_shops", args: {} }] },
      { kind: "tools", calls: [{ name: "read_menu", args: { outletId: menu.outlet.id } }] },
      { kind: "tools", calls: [{ name: "propose_basket", args: { outletId: menu.outlet.id, lines: [{ menuItemId: item.id, quantity: 2 }] } }] },
      { kind: "text", text: "FIXTURE：请确认两杯 Kopi O。" },
      { kind: "tools", calls: [{ name: "search_outlets", args: { area: null, name: "Lorong Demo Kopi" } }] },
      { kind: "tools", calls: [{ name: "get_published_menu", args: { outletId: menu.outlet.id } }] },
      { kind: "answer", proposal: proposal({ kind: "basket", outletId: menu.outlet.id, lines: [{ itemId: item.id, quantity: 2 }] }) },
    ];
    return (index) => turns[index]!;
  };
  const run = async (meter: ReturnType<typeof createMeter>) => {
    const rows: Row[] = [];
    await runOutcomes({ cases: [zh1!], menus, web, apiKey: "FIXTURE-no-key", openaiFetch: cappedFetch(meter.fetch, meter.ledger), isStopped: meter.isStopped, onRow: (row) => rows.push(row) });
    return rows;
  };

  it("runs both paths and prices a missing cache-write lifetime at the highest rate", async () => {
    const usage = () => ({ input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 500 } });
    const meter = createMeter(join(dir, "lifetime.json"), providerWith(zh1Script(), usage));
    const rows = await run(meter);
    expect(rows.map((row) => [row.path, row.structuralPass, row.wrongLinks])).toEqual([["assistant", true, 0], ["box", true, 0]]);
    expect(meter.isStopped()).toBe(false);
    expect(meter.ledger.cacheUpperBoundTokens).toBe(500 * meter.ledger.requests);
    expect(meter.ledger.spentUsd).toBeGreaterThan(0);
    expect(meter.ledger.reservedUsd).toBe(0);
  });

  it("stops on missing usage, keeps the charge reserved and counts nothing unattempted as a pass", async () => {
    const path = join(dir, "missing.json");
    const meter = createMeter(path, providerWith(zh1Script(), () => undefined));
    const rows = await run(meter);
    // The first request's usage is missing: the assistant fails, and the box is never attempted.
    expect(rows.map((row) => [row.path, row.structuralPass])).toEqual([["assistant", false]]);
    expect(meter.isStopped()).toBe(true);
    expect(meter.ledger.requests).toBe(1);
    expect(meter.ledger.reservedUsd).toBeGreaterThan(0);
    expect(verdict(chineseCases(), rows).eligible).toBe(false);
    // A restart against that ledger is refused.
    expect(() => createMeter(path, providerWith(zh1Script(), () => undefined))).toThrow("unresolved earlier model charge");
  });

  it("stops on a provider interruption without a retry", async () => {
    const script = zh1Script();
    let sent = 0;
    const provider: typeof fetch = async (...args) => {
      sent += 1;
      if (sent === 2) throw new TypeError("FIXTURE connection dropped");
      return providerWith(script, () => ({ input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }))(...args);
    };
    const meter = createMeter(join(dir, "dropped.json"), provider);
    const rows = await run(meter);
    expect(sent).toBe(2);
    expect(rows.map((row) => row.structuralPass)).toEqual([false]);
    expect(meter.isStopped()).toBe(true);
    expect(meter.ledger.reservedUsd).toBeGreaterThan(0);
  });
});
