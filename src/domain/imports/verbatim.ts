import { createHash } from "node:crypto";
import type { DraftItemSuggestion } from "@/domain/menu/types";
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
