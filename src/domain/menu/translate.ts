import { and, eq } from "drizzle-orm";
import { getPublishedMenu } from "@/domain/outlets/search";
import { menuTranslations, type StoredTranslatedItem } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import type { TranslationCall } from "@/integrations/ai/menu-translate";

// The menu explained and translated (S29; Gate 2 second build plan amendment, "Menu explained and
// translated"). The translated text only ever sits beside the shop's own names: prices, availability
// and original names always come from the published menu, and nothing here reaches a review, receipt,
// PayPal order or merchant view.

// A browser language's lower-cased primary subtag, such as "zh" from "zh-CN".
export const LANGUAGE_SUBTAG = /^[a-z]{2,3}$/;

export const MAX_TRANSLATED_NAME_CHARS = 80;
export const MAX_EXPLANATION_CHARS = 160;

export type TranslatedItem = StoredTranslatedItem;

// The language's English name for the model's instructions, or null when the tag is not a primary
// language subtag a runtime knows. A well-formed tag that names no language, such as "zzz" or
// "und", is refused too, so it cannot buy a model call or a stored row.
export function languageName(language: string): string | null {
  if (!LANGUAGE_SUBTAG.test(language)) return null;
  return new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(language) ?? null;
}

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

export type MenuTranslator = {
  model: string;
  translate(items: readonly { id: string; name: string }[], language: { tag: string; name: string }): Promise<TranslationCall>;
};

export type TranslationResult =
  | { kind: "ok"; menuRevisionId: string; language: string; items: TranslatedItem[] }
  | { kind: "not_found" }
  | { kind: "unavailable" };

// Reads the outlet's published revision in the language; on a miss makes one model call, keeps the
// safe items and inserts with on conflict do nothing, then reads again, so two concurrent misses store
// one row and both answer with it. translator is null when translation is off.
export async function getOrCreateTranslation(db: Db, outletId: string, language: string, now: Date, translator: MenuTranslator | null): Promise<TranslationResult> {
  const name = languageName(language);
  if (name === null) return { kind: "not_found" };
  const menu = await getPublishedMenu(db, outletId);
  if (!menu) return { kind: "not_found" };

  const stored = () =>
    db
      .select({ items: menuTranslations.items })
      .from(menuTranslations)
      .where(and(eq(menuTranslations.menuRevisionId, menu.menuRevisionId), eq(menuTranslations.language, language)))
      .limit(1);
  const answer = (items: TranslatedItem[]): TranslationResult => ({ kind: "ok", menuRevisionId: menu.menuRevisionId, language, items });

  const [hit] = await stored();
  if (hit) return answer(hit.items);
  if (!translator) return { kind: "unavailable" };

  const original = menu.items.map((item) => ({ id: item.id, name: item.name }));
  const call = await translator.translate(original, { tag: language, name });
  if (call.kind !== "ok") return { kind: "unavailable" };
  const kept = keepSafeTranslations(original, call.output.items);
  // English buyers get explanations only: the shop's own name is never rewritten.
  const items = language === "en" ? kept.map((item) => ({ ...item, name: original.find((entry) => entry.id === item.itemId)!.name })) : kept;

  await db.insert(menuTranslations).values({ menuRevisionId: menu.menuRevisionId, language, items, model: translator.model, createdAt: now }).onConflictDoNothing();
  const [row] = await stored();
  return row ? answer(row.items) : { kind: "unavailable" };
}
