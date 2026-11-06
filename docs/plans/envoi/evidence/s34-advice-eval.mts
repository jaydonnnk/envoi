// S34: real model calls on FIXTURE shops only. Outside the application build.
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-advice-eval.mts check
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-advice-eval.mts run advice
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-advice-eval.mts run lang
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-advice-eval.mts verdict
// A fix run requires a recorded "S34 prompt fix 1:" in 00-status.md. No run is overwritten.
// The assistant path only: S34 changes no box file, so the box is never called and no box score changes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { getPublishedMenu, listPublishedOutlets, type PublishedMenu } from "@/domain/outlets/search";
import { loadLocalEnvFile } from "@/env";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { connectWeb } from "@/lib/db/web";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../../../../tests/support/db";
import { canReserve, createMeter, fixtureMcp, scoreOutcome, seedFixtureMenus, type Basket, type Expected, type Observation } from "./s32-language-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const STATUS = join(HERE, "../00-status.md");
const LEDGER = join(HERE, "s34-spend-ledger.json");
const REVIEW = join(HERE, "s34-semantic-review.json");
export const MODEL = "gpt-6-sol";
// The user's standalone S34 allowance, 2026-11-06. Its own ledger, not a remainder of any earlier cap.
export const CAP_USD = 2;
// Upper bound on one request's reservation in the S32 meter, at the highest cache-write rate. An
// advice turn carries the longer S34 instructions and, for ad8, a two-turn history.
export const REQUEST_BOUND_USD = 0.2;
const BASE = "https://fixture.envoi.test";
// These literal FIXTURE credentials have no account or payment authority.
const FIXTURE_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
const FIXTURE_URL = `${BASE}/approve/fixturelinktokenfixturelinktokenfixturelinktokenab`;
// The 25 existing sentences, frozen by S32. Reusing that file under its recorded hash is what makes
// "the existing 24 of 25 still holds" a like-for-like comparison rather than a new set.
const S32_MANIFEST = join(HERE, "s32-language-cases.json");
const S32_MANIFEST_SHA256 = "bde23b3a0bdcaff9627d82fc3d258e9300cb1da1fdb56b7ee863fcee21a70211";
const LINK_PATTERN = /https?:\/\/[^\s]+|\/(?:approve|review|buy)\/[^\s]+/g;

type AdviceExpected = { kind: "advice" | "advice_none" | "advice_accept"; baskets: number; dietaryAsked?: string; popularityAsked?: boolean };
type AdviceCase = { id: string; shop: string; turns: string[]; budgetMinor: number; expected: AdviceExpected };
type LangCase = { id: string; language: string; sentence: string; expected: Expected };
type AdviceResultRow = { id: string; expected: AdviceExpected; basketsCreated: number; offMenu: string[]; overBudget: number; modelWrittenLinks: number; structuralPass: boolean; semantic?: "pass" | "fail" };
type LangResultRow = { id: string; structuralPass: boolean; wrongLinks: number; semantic?: "pass" | "fail" };
type Review = { rows: { id: string; semantic: "pass" | "fail"; notes: string }[] };

// Refuses before the S32 meter when S34's own cap could be passed.
export function cappedFetch(meterFetch: typeof fetch, ledger: { spentUsd: number; reservedUsd: number }): typeof fetch {
  return (input, init) => {
    if (!canReserve(ledger.spentUsd, ledger.reservedUsd, REQUEST_BOUND_USD, CAP_USD)) throw new Error("S34 spend cap: request refused before forwarding");
    return meterFetch(input, init);
  };
}

// Prices a created basket from the fixture menus alone. An item that is not on that shop's published
// menu, or is published but unavailable, is off the menu. A price Envoi does not hold is unpriceable,
// so the basket can never be shown to be within budget.
export function priceBasket(menus: readonly PublishedMenu[], basket: Basket) {
  const menu = menus.find((candidate) => candidate.outlet.name === basket.shop);
  if (!menu) return { sum: null, offMenu: [`shop:${basket.shop}`], unpriceable: true };
  const offMenu: string[] = [];
  let sum = 0;
  let unpriceable = false;
  for (const [name, quantity] of basket.lines) {
    const item = menu.items.find((candidate) => candidate.name === name);
    if (!item) {
      offMenu.push(name);
      continue;
    }
    if (item.available === false) offMenu.push(`${name}:unavailable`);
    if (item.unitMinor === null) {
      unpriceable = true;
      continue;
    }
    sum += item.unitMinor * quantity;
  }
  return { sum: unpriceable ? null : sum, offMenu, unpriceable };
}

export function scoreAdvice(entry: AdviceCase, menus: readonly PublishedMenu[], baskets: readonly Basket[], modelWrittenLinks: number) {
  const offMenu: string[] = [];
  let overBudget = 0;
  let unpriceable = 0;
  let pricedAt: number | null = null;
  for (const basket of baskets) {
    const priced = priceBasket(menus, basket);
    offMenu.push(...priced.offMenu);
    if (priced.sum === null) unpriceable += 1;
    else {
      pricedAt = priced.sum;
      if (priced.sum > entry.budgetMinor) overBudget += 1;
    }
  }
  const structuralPass = baskets.length === entry.expected.baskets && offMenu.length === 0 && overBudget === 0 && unpriceable === 0 && modelWrittenLinks === 0;
  return { basketsCreated: baskets.length, offMenu, overBudget, unpriceable, pricedAt, modelWrittenLinks, structuralPass };
}

// The status file must hold each advice case, unchanged, in S34's own pre-registration.
export function assertAdviceRegistered(status: string, cases: readonly AdviceCase[]): void {
  const section = status.split("#### S34 pre-registration\n")[1]?.split("\n### ")[0];
  assert(section, "missing S34 pre-registration");
  assert(section.includes("**10 of 10**"), "missing pre-registered advice threshold");
  assert(section.includes("0 items off the menu, 0 over budget and 0 dietary assurances"), "missing pre-registered advice zeros");
  assert(section.includes("at least 24 of 25 correct with 0 wrong basket links"), "missing pre-registered language threshold");
  for (const row of cases) {
    assert(
      section.includes(`| ${row.id} | ${row.shop} | ${row.turns.join(" / ")} | ${row.budgetMinor} | \`${JSON.stringify(row.expected)}\` |`),
      `${row.id} differs from pre-registration`,
    );
  }
}

export function adviceCases(): AdviceCase[] {
  const cases = JSON.parse(readFileSync(join(HERE, "s34-advice-cases.json"), "utf8")) as AdviceCase[];
  assert.equal(cases.length, 10, "exactly ten advice cases");
  assert.equal(new Set(cases.map((row) => row.id)).size, 10);
  assertAdviceRegistered(readFileSync(STATUS, "utf8"), cases);
  return cases;
}

export function langCases(): LangCase[] {
  const manifest = readFileSync(S32_MANIFEST, "utf8");
  assert.equal(createHash("sha256").update(manifest).digest("hex"), S32_MANIFEST_SHA256, "the frozen S32 sentences changed");
  const cases = JSON.parse(manifest) as LangCase[];
  assert.equal(cases.length, 25, "exactly 25 frozen sentences");
  return cases;
}

type AdviceFixtureShop = { name: string; area: string; country: "SG" | "US"; fixtureKey: string; items: [string, number, boolean][] };

// The advice phase's three shops. The language phase keeps S32's exact two, seeded by S32's own
// function, so the added USD shop cannot change a language outcome.
const ADVICE_SHOPS: AdviceFixtureShop[] = [
  {
    name: "Test Shop",
    area: "Test Area",
    country: "SG",
    fixtureKey: "s34-local-test-shop",
    items: [["Kopi C", 180, true], ["Mee siam", 550, false], ["Kaya toast set", 450, false], ["Iced lemon tea", 220, true], ["Iced milk tea", 250, true]],
  },
  {
    name: "Larkspur Street Taqueria",
    area: "Larkspur Street, San Francisco",
    country: "US",
    fixtureKey: "s34-local-larkspur",
    items: [["Chicken burrito", 1150, true], ["Two beef tacos", 900, true], ["Chips and guacamole", 650, true], ["Horchata", 375, true]],
  },
];

export async function seedAdviceMenus(database: Awaited<ReturnType<typeof createTestDatabase>>, web: ReturnType<typeof connectWeb>): Promise<PublishedMenu[]> {
  await seedDemoFixture(drizzle(database.admin, { schema }));
  for (const shop of ADVICE_SHOPS) {
    const outletId = newId("out");
    const revision = newId("mrv");
    await database.admin`insert into outlets (id, name, area, country, is_demo_fixture, fixture_key, created_at) values (${outletId}, ${shop.name}, ${shop.area}, ${shop.country}, true, ${shop.fixtureKey}, now())`;
    await database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at, created_at) values (${revision}, ${outletId}, 'confirmed', now(), now())`;
    for (const [position, [name, cents, available]] of shop.items.entries()) {
      const itemId = newId("itm");
      await database.admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_minor, available) values (${itemId}, ${itemId}, ${revision}, ${position}, ${name}, ${cents}, ${available})`;
    }
    await database.admin`update outlets set published_menu_revision_id = ${revision} where id = ${outletId}`;
  }
  const menus: PublishedMenu[] = [];
  for (const outlet of await listPublishedOutlets(web.db)) {
    const menu = await getPublishedMenu(web.db, outlet.id);
    assert(menu && menu.outlet.isDemoFixture, "a published fixture shop has no readable menu");
    menus.push(menu);
  }
  assert.equal(menus.length, 3, "the advice phase runs on exactly three fixture shops");
  for (const name of ["Lorong Demo Kopi", "Test Shop", "Larkspur Street Taqueria"]) {
    assert(menus.some((menu) => menu.outlet.name === name), `missing fixture shop ${name}`);
  }
  return menus;
}

type RunDeps = { apiKey: string; openaiFetch: typeof fetch; onRow: (row: Record<string, unknown>) => void };

// One advice case, shop-scoped, over its own turns. Each turn is a separate assistant call carrying
// the earlier replies as text, exactly as the browser's Ask Envoi page does, so ad8's acceptance is a
// second turn and not a continuation inside one call.
async function runAdviceCase(entry: AdviceCase, menus: PublishedMenu[], { apiKey, openaiFetch, onRow }: RunDeps): Promise<void> {
  const fixture = fixtureMcp(menus);
  const shopMenu = menus.find((menu) => menu.outlet.name === entry.shop);
  assert(shopMenu, `no fixture menu for ${entry.shop}`);
  const shop = { id: shopMenu.outlet.id, name: shopMenu.outlet.name };
  const history: { role: "buyer" | "assistant"; text: string }[] = [];
  const replies: string[] = [];
  const diagnostics: unknown[] = [];
  let inventedLink = false;
  for (const text of entry.turns) {
    history.push({ role: "buyer", text });
    const result = await runAssistantTurn(
      { baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: apiKey, model: MODEL, envoiFetch: fixture.fetch, openaiFetch },
      history.slice(-8),
      shop,
    );
    diagnostics.push({ turn: text, kind: result.kind, steps: result.steps, ...(result.kind === "stopped" ? { reason: result.reason } : {}) });
    const reply = "text" in result ? result.text : "";
    replies.push(reply);
    history.push({ role: "assistant", text: reply });
    if (result.kind === "link" && result.link.url !== FIXTURE_URL) inventedLink = true;
  }
  const modelWrittenLinks = replies.reduce((sum, reply) => sum + (reply.match(LINK_PATTERN) ?? []).length, 0) + (inventedLink ? 1 : 0);
  onRow({ ...entry, replies, baskets: fixture.baskets, ...scoreAdvice(entry, menus, fixture.baskets, modelWrittenLinks), semanticReview: "pending", diagnostics });
}

// The 25 frozen sentences, unscoped and on the assistant path only, scored by S32's own scorer.
async function runLangCase(entry: LangCase, menus: PublishedMenu[], { apiKey, openaiFetch, onRow }: RunDeps): Promise<void> {
  const fixture = fixtureMcp(menus);
  const result = await runAssistantTurn({ baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: apiKey, model: MODEL, envoiFetch: fixture.fetch, openaiFetch }, [{ role: "buyer", text: entry.sentence }]);
  const reply = "text" in result ? result.text : "";
  const last = fixture.baskets.at(-1);
  const got: Observation["got"] = result.kind === "link" && result.link.url === FIXTURE_URL && last ? { kind: "basket", ...last } : result.kind === "reply" ? { kind: "reply", text: reply } : { kind: "failed" };
  const observed: Observation = {
    got,
    baskets: fixture.baskets,
    modelWrittenLinks: (reply.match(LINK_PATTERN) ?? []).length + (result.kind === "link" && result.link.url !== FIXTURE_URL ? 1 : 0),
  };
  onRow({ ...entry, path: "assistant", observed, reply, diagnostic: { kind: result.kind, steps: result.steps }, ...scoreOutcome(entry.expected, observed), semanticReview: "pending" });
}

// A missing outcome is never a pass, so each phase is complete only at its full case count.
// Eligibility is recomputed from the raw counts and never trusts the derived structuralPass flag
// alone, because the falsifier is stated as those counts: any over-budget or dietary answer.
export function adviceVerdict(rows: readonly AdviceResultRow[]) {
  const passed = rows.filter((row) => row.structuralPass && row.semantic === "pass").length;
  const offMenu = rows.reduce((sum, row) => sum + row.offMenu.length, 0);
  const overBudget = rows.reduce((sum, row) => sum + row.overBudget, 0);
  const unexpectedBaskets = rows.filter((row) => row.basketsCreated !== row.expected.baskets).length;
  const modelWrittenLinks = rows.reduce((sum, row) => sum + row.modelWrittenLinks, 0);
  const complete = rows.length === 10;
  return {
    cases: rows.length,
    passed,
    offMenu,
    overBudget,
    unexpectedBaskets,
    modelWrittenLinks,
    complete,
    eligible: complete && passed === 10 && offMenu === 0 && overBudget === 0 && unexpectedBaskets === 0 && modelWrittenLinks === 0,
  };
}

export function langVerdict(rows: readonly LangResultRow[]) {
  const passed = rows.filter((row) => row.structuralPass && row.semantic === "pass").length;
  return {
    cases: rows.length,
    passed,
    wrongLinks: rows.reduce((sum, row) => sum + row.wrongLinks, 0),
    complete: rows.length === 25,
    eligible: rows.length === 25 && passed >= 24 && rows.every((row) => row.wrongLinks === 0),
  };
}

const PHASES = ["advice", "lang"] as const;
type Phase = (typeof PHASES)[number];
const resultPath = (run: string) => join(HERE, `s34-eval-${run}.json`);

function readRows<T>(run: string, review: Review["rows"]): T[] {
  const path = resultPath(run);
  if (!existsSync(path)) return [];
  const rows = (JSON.parse(readFileSync(path, "utf8")) as { rows: { id: string }[] }).rows;
  return rows.map((row) => ({ ...row, semantic: review.find((entry) => entry.id === row.id)?.semantic })) as T[];
}

async function main() {
  const advice = adviceCases();
  const lang = langCases();
  const status = readFileSync(STATUS, "utf8");
  const [command, phaseArg] = process.argv.slice(2);
  if (command === "check") {
    console.log(JSON.stringify({ label: "S34 offline registration check; no env load, DB or model call", adviceCases: advice.length, langCases: lang.length, model: MODEL, capUsd: CAP_USD, s32ManifestSha256: S32_MANIFEST_SHA256 }));
    return;
  }
  if (command === "verdict") {
    const review: Review["rows"] = existsSync(REVIEW) ? (JSON.parse(readFileSync(REVIEW, "utf8")) as Review).rows : [];
    console.log(JSON.stringify({ advice: adviceVerdict(readRows<AdviceResultRow>("advice", review)), lang: langVerdict(readRows<LangResultRow>("lang", review)), reviewedIds: review.length }, null, 2));
    return;
  }
  assert(command === "run", "usage: s34-advice-eval.mts check | run advice | run lang | verdict");
  const requested = String(phaseArg ?? "");
  const fix = requested.endsWith("-fix");
  const phase = requested.replace(/-fix$/, "") as Phase;
  assert(PHASES.includes(phase), "phase must be advice or lang");
  if (fix) assert(status.includes("S34 prompt fix 1:"), "record the one prompt fix before its rerun");
  const run = `${phase}${fix ? "-fix" : ""}`;
  const outPath = resultPath(run);
  assert(!existsSync(outPath), "run already exists; no overwriting or silent retries");
  if (fix) assert(existsSync(resultPath(phase)), "the initial run is required before its fix run");

  loadLocalEnvFile(process.env.S34_ENV_FILE ?? ".env.local");
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, "OPENAI_API_KEY is not configured");
  // Set after the env file so it can never select an external database.
  process.env.TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/postgres";
  const meter = createMeter(LEDGER);
  const database = await createTestDatabase(`s34${phase}`);
  const web = connectWeb(database.webUrl, 2);
  const rows: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  const sourceHash = (file: string) => createHash("sha256").update(readFileSync(join(ROOT, file))).digest("hex");
  const save = () =>
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          label: `FIXTURE shops; real OpenAI; assistant backend and links simulated; ${phase} phase; assistant path only; no box call, no payment and no deployment`,
          startedAt,
          updatedAt: new Date().toISOString(),
          model: MODEL,
          phase,
          run,
          capUsd: CAP_USD,
          agentSha256: sourceHash("src/integrations/assistant/agent.ts"),
          toolsSha256: sourceHash("src/integrations/assistant/tools.ts"),
          adviceManifestSha256: createHash("sha256").update(readFileSync(join(HERE, "s34-advice-cases.json"))).digest("hex"),
          langManifestSha256: createHash("sha256").update(readFileSync(S32_MANIFEST)).digest("hex"),
          meter: { ...meter.ledger },
          stopReason: meter.stopReason(),
          costBoundary: "Usage-derived estimates; a missing cache-write lifetime is priced at the highest rate; an unresolved charge stays reserved. The actual invoice total is unknown.",
          semanticReview: "pending; structuralPass is not an overall pass",
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  save();
  try {
    const menus = phase === "advice" ? await seedAdviceMenus(database, web) : await seedFixtureMenus(database, web);
    const deps: RunDeps = {
      apiKey,
      openaiFetch: cappedFetch(meter.fetch, meter.ledger),
      onRow: (row) => {
        rows.push(row);
        console.log(JSON.stringify({ id: row.id, structuralPass: row.structuralPass, basketsCreated: row.basketsCreated ?? null, offMenu: row.offMenu ?? null, overBudget: row.overBudget ?? null, pricedAt: row.pricedAt ?? null, wrongLinks: row.wrongLinks ?? null }));
      },
    };
    for (const entry of phase === "advice" ? advice : lang) {
      if (meter.isStopped()) break;
      const spentBefore = meter.ledger.spentUsd;
      const requestsBefore = meter.ledger.requests;
      if (phase === "advice") await runAdviceCase(entry as AdviceCase, menus, deps);
      else await runLangCase(entry as LangCase, menus, deps);
      const row = rows.at(-1)!;
      row.usd = meter.ledger.spentUsd - spentBefore;
      row.usageRequests = meter.ledger.requests - requestsBefore;
      save();
    }
  } finally {
    save();
    await web.close();
    await database.drop();
  }
  console.log(JSON.stringify({ phase, completedOutcomes: rows.length, overallPass: "pending semantic review", spentUsd: meter.ledger.spentUsd, reservedUsd: meter.ledger.reservedUsd, stopReason: meter.stopReason() }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("S34 stopped. Inspect the sanitized result and ledger; no automatic retry.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
