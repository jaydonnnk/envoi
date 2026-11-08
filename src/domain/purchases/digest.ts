import { and, eq } from "drizzle-orm";
import { enrollments } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { formatMoney, money, type Currency } from "@/lib/money";
import type { SalesSummary } from "./sales-summary";

// The weekly summary written by AI (S47; Gate 2 "Flow: digest", Gate 3 S47 amendment 2026-11-08).
// Code computes every figure. The model writes only a template holding placeholder names, and never
// sees a figure, an order or the shop. A template holding any number of its own, or any placeholder
// code did not offer, is refused, and the desk shows no summary. No digest is stored.

export const DIGEST_PLACEHOLDERS = ["paid_total", "paid_count", "net_total", "fee_total"] as const;
export type DigestPlaceholder = (typeof DIGEST_PLACEHOLDERS)[number];

// English, 中文, Melayu and தமிழ், as the S42 stall card labels them.
export const DIGEST_LANGUAGES = ["en", "zh", "ms", "ta"] as const;
export type DigestLanguage = (typeof DIGEST_LANGUAGES)[number];

// Code-formatted strings. A null figure is not offered to the model, and its placeholder in a template
// counts as unknown.
export type DigestFigures = { paid_total: string; paid_count: string; net_total: string | null; fee_total: string | null };

export type DigestModel = (input: { language: DigestLanguage; placeholders: readonly DigestPlaceholder[] }) => Promise<string | null>;

// The route's answer: the seven Singapore dates it covers, and an empty week, a refused template or
// one filled paragraph per currency. A refusal carries no text.
export type DigestAnswer = {
  from: string;
  to: string;
  digest: { kind: "empty" } | { kind: "refused" } | { kind: "ok"; paragraphs: { currency: Currency; text: string }[] };
};

export type FilledDigest = { kind: "ok"; text: string } | { kind: "refused"; reason: "digit" | "unknown_placeholder" };

// Any Unicode number character: ASCII, Tamil and every other script's digits, and fractions.
const NUMBER_CHARACTER = /\p{N}/u;
// Chinese numerals are letters to Unicode, so they are listed. 一 also starts ordinary words such as
// 一起; refusing those is the safer failure (Gate 3 least confident decision 7).
const CHINESE_NUMERAL = /[〇零一二两兩三四五六七八九十百千万萬亿億壹贰貳叁參肆伍陆陸柒捌玖拾佰仟]/u;
// Whole words only, in any case. "a" and "an" are articles here, not counts.
const LATIN_NUMBER_WORDS = [
  // English
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "hundreds", "thousand", "thousands", "million",
  "millions", "billion", "dozen", "dozens", "twice", "thrice", "half",
  // Malay
  "kosong", "sifar", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "lapan", "sembilan", "sepuluh",
  "sebelas", "belas", "puluh", "seratus", "ratus", "ratusan", "seribu", "ribu", "ribuan", "sejuta", "juta", "bilion",
  "separuh", "setengah",
];
const LATIN_NUMBER_WORD = new RegExp(`(?<![\\p{L}\\p{M}])(?:${LATIN_NUMBER_WORDS.join("|")})(?![\\p{L}\\p{M}])`, "iu");
// Tamil words take suffixes that change their last vowel (ஐந்து, ஐந்தாவது, ஐந்தும்), so a word that
// starts with a number's stem is refused. Short numbers whose stem begins ordinary words (ஆறு, river
// or six; ஆற்றல், power) are refused only as whole words. ஒரு, the article, is not listed. A stem that
// begins an unrelated word is refused anyway; that is the safer failure.
const TAMIL_NUMBER_STEMS = [
  "பூஜ்ஜிய", "ஒன்ற", "இரண்ட", "மூன்ற", "நான்க", "ஐந்த", "ஒன்பத", "இருபத", "முப்பத", "நாற்பத", "ஐம்பத",
  "அறுபத", "எழுபத", "எண்பத", "தொண்ணூற", "ஆயிர", "லட்ச",
];
const TAMIL_NUMBER_WORDS = ["ஆறு", "ஏழு", "எட்டு", "பத்து", "நூறு", "நூற்று", "கோடி", "பாதி"];
const TAMIL_NUMBER_WORD = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:(?:${TAMIL_NUMBER_STEMS.join("|")})|(?:${TAMIL_NUMBER_WORDS.join("|")})(?![\\p{L}\\p{M}]))`,
  "u",
);

const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

function holdsNumber(template: string): boolean {
  return NUMBER_CHARACTER.test(template) || CHINESE_NUMERAL.test(template) || LATIN_NUMBER_WORD.test(template) || TAMIL_NUMBER_WORD.test(template);
}

// The template is checked before anything is substituted, and substitution is one pass, so a figure
// is never scanned and a value that looks like a placeholder is never replaced again.
export function fillDigest(template: string, figures: DigestFigures): FilledDigest {
  if (holdsNumber(template)) return { kind: "refused", reason: "digit" };
  for (const [, name] of template.matchAll(PLACEHOLDER)) {
    if (!(DIGEST_PLACEHOLDERS as readonly string[]).includes(name!) || figures[name as DigestPlaceholder] === null) return { kind: "refused", reason: "unknown_placeholder" };
  }
  if (/[{}]/.test(template.replaceAll(PLACEHOLDER, ""))) return { kind: "refused", reason: "unknown_placeholder" };
  return { kind: "ok", text: template.replaceAll(PLACEHOLDER, (_, name: DigestPlaceholder) => figures[name]!) };
}

// Fee and net are offered only when PayPal gave every fee in every currency, so the summary never
// calls a partly known net what reached the shop and never turns an unknown fee into zero.
export function offeredPlaceholders(summaries: readonly SalesSummary[]): DigestPlaceholder[] {
  return summaries.every((summary) => summary.unknownFeeCount === 0) ? [...DIGEST_PLACEHOLDERS] : ["paid_total", "paid_count"];
}

export function digestFigures(summary: SalesSummary, offerFees: boolean): DigestFigures {
  const format = (minor: number) => formatMoney(money(summary.currency, minor));
  return {
    paid_total: format(summary.paidMinor),
    paid_count: String(summary.paidCount),
    net_total: offerFees ? format(summary.knownNetMinor) : null,
    fee_total: offerFees ? format(summary.knownFeeMinor) : null,
  };
}

// Fills one template once per currency, in the summaries' order, so SGD and USD are never added
// together. Any refusal refuses the whole digest.
export function composeDigest(summaries: readonly SalesSummary[], template: string): Extract<DigestAnswer["digest"], { kind: "ok" }> | Extract<FilledDigest, { kind: "refused" }> {
  const offerFees = offeredPlaceholders(summaries).includes("fee_total");
  const paragraphs: { currency: Currency; text: string }[] = [];
  for (const summary of summaries) {
    const filled = fillDigest(template, digestFigures(summary, offerFees));
    if (filled.kind === "refused") return filled;
    paragraphs.push({ currency: summary.currency, text: filled.text });
  }
  return { kind: "ok", paragraphs };
}

export async function hasApprovedEnrollment(db: Pick<Db, "select">, outletId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.outletId, outletId), eq(enrollments.status, "approved")))
    .limit(1);
  return row !== undefined;
}
