import type { SgdCents } from "@/lib/money";

// Menu drafts (Gate 3 "Menu and imports"). A draft revision belongs to one outlet; buyers read only
// a published, confirmed revision.

export type MenuItemDraft = {
  id: string;
  name: string;
  portion: string | null;
  priceSgdCents: SgdCents | null;
  availability: "available" | "unavailable" | "unknown";
  source: "merchant" | "import_suggestion";
};

export type MenuCompleteness =
  | { complete: true; itemCount: number }
  | { complete: false; incompleteItemIds: string[]; reason: "missing_price" | "missing_name" | "missing_availability" };

// The draft as the merchant sees it. `version` is the conflict token every write and confirmation
// must name; `status` is confirmed only while the exact confirmed version is unchanged.
export type MenuDraft = {
  outletId: string;
  revisionId: string;
  version: number;
  status: "draft" | "confirmed";
  confirmedAt: Date | null;
  // True when this is the published menu itself: there are no unpublished changes. Saving changes to
  // it creates a new draft revision; buyers keep reading this one until the next publication.
  published: boolean;
  items: MenuItemDraft[];
  completeness: MenuCompleteness;
};

// One item as the merchant submits it. An item without an id is new; an id must already belong to
// this draft revision. A price is whole cents above zero or null, never a guess.
export type MenuItemInput = {
  id?: string;
  name: string;
  portion: string | null;
  priceSgdCents: number | null;
  availability: MenuItemDraft["availability"];
};

// The same bounds the photo import uses (Gate 3 MENU_IMPORT_LIMITS: 100 rows, 120 characters).
export const MENU_LIMITS = { maxItems: 100, maxTextChars: 120, maxPriceSgdCents: 100_000 } as const;

// One row a menu photo import suggests (S11). A blank price says why it is blank; it is never zero.
export type DraftItemSuggestion = {
  name: string; // "" when unreadable; completeness then blocks confirmation
  portion: string | null;
  priceSgdCents: SgdCents | null;
  priceBasis: "explicit" | "ambiguous" | "blank" | "other_currency" | "duplicate_variant" | "not_on_page";
};

// The result of merging suggestions into a draft. `added` holds the new items, in order, with the
// ids they get; a suggestion that matches an existing item by name and portion adds nothing, so the
// merchant's own version of that item stands. Suggestions past the menu's item cap are skipped and
// counted.
export type DraftMerge =
  | { applied: true; added: MenuItemDraft[]; addedItemIds: string[]; preservedMerchantEditIds: string[]; skippedForCapacity: number }
  | { applied: false; reason: "base_revision_changed" | "confirmed_revision" };
