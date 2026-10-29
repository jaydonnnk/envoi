// Slice S24 web menu evaluation, pre-registered in 00-status.md "S24 evaluation protocol, pre-registered
// 2026-10-29 before any model call". The pages and expected items are s24-eval-expected.json.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s24-web-eval.mts --self-test
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s24-web-eval.mts <spend-limit-usd> <model>
// It reads KERNEL_API_KEY and OPENAI_API_KEY from .env.local and never prints them. Each page goes once
// through the product's own steps in runWebImport's order: readPageText (one real Kernel session),
// hasPrintedPrice, draftMenuFromPageText, validateVisionDraft and keepPrintedOnly. No database row is
// written. The spend bounds below are a FIXTURE policy held in this file only; MENU_SPEND_POLICY is
// not changed. A fetch wrapper around the Kernel client records each session id the create call
// returned and the status of its delete call; it never records a request or response body.
// It writes s24-web-eval-<model>.json beside this file and stops before a call whose worst case could
// take the total past the spend limit.
//
// The scoring rule is fixed here, committed before the first model call, and never loosened after:
// - fold: NFKC, lower case, curly quotes made straight, runs of whitespace made one space, trimmed.
// - A drafted row matches an expected item of the same page, one to one, by the first rule that holds,
//   each rule tried over all rows before the next:
//   1. exact: fold(name) and fold(portion ?? "") are equal;
//   2. joined: fold(name + " " + portion) are equal after "()[],:;-" and the middle dot become spaces,
//      so "Kopi C (Hot)" with no portion matches "Kopi C" with portion "Hot";
//   3. unique name: fold(name) is equal, that name appears once among the page's expected items and
//      once among its drafted rows, so a portion is ignored only when it distinguishes no variant.
//   A portion that tells two variants apart (the round 4 trap) is never dropped: rule 3 refuses a
//   name that appears twice.
// - A row left after one-to-one matching that still matches an expected item by rule 1 or 2 is a
//   duplicate of it, judged against that item's price, as the protocol's "matching name and portion".
// - A drafted row with a price is a wrong filled price when it matches nothing, when its match has
//   no expected price, or when its cents differ from the expected cents.
// - An expected priced item is drafted with its price when a matching row carries its exact cents.
// - Pass, all together: zero wrong filled prices; at least 46 of the 51 expected priced items
//   drafted with their price; F5 and R2 close picture_menu with no model call; F7 closes page_refused;
//   R3 drafts nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DraftItemSuggestion } from "@/domain/menu/types";
import { actualUsdMicros, type MenuModelBounds } from "@/domain/imports/types";
import { validateVisionDraft } from "@/domain/imports/validate-result";
import { hasPrintedPrice, keepPrintedOnly } from "@/domain/imports/verbatim";
import { checkMenuPageUrl } from "@/domain/imports/web-url";
import { loadLocalEnvFile } from "@/env";
import { draftMenuFromPageText, MENU_WEB_PROMPT_VERSION } from "@/integrations/ai/menu-web";
import { PAGE_READ_BOUNDS, readPageText } from "@/integrations/browser/kernel";
import { menuModelBudgetMs } from "@/lib/time";

type Expected = { name: string; portion: string | null; price: string | null };
type Page = { id: string; label: string; url: string; expect: "completed" | "picture_menu" | "page_refused" | "no_draft"; items: Expected[] };
type Row = { name: string; portion: string | null; priceSgdCents: number | null; priceBasis: DraftItemSuggestion["priceBasis"] };

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = (JSON.parse(readFileSync(join(HERE, "s24-eval-expected.json"), "utf8")) as { pages: Page[] }).pages;
const PRICED_TOTAL = PAGES.reduce((sum, page) => sum + page.items.filter((item) => item.price !== null).length, 0);
const PRICED_NEEDED = 46;

// FIXTURE bounds for the evaluation only, from S4's 2026-10-14 list prices [vendor claim].
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 100_000, output: 500_000 },
  "gpt-5.6-luna": { input: 200_000, output: 1_200_000 },
};
const boundsOf = (model: string): MenuModelBounds => ({
  model,
  inputUsdMicrosPerMillionTokens: PRICES[model]!.input,
  outputUsdMicrosPerMillionTokens: PRICES[model]!.output,
  maxInputTokens: 17_000,
  maxOutputTokens: 6_000,
});
// The worst case the spend stop uses: one token per byte of the cut page text, plus the prompt.
const worstInputTokens = PAGE_READ_BOUNDS.maxTextBytes + 2_000;

// ---- Scoring ----------------------------------------------------------------------------------------

const fold = (text: string | null) =>
  (text ?? "").normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const joined = (name: string, portion: string | null) => fold(`${name} ${portion ?? ""}`.replace(/[()[\],:;\-·]/g, " "));
const cents = (price: string) => Math.round(Number(price) * 100);

export type PageScore = {
  matches: { row: Row; expected: Expected | null; rule: 1 | 2 | 3 | null; duplicate: boolean }[];
  wrongFilled: { name: string; portion: string | null; drafted: number; expected: number | null }[];
  pricedFound: number;
  pricedExpected: number;
  missing: Expected[];
  extras: Row[];
};

export function scorePage(expected: Expected[], rows: Row[]): PageScore {
  const used = new Set<number>();
  const matchOf = new Map<number, { index: number; rule: 1 | 2 | 3 }>();
  const rules: [1 | 2 | 3, (row: Row, item: Expected) => boolean][] = [
    [1, (row, item) => fold(row.name) === fold(item.name) && fold(row.portion) === fold(item.portion)],
    [2, (row, item) => joined(row.name, row.portion) === joined(item.name, item.portion)],
    [
      3,
      (row, item) =>
        fold(row.name) === fold(item.name) &&
        expected.filter((other) => fold(other.name) === fold(item.name)).length === 1 &&
        rows.filter((other) => fold(other.name) === fold(row.name)).length === 1,
    ],
  ];
  for (const [rule, test] of rules) {
    rows.forEach((row, r) => {
      if (matchOf.has(r)) return;
      const index = expected.findIndex((item, e) => !used.has(e) && test(row, item));
      if (index >= 0) {
        used.add(index);
        matchOf.set(r, { index, rule });
      }
    });
  }
  // A row left over after one-to-one matching that still names an expected item by rule 1 or 2 is a
  // duplicate of it: the protocol judges its price against that item, and it counts as no extra.
  const matches = rows.map((row, r) => {
    const m = matchOf.get(r);
    if (m) return { row, expected: expected[m.index]!, rule: m.rule, duplicate: false };
    const twin = expected.find((item) => rules[0]![1](row, item) || rules[1]![1](row, item)) ?? null;
    return { row, expected: twin, rule: null, duplicate: twin !== null };
  });
  const wrongFilled = matches
    .filter(({ row, expected: item }) => row.priceSgdCents !== null && (item === null || item.price === null || cents(item.price) !== row.priceSgdCents))
    .map(({ row, expected: item }) => ({ name: row.name, portion: row.portion, drafted: row.priceSgdCents!, expected: item?.price ? cents(item.price) : null }));
  const found = new Set(matches.filter(({ row, expected: item, duplicate }) => !duplicate && item?.price != null && row.priceSgdCents === cents(item.price)).map(({ expected: item }) => item));
  const priced = expected.filter((item) => item.price !== null);
  return {
    matches,
    wrongFilled,
    pricedFound: priced.filter((item) => found.has(item)).length,
    pricedExpected: priced.length,
    missing: priced.filter((item) => !found.has(item)),
    extras: matches.filter(({ expected: item }) => item === null).map(({ row }) => row),
  };
}

function selfTest(): void {
  const row = (name: string, portion: string | null, priceSgdCents: number | null): Row => ({ name, portion, priceSgdCents, priceBasis: priceSgdCents === null ? "not_on_page" : "explicit" });
  const f1: Expected[] = [
    { name: "Kopi C", portion: "Hot", price: "1.80" },
    { name: "Ebi fry", portion: "3 pcs", price: "4.90" },
    { name: "Ebi fry", portion: "+ Mentaiko", price: null },
  ];
  const check = (label: string, ok: boolean) => {
    if (!ok) throw new Error(`self-test failed: ${label}`);
    console.log(`self-test ok: ${label}`);
  };
  let s = scorePage(f1, [row("Kopi C (Hot)", null, 180), row("Ebi fry", "3 pcs", 490), row("Ebi fry", "+ Mentaiko", null)]);
  check("joined rule matches a portion written into the name", s.wrongFilled.length === 0 && s.pricedFound === 2);
  s = scorePage(f1, [row("Kopi C", "Hot", 180), row("Ebi fry", "+ Mentaiko", 490)]);
  check("the variant's portion is kept: 4.90 on + Mentaiko is wrong", s.wrongFilled.length === 1 && s.pricedFound === 1);
  s = scorePage(f1, [row("Kopi C", "Hot", 180), row("Ebi fry", null, 490)]);
  check("a shared name with no portion is not matched by rule 3", s.wrongFilled.length === 1 && s.matches[1]!.expected === null);
  s = scorePage([{ name: "Otah", portion: null, price: "2" }], [row("Otah", "1 pc", 200)]);
  check("rule 3 matches a unique name", s.wrongFilled.length === 0 && s.pricedFound === 1);
  s = scorePage(f1, [row("Kopi C", "Hot", 160), row("Golden Lobster", null, 50), row("Golden Lobster", null, null)]);
  check("a wrong price and a priced extra are wrong; a blank extra is not", s.wrongFilled.length === 2 && s.extras.length === 2);
  s = scorePage([{ name: "Kopi C", portion: "Hot", price: "1.80" }], [row("Kopi C", "Hot", 180), row("Kopi C", "Hot", 180)]);
  check("a duplicate row with the same price is not wrong", s.wrongFilled.length === 0 && s.pricedFound === 1 && s.matches[1]!.duplicate);
  s = scorePage([{ name: "Kopi C", portion: "Hot", price: "1.80" }], [row("Kopi C", "Hot", 180), row("Kopi C", "Hot", 160)]);
  check("a duplicate row with another price is wrong", s.wrongFilled.length === 1);
}

// ---- Run ---------------------------------------------------------------------------------------------

type KernelTrace = { created: string[]; deletes: { sessionId: string; status: number | null }[] };

function tracingFetch(trace: KernelTrace): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (err) {
      if (method === "DELETE") trace.deletes.push({ sessionId: url.pathname.split("/").at(-1)!, status: null });
      throw err;
    }
    if (method === "POST" && /\/browsers\/?$/.test(url.pathname) && response.ok) {
      const body = (await response.clone().json()) as { session_id?: unknown };
      if (typeof body.session_id === "string") trace.created.push(body.session_id);
    }
    if (method === "DELETE") trace.deletes.push({ sessionId: url.pathname.split("/").at(-1)!, status: response.status });
    return response;
  };
}

async function main(): Promise<void> {
  if (process.argv[2] === "--self-test") return selfTest();
  selfTest();
  const limitUsd = Number(process.argv[2]);
  const model = process.argv[3]!;
  if (!(limitUsd > 0) || !PRICES[model]) throw new Error("usage: <spend-limit-usd> <gpt-6-luna|gpt-5.6-luna>");
  loadLocalEnvFile();
  const kernelKey = process.env.KERNEL_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!kernelKey || !openaiKey) throw new Error("KERNEL_API_KEY and OPENAI_API_KEY must be set in .env.local");
  const bounds = boundsOf(model);
  const worstUsdMicros = actualUsdMicros(bounds, { inputTokens: worstInputTokens, outputTokens: bounds.maxOutputTokens });
  let spentUsdMicros = 0;
  const results: unknown[] = [];
  let wrongTotal = 0;
  let foundTotal = 0;
  const outcomeChecks: { page: string; expected: string; actual: string; modelCalled: boolean; pass: boolean }[] = [];

  for (const page of PAGES) {
    const link = checkMenuPageUrl(page.url);
    if (!link.ok) throw new Error(`${page.id}: the link fails checkMenuPageUrl (${link.reason})`);
    const trace: KernelTrace = { created: [], deletes: [] };
    const started = Date.now();
    const read = await readPageText(link.url, new AbortController().signal, { apiKey: kernelKey, fetch: tracingFetch(trace) });
    const readMs = Date.now() - started;
    let outcome: string;
    let rows: Row[] = [];
    let modelCalled = false;
    let call: { inputTokens: number | null; outputTokens: number | null; costUsdMicros: number; ms: number; kind: string } | null = null;
    let droppedNames = 0;
    let textBytes: number | null = null;
    if (read.kind !== "ok") {
      outcome = read.kind === "refused" ? "page_refused" : read.kind === "timeout" ? "page_timeout" : "page_unreachable";
    } else if (((textBytes = new TextEncoder().encode(read.text).byteLength), !hasPrintedPrice(read.text))) {
      outcome = "picture_menu";
    } else {
      if (spentUsdMicros + worstUsdMicros > limitUsd * 1_000_000) {
        console.log(`stopped before ${page.id}: worst case would pass the US$${limitUsd} limit`);
        break;
      }
      modelCalled = true;
      const admittedAt = new Date(started);
      const callStart = Date.now();
      const drafted = await draftMenuFromPageText({
        text: read.text,
        model,
        apiKey: openaiKey,
        bounds,
        budgetMs: menuModelBudgetMs(admittedAt, new Date()),
        signal: new AbortController().signal,
      });
      const tokens = drafted.kind === "ok" ? drafted : { inputTokens: null, outputTokens: null };
      const cost = drafted.kind === "ok" ? actualUsdMicros(bounds, tokens) : actualUsdMicros(bounds, { inputTokens: worstInputTokens, outputTokens: bounds.maxOutputTokens });
      spentUsdMicros += cost;
      call = { inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, costUsdMicros: cost, ms: Date.now() - callStart, kind: drafted.kind };
      if (drafted.kind !== "ok") {
        outcome = drafted.kind === "timeout" ? "model_timeout" : drafted.kind === "aborted" ? "aborted" : "model_failed";
      } else {
        const validated = validateVisionDraft(drafted.raw);
        const kept = validated.ok ? keepPrintedOnly(validated, read.text) : null;
        if (!validated.ok || !kept || kept.draft.items.length === 0) {
          outcome = "output_invalid";
        } else {
          outcome = "completed";
          droppedNames = kept.droppedNames;
          rows = kept.draft.items.map((item) => ({ name: item.name, portion: item.portion, priceSgdCents: item.priceSgdCents, priceBasis: item.priceBasis }));
        }
      }
    }
    const score = scorePage(page.items, rows);
    wrongTotal += score.wrongFilled.length;
    foundTotal += score.pricedFound;
    if (page.expect !== "completed") {
      const pass =
        page.expect === "no_draft" ? outcome !== "completed" && rows.length === 0 : outcome === page.expect && (page.expect !== "picture_menu" || !modelCalled);
      outcomeChecks.push({ page: page.id, expected: page.expect, actual: outcome, modelCalled, pass });
    }
    const result = {
      page: page.id,
      label: page.label,
      host: link.host,
      outcome,
      kernel: { read: read.kind, error: read.kind === "ok" ? null : read.error, finalHost: read.kind === "ok" ? read.finalHost : null, textBytes, ms: readMs, ...trace },
      modelCalled,
      call,
      droppedNames,
      rows: score.matches.map(({ row, expected: item, rule, duplicate }) => ({ ...row, matched: item ? { name: item.name, portion: item.portion, price: item.price } : null, rule, duplicate })),
      wrongFilled: score.wrongFilled,
      pricedFound: score.pricedFound,
      pricedExpected: score.pricedExpected,
      missing: score.missing,
      extras: score.extras,
    };
    results.push(result);
    console.log(
      `${page.id} [${page.label.startsWith("FIXTURE") ? "FIXTURE" : "REAL"}] ${outcome}; rows ${rows.length}; priced ${score.pricedFound}/${score.pricedExpected}; wrong ${score.wrongFilled.length}; dropped ${droppedNames}; sessions ${trace.created.join(",") || "none"}; deletes ${trace.deletes.map((d) => `${d.sessionId}:${d.status}`).join(",") || "none"}; read ${readMs} ms${call ? `; model ${call.ms} ms, ${call.inputTokens}/${call.outputTokens} tokens, US$${(call.costUsdMicros / 1e6).toFixed(6)}` : ""}`,
    );
  }

  const pass = wrongTotal === 0 && foundTotal >= PRICED_NEEDED && outcomeChecks.every((check) => check.pass) && results.length === PAGES.length;
  const summary = {
    protocol: "S24 web menu evaluation, pre-registered 2026-10-29; scorer committed before the first model call",
    model,
    prompt: MENU_WEB_PROMPT_VERSION,
    ranAt: new Date().toISOString(),
    pagesRun: results.length,
    wrongFilledTotal: wrongTotal,
    pricedFound: foundTotal,
    pricedExpected: PRICED_TOTAL,
    pricedNeeded: PRICED_NEEDED,
    outcomeChecks,
    spentUsdMicros,
    pass,
    results,
  };
  writeFileSync(join(HERE, `s24-web-eval-${model}.json`), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(`${model}: ${pass ? "PASS" : "FAIL"}; wrong ${wrongTotal}; priced ${foundTotal}/${PRICED_TOTAL} (need ${PRICED_NEEDED}); outcome checks ${outcomeChecks.map((c) => `${c.page}:${c.actual}${c.pass ? "" : "(fail)"}`).join(" ")}; spent US$${(spentUsdMicros / 1e6).toFixed(6)}`);
}

await main();
