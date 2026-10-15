// Merchant orders polling (S8), within the S3 bounds: while any listed order can still change state,
// re-read the outlet's orders at most every 2 seconds for at most 60 seconds. Each poll is a read of
// stored state only.

import { isTerminalPurchaseState } from "@/app/receipt/[purchaseId]/polling";
import { startBoundedPolling, type PollerDeps } from "@/lib/browser/polling";

export type PolledOrder = { id: string; state: string; attemptState: string | null; acknowledgedAt: string | null };

const fingerprint = (orders: readonly PolledOrder[]) => orders.map((order) => `${order.id}:${order.state}:${order.attemptState}:${order.acknowledgedAt}`).join(",");

// The newest page, as a poll reads it, ahead of every order already shown that it does not include.
// No order is ever dropped: an order never leaves the list once it is one, so an order a newer one
// pushed off the newest page, and every older page loaded, stays in place, in the same order.
export function withNewest<T extends { id: string }>(shown: readonly T[], newest: readonly T[]): T[] {
  const ids = new Set(newest.map((order) => order.id));
  return [...newest, ...shown.filter((order) => !ids.has(order.id))];
}

// An older page after every order already shown, without repeating one.
export function withOlder<T extends { id: string }>(shown: readonly T[], older: readonly T[]): T[] {
  const ids = new Set(shown.map((order) => order.id));
  return [...shown, ...older.filter((order) => !ids.has(order.id))];
}

export function startOrdersPolling(initial: readonly PolledOrder[], deps: PollerDeps<readonly PolledOrder[]>): () => void {
  return startBoundedPolling(initial, { isDone: (orders) => orders.every((order) => isTerminalPurchaseState(order.state)), same: (a, b) => fingerprint(a) === fingerprint(b) }, deps);
}
