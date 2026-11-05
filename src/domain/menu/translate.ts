import { and, eq } from "drizzle-orm";
import { getPublishedMenu } from "@/domain/outlets/search";
import { menuTranslations } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import type { TranslationCall } from "@/integrations/ai/menu-translate";
import { keepSafeTranslations, type TranslatedItem } from "./translation-rules";

export { keepSafeTranslations, type TranslatedItem };

// The menu explained and translated (S29; Gate 2 second build plan amendment, "Menu explained and
// translated"). The translated text only ever sits beside the shop's own names: prices, availability
// and original names always come from the published menu, and nothing here reaches a review, receipt,
// PayPal order or merchant view.

// A browser language's lower-cased primary subtag, such as "zh" from "zh-CN".
export const LANGUAGE_SUBTAG = /^[a-z]{2,3}$/;

// The language's English name for the model's instructions, or null when the tag is not a primary
// language subtag a runtime knows. A well-formed tag that names no language, such as "zzz" or
// "und", is refused too, so it cannot buy a model call or a stored row.
export function languageName(language: string): string | null {
  if (!LANGUAGE_SUBTAG.test(language)) return null;
  return new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(language) ?? null;
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
