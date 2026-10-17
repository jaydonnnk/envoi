import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { canTransitionAttempt, isPreCapture, PRE_CAPTURE_STATES, type AttemptState } from "@/domain/payments/state";
import { pyusdAttemptLocks, type PyusdAttemptState } from "@/domain/pyusd/state";
import { paymentAttempts, purchases, type PURCHASE_STATES } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";

// Purchase lifecycle (Gate 3, State transitions: Purchase) and the view derived on read.

export type PurchaseState = (typeof PURCHASE_STATES)[number];
export type PurchaseRow = typeof purchases.$inferSelect;
export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;

export type PurchaseTransition = { from: PurchaseState; to: PurchaseState; reason: string };

const PURCHASE_TRANSITIONS: Record<PurchaseState, readonly PurchaseState[]> = {
  review_open: ["review_expired", "review_invalidated", "superseded", "pending_payment"],
  pending_payment: ["paid", "uncertain", "unpaid_closed"],
  uncertain: ["paid", "unpaid_closed"],
  paid: [],
  review_expired: [],
  review_invalidated: [],
  superseded: [],
  unpaid_closed: [],
};

// The only reasons that may move a purchase into paid. pyusd_confirmed is the hint or scan
// verification that bound a finalized transfer (S16).
const PAID_REASONS = new Set(["capture_confirmed", "pyusd_confirmed"]);

export function canTransitionPurchase(t: PurchaseTransition): boolean {
  if (!PURCHASE_TRANSITIONS[t.from].includes(t.to)) return false;
  return t.to !== "paid" || PAID_REASONS.has(t.reason);
}

// The basket lock (Gate 3, S7 and S16): why money can still move for a purchase, derived on read
// with no stored lock and no maintenance dependency.
export type BasketLockReason = "paypal_capture_in_flight" | "paypal_review_window" | "pyusd_attempt_open" | "purchase_uncertain";

export type PurchaseLockView = {
  purchaseState: PurchaseState; // as stored; the derivation below needs no stored transition
  reviewExpiresAt: Date;
  paypalAttempt: AttemptState | null; // the purchase's latest attempt, when it is a PayPal one
  pyusdAttempt: PyusdAttemptState | null; // the purchase's PYUSD attempt, if any
};

// Pure. Money can still move while a capture was dispatched or its outcome is unknown, while an
// attempt that never dispatched a capture is still inside its review window, while a PYUSD attempt
// is in any state other than confirmed or closed_unpaid, and while the purchase is uncertain. Once
// T_REVIEW passes, a PayPal attempt that never dispatched a capture can never send one, so it stops
// locking even while its purchase is still stored as pending_payment. T_REVIEW never ends a PYUSD
// attempt's lock: its released transaction can land until its block-height bound.
export function moneyCanStillMove(view: PurchaseLockView, now: Date): BasketLockReason | null {
  if (view.paypalAttempt === "capture_dispatched" || view.paypalAttempt === "capture_unknown") return "paypal_capture_in_flight";
  if (view.paypalAttempt !== null && isPreCapture(view.paypalAttempt) && now.getTime() < view.reviewExpiresAt.getTime()) return "paypal_review_window";
  if (view.pyusdAttempt !== null && pyusdAttemptLocks(view.pyusdAttempt)) return "pyusd_attempt_open";
  if (view.purchaseState === "uncertain") return "purchase_uncertain";
  return null;
}

// The lock view of a stored purchase and its latest attempt, split by the attempt's rail.
export function lockViewOf(purchase: Pick<PurchaseRow, "state" | "reviewExpiresAt">, attempt: Pick<PaymentAttemptRow, "rail" | "state"> | null): PurchaseLockView {
  return {
    purchaseState: purchase.state as PurchaseState,
    reviewExpiresAt: purchase.reviewExpiresAt,
    paypalAttempt: attempt && attempt.rail !== "pyusd" ? (attempt.state as AttemptState) : null,
    pyusdAttempt: attempt && attempt.rail === "pyusd" ? (attempt.state as PyusdAttemptState) : null,
  };
}

// Extra transfers join this view in S17.
export type PurchaseView = { state: PurchaseState; paypalAttempt: AttemptState | null; pyusdAttempt: PyusdAttemptState | null };

// Pure. A review past T_REVIEW reads expired. A PayPal attempt that never dispatched a capture
// reads abandoned once T_REVIEW passes, and its purchase unpaid_closed: no capture can be sent
// for it any more, so the approval at PayPal can never move money. Once a PYUSD attempt is prepared,
// T_REVIEW no longer applies to it.
export function derivePurchaseView(purchase: PurchaseRow, attempt: PaymentAttemptRow | null, now: Date): PurchaseView {
  const expired = now.getTime() >= purchase.reviewExpiresAt.getTime();
  const state = purchase.state as PurchaseState;
  const pyusdAttempt = attempt?.rail === "pyusd" ? (attempt.state as PyusdAttemptState) : null;
  const attemptState = attempt && attempt.rail !== "pyusd" ? (attempt.state as AttemptState) : null;
  if (state === "review_open" && expired) return { state: "review_expired", paypalAttempt: attemptState, pyusdAttempt };
  if (state === "pending_payment" && expired && attemptState !== null && isPreCapture(attemptState)) {
    return { state: "unpaid_closed", paypalAttempt: "abandoned", pyusdAttempt: null };
  }
  return { state, paypalAttempt: attemptState, pyusdAttempt };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Compare-and-set from one of `from` to `to`. Throws on a transition the table forbids: that is a
// programming error, never a runtime outcome. Returns whether this call moved the row.
export async function transitionPurchase(db: Db | Tx, purchaseId: string, from: readonly PurchaseState[], to: PurchaseState, reason: string): Promise<boolean> {
  for (const state of from) {
    if (!canTransitionPurchase({ from: state, to, reason })) throw new Error(`illegal purchase transition ${state} -> ${to} (${reason})`);
  }
  const moved = await db
    .update(purchases)
    .set({ state: to })
    .where(and(eq(purchases.id, purchaseId), inArray(purchases.state, [...from])))
    .returning({ id: purchases.id });
  return moved.length === 1;
}

// Stores what derivePurchaseView reads, by compare-and-set, at any touch. Best effort: no
// buyer-visible state and no decision waits for it.
export async function storeDerivedTransitions(tx: Db | Tx, purchaseId: string, now: Date): Promise<void> {
  await tx
    .update(purchases)
    .set({ state: "review_expired" })
    .where(and(eq(purchases.id, purchaseId), eq(purchases.state, "review_open"), lte(purchases.reviewExpiresAt, now)));

  for (const state of PRE_CAPTURE_STATES) {
    if (!canTransitionAttempt(state, "abandoned")) throw new Error(`illegal attempt transition ${state} -> abandoned`);
  }
  // Races the capture-dispatch compare-and-set on the same row: dispatch requires the deadline in
  // the future and this requires it passed, so exactly one of them can win.
  const abandoned = await tx
    .update(paymentAttempts)
    .set({ state: "abandoned", outcomeReason: "review_window_passed", updatedAt: now })
    .where(
      and(
        eq(paymentAttempts.purchaseId, purchaseId),
        inArray(paymentAttempts.state, [...PRE_CAPTURE_STATES]),
        sql`exists (select 1 from ${purchases} where ${purchases.id} = ${purchaseId} and ${purchases.reviewExpiresAt} <= ${now.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ id: paymentAttempts.id });
  for (const attempt of abandoned) {
    const closed = await transitionPurchase(tx, purchaseId, ["pending_payment"], "unpaid_closed", "attempt_abandoned");
    await recordAudit(tx, {
      at: now,
      actor: "system",
      action: "attempt_abandoned",
      purchaseId,
      attemptId: attempt.id,
      operatorVisible: false,
      details: { reason: "review_window_passed", purchaseClosed: closed },
    });
  }
}

export async function applyDerivedTransitions(db: Db, purchaseId: string, now: Date): Promise<void> {
  await db.transaction((tx) => storeDerivedTransitions(tx, purchaseId, now));
}
