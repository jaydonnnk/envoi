// S47 weekly summary evaluation, pre-registered in 00-status.md "S47 weekly summary evaluation,
// pre-registration" before any paid model call. Each case sends one request through the real
// tool-free call of src/integrations/ai/digest.ts and fills the answer with the real composeDigest
// over FIXTURE sales summaries, then scores what would reach the screen. No database, PayPal, Neon
// or Render is touched: the call receives a language and placeholder names only.
//
// Every model request goes through a counting fetch that refuses any other model and refuses a
// request once one more worst-case request could pass the spend limit. The key is read from
// .env.local by name and is never stored or printed.
//
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s47-digest-eval.mts selftest
//     runs the scorer on fixture answers only (no network).
//   S47_SPEND_LIMIT_USD=<limit> npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s47-digest-eval.mts run <model>
//     runs every case once with <model> and writes s47-digest-eval-<model>.json beside this file.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeDigest, digestFigures, offeredPlaceholders, type DigestLanguage, type DigestPlaceholder } from "@/domain/purchases/digest";
import type { SalesSummary } from "@/domain/purchases/sales-summary";
import { createDigestModel } from "@/integrations/ai/digest";
import type { Currency } from "@/lib/money";

const HERE = dirname(fileURLToPath(import.meta.url));

// USD per million tokens [vendor claim]: gpt-6-sol as S35 recorded it on 2026-11-06; it publishes
// no cached price, so cached input is charged in full.
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-6-sol": { input: 2, cached: 2, output: 10 },
};
// The worst case of one request: 4,000 input tokens and the call's whole output bound of 1,000.
const WORST_REQUEST_TOKENS = { input: 4_000, output: 1_000 };

// FIXTURE sales summaries. SGD all known uses the mockup's illustration figures.
const SGD_KNOWN: SalesSummary = { currency: "SGD", paidMinor: 9640, paidCount: 6, knownFeeMinor: 825, knownNetMinor: 8815, unknownFeeCount: 0, byRail: [] };
const USD_KNOWN: SalesSummary = { currency: "USD", paidMinor: 2350, paidCount: 2, knownFeeMinor: 152, knownNetMinor: 2198, unknownFeeCount: 0, byRail: [] };
const SGD_ONE_UNKNOWN: SalesSummary = { currency: "SGD", paidMinor: 9640, paidCount: 6, knownFeeMinor: 700, knownNetMinor: 7115, unknownFeeCount: 1, byRail: [] };

const STATES = {
  "sgd-known": [SGD_KNOWN],
  "sgd-usd-known": [SGD_KNOWN, USD_KNOWN],
  "sgd-usd-one-unknown": [SGD_ONE_UNKNOWN, USD_KNOWN],
} satisfies Record<string, SalesSummary[]>;
type State = keyof typeof STATES;

const LANGUAGES: DigestLanguage[] = ["en", "zh", "ms", "ta"];

export const CASES: { id: string; language: DigestLanguage; state: State }[] = [];
for (const [i, state] of (Object.keys(STATES) as State[]).entries()) {
  for (const [j, language] of LANGUAGES.entries()) CASES.push({ id: `D${i * 4 + j + 1}`, language, state });
}

// The scorer, independent of fillDigest. A number run is a run of Unicode number characters joined
// by dots or commas, with an optional S$ or US$ in front. Every run in a shown paragraph must equal
// one of the figures code computed for that paragraph's currency. Any Chinese numeral character is
// an invented figure. Number words are not scored here (see the pre-registration).
const NUMBER_RUN = /(?:US\$|S\$)?\p{N}(?:[\p{N}.,]*\p{N})?/gu;
const CHINESE_NUMERAL = /[〇零一二两兩三四五六七八九十百千万萬亿億壹贰貳叁參肆伍陆陸柒捌玖拾佰仟]/u;

export function inventedFigures(text: string, allowed: readonly string[]): string[] {
  const invented = [...text.matchAll(NUMBER_RUN)].map((m) => m[0]).filter((run) => !allowed.includes(run));
  const chinese = text.match(CHINESE_NUMERAL);
  return chinese ? [...invented, chinese[0]] : invented;
}

function allowedFor(summaries: readonly SalesSummary[], currency: Currency): string[] {
  const offerFees = offeredPlaceholders(summaries).includes("fee_total");
  const summary = summaries.find((s) => s.currency === currency)!;
  return Object.values(digestFigures(summary, offerFees)).filter((v): v is string => v !== null);
}

type Shown = { currency: Currency; text: string }[];
type Scored = { kind: "ok" | "refused" | "no_answer"; shown: Shown; invented: string[]; refusedShown: boolean };

// What reaches the screen for one answer: the filled paragraphs when composeDigest accepts it, and
// nothing (a code-written notice) when it refuses or the model gave no template.
export function scoreAnswer(summaries: readonly SalesSummary[], template: string | null, compose = composeDigest): Scored {
  if (template === null) return { kind: "no_answer", shown: [], invented: [], refusedShown: false };
  const result = compose(summaries, template);
  if (result.kind === "refused") return { kind: "refused", shown: [], invented: [], refusedShown: false };
  const invented = result.paragraphs.flatMap((p) => inventedFigures(p.text, allowedFor(summaries, p.currency)));
  return { kind: "ok", shown: result.paragraphs, invented, refusedShown: false };
}

// Registered pass rule: 12 cases, zero invented figures shown and zero refused outputs shown.
export function verdict(results: Scored[]) {
  const shown = results.filter((r) => r.kind === "ok").length;
  const refused = results.filter((r) => r.kind === "refused").length;
  const noAnswer = results.filter((r) => r.kind === "no_answer").length;
  const invented = results.reduce((n, r) => n + r.invented.length, 0);
  const refusedShown = results.filter((r) => r.refusedShown).length;
  return { total: results.length, shown, refused, noAnswer, invented, refusedShown, pass: results.length === 12 && invented === 0 && refusedShown === 0 };
}

async function selftest() {
  const failures: string[] = [];
  const known = STATES["sgd-usd-known"];
  const unknown = STATES["sgd-usd-one-unknown"];
  const clean = "This week {{paid_count}} paid orders brought {{paid_total}}. PayPal kept {{fee_total}}, so {{net_total}} reached you.";
  const cleanPaidOnly = "This week {{paid_count}} paid orders brought {{paid_total}}.";
  const ok = scoreAnswer(known, clean);
  if (ok.kind !== "ok" || ok.invented.length !== 0 || ok.shown.length !== 2) failures.push("clean template, two currencies");
  if (ok.shown[1]?.text !== "This week 2 paid orders brought US$23.50. PayPal kept US$1.52, so US$21.98 reached you.") failures.push("USD paragraph text");
  if (scoreAnswer(unknown, cleanPaidOnly).kind !== "ok") failures.push("paid-only template while a fee is unknown");
  if (scoreAnswer(unknown, clean).kind !== "refused") failures.push("fee placeholder while a fee is unknown");
  if (scoreAnswer(known, "You had 7 orders worth {{paid_total}}.").kind !== "refused") failures.push("template with its own digit");
  if (scoreAnswer(known, null).kind !== "no_answer") failures.push("no answer");
  // The scorer's own detection, on shown text that bypasses fillDigest.
  const allowed = allowedFor(known, "SGD");
  const probes: [string, string[]][] = [
    ["You earned S$96.40 from 6 orders.", []],
    ["You earned S$96.40 from 7 orders.", ["7"]],
    ["You earned S$96.41.", ["S$96.41"]],
    ["You earned US$23.50.", ["US$23.50"]],
    ["You earned S$96.40 from 16 orders.", ["16"]],
    ["௭ orders", ["௭"]],
    ["本周七笔订单", ["七"]],
  ];
  for (const [text, expected] of probes) {
    if (JSON.stringify(inventedFigures(text, allowed)) !== JSON.stringify(expected)) failures.push(`probe: ${text}`);
  }
  // A composeDigest that lets a refused template through must count as an invented figure shown.
  const leaky = (summaries: readonly SalesSummary[], template: string) => ({ kind: "ok" as const, paragraphs: summaries.map((s) => ({ currency: s.currency, text: template.replaceAll("{{paid_total}}", "S$96.40") })) });
  const leaked = scoreAnswer(known, "You had 7 orders worth {{paid_total}}.", leaky);
  if (leaked.invented.length === 0) failures.push("leaky compose not caught");
  const twelve = (r: Scored) => Array.from({ length: 12 }, () => r);
  if (!verdict(twelve(ok)).pass) failures.push("twelve clean must pass");
  if (!verdict(twelve(scoreAnswer(known, null))).pass) failures.push("twelve no answers pass on safety");
  if (verdict([...twelve(ok).slice(1), leaked]).pass) failures.push("one invented figure must fail");
  if (verdict([...twelve(ok).slice(1), { ...ok, refusedShown: true }]).pass) failures.push("one refused shown must fail");
  if (verdict(twelve(ok).slice(1)).pass) failures.push("eleven cases must fail");
  if (CASES.length !== 12) failures.push("twelve cases");
  console.log(JSON.stringify({ label: "FIXTURE scorer self-test, no network", cases: CASES.length, failures }));
  if (failures.length > 0) process.exit(1);
}

async function run(model: string) {
  const price = PRICES[model];
  if (!price) throw new Error(`no registered price for ${model}`);
  const limit = Number(process.env.S47_SPEND_LIMIT_USD);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("S47_SPEND_LIMIT_USD must be a positive number");
  process.loadEnvFile(".env.local");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const worst = (WORST_REQUEST_TOKENS.input * price.input + WORST_REQUEST_TOKENS.output * price.output) / 1e6;
  let spent = 0;
  const usage = { requests: 0, refusedRequests: 0, input: 0, cached: 0, output: 0 };
  const sentBodies: string[] = [];
  const countingFetch: typeof fetch = async (input, init) => {
    const text = typeof init?.body === "string" ? init.body : "";
    const body = text ? (JSON.parse(text) as { model?: string }) : {};
    if (body.model !== model) { usage.refusedRequests += 1; throw new Error(`refused: request for model ${String(body.model)}`); }
    if (spent + worst > limit) { usage.refusedRequests += 1; throw new Error("refused: one more worst-case request could pass the spend limit"); }
    sentBodies.push(text);
    spent += worst; // reserved until the real usage is known
    const response = await fetch(input, init);
    const json = (await response.clone().json().catch(() => null)) as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } } | null;
    const u = json?.usage;
    spent -= worst;
    if (u) {
      const cached = u.input_tokens_details?.cached_tokens ?? 0;
      const fresh = (u.input_tokens ?? 0) - cached;
      spent += (fresh * price.input + cached * price.cached + (u.output_tokens ?? 0) * price.output) / 1e6;
      usage.input += u.input_tokens ?? 0;
      usage.cached += cached;
      usage.output += u.output_tokens ?? 0;
    } else {
      spent += worst; // no usage returned: charge the worst case
    }
    usage.requests += 1;
    return response;
  };
  const digestModel = createDigestModel({ apiKey, model, fetch: countingFetch });
  const results = [];
  const scored: Scored[] = [];
  for (const c of CASES) {
    const summaries = STATES[c.state];
    const placeholders: DigestPlaceholder[] = offeredPlaceholders(summaries);
    const started = Date.now();
    const template = await digestModel({ language: c.language, placeholders });
    const score = scoreAnswer(summaries, template);
    scored.push(score);
    const reason = template === null ? null : (() => { const r = composeDigest(summaries, template); return r.kind === "refused" ? r.reason : null; })();
    results.push({ id: c.id, language: c.language, state: c.state, placeholders, raw: template, kind: score.kind, refusalReason: reason, shown: score.shown, invented: score.invented, ms: Date.now() - started });
  }
  // The needle check: no request body held a figure from the FIXTURE summaries.
  const figureNeedles = ["96.40", "9640", "88.15", "8815", "8.25", "23.50", "2350", "21.98", "1.52", "71.15", "7.00"];
  const leakedNeedles = figureNeedles.filter((n) => sentBodies.some((b) => b.includes(n)));
  const outcome = verdict(scored);
  const record = { label: "S47 weekly summary evaluation; FIXTURE sales summaries, no order data; test environment", model, limitUsd: limit, estimatedSpendUsd: Number(spent.toFixed(6)), usage, leakedNeedles, outcome, results };
  const out = join(HERE, `s47-digest-eval-${model}.json`);
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ out, outcome, leakedNeedles, estimatedSpendUsd: record.estimatedSpendUsd, usage }));
}

const [mode, model] = process.argv.slice(2);
if (mode === "selftest") await selftest();
else if (mode === "run" && model) await run(model);
else throw new Error("usage: selftest | run <model>");
