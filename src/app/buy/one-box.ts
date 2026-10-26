"use client";

// The one-box answers: the words of Gate 1's `buyer-one-box.html` and the in-memory basket of Gate 2's
// one-box ordering point 5. Shared by the client components, so it holds no React and no database.
//
// The proposal travels in memory from the suggestion response to the shop page. It is never put in a
// URL, a query string or storage, so a reload, a shared link or a bookmark finds nothing and the
// basket then starts empty, which is the safe answer. The directive above keeps this module on the
// browser side of the boundary: a held proposal belongs to one browser, never to the server process.

export type BasketLine = { id: string; quantity: number };
export type BasketProposal = { outletId: string; lines: BasketLine[] };

let held: BasketProposal | null = null;
const listeners = new Set<() => void>();

export function holdBasketProposal(proposal: BasketProposal): void {
  held = proposal;
  for (const listener of listeners) listener();
}

export function subscribeBasketProposal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The proposal held for this shop, or null. Reading does not consume it, so a remount sees the same
// basket; the browser drops it when this document goes, and nothing else does.
export function basketProposalFor(outletId: string): BasketProposal | null {
  return held !== null && held.outletId === outletId ? held : null;
}

// The server's snapshot, and the one the browser uses while it hydrates: nothing is held there, so
// the first paint matches the HTML the server sent and the proposal appears on the next render.
export function noBasketProposal(): null {
  return null;
}

// The address a basket answer opens: the shop, and nothing about the basket.
export function shopHref(outletId: string): string {
  return `/buy?outlet=${encodeURIComponent(outletId)}`;
}

// The mockup spells the count out ("Two published items fit") and keeps the quantity a digit ("puts 2
// in the basket"). A choose answer shows at most MAX_MATCHES items, so five words cover every case.
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function nameWords(name: string): string[] {
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
}

// The question names the phrase the buyer used, rebuilt from the words every matching item name
// shares, so it is Envoi's own wording and never the model's: "Iced lemon tea" and "Iced milk tea"
// ask "Which iced tea?".
export function chooseHeading(names: readonly string[]): string {
  const [first, ...rest] = names;
  if (first === undefined) return "Which one?";
  const shared = nameWords(first).filter((word) => rest.every((name) => nameWords(name).includes(word)));
  return shared.length > 0 ? `Which ${shared.join(" ")}?` : "Which one?";
}

export function chooseSummary(matchCount: number, quantity: number): string {
  return `${countWord(matchCount)} published items fit. Pick one, and Envoi puts ${quantity} in the basket.`;
}

export function unavailableHeading(itemNames: readonly string[], outletName: string): string {
  return `${itemNames.join(", ")} ${itemNames.length === 1 ? "is" : "are"} unavailable at ${outletName} today`;
}
