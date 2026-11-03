// S29 translation evaluation, pre-registered in 00-status.md "S29 translation evaluation,
// pre-registration" before any model call. Every case runs the real getOrCreateTranslation with the
// real tool-free call of src/integrations/ai/menu-translate.ts against the disposable local database
// envoi_s29_local, which holds the four published FIXTURE menus read from Render through the envoi MCP
// get_menu on 2026-11-03 (s29-fixture-menus.json). Nothing here reaches Neon, Render or PayPal.
//
// Each model request goes through a counting fetch that refuses any other model and any request once
// one more worst-case request could pass the spend limit. The key is read from OPENAI_API_KEY in the
// environment and is never stored or printed.
//
// Two modes, run from the repository root:
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s29-translate-eval.mts seed
//     creates envoi_s29_local (dropping any old copy), migrates it and publishes the four menus.
//   S29_SPEND_LIMIT_USD=<limit> OPENAI_API_KEY=... npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s29-translate-eval.mts run <model>
//     runs every menu in every language once with <model> and writes s29-translate-eval-<model>.json
//     beside this file, holding every model answer, stored row and score.
//   S29_DRY_RUN=fixture S29_DRY_RUN_OUT=<file> adds a dry run of the same path with no OpenAI call.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import postgres from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketForm, type MenuTranslation } from "@/app/buy/basket-form";
import { getOrCreateTranslation, languageName, type MenuTranslator } from "@/domain/menu/translate";
import { MENU_TRANSLATION_PROMPT_VERSION, translateMenuNames, type TranslationOutput } from "@/integrations/ai/menu-translate";
import { runMigrations } from "@/lib/db/migrate";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import type { Currency } from "@/lib/money";

const HERE = dirname(fileURLToPath(import.meta.url));
const NAME = "envoi_s29_local";
const BASE = "postgres://postgres@127.0.0.1:5432/postgres";
const LOCAL_DB = `postgres://postgres@127.0.0.1:5432/${NAME}`;
// The protocol's five languages; English gets explanations only.
export const LANGUAGES = ["zh", "ja", "ko", "de", "en"] as const;
// USD per million tokens [vendor claim]: gpt-6-luna as S4 recorded it on 2026-10-14, gpt-6.1-sol as
// S11 recorded it on 2026-10-15; sol publishes no cached price, so cached input is charged in full.
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "gpt-6.1-sol": { input: 2, cached: 2, output: 10 },
};
// The worst case of one request: 4,000 input tokens and the call's whole output bound.
const WORST_REQUEST_TOKENS = { input: 4_000, output: 16_000 };

type FixtureMenu = { outletId: string; name: string; area: string; country: "SG" | "US"; items: { id: string; name: string; unitMinor: number; available: boolean }[] };
const MENUS = (JSON.parse(readFileSync(join(HERE, "s29-fixture-menus.json"), "utf8")) as { menus: FixtureMenu[] }).menus;

async function seed() {
  const root = postgres(BASE, { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`);
    await root.unsafe(`CREATE DATABASE "${NAME}"`);
    for (const role of ["envoi_web", "envoi_maintenance"]) {
      await root.unsafe(`DO $$ BEGIN CREATE ROLE ${role} LOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`);
    }
  } finally {
    await root.end({ timeout: 5 });
  }
  await runMigrations(LOCAL_DB);
  const admin = postgres(LOCAL_DB, { max: 1, onnotice: () => {} });
  try {
    for (const menu of MENUS) {
      const revision = `mrv_${menu.outletId.slice(4)}`;
      await admin`insert into outlets (id, name, area, is_demo_fixture, fixture_key, country) values (${menu.outletId}, ${menu.name}, ${menu.area}, true, ${`s29-eval-${menu.outletId}`}, ${menu.country})`;
      await admin`insert into menu_revisions (id, outlet_id, status, confirmed_at) values (${revision}, ${menu.outletId}, 'confirmed', now())`;
      for (const [position, item] of menu.items.entries()) {
        await admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_minor, available) values (${item.id}, ${item.id}, ${revision}, ${position}, ${item.name}, ${item.unitMinor}, ${item.available})`;
      }
      await admin`update outlets set published_menu_revision_id = ${revision} where id = ${menu.outletId}`;
    }
    const [{ n }] = await admin<{ n: string }[]>`select count(*) as n from menu_items`;
    console.log(JSON.stringify({ label: "FIXTURE menus; test money only", database: NAME, menus: MENUS.length, items: Number(n) }));
  } finally {
    await admin.end({ timeout: 5 });
  }
}

// What the buyer's screen shows of each item's price, availability and original name, and the
// quantity controls' names: the facts named test 27 compares.
function displayed(items: FixtureMenu["items"], currency: Currency, translation: MenuTranslation | null) {
  const router = { push: () => undefined, replace: () => undefined, back: () => undefined, forward: () => undefined, refresh: () => undefined, prefetch: () => undefined };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router as never }, createElement(BasketForm, { outletId: "out_fixture", currency, items, translation })));
  return {
    html,
    prices: [...html.matchAll(/<small>((?:S\$|US\$)[\d.]+ each|Price not set, cannot be bought yet|Not available)<\/small>/g)].map((match) => match[1]),
    controls: [...html.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]),
    subtotal: html.match(/class="total money">([^<]+)</)?.[1],
  };
}

async function run(model: string) {
  const limit = Number(process.env.S29_SPEND_LIMIT_USD);
  const apiKey = process.env.OPENAI_API_KEY;
  const price = PRICES[model];
  if (!(limit > 0) || !apiKey || !price) throw new Error("set S29_SPEND_LIMIT_USD and OPENAI_API_KEY, and name a priced model");
  const usage = { input: 0, cached: 0, output: 0, requests: 0, refused: 0, otherModel: 0 };
  const spent = () => (usage.input * price.input + usage.cached * price.cached + usage.output * price.output) / 1e6;
  const worst = (WORST_REQUEST_TOKENS.input * price.input + WORST_REQUEST_TOKENS.output * price.output) / 1e6;
  const counting = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const asked = (JSON.parse(String(init?.body ?? "{}")) as { model?: string }).model;
    if (asked !== model) {
      usage.otherModel += 1;
      return Response.json({ error: { message: "s29 evaluation: unexpected model", type: "unexpected_model" } }, { status: 400 });
    }
    // Earlier runs' spend counts against the same limit.
    if (previousSpend() + spent() + worst > limit) {
      usage.refused += 1;
      return Response.json({ error: { message: "s29 evaluation spend limit", type: "spend_limit" } }, { status: 429 });
    }
    const response = DRY_RUN ? fixtureResponse(String(init?.body)) : await fetch(input, init);
    const text = await response.text();
    usage.requests += 1;
    try {
      const body = JSON.parse(text) as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } };
      const cached = body.usage?.input_tokens_details?.cached_tokens ?? 0;
      usage.input += (body.usage?.input_tokens ?? 0) - cached;
      usage.cached += cached;
      usage.output += body.usage?.output_tokens ?? 0;
    } catch {
      // An answer without usage is counted as a request only.
    }
    return new Response(text, { status: response.status, headers: response.headers });
  }) as typeof globalThis.fetch;

  const sql = postgres(LOCAL_DB, { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema }) as unknown as Db;
  const cases = [];
  try {
    await sql`delete from menu_translations`;
    for (const menu of MENUS) {
      for (const language of LANGUAGES) {
        let raw: TranslationOutput | null = null;
        let callKind = "not_called";
        const translator: MenuTranslator = {
          model,
          translate: async (items, lang) => {
            const call = await translateMenuNames({ items, languageName: lang.name, english: lang.tag === "en", model, apiKey, fetch: counting });
            callKind = call.kind;
            if (call.kind === "ok") raw = call.output;
            return call;
          },
        };
        const started = performance.now();
        const result = await getOrCreateTranslation(db, menu.outletId, language, new Date(), translator);
        const ms = Math.round(performance.now() - started);
        const ids = new Set(menu.items.map((item) => item.id));
        const rawItems = (raw as TranslationOutput | null)?.items ?? [];
        const stored = result.kind === "ok" ? result.items : [];
        const currency: Currency = menu.country === "US" ? "USD" : "SGD";
        const plain = displayed(menu.items, currency, null);
        const shown = displayed(menu.items, currency, result.kind === "ok" ? { language, items: Object.fromEntries(stored.map((item) => [item.itemId, { name: item.name, explanation: item.explanation }])) } : null);
        const changedFrom = (screen: ReturnType<typeof displayed>) => menu.items.filter((item, n) => plain.prices[n] !== screen.prices[n] || !screen.html.includes(item.name)).map((item) => item.id);
        const changed = changedFrom(shown);
        // Self-test of the scorer on this case: a screen with the first price one cent higher and the
        // last original name missing must be caught as two changed items.
        const needle = displayed(menu.items.map((item, n) => (n === 0 ? { ...item, unitMinor: item.unitMinor + 1 } : n === menu.items.length - 1 ? { ...item, name: "FIXTURE renamed" } : item)), currency, null);
        if (changedFrom(needle).length !== 2) throw new Error(`the displayed-change scorer missed its needle on ${menu.name}`);
        const controlsChanged = JSON.stringify(plain.controls) !== JSON.stringify(shown.controls) || plain.subtotal !== shown.subtotal;
        cases.push({
          outletId: menu.outletId,
          shop: menu.name,
          language,
          languageName: languageName(language),
          callKind,
          resultKind: result.kind,
          ms,
          rawAnswer: raw,
          // Scored: entries in the model's own answer whose id is not on the revision.
          rawIdsNotOnMenu: rawItems.filter((item) => !ids.has(item.itemId)).map((item) => item.itemId),
          // Scored: items whose displayed price, availability or original name differs from the
          // untranslated screen, and whether the controls or subtotal differ.
          displayedChanged: changed,
          controlsChanged,
          // Reported, not scored.
          storedItems: stored,
          droppedByGuards: rawItems.filter((item) => ids.has(item.itemId) && !stored.some((kept) => kept.itemId === item.itemId)).map((item) => item.itemId),
          untranslated: menu.items.filter((item) => !stored.some((kept) => kept.itemId === item.id)).map((item) => item.id),
        });
        console.log(`${menu.name} / ${language}: ${result.kind}, ${stored.length} of ${menu.items.length} shown, ${ms} ms`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  const pricesChanged = cases.reduce((sum, c) => sum + c.displayedChanged.length + (c.controlsChanged ? 1 : 0), 0);
  const notOnMenu = cases.reduce((sum, c) => sum + c.rawIdsNotOnMenu.length, 0);
  const record = {
    label: "S29 translation evaluation on FIXTURE menus; demo fixture shops, test money only; real OpenAI calls",
    model,
    promptVersion: MENU_TRANSLATION_PROMPT_VERSION,
    ranAt: new Date().toISOString(),
    cases,
    score: { displayedPricesChanged: pricesChanged, translatedItemsNotOnMenu: notOnMenu, pass: pricesChanged === 0 && notOnMenu === 0 },
    coverage: { cases: cases.length, okCases: cases.filter((c) => c.resultKind === "ok").length, itemsShown: cases.reduce((s, c) => s + c.storedItems.length, 0), itemsOnMenus: cases.reduce((s, c) => s + c.storedItems.length + c.untranslated.length, 0) },
    usage: { ...usage, spentUsd: Number(spent().toFixed(6)), limitUsd: limit, earlierRunsUsd: Number(previousSpend().toFixed(6)) },
  };
  writeFileSync(DRY_RUN ? String(process.env.S29_DRY_RUN_OUT) : join(HERE, `s29-translate-eval-${model}.json`), `${JSON.stringify(record, null, 1)}\n`);
  console.log(JSON.stringify({ model, score: record.score, coverage: record.coverage, usage: record.usage }));
}

// S29_DRY_RUN=fixture proves the harness without OpenAI: each request is answered by a FIXTURE model
// that echoes every name, adds one item not on the menu and one price, and costs one token each way.
const DRY_RUN = process.env.S29_DRY_RUN === "fixture";

function fixtureResponse(body: string): Response {
  const prompt = (JSON.parse(body) as { input: { role: string; content: { text: string }[] }[] }).input.find((entry) => entry.role === "user")!.content[0]!.text;
  const menu = JSON.parse(prompt.match(/^<menu>\n(.*)\n<\/menu>$/s)![1]!) as { itemId: string; name: string }[];
  const items = [
    ...menu.map((item, n) => ({ itemId: item.itemId, name: `FIXTURE ${item.name}`, explanation: n === 0 ? "FIXTURE S$9.99" : "FIXTURE explanation." })),
    { itemId: "itm_fixturenotonthemenuxxxxxx", name: "FIXTURE invented", explanation: null },
  ];
  const text = JSON.stringify({ items });
  return Response.json({ id: "FIXTURE-resp", object: "response", created_at: 1_790_000_000, model: currentModel, status: "completed", output: [{ type: "message", id: "FIXTURE-msg", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1 }, incomplete_details: null });
}

// The measured spend of earlier recorded runs, so both runs share the one limit.
function previousSpend(): number {
  let total = 0;
  for (const model of Object.keys(PRICES)) {
    try {
      const earlier = JSON.parse(readFileSync(join(HERE, `s29-translate-eval-${model}.json`), "utf8")) as { model: string; usage: { spentUsd: number } };
      if (earlier.model !== currentModel) total += earlier.usage.spentUsd;
    } catch {
      // No earlier run of this model.
    }
  }
  return total;
}

const [mode, currentModel = ""] = process.argv.slice(2);
if (mode === "seed") await seed();
else if (mode === "run") await run(currentModel);
else throw new Error("usage: seed | run <model>");
