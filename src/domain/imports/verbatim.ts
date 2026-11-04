import { createHash } from "node:crypto";
import type { DraftItemSuggestion } from "@/domain/menu/types";
import type { Money } from "@/lib/money";
import type { VisionDraftValidation } from "./validate-result";

// The verbatim rule of a web menu import (S24; Gate 2 web menu import, rule 7). A drafted price is
// kept only when the same digits are printed in the page text, and an item only when its name is.
// It stops invented digits, not a printed price paired with the wrong printed item (R22).

type ValidDraft = Extract<VisionDraftValidation, { ok: true }>;

// A run of digits with at most one decimal point and at most two decimals, optionally after "$" or
// "S$". The lookarounds keep "4.905" or "12.3.4" from yielding a shorter number inside them.
const PRICE_TOKEN = /(S?\$\s?)?(?<![\d.])(\d{1,6})(?:\.(\d{1,2}))?(?!\d|\.\d)/g;

function cents(whole: string, fraction: string | undefined): number {
  return Number(whole) * 100 + Number((fraction ?? "").padEnd(2, "0"));
}

// Every price-shaped number printed in the text, in SGD cents: "4.90" and "4.9" both give 490,
// "49" gives 4900.
export function pagePriceTokens(text: string): Set<number> {
  const tokens = new Set<number>();
  for (const match of text.matchAll(PRICE_TOKEN)) tokens.add(cents(match[2]!, match[3]));
  return tokens;
}

// Whether the text prints at least one SGD-like price: a number after "$", "S$" or "SGD", or a
// number with exactly two decimals. Opening hours and phone numbers alone do not count.
export function hasPrintedPrice(text: string): boolean {
  for (const match of text.matchAll(PRICE_TOKEN)) {
    if (match[1] !== undefined || match[3]?.length === 2) return true;
    const before = text.slice(Math.max(0, match.index - 4), match.index);
    if (/SGD\s?$/i.test(before)) return true;
  }
  return false;
}

const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function keepPrintedOnly(draft: ValidDraft, pageText: string): { draft: ValidDraft; droppedNames: number } {
  const tokens = pagePriceTokens(pageText);
  const page = fold(pageText);
  const items: DraftItemSuggestion[] = [];
  let droppedNames = 0;
  for (const item of draft.items) {
    const name = fold(item.name);
    // An empty name is not a name printed on the page.
    if (name === "" || !page.includes(name)) {
      droppedNames += 1;
      continue;
    }
    if (item.priceMinor !== null && !tokens.has(item.priceMinor)) items.push({ ...item, priceMinor: null, priceBasis: "not_on_page" });
    else items.push({ ...item });
  }
  const serialized = JSON.stringify(items);
  return {
    draft: {
      ok: true,
      items,
      fingerprint: createHash("sha256").update(serialized).digest("hex"),
      blankPriceCount: items.filter((item) => item.priceMinor === null).length,
    },
    droppedNames,
  };
}

const EXCERPT_MAX = 120;
const nameSource = (word: string) => word.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

// The page's own words around a drafted name (S30; Gate 2 draft review aids), at most 120 characters,
// or null when the name is not found. It prefers the occurrence nearest the drafted price and the
// line that holds them. It helps the merchant check a price and proves nothing: a number on the page
// does not prove which dish it is for (R22). The result goes in the web import's answer only, never
// to the database, a log or a trace.
export function excerptFor(pageText: string, name: string, price: Money | null): string | null {
  const words = name.normalize("NFKC").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const page = pageText.normalize("NFKC");
  const occurrences = [...page.matchAll(new RegExp(words.map(nameSource).join("\\s+"), "giu"))];
  const first = occurrences[0];
  if (!first) return null;
  const printed = price === null ? [] : [...page.matchAll(PRICE_TOKEN)].filter((token) => cents(token[2]!, token[3]) === price.minor);

  let span = { start: first.index, end: first.index + first[0].length };
  let spanCost = Number.POSITIVE_INFINITY;
  for (const occurrence of occurrences) {
    const nameEnd = occurrence.index + occurrence[0].length;
    for (const token of printed) {
      const start = Math.min(occurrence.index, token.index);
      const end = Math.max(nameEnd, token.index + token[0].length);
      // A price on the name's own line beats a nearer one across lines, which belongs to another row.
      // On a tie the price printed after the name wins: that is how a menu line usually reads.
      const cost = end - start + (page.slice(start, end).includes("\n") ? EXCERPT_MAX : 0) + (token.index < occurrence.index ? 1 : 0);
      if (end - start <= EXCERPT_MAX && cost < spanCost) {
        span = { start, end };
        spanCost = cost;
      }
    }
  }

  const lineStart = page.lastIndexOf("\n", span.start - 1) + 1;
  const lineEndAt = (from: number) => {
    const end = page.indexOf("\n", from);
    return end === -1 ? page.length : end;
  };
  let lineEnd = lineEndAt(span.end);
  // A name alone on its line with no drafted price: the next line may say why, like "ask staff".
  if (price === null && page.slice(lineStart, lineEnd).trim() === page.slice(span.start, span.end)) {
    lineEnd = (/^\s*[^\n]*/.exec(page.slice(lineEnd))?.[0].length ?? 0) + lineEnd;
  }

  const spare = EXCERPT_MAX - (span.end - span.start);
  let from = Math.max(lineStart, span.start - Math.floor(spare / 2));
  let to = Math.min(lineEnd, from + EXCERPT_MAX);
  from = Math.max(lineStart, to - EXCERPT_MAX);
  // A cut line loses its partial words, never the name or the price.
  if (from > lineStart) {
    const space = page.indexOf(" ", from);
    if (space !== -1 && space < span.start) from = space + 1;
  }
  if (to < lineEnd) {
    const space = page.lastIndexOf(" ", to);
    if (space >= span.end) to = space;
  }
  return page.slice(from, to).replace(/\s+/g, " ").trim();
}
