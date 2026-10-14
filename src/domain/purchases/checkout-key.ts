import { createHash } from "node:crypto";

// Logical checkout identity (Gate 3, Checkout identity). Two requests that differ in any priced or
// routed input get different keys: a changed menu revision is a different checkout, never a
// mutated one.

export type RailId = "paypal" | "pyusd";
export type PurchaseLine = { menuItemId: string; quantity: number };

export type CheckoutKeyInput = {
  buyerUserId: string;
  outletId: string;
  menuRevisionId: string;
  destinationId: string;
  rail: RailId;
  currency: "SGD";
  lines: readonly PurchaseLine[];
  pyusdRateVersionId: string | null; // required for "pyusd", null for "paypal"
};

export type CheckoutKey = string & { readonly __brand: "CheckoutKey" };

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;

export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;
}

export function computeCheckoutKey(input: CheckoutKeyInput): CheckoutKey {
  for (const line of input.lines) {
    if (!isValidQuantity(line.quantity)) throw new RangeError(`quantity must be ${MIN_QUANTITY}..${MAX_QUANTITY}`);
  }
  const lines = [...input.lines]
    .sort((a, b) => (a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0))
    .map((line) => [line.menuItemId, line.quantity]);
  // Positional array, so the hash input has one canonical form whatever the object key order.
  const canonical = JSON.stringify([
    "checkout-key-v1",
    input.buyerUserId,
    input.outletId,
    input.menuRevisionId,
    input.destinationId,
    input.rail,
    input.currency,
    lines,
    input.pyusdRateVersionId,
  ]);
  return createHash("sha256").update(canonical).digest("hex") as CheckoutKey;
}

// Rail-independent basket identity (Gate 3 BasketLockKey, S7). It deliberately leaves out the rail,
// destination, menu revision and rate, so the same items on a republished menu or a changed
// destination are the same basket. Lines name each item by its key, which a revision copied from
// the published one keeps, not by the revision-specific item id. Migration 0017 backfills stored
// purchases with this exact form, so the two must change together.
export type BasketLockKey = string & { readonly __brand: "BasketLockKey" };
export type BasketLockLine = { itemKey: string; quantity: number };

export function computeBasketLockKey(input: { buyerUserId: string; outletId: string; lines: readonly BasketLockLine[] }): BasketLockKey {
  for (const line of input.lines) {
    if (!isValidQuantity(line.quantity)) throw new RangeError(`quantity must be ${MIN_QUANTITY}..${MAX_QUANTITY}`);
  }
  const lines = [...input.lines]
    .sort((a, b) => (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0))
    .map((line) => `${line.itemKey}:${line.quantity}`)
    .join(",");
  return createHash("sha256").update(["basket-lock-v1", input.buyerUserId, input.outletId, lines].join("\n")).digest("hex") as BasketLockKey;
}
