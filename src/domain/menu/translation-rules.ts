import type { StoredTranslatedItem } from "@/lib/db/schema";

// The rules a translated menu name must pass, free of any database import so that the receipt's Show
// the stall panel (S42) applies the same rules in the browser as the route applied before storing.

const MAX_TRANSLATED_NAME_CHARS = 80;
const MAX_EXPLANATION_CHARS = 160;

export type TranslatedItem = StoredTranslatedItem;

const chars = (text: string) => Array.from(text).length;

// Signs that read as a price. S$ and US$ hold $.
const CURRENCY_SIGNS = ["$", "¥", "€", "£", "元"];

// The digits and currency signs in text that the original name does not hold. Both are compared in
// NFKC, so a full-width "１" or "＄" counts as "1" or "$".
function addsNumberOrCurrency(text: string, original: string): boolean {
  const source = original.normalize("NFKC");
  const added = text.normalize("NFKC");
  for (const digit of added.match(/\p{Nd}/gu) ?? []) if (!source.includes(digit)) return true;
  return CURRENCY_SIGNS.some((sign) => added.includes(sign) && !source.includes(sign));
}

// Keeps a proposed item only when its id is one of the revision's items (once), its name is 1 to 80
// characters, its explanation at most 160, and neither holds a digit or currency sign the original
// name lacks. A dropped item shows its original name alone.
export function keepSafeTranslations(original: readonly { id: string; name: string }[], proposed: readonly TranslatedItem[]): TranslatedItem[] {
  const names = new Map(original.map((item) => [item.id, item.name]));
  const seen = new Set<string>();
  return proposed.flatMap((item) => {
    const originalName = names.get(item.itemId);
    if (originalName === undefined || seen.has(item.itemId)) return [];
    seen.add(item.itemId);
    const name = item.name.trim();
    const explanation = item.explanation?.trim() || null;
    if (chars(name) < 1 || chars(name) > MAX_TRANSLATED_NAME_CHARS) return [];
    if (explanation !== null && chars(explanation) > MAX_EXPLANATION_CHARS) return [];
    if (addsNumberOrCurrency(`${name}\n${explanation ?? ""}`, originalName)) return [];
    return [{ itemId: item.itemId, name, explanation }];
  });
}
