// S32: real model calls on FIXTURE shops only. Outside the application build.
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s32-language-eval.mts check
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s32-language-eval.mts run initial
// A fix run requires a recorded "S32 prompt fix 1:" in 00-status.md. No run is overwritten.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getPublishedMenu, listPublishedOutlets, type PublishedMenu } from "@/domain/outlets/search";
import { suggestFromText, type SuggestionResult } from "@/domain/suggestions/suggest";
import { loadLocalEnvFile } from "@/env";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { envoiTools, TEST_NOTICE } from "@/integrations/mcp/contracts";
import { connectWeb } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import * as schema from "@/lib/db/schema";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../../../../tests/support/db";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const MODEL = "gpt-6-sol";
const CAP_USD = 1;
// Standard list prices verified from official model/caching docs 2026-11-05 [vendor claim].
const PRICES = { inputPerM: 2, cachedInputPerM: 0.2, cacheWritePerM: 2.5, longCacheWritePerM: 5, outputPerM: 10 };
const LOCAL_PREFIX = "postgres://postgres@127.0.0.1:5432/";
const BASE = "https://fixture.envoi.test";
// These literal FIXTURE credentials have no account or payment authority.
const FIXTURE_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
const FIXTURE_URL = `${BASE}/approve/fixturelinktokenfixturelinktokenfixturelinktokenab`;
const TEST_ITEMS = [
  ["Kopi C", 180, true], ["Mee siam", 550, false], ["Kaya toast set", 450, false],
  ["Iced lemon tea", 220, true], ["Iced milk tea", 250, true],
] as const;

const basketFields = { shop: z.string(), lines: z.array(z.tuple([z.string(), z.number()])) };
const expectedSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("basket"), ...basketFields }),
  z.object({ kind: z.literal("unavailable_item"), shop: z.string(), names: z.array(z.string()) }),
  z.object({ kind: z.literal("choose"), shop: z.string(), names: z.array(z.string()), quantity: z.number() }),
]);
const caseSchema = z.object({ id: z.string(), language: z.enum(["zh", "ja", "ko", "es", "ms"]), sentence: z.string(), expected: expectedSchema });
export type Expected = z.infer<typeof expectedSchema>;
export type Basket = z.infer<z.ZodObject<typeof basketFields>>;
export type Observation = { got: Expected | { kind: "failed" } | { kind: "reply"; text: string }; baskets: Basket[]; modelWrittenLinks: number };
const sorted = (values: readonly string[]) => JSON.stringify([...values].sort());
const linesKey = (basket: Basket) => sorted(basket.lines.map((line) => JSON.stringify(line)));
function sameBasket(left: Basket, right: Basket) {
  return left.shop === right.shop && linesKey(left) === linesKey(right);
}

// Structural scoring only. No row passes overall until its separate semantic review is recorded.
export function scoreOutcome(expected: Expected, observed: Observation) {
  const wrongLinks = observed.modelWrittenLinks + observed.baskets.filter((basket) => expected.kind !== "basket" || !sameBasket(expected, basket)).length;
  const got = observed.got;
  let matches = false;
  if (expected.kind === "basket" && got.kind === "basket") {
    matches = sameBasket(expected, got) && observed.baskets.length > 0;
  } else if (expected.kind !== "basket" && got.kind === "reply") {
    // The actual reply meaning, language, choices and unavailability require semantic review.
    matches = true;
  } else if (expected.kind === "choose" && got.kind === "choose") {
    matches = expected.shop === got.shop && sorted(expected.names) === sorted(got.names) && expected.quantity === got.quantity;
  } else if (expected.kind === "unavailable_item" && got.kind === "unavailable_item") {
    matches = expected.shop === got.shop && sorted(expected.names) === sorted(got.names);
  }
  return { structuralPass: matches && wrongLinks === 0, wrongLinks };
}

const usageSchema = z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative(), cache_write_tokens: z.number().int().nonnegative(), cache_write_tokens_details: z.object({ ttl_30m_tokens: z.number().int().nonnegative(), ttl_12h_tokens: z.number().int().nonnegative() }).optional() }) });
export function usageCost(input: number, cached: number, output: number, written = 0, longWritten = 0) {
  assert(written + cached <= input && longWritten <= written, "cache-write counts exceed input usage");
  return ((input - cached) * PRICES.inputPerM + cached * PRICES.cachedInputPerM + written * (PRICES.cacheWritePerM - PRICES.inputPerM) + longWritten * (PRICES.longCacheWritePerM - PRICES.cacheWritePerM) + output * PRICES.outputPerM) / 1e6;
}
export function canReserve(spent: number, reserved: number, next: number, cap: number) {
  return spent + reserved + next <= cap;
}

function casesAndRegistration() {
  const manifest = readFileSync(join(HERE, "s32-language-cases.json"), "utf8");
  const cases = z.array(caseSchema).length(25).parse(JSON.parse(manifest));
  const status = readFileSync(join(HERE, "../00-status.md"), "utf8");
  const section = status.split("#### S32 pre-registration\n")[1]?.split("#### S32 results and closure")[0];
  assert(section, "missing S32 pre-registration");
  assert(section.includes("at least 24 of 25 correct, zero wrong basket links"), "missing pre-registered threshold");
  const registered = section.split("\n").filter((line) => /^\| (zh|ja|ko|es|ms)[1-5] \|/.test(line));
  assert.equal(registered.length, 25, "exactly 25 sentences must be pre-registered");
  for (const [i, row] of cases.entries()) {
    assert.equal(registered[i], `| ${row.id} | ${row.language} | ${row.sentence} | \`${JSON.stringify(row.expected)}\` |`, "case differs from pre-registration");
  }
  assert.equal(new Set(cases.map((row) => row.id)).size, 25);
  return { cases, status, manifestSha256: createHash("sha256").update(manifest).digest("hex") };
}

const ledgerSchema = z.object({ spentUsd: z.number().nonnegative(), reservedUsd: z.number().nonnegative(), requests: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), cachedTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), cacheWriteTokens: z.number().int().nonnegative(), longCacheWriteTokens: z.number().int().nonnegative(), cacheUpperBoundTokens: z.number().int().nonnegative().default(0) });
export function createMeter(path = join(HERE, "s32-spend-ledger.json"), send: typeof fetch = globalThis.fetch, options: { allowReserved?: boolean } = {}) {
  const ledger = existsSync(path) ? ledgerSchema.parse(JSON.parse(readFileSync(path, "utf8"))) : { spentUsd: 0, reservedUsd: 0, requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, cacheWriteTokens: 0, longCacheWriteTokens: 0, cacheUpperBoundTokens: 0 };
  assert(options.allowReserved || ledger.reservedUsd === 0, "unresolved earlier model charge; reconcile before more calls");
  const flush = () => writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n");
  let stopped = false;
  let stopReason: string | null = null;
  const metered: typeof fetch = async (input, init) => {
    assert(!stopped, "evaluation already stopped");
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    assert.equal(url, "https://api.openai.com/v1/responses", "only the recorded model endpoint is authorized");
    const body = z.object({ model: z.literal(MODEL) }).passthrough().parse(JSON.parse(String(init?.body)));
    const boundedBody = JSON.stringify({ ...body, max_output_tokens: 2000, service_tier: "default" });
    // UTF-8 bytes upper-bound byte-level tokens; 2048 additional tokens reserve tool framing.
    const inputBound = Buffer.byteLength(boundedBody, "utf8") + 2048;
    const reserved = (inputBound * PRICES.longCacheWritePerM + 2000 * PRICES.outputPerM) / 1e6;
    if (!canReserve(ledger.spentUsd, ledger.reservedUsd, reserved, CAP_USD)) {
      stopped = true;
      stopReason = "spend_cap";
      throw new Error("S32 spend cap: request refused before forwarding");
    }
    ledger.reservedUsd += reserved;
    ledger.requests += 1;
    flush();
    let stage = "provider_send";
    try {
      const response = await send(input, { ...init, body: boundedBody });
      stage = "provider_status";
      assert(response.ok, "provider error with unresolved usage");
      stage = "usage_and_model_tier";
      const value: unknown = await response.clone().json();
      const { usage } = z.object({ model: z.literal(MODEL), service_tier: z.literal("default"), usage: usageSchema }).parse(value);
      stage = "cache_accounting";
      const details = usage.input_tokens_details;
      const upperBoundWrites = details.cache_write_tokens_details ? 0 : details.cache_write_tokens;
      const longWritten = details.cache_write_tokens_details?.ttl_12h_tokens ?? upperBoundWrites;
      const shortWritten = details.cache_write_tokens_details?.ttl_30m_tokens ?? 0;
      assert(shortWritten + longWritten === details.cache_write_tokens, "cache-write lifetime counts do not sum to writes");
      stage = "token_bounds";
      assert(usage.input_tokens <= inputBound && usage.output_tokens <= 2000, "provider exceeded reserved token bounds");
      ledger.inputTokens += usage.input_tokens;
      ledger.cachedTokens += usage.input_tokens_details.cached_tokens;
      ledger.cacheWriteTokens += details.cache_write_tokens;
      ledger.longCacheWriteTokens += longWritten - upperBoundWrites;
      ledger.cacheUpperBoundTokens += upperBoundWrites;
      ledger.outputTokens += usage.output_tokens;
      ledger.spentUsd += usageCost(usage.input_tokens, usage.input_tokens_details.cached_tokens, usage.output_tokens, details.cache_write_tokens, longWritten);
      ledger.reservedUsd -= reserved;
      if (Math.abs(ledger.reservedUsd) < 1e-9) ledger.reservedUsd = 0;
      flush();
      return response;
    } catch {
      stopped = true;
      stopReason = stage;
      throw new Error("S32 provider/usage failure; charge remains reserved, no retry authorized");
    }
  };
  return { fetch: metered, ledger, isStopped: () => stopped, stopReason: () => stopReason };
}

// Real MCP SDK client/server and shared tool schemas. Backend and links are FIXTURE simulations.
export function fixtureMcp(menus: PublishedMenu[]) {
  const baskets: Basket[] = [];
  const json = (value: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, `${BASE}/mcp`);
    assert.equal(request.headers.get("authorization"), `Bearer ${FIXTURE_TOKEN}`);
    const message = JSONRPCMessageSchema.parse(await request.json());
    const server = new McpServer({ name: "FIXTURE-S32", version: "1.0.0" });
    server.registerTool("search_outlets", envoiTools.search_outlets, async () => json({ notice: TEST_NOTICE, outlets: menus.map(({ outlet }) => ({ ...outlet, label: "Demo fixture shop, not a real merchant" })) }));
    server.registerTool("get_menu", envoiTools.get_menu, async ({ outletId }) => {
      const menu = menus.find(({ outlet }) => outlet.id === outletId);
      if (!menu) return { isError: true, content: [{ type: "text", text: "FIXTURE shop not found" }] };
      return json({ notice: TEST_NOTICE, outlet: { ...menu.outlet, label: "Demo fixture shop, not a real merchant" }, currency: menu.currency, items: menu.items.map((item) => ({ ...item, currency: menu.currency })) });
    });
    server.registerTool("create_purchase_request", envoiTools.create_purchase_request, async ({ outletId, lines }) => {
      const menu = menus.find(({ outlet }) => outlet.id === outletId);
      baskets.push({ shop: menu?.outlet.name ?? `unknown:${outletId}`, lines: lines.map((line): [string, number] => [menu?.items.find((item) => item.id === line.menuItemId)?.name ?? `unknown:${line.menuItemId}`, line.quantity]) });
      return json({ notice: TEST_NOTICE, url: FIXTURE_URL, expiresAt: "2030-01-01T00:00:00.000Z", forTheBuyer: "FIXTURE non-redeemable link; no payment." });
    });
    const [wire, service] = InMemoryTransport.createLinkedPair();
    await server.connect(service);
    try {
      const answer = new Promise<JSONRPCMessage>((resolve) => { wire.onmessage = resolve; });
      await wire.start();
      await wire.send(message);
      return "id" in message ? Response.json(await answer) : new Response(null, { status: 202 });
    } finally {
      await wire.close();
      await server.close();
    }
  };
  return { fetch, baskets };
}

function boxObservation(result: SuggestionResult): Observation {
  switch (result.kind) {
    case "basket": {
      const basket: Basket = { shop: result.outlet.name, lines: result.lines.map(({ item, quantity }) => [item.name, quantity]) };
      return { got: { kind: "basket", ...basket }, baskets: [basket], modelWrittenLinks: 0 };
    }
    case "choose": return { got: { kind: "choose", shop: result.outlet.name, names: result.matches.map((item) => item.name), quantity: result.quantity }, baskets: [], modelWrittenLinks: 0 };
    case "unavailable_item": return { got: { kind: "unavailable_item", shop: result.outlet.name, names: result.items.map((item) => item.name) }, baskets: [], modelWrittenLinks: 0 };
    default: return { got: { kind: "failed" }, baskets: [], modelWrittenLinks: 0 };
  }
}


export async function seedFixtureMenus(database: Awaited<ReturnType<typeof createTestDatabase>>, web: ReturnType<typeof connectWeb>) {
  await seedDemoFixture(drizzle(database.admin, { schema }));
  const outletId = newId("out");
  const revision = newId("mrv");
  await database.admin`insert into outlets (id, name, area, is_demo_fixture, fixture_key, created_at) values (${outletId}, 'Test Shop', 'Test Area', true, 's32-local-test-shop', now())`;
  await database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at, created_at) values (${revision}, ${outletId}, 'confirmed', now(), now())`;
  for (const [position, [name, cents, available]] of TEST_ITEMS.entries()) {
    const itemId = newId("itm");
    await database.admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_minor, available) values (${itemId}, ${itemId}, ${revision}, ${position}, ${name}, ${cents}, ${available})`;
  }
  await database.admin`update outlets set published_menu_revision_id = ${revision} where id = ${outletId}`;
  const menus: PublishedMenu[] = [];
  for (const outlet of await listPublishedOutlets(web.db)) {
    const menu = await getPublishedMenu(web.db, outlet.id);
    assert(menu && menu.outlet.isDemoFixture);
    menus.push(menu);
  }
  assert.equal(menus.length, 2);
  return menus;
}

async function main() {
  const { cases, status, manifestSha256 } = casesAndRegistration();
  const [command, run] = process.argv.slice(2);
  if (command === "check") {
    console.log(JSON.stringify({ label: "S32 offline registration check; no env load, DB or model call", cases: cases.length, model: MODEL, manifestSha256 }));
    return;
  }
  assert(command === "run" && (run === "initial" || run === "continue" || run === "fix"), "usage: s32-language-eval.mts check | run initial | run fix");
  if (run === "continue") assert(status.includes("S32 continuation authorization:"), "continuation requires the recorded explicit authorization");
  if (run === "fix") assert(status.includes("S32 prompt fix 1:"), "record the one prompt fix before its rerun");
  const outPath = join(HERE, `s32-language-eval-${run}.json`);
  assert(!existsSync(outPath), "run already exists; no overwriting or silent retries");
  if (run === "fix") assert(existsSync(join(HERE, "s32-language-eval-initial.json")), "initial run is required");

  loadLocalEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, "OPENAI_API_KEY is not configured");
  // Set after loadLocalEnvFile so its TEST_DATABASE_URL can never select an external database.
  const localDb = process.env.S32_LOCAL_DB ?? `${LOCAL_PREFIX}envoi_test`;
  assert(localDb.startsWith(LOCAL_PREFIX), "S32_LOCAL_DB must use the dedicated local disposable server");
  process.env.TEST_DATABASE_URL = localDb;
  const meter = createMeter(join(HERE, "s32-spend-ledger.json"), globalThis.fetch, { allowReserved: run === "continue" });
  const database = await createTestDatabase("s32eval");
  const web = connectWeb(database.webUrl, 2);
  const rows: Record<string, unknown>[] = [];
  if (run === "continue") {
    const previous = z.object({ model: z.literal(MODEL), manifestSha256: z.literal(manifestSha256), rows: z.array(caseSchema.extend({ path: z.enum(["assistant", "box"]) }).passthrough()) }).parse(JSON.parse(readFileSync(join(HERE, "s32-language-eval-initial.json"), "utf8")));
    assert(previous.rows.length > 0 && previous.rows.length < 50, "only an incomplete initial run can be continued");
    rows.push(...previous.rows);
  }
  const attempted = new Set(rows.map((row) => `${row.id}:${row.path}`));
  assert.equal(attempted.size, rows.length, "duplicate earlier attempt");
  const startedAt = new Date().toISOString();
  const snapshot = () => ({
    label: "FIXTURE shops; real OpenAI; box on local DB; assistant backend and links simulated; no payment or deployment",
    startedAt, updatedAt: new Date().toISOString(), model: MODEL, run, manifestSha256,
    promptSha256: createHash("sha256").update(readFileSync(join(ROOT, "src/integrations/assistant/agent.ts"))).digest("hex"),
    boxPromptSha256: createHash("sha256").update(readFileSync(join(ROOT, "src/integrations/ai/openai.ts"))).digest("hex"),
    prices: PRICES, approvedS32CapUsd: CAP_USD, totalS32Meter: { ...meter.ledger }, stopReason: meter.stopReason(),
    semanticReview: "pending; structuralPass is not an overall pass", costBoundary: "Usage-derived estimates; missing cache lifetime is priced at the highest rate. Earlier unresolved charge stays reserved. Actual invoice total is unknown.", continuedFrom: run === "continue" ? "s32-language-eval-initial.json" : null, rows,
  });
  const save = () => writeFileSync(outPath, JSON.stringify(snapshot(), null, 2) + "\n");
  save();
  try {
    const menus = await seedFixtureMenus(database, web);
    for (const entry of cases) {
      for (const path of ["assistant", "box"] as const) {
        if (meter.isStopped()) break;
        if (attempted.has(`${entry.id}:${path}`)) continue;
        const before = { ...meter.ledger };
        let observed: Observation;
        let reply = "";
        let diagnostic: unknown = null;
        if (path === "assistant") {
          const fixture = fixtureMcp(menus);
          const result = await runAssistantTurn({ baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: apiKey, model: MODEL, envoiFetch: fixture.fetch, openaiFetch: meter.fetch }, [{ role: "buyer", text: entry.sentence }]);
          diagnostic = { kind: result.kind, steps: result.steps, ...(result.kind === "stopped" ? { reason: result.reason } : {}) };
          reply = "text" in result ? result.text : "";
          const last = fixture.baskets.at(-1);
          const got: Observation["got"] = result.kind === "link" && result.link.url === FIXTURE_URL && last ? { kind: "basket", ...last } : result.kind === "reply" ? { kind: "reply", text: reply } : { kind: "failed" };
          observed = { got, baskets: fixture.baskets, modelWrittenLinks: (reply.match(/https?:\/\/[^\s]+|\/(?:approve|review|buy)\/[^\s]+/g) ?? []).length + (result.kind === "link" && result.link.url !== FIXTURE_URL ? 1 : 0) };
        } else {
          const result = await suggestFromText(web.db, { kind: "buyer", userId: "FIXTURE-s32-anonymous", isAnonymous: true }, { text: entry.sentence }, new Date(), createOpenAISuggestionModel({ apiKey, model: MODEL, fetch: meter.fetch }));
          diagnostic = result;
          observed = boxObservation(result);
        }
        const row = { ...entry, path, observed, reply, diagnostic, ...scoreOutcome(entry.expected, observed), semanticReview: "pending", usageRequests: meter.ledger.requests - before.requests, tokens: { input: meter.ledger.inputTokens - before.inputTokens, cached: meter.ledger.cachedTokens - before.cachedTokens, output: meter.ledger.outputTokens - before.outputTokens, cacheWrites: meter.ledger.cacheWriteTokens - before.cacheWriteTokens, longCacheWrites: meter.ledger.longCacheWriteTokens - before.longCacheWriteTokens, upperBoundCacheWrites: meter.ledger.cacheUpperBoundTokens - before.cacheUpperBoundTokens }, usd: meter.ledger.spentUsd - before.spentUsd, reservedUsd: meter.ledger.reservedUsd };
        rows.push(row);
        attempted.add(`${entry.id}:${path}`);
        save();
        console.log(JSON.stringify({ id: entry.id, path, structuralPass: row.structuralPass, wrongLinks: row.wrongLinks, usd: row.usd }));
      }
      if (meter.isStopped()) break;
    }
  } finally {
    save();
    await web.close();
    await database.drop();
  }
  console.log(JSON.stringify({ completedOutcomes: rows.length, overallPass: "pending semantic review", totalS32SpentUsd: meter.ledger.spentUsd, unresolvedReservedUsd: meter.ledger.reservedUsd }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("S32 stopped. Inspect the sanitized result/ledger and offline checks; no automatic retry.");
    process.exitCode = 1;
  });
}
