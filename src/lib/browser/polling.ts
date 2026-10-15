// Bounded browser polling (S3 bounds, shared by the receipt and, since S8, the merchant orders view):
// re-read Envoi's stored state at most every 2 seconds for at most 60 seconds, and stop for good once
// the polled state is done. Each poll is a read of stored state only; no poll calls a provider.

export const POLL_INTERVAL_MS = 2_000;
export const POLL_LIMIT_MS = 60_000;

export type PollerDeps<T> = {
  fetchState: () => Promise<T | null>; // null: this poll failed; keep trying until the limit
  onChange: (next: T) => void;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  now: () => number;
};

export type PollRule<T> = {
  isDone: (state: T) => boolean;
  same: (a: T, b: T) => boolean;
};

// Starts polling from the state the page rendered. Returns a stop function. A done state stops
// polling for good, whether it was rendered or polled.
export function startBoundedPolling<T>(initial: T, rule: PollRule<T>, deps: PollerDeps<T>): () => void {
  if (rule.isDone(initial)) return () => {};
  const startedAt = deps.now();
  let current = initial;
  let stopped = false;
  let handle: unknown = null;

  const tick = async () => {
    if (stopped) return;
    const next = await deps.fetchState();
    if (stopped) return;
    if (next && !rule.same(next, current)) {
      current = next;
      deps.onChange(next);
    }
    if (rule.isDone(current)) {
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
