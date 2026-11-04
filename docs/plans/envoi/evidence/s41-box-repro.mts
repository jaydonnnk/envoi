// S41 box reproduction, 2026-11-04. Runs the one-sentence box's own placeholder sentence through the
// product's own suggestFromText and OpenAI adapter, anonymously, up to ten times, on a disposable
// local database with two labeled FIXTURE shops. It exists to reproduce the "What would you like to
// buy?" reply observed live on Render on 1 of 2 tries, and to capture the model proposal behind it.
//
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s41-box-repro.mts <spend-limit-usd> <model> [output-tag]
//
// It reads OPENAI_API_KEY from .env.local through the project's own loader and never prints it, nor
// any other environment value except the model name it was given. It refuses to create a database
// unless the URL is the local disposable server. It stops before a request whose worst-case cost
// could pass the stated spend limit.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { suggestFromText, type SuggestionResult } from "@/domain/suggestions/suggest";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import { loadLocalEnvFile } from "@/env";
import { connectWeb } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import * as schema from "@/lib/db/schema";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../../../../tests/support/db";

// The box's own placeholder sentence, byte-identical to src/app/buy/text-suggest.tsx.
const SENTENCE = "two kaya toast and kopi near Tanjong Pagar";
const MAX_TRIES = 10;

const LOCAL_DB_PREFIX = "postgres://postgres@127.0.0.1:5432/";

// Prices for gpt-6-sol, USD per million tokens, read from OpenAI's pricing page 2026-11-04 and
// already recorded in ask-rerun-2026-11-04.mts [vendor claim, not re-verified here].
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-6-sol": { input: 2, cached: 0.2, output: 10 },
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
};

// The worst case of one model request: 8,000 input and 2,000 output tokens, S20's per-step bound.
const WORST_STEP_TOKENS = { input: 8_000, output: 2_000 };
// A suggestion makes at most five model requests: three tool steps, a refused fourth and the answer.
const WORST_REQUESTS = 5;

// The same evaluation-only FIXTURE shop box-rerun-2026-11-04.mts seeded, which is the live Test Shop
// the user described on 2026-10-26 plus the two iced teas of the approved mockup.
const EVAL_SHOP = {
  key: "s41-repro-test-shop",
  name: "Test Shop",
  area: "Test Area",
  items: [
    ["Kopi C", 180, true],
    ["Mee siam", 550, false],
    ["Kaya toast set", 450, false],
    ["Iced lemon tea", 220, true],
    ["Iced milk tea", 250, true],
  ],
} as const;

type Usage = { input: number; cached: number; output: number };

const cost = (usage: Usage, price: { input: number; cached: number; output: number }) =>
  ((usage.input - usage.cached) * price.input + usage.cached * price.cached + usage.output * price.output) / 1_000_000;

function describe(result: SuggestionResult) {
  switch (result.kind) {
    case "basket":
      return { kind: "basket", outlet: result.outlet.name, lines: result.lines.map((line) => [line.item.name, line.quantity]) };
    case "choose":
      return { kind: "choose", outlet: result.outlet.name, quantity: result.quantity, names: result.matches.map((item) => item.name) };
    case "unavailable_item":
      return { kind: "unavailable_item", outlet: result.outlet.name, names: result.items.map((item) => item.name) };
    case "items":
      return { kind: "items", outlet: result.outlet.name, items: result.matches.map((item) => item.name) };
    case "outlets":
      return { kind: "outlets", outlets: result.matches.map((outlet) => outlet.name) };
    case "clarification":
      return { kind: "clarification", missing: result.missing, question: result.question };
    default:
      return { kind: result.kind };
  }
}

// The failure the buyer sees: text-suggest.tsx renders "Tell me a little more" plus the server's
// question whenever the answer is a clarification that does not ask for an area.
function isReproducedFailure(result: SuggestionResult): boolean {
  return result.kind === "clarification" && result.missing.includes("item") && !result.missing.includes("area");
}

// Walks a Responses API body and keeps every string that parses to an object carrying a proposal
// "kind", so the diagnosis reads the model's own answer and not only Envoi's settled suggestion.
function proposalsIn(body: unknown): unknown[] {
  const kinds = new Set(["outlets", "items", "basket", "choose", "clarification", "no_match"]);
  const found: unknown[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      const text = node.trim();
      if (!text.startsWith("{")) return;
      try {
        const parsed = JSON.parse(text) as { kind?: unknown };
        if (parsed && typeof parsed === "object" && kinds.has(String(parsed.kind))) found.push(parsed);
      } catch {
        // Not JSON; nothing to keep.
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (node && typeof node === "object") for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(body);
  return found;
}

async function main() {
  const [limitArg, model, tag = ""] = process.argv.slice(2);
  const limit = Number(limitArg);
  if (!Number.isFinite(limit) || limit <= 0 || !model) throw new Error("usage: s41-box-repro.mts <spend-limit-usd> <model>");
  const price = PRICES[model];
  if (!price) throw new Error(`no recorded price for ${model}`);

  loadLocalEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  // Set after the load so the disposable database is local whatever .env.local holds.
  const localDb = process.env.S41_LOCAL_DB ?? `${LOCAL_DB_PREFIX}envoi_test`;
  if (!localDb.startsWith(LOCAL_DB_PREFIX)) throw new Error("S41_LOCAL_DB must point at the local disposable server");
  process.env.TEST_DATABASE_URL = localDb;

  const worst = cost({ input: WORST_STEP_TOKENS.input * WORST_REQUESTS, cached: 0, output: WORST_STEP_TOKENS.output * WORST_REQUESTS }, price);
  const database = await createTestDatabase("s41repro");
  const web = connectWeb(database.webUrl, 2);
  const rows: Record<string, unknown>[] = [];
  let spent = 0;
  let reproducedOnTry: number | null = null;
  try {
    const admin = drizzle(database.admin, { schema });
    await seedDemoFixture(admin);
    const outletId = newId("out");
    const revision = newId("mrv");
    await database.admin`insert into outlets (id, name, area, is_demo_fixture, fixture_key, created_at) values (${outletId}, ${EVAL_SHOP.name}, ${EVAL_SHOP.area}, true, ${EVAL_SHOP.key}, now())`;
    await database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at, created_at) values (${revision}, ${outletId}, 'confirmed', now(), now())`;
    for (const [position, [name, cents, available]] of EVAL_SHOP.items.entries()) {
      const itemId = newId("itm");
      await database.admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_minor, available) values (${itemId}, ${itemId}, ${revision}, ${position}, ${name}, ${cents}, ${available})`;
    }
    await database.admin`update outlets set published_menu_revision_id = ${revision} where id = ${outletId}`;

    for (let attempt = 1; attempt <= MAX_TRIES; attempt += 1) {
      if (spent + worst > limit) {
        rows.push({ attempt, skipped: "spend limit" });
        continue;
      }
      let usage: Usage = { input: 0, cached: 0, output: 0 };
      const proposals: unknown[] = [];
      // Meters token usage and keeps the model's own proposal at the fetch boundary. The request
      // body is untouched, so this is the product's real call.
      const metered: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        const body = (await response.clone().json().catch(() => null)) as
          | { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } }
          | null;
        usage = {
          input: usage.input + (body?.usage?.input_tokens ?? 0),
          cached: usage.cached + (body?.usage?.input_tokens_details?.cached_tokens ?? 0),
          output: usage.output + (body?.usage?.output_tokens ?? 0),
        };
        proposals.push(...proposalsIn(body));
        return response;
      };
      const startedAt = new Date();
      const result = await suggestFromText(
        web.db,
        { kind: "buyer", userId: "FIXTURE-s41-anonymous", isAnonymous: true },
        { text: SENTENCE },
        startedAt,
        createOpenAISuggestionModel({ apiKey, model, fetch: metered }),
      );
      const ms = Date.now() - startedAt.getTime();
      const usd = cost(usage, price);
      spent += usd;
      const failed = isReproducedFailure(result);
      if (failed && reproducedOnTry === null) reproducedOnTry = attempt;
      const row = { attempt, ms, usd: Number(usd.toFixed(6)), usage, reproduced: failed, got: describe(result), proposals };
      rows.push(row);
      console.log(JSON.stringify({ attempt, ms, reproduced: failed, got: describe(result), proposals }));
    }
  } finally {
    await web.close();
    await database.drop();
  }

  const completed = rows.filter((row) => !("skipped" in row)).length;
  const failures = rows.filter((row) => row.reproduced === true).length;
  const here = dirname(fileURLToPath(import.meta.url));
  // Self-labeling: the record says which half of the S41 fix was in the source when it ran, so the
  // before-fix and after-fix files cannot be confused.
  const promptSource = readFileSync(join(here, "..", "..", "..", "..", "src", "integrations", "ai", "openai.ts"), "utf8");
  const out = {
    label: "FIXTURE shops and one FIXTURE sentence; real OpenAI calls; anonymous buyer principal",
    ranAt: new Date().toISOString(),
    sentence: SENTENCE,
    model,
    promptCarriesPartialQuantityRule: promptSource.includes("named items but left out how many of at least one of them"),
    spendLimitUsd: limit,
    spentUsd: Number(spent.toFixed(6)),
    worstCasePerTryUsd: Number(worst.toFixed(6)),
    tries: MAX_TRIES,
    completed,
    failures,
    reproducedOnTry,
    shops: ["Lorong Demo Kopi (Tanjong Pagar)", "Test Shop (Test Area)"],
    rows,
  };
  writeFileSync(join(here, `s41-box-repro${tag}.json`), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`reproduced ${failures} of ${completed} completed tries; first on try ${reproducedOnTry ?? "none"}`);
  console.log("spent (estimated from usage and list prices)", out.spentUsd, "of", limit);
}

await main();
