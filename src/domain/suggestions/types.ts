import type { OutletSearch, PublishedItemName, PublishedOutletSummary } from "@/domain/outlets/search";

// Gate 3 "Suggestions and handoffs". A suggestion names registered outlets and items only; any
// price shown with it is read from the published registry, never from the model.

export type SuggestionRequest = { text: string; area?: string };

export type PublishedItemSummary = { id: string; name: string; unitSgdCents: number; available: boolean | null };

export type SuggestionGap = "area" | "item" | "outlet";

export type Suggestion =
  | { kind: "outlets"; matches: PublishedOutletSummary[] }
  | { kind: "items"; outletId: string; outlet: PublishedOutletSummary; matches: PublishedItemSummary[] }
  | { kind: "clarification"; question: string; missing: SuggestionGap[] }
  | { kind: "no_match" }
  | { kind: "budget_exceeded" };

// What the model may answer: ids and gaps, never names it made up or prices. Every array and the
// area are re-checked against the registry and the buyer's own words before anything is shown.
export type ModelProposal = {
  kind: "outlets" | "items" | "clarification" | "no_match";
  outletIds: string[];
  outletId: string | null;
  itemIds: string[];
  area: string | null;
  missing: SuggestionGap[];
};

export type PublishedMenuForModel = {
  outlet: { id: string; name: string; area: string };
  items: { id: string; name: string; available: boolean | null }[];
};

// The three read-only tools. None returns a price.
export type SuggestionTools = {
  searchOutlets(search: OutletSearch): Promise<PublishedOutletSummary[]>;
  getPublishedMenu(outletId: string): Promise<PublishedMenuForModel | null>;
  listItemNames(area: string | null): Promise<PublishedItemName[]>;
};

export type ModelOutcome =
  | { kind: "proposal"; proposal: ModelProposal; toolCalls: number }
  | { kind: "budget_exceeded"; reason: "tool_calls" | "time"; toolCalls: number }
  | { kind: "failed"; toolCalls: number };

// The AI adapter (src/integrations/ai/openai.ts) enforces T_AI_BUDGET from startedAt and the
// three-call tool budget.
export type SuggestionModel = {
  readonly name: string;
  propose(request: { text: string; area: string | null }, tools: SuggestionTools, startedAt: Date): Promise<ModelOutcome>;
};
