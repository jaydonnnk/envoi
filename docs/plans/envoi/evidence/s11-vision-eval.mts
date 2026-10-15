// Slice S11 vision model evaluation (R5), pre-registered in 00-status.md "S11 vision evaluation, pre-registration".
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s11-vision-eval.mts [--round=2] <spend-limit-usd> <model> [<model> ...]
// Round 1 wrote s11-vision-eval.json; --round=2 writes s11-vision-eval-round2.json. Both rounds use
// the same photos, expected drafts, threshold, scoring and provisional bounds.
// It reads OPENAI_API_KEY from .env.local and never prints it. Each evaluation photo, from the
// git-ignored folder .maintenance-build/s11-eval-photos, goes once per candidate through the same
// path a merchant's photo takes: the browser shrink (simulated with sharp: at most 2,048 pixels per
// side, the first JPEG quality of 0.9 to 0.5 that fits 2 MiB), the product's normalizeMenuJpeg,
// draftMenuFromPhoto with T_MENU_MODEL as the budget, and validateVisionDraft. It scores the draft
// the merchant would see against the expected draft below and writes s11-vision-eval.json beside
// this file. It stops before a call whose worst case could take the total past the spend limit.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { MenuModelBounds } from "@/domain/imports/types";
import { actualUsdMicros, reserveUsdMicros } from "@/domain/imports/types";
import { validateVisionDraft } from "@/domain/imports/validate-result";
import { loadLocalEnvFile } from "@/env";
import { draftMenuFromPhoto, MENU_VISION_PROMPT_VERSION } from "@/integrations/ai/menu-vision";
import { normalizeMenuJpeg } from "@/integrations/image/normalize";
import { durationMs } from "@/lib/time";

// One printed price cell, or one priced line. `price` null means the merchant must see a blank.
// `aliases` are the accepted name-plus-portion readings; parentheticals are also accepted dropped.
// `split` lists the names of a shared row ("Coffee / Tea") when the model lists each part on its own.
// `prefix` accepts a reading that starts with an alias ("Set A Chicken 10 sticks ...").
// An `optional` entry is not counted as missed, but a wrong price on it still counts.
type Entry = { aliases: string[]; price: string | null; split?: string[]; prefix?: boolean; optional?: boolean };
type Photo = { id: string; file: string; challenge: string; entries: Entry[] };

const e = (aliases: string | string[], price: string | null, extra: Omit<Entry, "aliases" | "price"> = {}): Entry => ({
  aliases: typeof aliases === "string" ? [aliases] : aliases,
  price,
  ...extra,
});

function sizes(name: string, s: string, m: string, l: string): Entry[] {
  return [
    e([name, `${name} S`, `${name} Small`, `${name} Regular`], s),
    e([`${name} M`, `${name} Medium`], m),
    e([`${name} L`, `${name} Large`], l),
  ];
}
const single = (name: string, price: string) => e([name, `${name} S`, `${name} Small`, `${name} Regular`], price);

const KOPITIAM: Entry[] = [
  e("Kaya Toast with Butter", "2.40"),
  e("Butter Sugar Toast", "2.40"),
  e("French Toast with Kaya", "2.00"),
  e("Kaya Peanut Toast", "2.40"),
  e("Steamed Bread (Kaya Butter / Kaya Peanut)", "2.40", { split: ["Steamed Bread Kaya Butter", "Steamed Bread Kaya Peanut"] }),
  e(["Set A - Kaya Toast with Butter set", "Kaya Toast with Butter set"], "4.80"),
  e(["Set B - Butter Sugar Toast set", "Butter Sugar Toast set"], "4.80"),
  e(["Set C - French Toast set", "French Toast set"], "4.50"),
  e(["Set D - Kaya Peanut Toast set", "Kaya Peanut Toast set"], "4.80"),
  e(["Set E - Steamed Bread set (Kaya Butter / Kaya Peanut)", "Steamed Bread set"], "4.80", {
    split: ["Set E Steamed Bread set Kaya Butter", "Set E Steamed Bread set Kaya Peanut"],
  }),
  e("Coffee / Tea", "1.80", { split: ["Coffee", "Tea"] }),
  e("Coffee-O / Tea-O", "1.60", { split: ["Coffee-O", "Tea-O"] }),
  e("Coffee-C / Tea-C", "2.00", { split: ["Coffee-C", "Tea-C"] }),
  e("Milo / Horlicks", "2.00", { split: ["Milo", "Horlicks"] }),
  e("Chinese Tea", "1.80"),
  e("Iced Coffee / Tea", "2.60", { split: ["Iced Coffee", "Iced Tea"] }),
  e("Iced Milo / Horlicks", "2.80", { split: ["Iced Milo", "Iced Horlicks"] }),
  e("Iced Lemon Tea", "2.60"),
  e("Barley", "2.60"),
  e("Canned Drinks", "2.00"),
  e("Lime juice", "2.60"),
  e("Packet Juice/Milk", "1.50", { split: ["Packet Juice", "Packet Milk"] }),
  e("Bottled Water", "2.00"),
  e(["Ya Kun Kaya Jar 290g", "Kaya Jar 290g"], "4.80"),
  e(["Ya Kun Kaya Jar Single Gift Pack", "Kaya Jar Single Gift Pack", "Ya Kun Kaya Jar 290g Single Gift Pack"], "5.80"),
  e(["Ya Kun Elfin Pack (75g x 2)", "Elfin Pack"], "6.00"),
  e(["Ya Kun Kaya Cookies (80g)", "Kaya Cookies"], "2.50", { prefix: true }),
  e(["Ya Kun Coffee Powder 250g", "Coffee Powder 250g"], "6.00"),
  e(["Ya Kun Coffee Powder 500g", "Coffee Powder 500g"], "10.00"),
  e("Soft-Boiled Eggs (2 eggs)", "1.80"),
  e("Kaya Butter Crackers", "2.00"),
];

// The pre-registered expected drafts. Keep identical to the summary in 00-status.md.
export const PHOTOS: Photo[] = [
  {
    id: "E1",
    file: "E1-noodle-small-prices.jpg",
    challenge: "small printed prices in three size columns; the first column's label is hidden; '-' where a size has no price; add-ons",
    entries: [
      ...sizes("Mee Hong Kong", "5.80", "12", "16"),
      ...sizes("Kway Teow Hong Kong (Hor Fun)", "5.80", "12", "16"),
      ...sizes("Bee Hoon Hong Kong", "5.80", "12", "16"),
      ...sizes("Hokkien Mee (Kicap & Basah)", "5.80", "12", "16"),
      ...sizes("Mee Goreng", "6.50", "13", "18"),
      ...sizes("Fried Kway Teow (Black)", "6.50", "13", "18"),
      ...sizes("Hong Kong Fried Noodle", "6.50", "13", "18"),
      ...sizes("Crispy Noodle", "6.50", "13", "18"),
      ...sizes("Prawn Mee", "6.50", "13", "18"),
      ...sizes("Fried Bee Hoon Singapore Style (No Spicy)", "6.50", "13", "18"),
      ...sizes("Beef Mee Hong Kong", "8.80", "17", "23"),
      single("Beef Mee Soup", "8.80"),
      single("Mee/Bee Hoon/Kway Teow Soup", "5.80"),
      single("Tom Yam Mee Soup", "8.80"),
      single("Fried Cockles Kway Teow", "6.50"),
      e(["With Egg Additional", "Egg", "Add Egg", "Egg Additional"], "1.20", { optional: true }),
      e(["Take away Box additional Small", "Take away Box Small", "Takeaway Box Small"], "0.30", { optional: true }),
      e(["Take away Box additional Large", "Take away Box Large", "Takeaway Box Large"], "1.00", { optional: true }),
    ],
  },
  {
    id: "E2",
    file: "E2-western-dense.jpg",
    challenge: "dense lightbox in four sections; two-line names; dish captions beside photos; side choices without prices",
    entries: [
      e("Chicken Wing (Min 2 Pcs)", "1.50"),
      e("Cheesy Chicken Finger", "6.00"),
      e("Fries", "3.50"),
      e("Cheese Fries", "4.50"),
      e("Wasabi Mayo Fries", "5.50"),
      e("Mentaiko Fries", "5.00"),
      e("Truffle Fries", "7.00"),
      e("Coleslaw", "3.50"),
      e("Mac N Cheese", "3.50"),
      e("Sunny Side Up", "1.20"),
      e("Mushroom Soup", "3.50"),
      e("Onion Ring (10pcs)", "4.50"),
      e("Butter Rice", "2.00"),
      e("Add Nacho Cheese", "1.20"),
      e("Add Bratwurst", "4.50"),
      e(["Value Meal", "Value Meal Butter Rice w Chicken Finger & Egg", "Butter Rice w Chicken Finger & Egg"], "3.60"),
      e("Salmon Pasta", "11.50"),
      e("Grilled Chicken Pasta", "7.70"),
      e("Mushroom Pasta", "7.00"),
      e("Prawn Pasta", "8.00"),
      e(["Double Chicken Bratwurst Pasta", "Double Chicken"], "8.90"),
      e("Mushroom & Prawn Pasta", "11.90"),
      e("XL Chicken Cutlet Pasta", "8.90"),
      e("Breaded Dory Pasta", "8.50"),
      e("Breaded Seabass Pasta", "11.50"),
      e(["Cheesy Chicken Chop Pasta", "Cheesy Chicken"], "8.90"),
      e(["Grilled Chicken Chop", "Grilled Chicken Chop (Black Pepper / Mushroom / Brown Sauce)"], "7.70"),
      e("Prime Ribeye Steak", "16.50"),
      e("Double Up Chicken Chop", "12.30"),
      e("Cheesy Chicken Chop", "8.90"),
      e("XL Chicken Cutlet", "8.90"),
      e("Breaded Dory", "8.50"),
      e("Breaded Seabass", "11.50"),
      e("Lime Herb Butter Salmon", "11.50"),
      e("Salmon & Chicken Combo", "16.00"),
      e("Double Chicken Bratwurst", "8.90"),
      e("Onion Ring (5pcs)", null, { optional: true }),
      e(["Saute Garlic Mushroom", "Sauteed Garlic Mushroom"], null, { optional: true }),
    ],
  },
  {
    id: "E3",
    file: "E3-satay-sets.jpg",
    challenge: "set prices beside stick counts that are not prices; a large price; a GST note",
    entries: [
      e("Set A", "31.20", { prefix: true }),
      e("Set B", "49", { prefix: true }),
      e("Set C", "78", { prefix: true }),
      e("Set D", "116", { prefix: true }),
      e("Set E", "156", { prefix: true }),
      e("Set F", "223", { prefix: true }),
    ],
  },
  { id: "E4", file: "E4-kopitiam-glare.jpg", challenge: "lamination glare over one name; shared rows such as 'Coffee / Tea'; merchandise sizes; photo captions with prices", entries: KOPITIAM },
  {
    id: "E5",
    file: "E5-western-angled.jpg",
    challenge: "angled photo whose price tags sit above their rows; Chinese beside English, English names only; a camera date stamp",
    entries: [
      e("Mussels In Cream w Rice", "10.00"),
      e("Bouillabaisse (Fish Stew) w Rice", "11.00"),
      e(["Mixed Grill (Fish, Chicken, Sausage, Fried Egg & Fries)", "Mixed Grill"], "15.90", { prefix: true }),
      ...["Margherita:10.00", "Hawaiian:12.00", "Mushroom and Ham:13.90", "Pepperoni:13.90", "Chicken:13.90"].map((row) => {
        const [name, price] = row.split(":");
        return e([`${name} Pizza`, `${name} 11"`, `${name} Pizza 11"`, name === "Chicken" ? "Chicken Pizza" : name], price);
      }),
      e("Ham Carbonara", "8.90"),
      e("Chicken Aglio Olio", "8.90"),
      e("Clams in Tomato Sauce", "9.00"),
      e("Sizzling Chicken Cheese Burger", "12.00"),
      e("Sizzling Beef Cheese Burger", "12.90"),
      e("Striploin w Pepper Sauce", "14.90"),
      e("Salmon Filet w Lemon Sauce", "14.90"),
      e("Boneless Chicken Leg w Mushroom Sauce", "10.00"),
      e("Chicken Burger", "9.00"),
      e("Beef Burger", "9.90"),
      e("Double Beef Burger", "12.90"),
      e("Crispy Mid-Wings (5pcs)", "7.00"),
      e("Chicken Nuggets (6pcs)", "5.00"),
      e("French Fries", "5.00"),
      e("Truffle Fries", "7.00"),
    ],
  },
  { id: "E6", file: "E6-kopitiam-rotated.jpg", challenge: "E4 turned 90 degrees in its pixels", entries: KOPITIAM },
];

// Pre-registered thresholds (00-status.md). A candidate passes only if every one holds.
export const THRESHOLD = {
  minFoundShare: 0.9, // required entries matched, over all six photos
  minCorrectPriceShare: 0.9, // price outcomes correct among found required entries
  maxWrongFilledPrices: 2, // any filled price that differs from the expected one, over all six photos
  maxMedianLatencyMs: 30_000,
  maxLatencyMs: durationMs("T_MENU_MODEL"), // every call finishes inside the model budget
};

// Provisional bounds for the evaluation only, above any expected need, so the observed usage is
// not cut short. They also set the worst case the spend guard assumes for each call.
const EVAL_MAX_INPUT_TOKENS = 60_000;
const EVAL_MAX_OUTPUT_TOKENS = 16_000;

// USD micros per million tokens, standard tier, read 2026-10-15 (00-status.md).
export const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 100_000, output: 500_000 },
  "gpt-4o-mini": { input: 150_000, output: 600_000 },
  "gpt-5.6-luna": { input: 200_000, output: 1_200_000 },
  "gpt-5.4-nano": { input: 200_000, output: 1_250_000 },
  // Round 2 candidates, read 2026-10-15.
  "gpt-4.1-mini": { input: 400_000, output: 1_600_000 },
  "gpt-5.4-mini": { input: 750_000, output: 4_500_000 },
  "gpt-4.1": { input: 2_000_000, output: 8_000_000 },
  "gpt-6.1-sol": { input: 2_000_000, output: 10_000_000 },
  "gpt-5.6-terra": { input: 2_000_000, output: 12_000_000 },
  "gpt-5.4": { input: 2_500_000, output: 15_000_000 },
};

export function norm(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === "w" ? "with" : w));
  // A leading item code such as "17", "M1" or "P3" is not part of the name.
  if (words.length > 1 && /^[a-z]?\d{1,3}[a-z]?$/.test(words[0])) words.shift();
  return words.join(" ");
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
}

export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const x = bigrams(a);
  const y = bigrams(b);
  let common = 0;
  for (const [k, n] of x) common += Math.min(n, y.get(k) ?? 0);
  return (2 * common) / (a.length - 1 + (b.length - 1));
}

const MATCH_AT = 0.8;

function aliasKeys(entry: Entry): string[] {
  const keys = new Set<string>();
  for (const alias of entry.aliases) {
    keys.add(norm(alias));
    keys.add(norm(alias.replace(/\([^)]*\)/g, " ")));
  }
  return [...keys].filter(Boolean);
}

function score(entry: Entry, key: string): number {
  let best = 0;
  for (const alias of aliasKeys(entry)) {
    best = Math.max(best, dice(alias, key));
    if (entry.prefix && key.startsWith(`${alias} `)) best = Math.max(best, 0.95);
  }
  return best;
}

type DraftRow = { name: string; portion: string | null; priceSgdCents: number | null; priceBasis: string };
type EntryResult = { expected: string; price: string | null; optional: boolean; matched: DraftRow[]; found: boolean; correct: boolean; wrongFilled: number };

const cents = (price: string) => Math.round(Number(price) * 100);

export function scoreDraft(entries: Entry[], rows: DraftRow[]) {
  const keyOf = (row: DraftRow) => norm(`${row.name} ${row.portion ?? ""}`);
  const used = new Set<number>();
  const matched = new Map<number, number[]>();
  const pairs: { s: number; ei: number; ri: number }[] = [];
  entries.forEach((entry, ei) =>
    rows.forEach((row, ri) => {
      const s = score(entry, keyOf(row));
      if (s >= MATCH_AT) pairs.push({ s, ei, ri });
    }),
  );
  pairs.sort((a, b) => b.s - a.s || a.ei - b.ei || a.ri - b.ri);
  for (const p of pairs) {
    if (matched.has(p.ei) || used.has(p.ri)) continue;
    matched.set(p.ei, [p.ri]);
    used.add(p.ri);
  }
  // A shared row listed part by part counts as found only when every part is found.
  entries.forEach((entry, ei) => {
    if (matched.has(ei) || !entry.split) return;
    const parts: number[] = [];
    for (const part of entry.split) {
      const ri = rows.findIndex((row, i) => !used.has(i) && !parts.includes(i) && dice(norm(part), keyOf(row)) >= 0.9);
      if (ri < 0) return;
      parts.push(ri);
    }
    parts.forEach((ri) => used.add(ri));
    matched.set(ei, parts);
  });

  const results: EntryResult[] = entries.map((entry, ei) => {
    const got = (matched.get(ei) ?? []).map((ri) => rows[ri]);
    const want = entry.price === null ? null : cents(entry.price);
    const wrongFilled = got.filter((row) => row.priceSgdCents !== null && row.priceSgdCents !== want).length;
    return {
      expected: entry.aliases[0],
      price: entry.price,
      optional: entry.optional === true,
      matched: got,
      found: got.length > 0,
      correct: got.length > 0 && got.every((row) => row.priceSgdCents === want),
      wrongFilled,
    };
  });
  const extras = rows.filter((_, ri) => !used.has(ri));
  const required = results.filter((r) => !r.optional);
  return {
    required: required.length,
    found: required.filter((r) => r.found).length,
    correct: required.filter((r) => r.correct).length,
    wrongFilled: results.reduce((n, r) => n + r.wrongFilled, 0) + extras.filter((row) => row.priceSgdCents !== null).length,
    entries: results,
    extras,
  };
}

async function browserShrink(file: Uint8Array): Promise<Uint8Array> {
  const meta = await sharp(file).metadata();
  const scale = Math.min(1, 2_048 / Math.max(meta.width ?? 1, meta.height ?? 1));
  for (const quality of [90, 80, 70, 60, 50]) {
    const out = await sharp(file)
      .rotate()
      .resize({ width: Math.max(1, Math.round((meta.width ?? 1) * scale)) })
      .jpeg({ quality })
      .toBuffer();
    if (out.byteLength <= 2_097_152) return new Uint8Array(out);
  }
  throw new Error("shrink failed");
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const args = process.argv.slice(2);
  const round = args[0]?.startsWith("--round=") ? Number(args.shift()!.slice("--round=".length)) : 1;
  const [limitArg, ...models] = args;
  const limitUsdMicros = Math.round(Number(limitArg) * 1_000_000);
  if (!(limitUsdMicros > 0) || models.length === 0) throw new Error("usage: <spend-limit-usd> <model> [<model> ...]");
  for (const model of models) if (!PRICES[model]) throw new Error(`no recorded price for ${model}`);
  loadLocalEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  const photos = [];
  for (const photo of PHOTOS) {
    const shrunk = await browserShrink(readFileSync(join(".maintenance-build/s11-eval-photos", photo.file)));
    const normalized = await normalizeMenuJpeg(shrunk);
    if (!normalized.ok) throw new Error(`${photo.id} refused by normalizeMenuJpeg: ${normalized.reason}`);
    photos.push({ photo, jpeg: normalized.jpeg, width: normalized.width, height: normalized.height, bytes: normalized.jpeg.byteLength });
  }

  let spentUsdMicros = 0;
  const runs = [];
  let stopped: string | null = null;
  for (const model of models) {
    const bounds: MenuModelBounds = {
      model,
      inputUsdMicrosPerMillionTokens: PRICES[model].input,
      outputUsdMicrosPerMillionTokens: PRICES[model].output,
      maxInputTokens: EVAL_MAX_INPUT_TOKENS,
      maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS,
    };
    for (const { photo, jpeg, width, height, bytes } of photos) {
      if (spentUsdMicros + reserveUsdMicros(bounds) > limitUsdMicros) {
        stopped = `stopped before ${model} ${photo.id}: worst case ${reserveUsdMicros(bounds)} micros would pass the limit`;
        break;
      }
      const started = performance.now();
      const call = await draftMenuFromPhoto({ jpeg, model, apiKey, bounds, budgetMs: durationMs("T_MENU_MODEL"), signal: new AbortController().signal });
      const latencyMs = Math.round(performance.now() - started);
      const costUsdMicros = actualUsdMicros(bounds, { inputTokens: call.inputTokens, outputTokens: call.outputTokens });
      spentUsdMicros += costUsdMicros;
      const validation = call.kind === "ok" ? validateVisionDraft(call.raw) : null;
      const rows: DraftRow[] = validation?.ok ? validation.items.map((item) => ({ ...item, priceSgdCents: item.priceSgdCents === null ? null : Number(item.priceSgdCents) })) : [];
      const scored = scoreDraft(photo.entries, rows);
      runs.push({
        model,
        photo: photo.id,
        sent: { width, height, bytes },
        outcome: call.kind,
        error: call.kind === "provider_error" ? call.error : null,
        validation: validation === null ? null : validation.ok ? "ok" : validation.reason,
        latencyMs,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        rowsReturned: rows.length,
        costUsdMicros,
        score: { required: scored.required, found: scored.found, correct: scored.correct, wrongFilled: scored.wrongFilled },
        entries: scored.entries,
        extras: scored.extras,
        raw: call.kind === "ok" ? call.raw : null,
      });
      console.log(`${model} ${photo.id}: ${call.kind}/${validation === null ? "-" : validation.ok ? "ok" : validation.reason} ${latencyMs} ms, found ${scored.found}/${scored.required}, correct ${scored.correct}, wrong filled ${scored.wrongFilled}, ${costUsdMicros} micros`);
    }
    if (stopped) break;
  }

  const summary = models.map((model) => {
    const mine = runs.filter((r) => r.model === model);
    const required = mine.reduce((n, r) => n + r.score.required, 0);
    const found = mine.reduce((n, r) => n + r.score.found, 0);
    const correct = mine.reduce((n, r) => n + r.score.correct, 0);
    const wrongFilled = mine.reduce((n, r) => n + r.score.wrongFilled, 0);
    const latencies = mine.map((r) => r.latencyMs);
    const complete = mine.length === PHOTOS.length && mine.every((r) => r.validation === "ok");
    const pass =
      complete &&
      found / required >= THRESHOLD.minFoundShare &&
      correct / Math.max(1, found) >= THRESHOLD.minCorrectPriceShare &&
      wrongFilled <= THRESHOLD.maxWrongFilledPrices &&
      median(latencies) <= THRESHOLD.maxMedianLatencyMs &&
      Math.max(...latencies) < THRESHOLD.maxLatencyMs;
    return {
      model,
      runs: mine.length,
      complete,
      required,
      found,
      correct,
      wrongFilled,
      medianLatencyMs: median(latencies),
      maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
      maxInputTokens: Math.max(0, ...mine.map((r) => r.inputTokens ?? 0)),
      maxOutputTokens: Math.max(0, ...mine.map((r) => r.outputTokens ?? 0)),
      costUsdMicros: mine.reduce((n, r) => n + r.costUsdMicros, 0),
      pass,
    };
  });
  const out = { round, ranAt: new Date().toISOString(), promptVersion: MENU_VISION_PROMPT_VERSION, limitUsdMicros, spentUsdMicros, stopped, threshold: THRESHOLD, summary, runs };
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), round === 1 ? "s11-vision-eval.json" : `s11-vision-eval-round${round}.json`), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ spentUsdMicros, stopped, summary }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
