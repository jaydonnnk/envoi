import { getPublishedMenu, listPublishedItemNames, listPublishedOutlets, searchPublishedOutlets, type PublishedMenuItem, type PublishedOutletSummary } from "@/domain/outlets/search";
import { MAX_SUGGESTED_QUANTITY, type ModelProposal, type PublishedItemSummary, type Suggestion, type SuggestionGap, type SuggestionModel, type SuggestionRequest, type SuggestionTools } from "@/domain/suggestions/types";
import type { BuyerPrincipal } from "@/lib/auth-context";
import type { Db } from "@/lib/db/web";
import { log } from "@/lib/log";

export const MAX_TEXT_LENGTH = 280;
export const MAX_AREA_LENGTH = 80;
const MAX_MATCHES = 5;

export type SuggestionResult = Suggestion | { kind: "unavailable" };

// Server-written questions. The model's own wording is never shown, so it cannot put a price,
// a payee or a "nearest" claim in front of the buyer.
const QUESTIONS: Record<SuggestionGap, string> = {
  area: "Which area are you in? For example, Tanjong Pagar.",
  item: "What would you like to buy?",
  outlet: "Which shop are you at?",
};

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Words that point at the buyer's position without naming a place. Envoi has no location, so
// "near me" names no area and must be asked about rather than guessed.
const VAGUE_PLACE_WORDS = new Set(["near", "nearby", "nearest", "closest", "close", "around", "me", "my", "here", "this", "location", "area", "the", "by", "in", "at", "to"]);

export function usableArea(value: string | null | undefined): string | null {
  if (!value) return null;
  const words = normalize(value).split(" ").filter((word) => word.length > 0 && !VAGUE_PLACE_WORDS.has(word));
  return words.length > 0 ? words.join(" ") : null;
}

// Whole words only: both sides are normalized to words joined by single spaces, so "an" is not
// found in "tanjong pagar" or in "kaya toast and kopi", and a one-letter area from the model
// cannot pass for one the buyer wrote.
export function containsWords(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

function inArea(outlet: PublishedOutletSummary, area: string): boolean {
  const outletArea = normalize(outlet.area);
  return containsWords(outletArea, area) || containsWords(area, outletArea);
}

function clarify(missing: SuggestionGap[]): Suggestion {
  const gaps = missing.length > 0 ? [...new Set(missing)] : (["item"] as SuggestionGap[]);
  return { kind: "clarification", question: gaps.map((gap) => QUESTIONS[gap]).join(" "), missing: gaps };
}

export function suggestionTools(db: Db): SuggestionTools {
  return {
    // The model passes areas the way buyers write them ("near Tanjong Pagar"); only the place
    // words reach the search.
    searchOutlets: (search) => searchPublishedOutlets(db, { area: usableArea(search.area), name: search.name }),
    getPublishedMenu: async (outletId) => {
      const menu = await getPublishedMenu(db, outletId);
      if (!menu) return null;
      return {
        outlet: { id: menu.outlet.id, name: menu.outlet.name, area: menu.outlet.area },
        items: menu.items.map((item) => ({ id: item.id, name: item.name, available: item.available })),
      };
    },
    listItemNames: (area) => listPublishedItemNames(db, usableArea(area)),
  };
}

// Turns the model's proposal into a suggestion the buyer may see. Ids not in the published registry
// are dropped, prices come from the registry, and an outlet or item answer needs an area the buyer
// stated (in the area field or in their own words), a shop the buyer named, or the shop whose id the
// buyer sent. Nothing here writes: a suggestion is a proposal the buyer still has to review.
async function settle(db: Db, req: SuggestionRequest, proposal: ModelProposal): Promise<Suggestion> {
  if (proposal.kind === "no_match") return { kind: "no_match" };
  if (proposal.kind === "clarification") return clarify(proposal.missing.filter((gap) => gap in QUESTIONS));

  const text = normalize(req.text);
  const proposedArea = usableArea(proposal.area);
  const area = usableArea(req.area) ?? (proposedArea && containsWords(text, proposedArea) ? proposedArea : null);
  const published = await listPublishedOutlets(db, 500);
  const named = new Set(published.filter((outlet) => containsWords(text, normalize(outlet.name))).map((outlet) => outlet.id));
  // Settle rule 2: an outletId the buyer sent widens the scope and nothing else, and only when it is
  // a published outlet. An unknown or unpublished one answers exactly as if it were absent.
  const sent = req.outletId !== undefined && published.some((outlet) => outlet.id === req.outletId) ? req.outletId : null;
  // Settle rule 1: the buyer named the shop, stated an area, or sent the shop's id.
  if (!area && named.size === 0 && sent === null) return clarify(["area"]);

  const inScope = (outlet: PublishedOutletSummary) => named.has(outlet.id) || outlet.id === sent || (area !== null && inArea(outlet, area));
  const byId = new Map(published.map((outlet) => [outlet.id, outlet]));

  if (proposal.kind === "outlets") {
    const matches = [...new Set(proposal.outletIds)]
      .map((id) => byId.get(id))
      .filter((outlet): outlet is PublishedOutletSummary => outlet !== undefined && inScope(outlet))
      .slice(0, MAX_MATCHES);
    return matches.length > 0 ? { kind: "outlets", matches } : { kind: "no_match" };
  }

  const outlet = proposal.outletId ? byId.get(proposal.outletId) : undefined;
  if (!outlet || !inScope(outlet)) return { kind: "no_match" };
  const menu = await getPublishedMenu(db, outlet.id);
  if (!menu) return { kind: "no_match" };

  if (proposal.kind === "basket") return settleBasket(outlet, menu.items, proposal.lines);
  if (proposal.kind === "choose") return settleChoice(outlet, menu.items, proposal.choices, proposal.lines.map((line) => line.quantity));

  const wanted = new Set(proposal.itemIds);
  const matches: PublishedItemSummary[] = summarize(
    menu.items.filter((item) => wanted.has(item.id) && item.unitSgdCents !== null && item.available !== false).slice(0, MAX_MATCHES),
  );
  return matches.length > 0 ? { kind: "items", outletId: outlet.id, outlet, matches } : { kind: "outlets", matches: [outlet] };
}

function summarize(items: readonly PublishedMenuItem[]): PublishedItemSummary[] {
  return items.map((item) => ({ id: item.id, name: item.name, unitSgdCents: item.unitSgdCents as number, available: item.available }));
}

function suggestedQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_SUGGESTED_QUANTITY;
}

// Settle rules 3 to 5. An item the shop published but marked unavailable is named, because dropping
// it silently would leave the buyer believing the whole sentence was understood; the model's quantity
// for it is dropped. A quantity outside the bound asks again rather than reaching a clamped basket.
function settleBasket(outlet: PublishedOutletSummary, items: readonly PublishedMenuItem[], lines: readonly { itemId: string; quantity: number }[]): Suggestion {
  const asked = new Map<string, number>();
  for (const line of lines) if (!asked.has(line.itemId)) asked.set(line.itemId, line.quantity);

  const unavailable = items.filter((item) => asked.has(item.id) && item.available === false).map((item) => ({ id: item.id, name: item.name }));
  if (unavailable.length > 0) return { kind: "unavailable_item", outletId: outlet.id, outlet, items: unavailable };
  if ([...asked.values()].some((quantity) => !suggestedQuantity(quantity))) return clarify(["item"]);

  const kept = summarize(
    items.filter((item) => asked.has(item.id) && item.unitSgdCents !== null && item.available !== false && suggestedQuantity(asked.get(item.id) as number)).slice(0, MAX_MATCHES),
  ).map((item) => ({ item, quantity: asked.get(item.id) as number }));
  // Nothing the buyer asked for is on this menu: show the shop so they can pick from it, as the item
  // answer does, rather than claiming no shop matched.
  return kept.length > 0 ? { kind: "basket", outletId: outlet.id, outlet, lines: kept } : { kind: "outlets", matches: [outlet] };
}

// Settle rule 6: a choice keeps only published, priced, available ids; one survivor is the basket the
// buyer meant, and none is no match. ModelProposal carries quantities in "lines" only, so the one
// quantity the buyer gave for the phrase is the single distinct quantity there; without exactly one,
// the answer asks again rather than picking a number for them.
function settleChoice(outlet: PublishedOutletSummary, items: readonly PublishedMenuItem[], choices: readonly string[], quantities: readonly number[]): Suggestion {
  const asked = [...new Set(quantities)];
  if (asked.length !== 1 || !suggestedQuantity(asked[0] as number)) return clarify(["item"]);
  const quantity = asked[0] as number;
  const offered = new Set(choices);
  const matches = summarize(
    items.filter((item) => offered.has(item.id) && item.unitSgdCents !== null && item.available !== false).slice(0, MAX_MATCHES),
  );
  if (matches.length === 0) return { kind: "no_match" };
  const [only] = matches;
  if (matches.length === 1) return { kind: "basket", outletId: outlet.id, outlet, lines: [{ item: only as PublishedItemSummary, quantity }] };
  return { kind: "choose", outletId: outlet.id, outlet, quantity, matches };
}

export async function suggestFromText(db: Db, principal: BuyerPrincipal, req: SuggestionRequest, now: Date, model: SuggestionModel): Promise<SuggestionResult> {
  const outcome = await model.propose({ text: req.text, area: req.area ?? null }, suggestionTools(db), now);
  const fields = { model: model.name, outcome: outcome.kind, toolCalls: outcome.toolCalls, ms: Date.now() - now.getTime(), anonymous: principal.isAnonymous };
  if (outcome.kind === "failed") {
    log("warn", "ai_suggestion", fields);
    return { kind: "unavailable" };
  }
  if (outcome.kind === "budget_exceeded") {
    log("info", "ai_suggestion", { ...fields, reason: outcome.reason });
    return { kind: "budget_exceeded" };
  }
  const suggestion = await settle(db, req, outcome.proposal);
  log("info", "ai_suggestion", { ...fields, suggestion: suggestion.kind });
  return suggestion;
}
