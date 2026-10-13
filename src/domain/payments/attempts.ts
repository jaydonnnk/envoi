import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { buyerActor, recordAudit } from "@/domain/audit/events";
import { canTransitionAttempt, isPreCapture, type AttemptState } from "@/domain/payments/state";
import type { PricedLine } from "@/domain/purchases/price";
import { decideCaptureOutcome, verifyApprovedOrder, type CaptureDecision, type ExpectedPurchase } from "@/domain/purchases/reconcile";
import { assertPaymentEligible, getOwnPurchase, latestAttempt, type OwnPurchase } from "@/domain/purchases/review";
import { derivePurchaseView, storeDerivedTransitions, transitionPurchase, type PaymentAttemptRow, type PurchaseView } from "@/domain/purchases/state";
import { isSandboxApprovalUrl } from "@/integrations/paypal/client";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { paymentAttempts, paymentDestinations, purchases } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { sgdFromCents } from "@/lib/money";
import { deadlineOf, type Now } from "@/lib/time";

// PayPal execution (Gate 3, Call stacks: paypal/start and paypal/complete). One active attempt per
// purchase, operation keys persisted before the call they name, capture serialized behind a lease
// and dispatched only by a compare-and-set that requires the review deadline in the future.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type PayPalDeps = { db: Db; paypal: PayPalWriteClient; now: Now; appBaseUrl: string };

// Test-only barriers; production callers pass none.
export type FlowHooks = { afterExistingAttemptRead?: () => Promise<void>; afterLease?: () => Promise<void> };

class SlotTaken extends Error {}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

type AttemptChanges = Partial<Pick<PaymentAttemptRow, "orderId" | "approvalUrl" | "captureRequestId" | "captureId" | "captureGrossSgdCents" | "captureVerifiedAt" | "outcomeReason">>;

// Compare-and-set on the attempt. Throws on a transition the table forbids; returns whether this
// call moved the row.
export async function transitionAttempt(db: Conn, attemptId: string, from: readonly AttemptState[], to: AttemptState, now: Date, changes: AttemptChanges = {}): Promise<boolean> {
  for (const state of from) {
    if (!canTransitionAttempt(state, to)) throw new Error(`illegal attempt transition ${state} -> ${to}`);
  }
  const moved = await db
    .update(paymentAttempts)
    .set({ ...changes, state: to, updatedAt: now })
    .where(and(eq(paymentAttempts.id, attemptId), inArray(paymentAttempts.state, [...from])))
    .returning({ id: paymentAttempts.id });
  return moved.length === 1;
}

// Claims the purchase's one non-terminal attempt slot with a fresh create request id. A unique
// violation is an error, never a reason to re-read: the purchase row lock keeps it unreachable,
// and the partial unique index is only the backstop.
async function claimSlot(tx: Tx, input: { purchaseId: string; payeeMerchantId: string; totalSgdCents: number; now: Date }): Promise<PaymentAttemptRow> {
  try {
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        id: newId("att"),
        purchaseId: input.purchaseId,
        state: "created",
        payeeMerchantId: input.payeeMerchantId,
        totalSgdCents: input.totalSgdCents,
        currency: "SGD",
        createRequestId: randomUUID(),
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!attempt) throw new Error("attempt insert returned no row");
    return attempt;
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlotTaken();
    throw err;
  }
}

export type StartResult = { attemptId: string; approvalUrl: string };

function existingStartAnswer(attempt: PaymentAttemptRow): StartResult | AppError {
  if ((attempt.state === "order_created" || attempt.state === "externally_approved") && attempt.approvalUrl) {
    return { attemptId: attempt.id, approvalUrl: attempt.approvalUrl };
  }
  if (attempt.state === "capture_dispatched" || attempt.state === "capture_unknown") {
    return appError("capture_already_dispatched", "PayPal is already completing this payment. Check the receipt.");
  }
  return appError("payment_uncertain", "We are still confirming the PayPal order for this review. Do not pay again.");
}

export async function startPayPal(deps: PayPalDeps, principal: BuyerPrincipal, purchaseId: string, hooks: FlowHooks = {}): Promise<StartResult | AppError> {
  try {
    return await deps.db.transaction(async (tx): Promise<StartResult | AppError> => {
      // The purchase row lock serializes starts of one review: a second start waits here, then
      // finds the first start's attempt and returns the same approval link.
      const [locked] = await tx
        .select({ id: purchases.id, state: purchases.state, totalSgdCents: purchases.totalSgdCents, lines: purchases.lines, destinationId: purchases.destinationId })
        .from(purchases)
        .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
        .for("update");
      if (!locked) return appError("not_found", "Purchase not found.");

      const eligibility = await assertPaymentEligible(tx, purchaseId, principal, deps.now());
      if (!eligibility.eligible) return eligibility.error;
      const existingId = eligibility.attemptId;
      await hooks.afterExistingAttemptRead?.();
      if (existingId) {
        const [existing] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, existingId));
        if (existing) return existingStartAnswer(existing);
      }
      if (locked.state !== "review_open") return appError("review_invalidated", "This review is closed. Review the basket again to pay.");

      const [destination] = await tx
        .select({ sellerMerchantId: paymentDestinations.sellerMerchantId })
        .from(paymentDestinations)
        .where(eq(paymentDestinations.id, locked.destinationId ?? ""));
      if (!destination) return appError("review_invalidated", "The shop changed how it is paid. Review the basket again.");

      const now = deps.now();
      const attempt = await claimSlot(tx, { purchaseId, payeeMerchantId: destination.sellerMerchantId, totalSgdCents: locked.totalSgdCents, now });
      await transitionPurchase(tx, purchaseId, ["review_open"], "pending_payment", "paypal_start");
      await recordAudit(tx, { at: now, actor: buyerActor(principal.userId), action: "paypal_attempt_created", purchaseId, attemptId: attempt.id, operatorVisible: false });

      const query = `purchase=${encodeURIComponent(purchaseId)}`;
      const created = await deps.paypal.createOrder(
        {
          purchaseId,
          attemptId: attempt.id,
          correlationId: purchaseId,
          payeeMerchantId: attempt.payeeMerchantId,
          lines: locked.lines.map((line) => ({ name: line.name, quantity: line.quantity, unitSgdCents: line.unitSgdCents })),
          totalSgdCents: locked.totalSgdCents,
          returnUrl: `${deps.appBaseUrl}/paypal/return?${query}`,
          cancelUrl: `${deps.appBaseUrl}/paypal/cancel?${query}`,
        },
        attempt.createRequestId,
      );
      const after = deps.now();
      if (created.kind === "ok" && created.value.approvalUrl && isSandboxApprovalUrl(created.value.approvalUrl)) {
        await transitionAttempt(tx, attempt.id, ["created"], "order_created", after, { orderId: created.value.id, approvalUrl: created.value.approvalUrl });
        return { attemptId: attempt.id, approvalUrl: created.value.approvalUrl };
      }
      // Unknown outcome: the buyer received no approval link, so no capture can follow. S3 decides
      // between same-key replay and recreation; until then the review window closes it.
      const reason = created.kind === "ok" ? "no_sandbox_approval_link" : `create_${created.kind}`;
      await transitionAttempt(tx, attempt.id, ["created"], "create_unknown", after, { orderId: created.kind === "ok" ? created.value.id : null, outcomeReason: reason });
      await recordAudit(tx, { at: after, actor: "system", action: "paypal_create_unknown", purchaseId, attemptId: attempt.id, operatorVisible: true, details: { reason } });
      return appError("provider_unreachable", "PayPal did not confirm the order. Nothing was charged.", { retryable: true, operatorVisible: true });
    });
  } catch (err) {
    if (err instanceof SlotTaken) return appError("execution_locked", "Another payment start for this review is in progress.");
    throw err;
  }
}

async function acquireLease(db: Db, attemptId: string, now: Date): Promise<string | null> {
  const owner = randomUUID();
  const claimed = await db
    .update(paymentAttempts)
    .set({ leaseOwner: owner, leaseExpiresAt: deadlineOf("T_LEASE", now) })
    .where(and(eq(paymentAttempts.id, attemptId), or(isNull(paymentAttempts.leaseOwner), lte(paymentAttempts.leaseExpiresAt, now))))
    .returning({ id: paymentAttempts.id });
  return claimed.length === 1 ? owner : null;
}

async function releaseLease(db: Db, attemptId: string, owner: string): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ leaseOwner: null, leaseExpiresAt: null })
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.leaseOwner, owner)));
}

// The capture-dispatch compare-and-set: the request id is persisted first, and the row moves only
// while the review deadline is still in the future. No row means no capture is ever sent.
async function dispatchCapture(db: Db, attemptId: string, captureRequestId: string, now: Date): Promise<boolean> {
  if (!canTransitionAttempt("externally_approved", "capture_dispatched")) throw new Error("illegal dispatch");
  const moved = await db
    .update(paymentAttempts)
    .set({ state: "capture_dispatched", captureRequestId, updatedAt: now })
    .where(
      and(
        eq(paymentAttempts.id, attemptId),
        eq(paymentAttempts.state, "externally_approved"),
        sql`exists (select 1 from ${purchases} where ${purchases.id} = ${paymentAttempts.purchaseId} and ${purchases.reviewExpiresAt} > ${now.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ id: paymentAttempts.id });
  return moved.length === 1;
}

function expectedPurchase(purchase: OwnPurchase, attempt: PaymentAttemptRow): ExpectedPurchase {
  const lines: PricedLine[] = purchase.lines.map((line) => ({
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    unitSgdCents: sgdFromCents(line.unitSgdCents),
    lineSgdCents: sgdFromCents(line.lineSgdCents),
  }));
  return {
    purchaseId: purchase.id,
    outletId: purchase.outletId,
    payeeId: attempt.payeeMerchantId,
    totalSgdCents: sgdFromCents(purchase.totalSgdCents),
    currency: "SGD",
    lines,
    correlationId: purchase.id,
  };
}

export type CompleteResult = { status: "paid" | "uncertain" | "in_flight" | "awaiting_approval"; view: PurchaseView; captureId: string | null };

async function currentView(db: Db, principal: BuyerPrincipal, purchaseId: string, now: Date): Promise<PurchaseView> {
  const purchase = await getOwnPurchase(db, principal, purchaseId, now);
  return purchase ? purchase.view : { state: "uncertain", paypalAttempt: null };
}

async function recordOutcome(db: Db, purchase: OwnPurchase, attempt: PaymentAttemptRow, decision: CaptureDecision | { decision: "no_evidence"; reason: string }, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    if (decision.decision === "confirmed") {
      const { evidence } = decision;
      await transitionAttempt(tx, attempt.id, ["capture_dispatched"], "capture_confirmed", now, {
        captureId: evidence.captureId,
        captureGrossSgdCents: evidence.grossSgdCents,
        captureVerifiedAt: evidence.verifiedAt,
      });
      await transitionPurchase(tx, purchase.id, ["pending_payment"], "paid", "capture_confirmed");
      await recordAudit(tx, {
        at: now,
        actor: "system",
        action: "paypal_capture_confirmed",
        purchaseId: purchase.id,
        attemptId: attempt.id,
        operatorVisible: false,
        details: { orderId: evidence.orderId, captureId: evidence.captureId, grossSgdCents: evidence.grossSgdCents, payeeId: evidence.payeeId },
      });
      return;
    }
    // Anything short of confirmed evidence is quarantined: never paid, operator alerted, no new
    // capture request id and no replacement payment.
    await transitionAttempt(tx, attempt.id, ["capture_dispatched"], "capture_unknown", now, { outcomeReason: decision.reason });
    await transitionPurchase(tx, purchase.id, ["pending_payment"], "uncertain", decision.reason);
    await recordAudit(tx, {
      at: now,
      actor: "system",
      action: "paypal_capture_quarantined",
      purchaseId: purchase.id,
      attemptId: attempt.id,
      operatorVisible: true,
      details: { reason: decision.reason, orderId: attempt.orderId },
    });
  });
}

export async function completePayPal(deps: PayPalDeps, principal: BuyerPrincipal, purchaseId: string, hooks: FlowHooks = {}): Promise<CompleteResult | AppError> {
  const { db, paypal, now } = deps;
  const purchase = await getOwnPurchase(db, principal, purchaseId, now());
  if (!purchase) return appError("not_found", "Purchase not found.");
  if (purchase.state === "paid") return { status: "paid", view: purchase.view, captureId: purchase.attempt?.captureId ?? null };

  const eligibility = await assertPaymentEligible(db, purchaseId, principal, now());
  if (!eligibility.eligible) return eligibility.error;
  const attempt = eligibility.attemptId ? purchase.attempt : null;
  if (!attempt || attempt.id !== eligibility.attemptId) return appError("validation_failed", "No PayPal payment was started for this review.");
  if (attempt.state === "capture_dispatched" || attempt.state === "capture_unknown") return { status: "in_flight", view: purchase.view, captureId: null };
  if (!attempt.orderId || (attempt.state !== "order_created" && attempt.state !== "externally_approved")) {
    return appError("payment_uncertain", "We are still confirming the PayPal order for this review. Do not pay again.");
  }

  const expected = expectedPurchase(purchase, attempt);
  const read = await paypal.readOrder(attempt.orderId);
  if (read.kind !== "ok") return appError("provider_unreachable", "PayPal could not be reached. Nothing was charged; try again.", { retryable: true });
  const check = verifyApprovedOrder(read.value, attempt.orderId, expected);
  if (!check.ok && check.waiting) return { status: "awaiting_approval", view: purchase.view, captureId: null };
  if (!check.ok) {
    await recordAudit(db, {
      at: now(),
      actor: "system",
      action: "paypal_approved_order_mismatch",
      purchaseId,
      attemptId: attempt.id,
      operatorVisible: true,
      details: { reason: check.reason, orderId: attempt.orderId },
    });
    return appError("payment_uncertain", "The PayPal order does not match this review, so it was not charged.", { operatorVisible: true });
  }

  const lease = await acquireLease(db, attempt.id, now());
  if (!lease) return { status: "in_flight", view: purchase.view, captureId: null };
  try {
    await hooks.afterLease?.();
    if (attempt.state === "order_created") await transitionAttempt(db, attempt.id, ["order_created"], "externally_approved", now());

    const captureRequestId = randomUUID();
    if (!(await dispatchCapture(db, attempt.id, captureRequestId, now()))) {
      return appError("review_expired", "This review expired before PayPal was charged. Nothing was charged.");
    }
    const captured = await paypal.captureOrder(attempt.orderId, captureRequestId);
    // Paid is decided on a server read of the order after the capture, never on the capture call.
    const evidence = captured.kind === "ok" ? await paypal.readOrder(attempt.orderId) : captured;
    const decision =
      evidence.kind === "ok"
        ? decideCaptureOutcome(evidence.value, expected, now())
        : { decision: "no_evidence" as const, reason: evidence.kind === "http_error" ? `capture_http_${evidence.status}${evidence.issues ? `:${evidence.issues}` : ""}` : `capture_${evidence.kind}` };
    await recordOutcome(db, purchase, attempt, decision, now());
    const view = await currentView(db, principal, purchaseId, now());
    return decision.decision === "confirmed"
      ? { status: "paid", view, captureId: decision.evidence.captureId }
      : { status: "uncertain", view, captureId: null };
  } finally {
    await releaseLease(db, attempt.id, lease);
  }
}

export type CancelResult = { view: PurchaseView };

// Closes a purchase whose payment never reached capture. Once a capture was dispatched, cancel
// answers payment_uncertain and the buyer sees "checking payment", never "canceled".
export async function cancelPurchase(deps: Pick<PayPalDeps, "db" | "now">, principal: BuyerPrincipal, purchaseId: string): Promise<CancelResult | AppError> {
  return deps.db.transaction(async (tx): Promise<CancelResult | AppError> => {
    const [locked] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
      .for("update");
    if (!locked) return appError("not_found", "Purchase not found.");
    const now = deps.now();
    const attempt = await latestAttempt(tx, purchaseId);
    const view = derivePurchaseView(locked, attempt, now);

    if (view.state === "unpaid_closed") {
      await storeDerivedTransitions(tx, purchaseId, now);
      return { view };
    }
    if (view.state === "paid") return appError("validation_failed", "This purchase is already paid.");
    if (attempt && !(["abandoned", "capture_failed", "capture_confirmed"] as string[]).includes(attempt.state)) {
      const state = attempt.state as AttemptState;
      if (!isPreCapture(state)) return appError("payment_uncertain", "PayPal may already be completing this payment. Check the receipt; do not pay again.");
      await transitionAttempt(tx, attempt.id, [state], "abandoned", now, { outcomeReason: "buyer_canceled" });
      await transitionPurchase(tx, purchaseId, ["pending_payment"], "unpaid_closed", "buyer_canceled");
      await recordAudit(tx, { at: now, actor: buyerActor(principal.userId), action: "paypal_canceled", purchaseId, attemptId: attempt.id, operatorVisible: false });
      return { view: { state: "unpaid_closed", paypalAttempt: "abandoned" } };
    }
    if (view.state === "review_open") return appError("validation_failed", "No payment was started. This review closes on its own.");
    return { view };
  });
}
