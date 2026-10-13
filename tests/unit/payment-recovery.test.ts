import { afterEach, describe, expect, it, vi } from "vitest";
import { POLL_INTERVAL_MS, POLL_LIMIT_MS, startReceiptPolling, type PolledState } from "@/app/receipt/[purchaseId]/polling";
import { canTransitionAttempt } from "@/domain/payments/state";
import { CREATE_REPLAY_REFUSED, decideCreateRecovery, isDefinitiveRefusal } from "@/domain/purchases/reconcile";
import { derivePurchaseView, type PaymentAttemptRow, type PurchaseRow } from "@/domain/purchases/state";

describe("create recovery", () => {
  const lost = { state: "create_unknown", orderId: null, outcomeReason: "create_timeout" };

  it("create_unknown without an order id is recreatable", () => {
    // A replay comes first; recreation only after PayPal refused that replay outright.
    expect(decideCreateRecovery(lost)).toBe("replay_same_key");
    expect(decideCreateRecovery({ ...lost, outcomeReason: `${CREATE_REPLAY_REFUSED}:422:INVALID_REQUEST` })).toBe("safe_to_recreate");
    // Once an order id was stored, never: Envoi could capture that order.
    expect(decideCreateRecovery({ ...lost, orderId: "FIXTURE-ORDER-1", outcomeReason: "no_sandbox_approval_link" })).toBe("block_uncertain");
    expect(decideCreateRecovery({ ...lost, orderId: "FIXTURE-ORDER-1", outcomeReason: `${CREATE_REPLAY_REFUSED}:422:INVALID_REQUEST` })).toBe("block_uncertain");
    expect(decideCreateRecovery({ ...lost, state: "order_created", orderId: "FIXTURE-ORDER-1" })).toBe("block_uncertain");
  });

  it("only a 4xx naming issue codes is a definitive refusal", () => {
    expect(isDefinitiveRefusal({ kind: "http_error", status: 422, retryable: false, issues: "UNPROCESSABLE_ENTITY,ORDER_NOT_APPROVED" })).toBe(true);
    expect(isDefinitiveRefusal({ kind: "http_error", status: 403, retryable: false, issues: "NOT_AUTHORIZED,PAYEE_NOT_CONSENTED" })).toBe(true);
    for (const status of [408, 409, 429, 500, 503]) expect(isDefinitiveRefusal({ kind: "http_error", status, retryable: true, issues: "SOME_ISSUE" })).toBe(false);
    expect(isDefinitiveRefusal({ kind: "http_error", status: 422, retryable: false })).toBe(false);
    expect(isDefinitiveRefusal({ kind: "timeout", responseReceived: false })).toBe(false);
    expect(isDefinitiveRefusal({ kind: "network_error", retryable: true })).toBe(false);
  });
});

describe("capture_unknown", () => {
  it("capture_unknown never becomes abandoned", () => {
    expect(canTransitionAttempt("capture_unknown", "abandoned")).toBe(false);
    // Not even once the review window has long passed: it still reads uncertain, never closed.
    const purchase = { state: "uncertain", reviewExpiresAt: new Date("2026-10-13T00:00:00Z") } as PurchaseRow;
    const attempt = { state: "capture_unknown" } as PaymentAttemptRow;
    expect(derivePurchaseView(purchase, attempt, new Date("2026-10-14T00:00:00Z"))).toEqual({ state: "uncertain", paypalAttempt: "capture_unknown" });
  });
});

describe("receipt polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function poller(answers: PolledState[], initial: PolledState = { state: "pending_payment", attemptState: "capture_unknown" }) {
    vi.useFakeTimers();
    const fetches: number[] = [];
    const changes: PolledState[] = [];
    const startedAt = Date.now();
    const stop = startReceiptPolling(initial, {
      fetchState: async () => {
        fetches.push(Date.now() - startedAt);
        return answers.shift() ?? answers.at(-1) ?? initial;
      },
      onChange: (next) => changes.push(next),
      schedule: (run, ms) => setTimeout(run, ms),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
    });
    return { fetches, changes, stop };
  }

  it("polling stops at a terminal state", async () => {
    const pending = { state: "uncertain", attemptState: "capture_unknown" };
    const paid = { state: "paid", attemptState: "capture_confirmed" };
    const { fetches, changes } = poller([pending, paid, paid, paid]);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(fetches).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS * 2]);
    expect(changes.at(-1)).toEqual(paid);
    await vi.advanceTimersByTimeAsync(POLL_LIMIT_MS);
    expect(fetches).toHaveLength(2);
  });

  it("polls at most every 2 seconds for at most 60 seconds, and not at all from a terminal page", async () => {
    // The approved cadence as literals, so a change to the module's constants fails here too.
    const { fetches } = poller([{ state: "pending_payment", attemptState: "capture_unknown" }]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetches).toHaveLength(30);
    expect(fetches[0]).toBe(2_000);
    expect(fetches.at(-1)).toBeLessThanOrEqual(60_000);
    expect(fetches.every((at, index) => index === 0 || at - fetches[index - 1]! >= 2_000)).toBe(true);
    vi.useRealTimers();

    const terminal = poller([], { state: "paid", attemptState: "capture_confirmed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(terminal.fetches).toEqual([]);
  });
});
