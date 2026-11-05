// S33 Chinese follow-up: the five original zh sentences on both paths, on FIXTURE shops. Outside the application build.
// It is separate from S32, whose scores stay as recorded. No outletId, added location or rewritten sentence is used.
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s33-chinese-followup.mts check
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s33-chinese-followup.mts run
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s33-chinese-followup.mts verdict
// A stopped run is recorded and never restarted: an existing result or ledger refuses a new run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PublishedMenu } from "@/domain/outlets/search";
import { suggestFromText, type SuggestionResult } from "@/domain/suggestions/suggest";
import { loadLocalEnvFile } from "@/env";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase } from "../../../../tests/support/db";
import { canReserve, createMeter, fixtureMcp, scoreOutcome, seedFixtureMenus, type Basket, type Expected, type Observation } from "./s32-language-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULT = join(HERE, "s33-chinese-followup.json");
const LEDGER = join(HERE, "s33-chinese-spend-ledger.json");
const REVIEW = join(HERE, "s33-chinese-semantic-review.json");
export const MODEL = "gpt-6-sol";
// Inside the user's US$1 for S33; the rest stays for the turns on Render.
export const CAP_USD = 0.75;
// Upper bound on one request's reservation in the S32 meter, at the highest cache-write rate.
export const REQUEST_BOUND_USD = 0.15;
const BASE = "https://fixture.envoi.test";
const FIXTURE_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
const FIXTURE_URL = `${BASE}/approve/fixturelinktokenfixturelinktokenfixturelinktokenab`;
export const PATHS = ["assistant", "box"] as const;
export type Path = (typeof PATHS)[number];
export type Case = { id: string; language: string; sentence: string; expected: Expected };
export type Row = { id: string; path: Path; structuralPass: boolean; wrongLinks: number; semantic?: "pass" | "fail" };
type Ledger = { spentUsd: number; reservedUsd: number };

export function chineseCases(manifest = readFileSync(join(HERE, "s32-language-cases.json"), "utf8")): Case[] {
  const cases = (JSON.parse(manifest) as Case[]).filter((row) => row.language === "zh");
  assert.deepEqual(cases.map((row) => row.id), ["zh1", "zh2", "zh3", "zh4", "zh5"], "the five original Chinese cases");
  return cases;
}

// The status file must hold each case, unchanged, in the follow-up's own pre-registration.
export function assertRegistered(status: string, cases: readonly Case[]): void {
  const section = status.split("#### S33 Chinese follow-up pre-registration\n")[1]?.split("\n#### ")[0]?.split("\n### ")[0];
  assert(section, "missing S33 Chinese follow-up pre-registration");
  assert(section.includes("5/5 on each path with zero wrong links"), "missing pre-registered threshold");
  for (const row of cases) assert(section.includes(`| ${row.id} | ${row.language} | ${row.sentence} | \`${JSON.stringify(row.expected)}\` |`), `${row.id} differs from pre-registration`);
}

// Refuses before the S32 meter when this follow-up's own cap could be passed.
export function cappedFetch(meterFetch: typeof fetch, ledger: Ledger): typeof fetch {
  return (input, init) => {
    if (!canReserve(ledger.spentUsd, ledger.reservedUsd, REQUEST_BOUND_USD, CAP_USD)) throw new Error("S33 spend cap: request refused before forwarding");
    return meterFetch(input, init);
  };
}

// 5/5 on each path, every outcome reviewed, zero wrong links. A missing outcome is never a pass.
export function verdict(cases: readonly Case[], rows: readonly Row[]) {
  const passed = (path: Path) => cases.filter(({ id }) => rows.some((row) => row.id === id && row.path === path && row.structuralPass && row.semantic === "pass")).length;
  const wrongLinks = rows.reduce((sum, row) => sum + row.wrongLinks, 0);
  const assistant = passed("assistant");
  const box = passed("box");
  return { assistant, box, wrongLinks, complete: rows.length === cases.length * PATHS.length, eligible: assistant === cases.length && box === cases.length && wrongLinks === 0 };
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

type RunDeps = { cases: readonly Case[]; menus: PublishedMenu[]; web: ReturnType<typeof connectWeb>; apiKey: string; openaiFetch: typeof fetch; isStopped: () => boolean; onRow: (row: Row & Record<string, unknown>) => void };

// Each case once on each path. The assistant call passes no shop, as in S32.
export async function runOutcomes({ cases, menus, web, apiKey, openaiFetch, isStopped, onRow }: RunDeps): Promise<void> {
  for (const entry of cases) {
    for (const path of PATHS) {
      if (isStopped()) return;
      let observed: Observation;
      let reply = "";
      let diagnostic: unknown;
      if (path === "assistant") {
        const fixture = fixtureMcp(menus);
        const result = await runAssistantTurn({ baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: apiKey, model: MODEL, envoiFetch: fixture.fetch, openaiFetch }, [{ role: "buyer", text: entry.sentence }]);
        diagnostic = { kind: result.kind, steps: result.steps };
        reply = "text" in result ? result.text : "";
        const last = fixture.baskets.at(-1);
        const got: Observation["got"] = result.kind === "link" && result.link.url === FIXTURE_URL && last ? { kind: "basket", ...last } : result.kind === "reply" ? { kind: "reply", text: reply } : { kind: "failed" };
        observed = { got, baskets: fixture.baskets, modelWrittenLinks: (reply.match(/https?:\/\/[^\s]+|\/(?:approve|review|buy)\/[^\s]+/g) ?? []).length + (result.kind === "link" && result.link.url !== FIXTURE_URL ? 1 : 0) };
      } else {
        const result = await suggestFromText(web.db, { kind: "buyer", userId: "FIXTURE-s33-anonymous", isAnonymous: true }, { text: entry.sentence }, new Date(), createOpenAISuggestionModel({ apiKey, model: MODEL, fetch: openaiFetch }));
        diagnostic = result;
        observed = boxObservation(result);
      }
      onRow({ ...entry, path, observed, reply, diagnostic, ...scoreOutcome(entry.expected, observed) });
    }
  }
}

async function main() {
  const cases = chineseCases();
  const status = readFileSync(join(HERE, "../00-status.md"), "utf8");
  assertRegistered(status, cases);
  const [command] = process.argv.slice(2);
  if (command === "check") {
    console.log(JSON.stringify({ label: "S33 offline registration check; no env load, DB or model call", cases: cases.length, model: MODEL, capUsd: CAP_USD }));
    return;
  }
  if (command === "verdict") {
    const rows = (JSON.parse(readFileSync(RESULT, "utf8")) as { rows: Row[] }).rows;
    const reviewed = JSON.parse(readFileSync(REVIEW, "utf8")) as { rows: { id: string; path: Path; semantic: "pass" | "fail" }[] };
    console.log(JSON.stringify(verdict(cases, rows.map((row) => ({ ...row, semantic: reviewed.rows.find((r) => r.id === row.id && r.path === row.path)?.semantic })))));
    return;
  }
  assert(command === "run", "usage: s33-chinese-followup.mts check | run | verdict");
  assert(!existsSync(RESULT) && !existsSync(LEDGER), "a run or ledger exists; a stopped follow-up is not silently restarted");
  loadLocalEnvFile(process.env.S33_ENV_FILE ?? ".env.local");
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, "OPENAI_API_KEY is not configured");
  // Set after the env file so it can never select an external database.
  process.env.TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/postgres";
  const meter = createMeter(LEDGER);
  const database = await createTestDatabase("s33zh");
  const web = connectWeb(database.webUrl, 2);
  const rows: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  const save = () =>
    writeFileSync(RESULT, JSON.stringify({
      label: "FIXTURE shops; real OpenAI; box on local DB; assistant backend and links simulated; no payment or deployment; separate from S32",
      startedAt, updatedAt: new Date().toISOString(), model: MODEL, capUsd: CAP_USD,
      manifestSha256: createHash("sha256").update(readFileSync(join(HERE, "s32-language-cases.json"))).digest("hex"),
      meter: { ...meter.ledger }, stopReason: meter.stopReason(),
      costBoundary: "Usage-derived estimates; missing cache lifetime is priced at the highest rate; an unresolved charge stays reserved. Actual invoice total is unknown.",
      semanticReview: "pending; structuralPass is not an overall pass", rows,
    }, null, 2) + "\n");
  save();
  try {
    const menus = await seedFixtureMenus(database, web);
    await runOutcomes({ cases, menus, web, apiKey, openaiFetch: cappedFetch(meter.fetch, meter.ledger), isStopped: meter.isStopped, onRow: (row) => { rows.push(row); save(); console.log(JSON.stringify({ id: row.id, path: row.path, structuralPass: row.structuralPass, wrongLinks: row.wrongLinks })); } });
  } finally {
    save();
    await web.close();
    await database.drop();
  }
  console.log(JSON.stringify({ completedOutcomes: rows.length, overallPass: "pending semantic review", spentUsd: meter.ledger.spentUsd, reservedUsd: meter.ledger.reservedUsd, stopReason: meter.stopReason() }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("S33 follow-up stopped. Inspect the sanitized result and ledger; no automatic retry.");
    process.exitCode = 1;
  });
}
