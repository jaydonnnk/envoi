import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { canTransitionAttempt, isPreCapture, PRE_CAPTURE_STATES, type AttemptState } from "@/domain/payments/state";
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

// The only reasons that may move a purchase into paid.
const PAID_REASONS = new Set(["capture_confirmed", "pyusd_confirmed"]);

export function canTransitionPurchase(t: PurchaseTransition): boolean {
  if (!PURCHASE_TRANSITIONS[t.from].includes(t.to)) return false;
  return t.to !== "paid" || PAID_REASONS.has(t.reason);
}

// PYUSD attempts, the basket lock and extra transfers join this view in S7, S16 and S17.
export type PurchaseView = { state: PurchaseState; paypalAttempt: AttemptState | null };

// Pure. A review past T_REVIEW reads expired. A PayPal attempt that never dispatched a capture
// reads abandoned once T_REVIEW passes, and its purchase unpaid_closed: no capture can be sent
// for it any more, so the approval at PayPal can never move money.
export function derivePurchaseView(purchase: PurchaseRow, attempt: PaymentAttemptRow | null, now: Date): PurchaseView {
  const expired = now.getTime() >= purchase.reviewExpiresAt.getTime();
  const state = purchase.state as PurchaseState;
  const attemptState = (attempt?.state ?? null) as AttemptState | null;
  if (state === "review_open" && expired) return { state: "review_expired", paypalAttempt: attemptState };
  if (state === "pending_payment" && expired && attemptState !== null && isPreCapture(attemptState)) {
    return { state: "unpaid_closed", paypalAttempt: "abandoned" };
  }
  return { state, paypalAttempt: attemptState };
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
