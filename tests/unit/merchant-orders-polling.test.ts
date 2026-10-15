import { afterEach, describe, expect, it, vi } from "vitest";
import { startOrdersPolling, type PolledOrder } from "@/app/merchant/orders/polling";

// S8: the merchant orders view polls within the S3 bounds, asserted as the approved literals.
describe("merchant orders polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const order = (id: string, state: string, attemptState: string | null = null, acknowledgedAt: string | null = null): PolledOrder => ({ id, state, attemptState, acknowledgedAt });

  function poller(answers: PolledOrder[][], initial: PolledOrder[]) {
    vi.useFakeTimers();
    const fetches: number[] = [];
    const changes: (readonly PolledOrder[])[] = [];
    const startedAt = Date.now();
    startOrdersPolling(initial, {
      fetchState: async () => {
        fetches.push(Date.now() - startedAt);
        return answers.shift() ?? answers.at(-1) ?? initial;
      },
      onChange: (next) => changes.push(next),
      schedule: (run, ms) => setTimeout(run, ms),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
    });
    return { fetches, changes };
  }

  it("merchant orders polling stays within the S3 bounds", async () => {
    // An order that can still change keeps the view polling: every 2 seconds, for at most 60.
    const open = poller([], [order("pur_a", "paid", "capture_confirmed"), order("pur_b", "pending_payment", "order_created")]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(open.fetches).toHaveLength(30);
    expect(open.fetches[0]).toBe(2_000);
    expect(open.fetches.at(-1)).toBeLessThanOrEqual(60_000);
    expect(open.fetches.every((at, index) => index === 0 || at - open.fetches[index - 1]! >= 2_000)).toBe(true);
    vi.useRealTimers();

    // Once every listed order is terminal, polling stops for good.
    const settling = poller(
      [[order("pur_a", "paid", "capture_confirmed"), order("pur_b", "unpaid_closed", "abandoned")]],
      [order("pur_a", "paid", "capture_confirmed"), order("pur_b", "pending_payment", "order_created")],
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settling.fetches).toEqual([2_000]);
    expect(settling.changes).toHaveLength(1);
    vi.useRealTimers();

    // A page rendered with only terminal orders does not poll at all.
    const settled = poller([], [order("pur_a", "paid", "capture_confirmed", "2026-10-15T01:00:00.000Z"), order("pur_c", "review_expired")]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled.fetches).toEqual([]);
  });
});
