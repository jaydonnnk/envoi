import { createHash } from "node:crypto";
import type { DraftItemSuggestion } from "@/domain/menu/types";
import { MenuVisionOutput } from "@/integrations/ai/menu-vision";
import { MENU_LIMITS } from "@/domain/menu/types";
import { sgdFromCents, sgdFromDecimalString } from "@/lib/money";
import { MENU_IMPORT_LIMITS } from "./types";

// Model output to draft suggestions (Gate 3 "Menu and imports"). The whole result is refused only
// when it is malformed, empty or breaks a bound; every price problem stays with its own item, which
// keeps a blank price and says why. A price is never repaired, guessed or defaulted to zero.

export type VisionDraftValidation =
  | { ok: true; items: DraftItemSuggestion[]; fingerprint: string; blankPriceCount: number }
  | { ok: false; reason: "malformed" | "empty" | "too_many_rows" | "text_too_long" | "oversize" };

type Priced = Pick<DraftItemSuggestion, "priceSgdCents" | "priceBasis">;

function priceOf(priceText: string | null, currency: "sgd_or_unmarked" | "other" | null): Priced {
  if (priceText === null) return { priceSgdCents: null, priceBasis: "blank" };
  if (currency === "other") return { priceSgdCents: null, priceBasis: "other_currency" };
  const cents = currency === "sgd_or_unmarked" ? sgdFromDecimalString(priceText.trim()) : null;
  // Zero, too many decimals, signs, exponents and anything above the menu's price cap stay blank.
  if (cents === null || cents <= 0 || cents > MENU_LIMITS.maxPriceSgdCents) return { priceSgdCents: null, priceBasis: "ambiguous" };
  return { priceSgdCents: sgdFromCents(cents), priceBasis: "explicit" };
}

const variantKey = (item: { name: string; portion: string | null }) => `${item.name.trim().toLowerCase()}\u0000${(item.portion ?? "").trim().toLowerCase()}`;

export function validateVisionDraft(raw: unknown): VisionDraftValidation {
  const parsed = MenuVisionOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  const rows = parsed.data.items;
  if (rows.length > MENU_IMPORT_LIMITS.maxRows) return { ok: false, reason: "too_many_rows" };

  const kept = rows.filter((row) => row.name !== null || row.portion !== null || row.priceText !== null || row.currency !== null);
  if (kept.length === 0) return { ok: false, reason: "empty" };
  if (kept.some((row) => (row.name ?? "").length > MENU_IMPORT_LIMITS.maxTextChars || (row.portion ?? "").length > MENU_IMPORT_LIMITS.maxTextChars)) {
    return { ok: false, reason: "text_too_long" };
  }

  const items: DraftItemSuggestion[] = kept.map((row) => ({
    name: (row.name ?? "").trim(),
    portion: row.portion === null || row.portion.trim() === "" ? null : row.portion.trim(),
    ...priceOf(row.priceText, row.currency),
  }));

  // Two rows with the same name and portion are variants the photo does not tell apart: both keep a
  // blank price for the merchant to resolve, whichever price each printed.
  const counts = new Map<string, number>();
  for (const item of items) if (item.name !== "") counts.set(variantKey(item), (counts.get(variantKey(item)) ?? 0) + 1);
  for (const item of items) {
    if (item.name !== "" && (counts.get(variantKey(item)) ?? 0) > 1) {
      item.priceSgdCents = null;
      item.priceBasis = "duplicate_variant";
    }
  }

  const serialized = JSON.stringify(items);
  if (new TextEncoder().encode(serialized).byteLength > MENU_IMPORT_LIMITS.maxResultBytes) return { ok: false, reason: "oversize" };
  return {
    ok: true,
    items,
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
    blankPriceCount: items.filter((item) => item.priceSgdCents === null).length,
  };
}
