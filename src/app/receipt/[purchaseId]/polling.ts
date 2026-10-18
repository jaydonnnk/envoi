// Receipt polling (S3): while a purchase is not terminal, re-read Envoi's stored state at most every
// 2 seconds for at most 60 seconds. Each poll is a read of stored state only; provider reads come
// from "Check status" and the webhook, debounced by T_PROVIDER_READ_DEBOUNCE.

import { startBoundedPolling, type PollerDeps as BoundedPollerDeps } from "@/lib/browser/polling";

export { POLL_INTERVAL_MS, POLL_LIMIT_MS } from "@/lib/browser/polling";

// States in which nothing can change any more without a new review.
const TERMINAL = new Set(["paid", "unpaid_closed", "review_expired", "review_invalidated", "superseded"]);

export function isTerminalPurchaseState(state: string): boolean {
  return TERMINAL.has(state);
}

// settled is false while a paid or closed PYUSD purchase's window scan is still running (S17), so a
// detected extra transfer can still appear; it is absent for PayPal.
export type PolledState = { state: string; attemptState: string | null; settled?: boolean };

export type PollerDeps = BoundedPollerDeps<PolledState>;

// Starts polling from the state the page rendered. Returns a stop function. A terminal, settled state
// stops polling for good, whether it was rendered or polled.
export function startReceiptPolling(initial: PolledState, deps: PollerDeps): () => void {
  return startBoundedPolling(
    initial,
    {
      isDone: (polled) => isTerminalPurchaseState(polled.state) && polled.settled !== false,
      same: (a, b) => a.state === b.state && a.attemptState === b.attemptState && a.settled === b.settled,
    },
    deps,
  );
}
