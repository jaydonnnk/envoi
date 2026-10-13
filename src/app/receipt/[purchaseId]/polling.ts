// Receipt polling (S3): while a purchase is not terminal, re-read Envoi's stored state at most every
// 2 seconds for at most 60 seconds. Each poll is a read of stored state only; provider reads come
// from "Check status" and the webhook, debounced by T_PROVIDER_READ_DEBOUNCE.

export const POLL_INTERVAL_MS = 2_000;
export const POLL_LIMIT_MS = 60_000;

// States in which nothing can change any more without a new review.
const TERMINAL = new Set(["paid", "unpaid_closed", "review_expired", "review_invalidated", "superseded"]);

export function isTerminalPurchaseState(state: string): boolean {
  return TERMINAL.has(state);
}

export type PolledState = { state: string; attemptState: string | null };

export type PollerDeps = {
  fetchState: () => Promise<PolledState | null>; // null: this poll failed; keep trying until the limit
  onChange: (next: PolledState) => void;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  now: () => number;
};

// Starts polling from the state the page rendered. Returns a stop function. A terminal state stops
// polling for good, whether it was rendered or polled.
export function startReceiptPolling(initial: PolledState, deps: PollerDeps): () => void {
  if (isTerminalPurchaseState(initial.state)) return () => {};
  const startedAt = deps.now();
  let current = initial;
  let stopped = false;
  let handle: unknown = null;

  const tick = async () => {
    if (stopped) return;
    const next = await deps.fetchState();
    if (stopped) return;
    if (next && (next.state !== current.state || next.attemptState !== current.attemptState)) {
      current = next;
      deps.onChange(next);
    }
    if (isTerminalPurchaseState(current.state)) {
      stopped = true;
      return;
    }
    if (deps.now() - startedAt + POLL_INTERVAL_MS > POLL_LIMIT_MS) {
      stopped = true;
      return;
    }
    handle = deps.schedule(() => void tick(), POLL_INTERVAL_MS);
  };

  handle = deps.schedule(() => void tick(), POLL_INTERVAL_MS);
  return () => {
    stopped = true;
    deps.cancel(handle);
  };
}
