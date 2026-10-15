// Merchant orders polling (S8), within the S3 bounds: while any listed order can still change state,
// re-read the outlet's orders at most every 2 seconds for at most 60 seconds. Each poll is a read of
// stored state only.

import { isTerminalPurchaseState } from "@/app/receipt/[purchaseId]/polling";
import { startBoundedPolling, type PollerDeps } from "@/lib/browser/polling";

export type PolledOrder = { id: string; state: string; attemptState: string | null; acknowledgedAt: string | null };

const fingerprint = (orders: readonly PolledOrder[]) => orders.map((order) => `${order.id}:${order.state}:${order.attemptState}:${order.acknowledgedAt}`).join(",");

export function startOrdersPolling(initial: readonly PolledOrder[], deps: PollerDeps<readonly PolledOrder[]>): () => void {
  return startBoundedPolling(initial, { isDone: (orders) => orders.every((order) => isTerminalPurchaseState(order.state)), same: (a, b) => fingerprint(a) === fingerprint(b) }, deps);
}
