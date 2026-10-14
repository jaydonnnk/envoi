import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { buyerActor, recordAudit } from "@/domain/audit/events";
import { canTransitionAttempt, isPreCapture, TERMINAL_ATTEMPT_STATES, type AttemptState } from "@/domain/payments/state";
import type { PricedLine } from "@/domain/purchases/price";
import {
  CREATE_REPLAY_REFUSED,
  decideCaptureOutcome,
  decideCreateRecovery,
  isDefinitiveRefusal,
  verifyApprovedOrder,
  type CaptureDecision,
  type ExpectedPurchase,
  type PayPalOrder,
} from "@/domain/purchases/reconcile";
import type { BasketLockKey } from "@/domain/purchases/checkout-key";
import { assertPaymentEligible, basketLocked, findBasketLock, getOwnPurchase, latestAttempt, type OwnPurchase } from "@/domain/purchases/review";
import {
  canTransitionPurchase,
  derivePurchaseView,
  storeDerivedTransitions,
  transitionPurchase,
  type PaymentAttemptRow,
  type PurchaseState,
  type PurchaseView,
} from "@/domain/purchases/state";
import { isSandboxApprovalUrl } from "@/integrations/paypal/client";
import type { PayPalWriteClient, ProviderResult } from "@/integrations/paypal/orders";
import type { PayPalReadClient } from "@/integrations/paypal/orders-read";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { paymentAttempts, paymentDestinations, PURCHASE_STATES, purchases, type StoredLine } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { sgdFromCents } from "@/lib/money";
import { deadlineOf, durationMs, type Now } from "@/lib/time";

// PayPal execution (Gate 3, Call stacks: paypal/start and paypal/complete). One active attempt per
// purchase, operation keys persisted before the call they name, capture serialized behind a lease
// and dispatched only by a compare-and-set that requires the review deadline in the future.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type PayPalDeps = { db: Db; paypal: PayPalWriteClient; now: Now; appBaseUrl: string };

// Test-only barriers; production callers pass none.
export type FlowHooks = {
  afterExistingAttemptRead?: () => Promise<void>;
  beforeAttemptSaved?: () => Promise<void>;
  afterLease?: () => Promise<void>;
  afterDispatch?: () => Promise<void>;
};

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

type LockedPurchase = { id: string; totalSgdCents: number; lines: StoredLine[] };

// The order is built from the stored purchase and the attempt's payee snapshot only, so a replay
// sends exactly what the first request sent.
function createOrderFor(deps: PayPalDeps, purchase: LockedPurchase, attempt: PaymentAttemptRow) {
  const query = `purchase=${encodeURIComponent(purchase.id)}`;
  return deps.paypal.createOrder(
    {
      purchaseId: purchase.id,
      attemptId: attempt.id,
      correlationId: purchase.id,
      payeeMerchantId: attempt.payeeMerchantId,
      lines: purchase.lines.map((line) => ({ name: line.name, quantity: line.quantity, unitSgdCents: line.unitSgdCents })),
      totalSgdCents: purchase.totalSgdCents,
      returnUrl: `${deps.appBaseUrl}/paypal/return?${query}`,
      cancelUrl: `${deps.appBaseUrl}/paypal/cancel?${query}`,
    },
    attempt.createRequestId,
  );
}

const providerReason = (prefix: string, result: ProviderResult<unknown>) =>
  result.kind === "http_error" ? `${prefix}_http_${result.status}${result.issues ? `:${result.issues}` : ""}` : `${prefix}_${result.kind}`;

const createUnconfirmed = () => appError("provider_unreachable", "PayPal did not confirm the order. Nothing was charged; try again.", { retryable: true, operatorVisible: true });

// Sends the create for a new attempt, or replays it for an attempt in create_unknown, always with
// the attempt's own persisted request id, and records what came back.
async function createAndRecord(tx: Tx, deps: PayPalDeps, purchase: LockedPurchase, attempt: PaymentAttemptRow): Promise<StartResult | AppError> {
  const replay = attempt.state === "create_unknown";
  const created = await createOrderFor(deps, purchase, attempt);
  const after = deps.now();
  if (created.kind === "ok" && created.value.approvalUrl && isSandboxApprovalUrl(created.value.approvalUrl)) {
    await transitionAttempt(tx, attempt.id, [attempt.state as AttemptState], "order_created", after, {
      orderId: created.value.id,
      approvalUrl: created.value.approvalUrl,
      outcomeReason: null,
    });
    if (replay) await recordAudit(tx, { at: after, actor: "system", action: "paypal_create_recovered", purchaseId: purchase.id, attemptId: attempt.id, operatorVisible: true, details: { orderId: created.value.id } });
    return { attemptId: attempt.id, approvalUrl: created.value.approvalUrl };
  }

  // Unknown outcome: the buyer received no approval link, so no capture can follow. An order id
  // PayPal did return is kept, which rules out ever recreating this attempt.
  const orderId = created.kind === "ok" ? created.value.id : attempt.orderId;
  if (!replay) {
    const reason = created.kind === "ok" ? "no_sandbox_approval_link" : providerReason("create", created);
    await transitionAttempt(tx, attempt.id, ["created"], "create_unknown", after, { orderId, outcomeReason: reason });
    await recordAudit(tx, { at: after, actor: "system", action: "paypal_create_unknown", purchaseId: purchase.id, attemptId: attempt.id, operatorVisible: true, details: { reason } });
    return createUnconfirmed();
  }
  const reason =
    created.kind === "ok" ? "replay_no_sandbox_approval_link" : isDefinitiveRefusal(created) ? `${CREATE_REPLAY_REFUSED}:${created.status}:${created.issues}` : providerReason("create_replay", created);
  await tx.update(paymentAttempts).set({ orderId, outcomeReason: reason, updatedAt: after }).where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.state, "create_unknown")));
  await recordAudit(tx, { at: after, actor: "system", action: "paypal_create_replayed", purchaseId: purchase.id, attemptId: attempt.id, operatorVisible: true, details: { reason } });
  return createUnconfirmed();
}

// A lost create response (Gate 3 Races, decideCreateRecovery): replay the same key first; only an
// attempt that never held an order id, and whose replay PayPal refused outright, is closed and
// recreated under a new key.
async function recoverCreate(tx: Tx, deps: PayPalDeps, purchase: LockedPurchase, attempt: PaymentAttemptRow): Promise<StartResult | AppError> {
  let current = attempt;
  let answer: StartResult | AppError | null = null;
  if (decideCreateRecovery(current) === "replay_same_key") {
    answer = await createAndRecord(tx, deps, purchase, current);
    if (!("code" in answer)) return answer;
    const [fresh] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, current.id));
    if (!fresh) throw new Error("attempt vanished during create recovery");
    current = fresh;
  }
  const decision = decideCreateRecovery(current);
  if (decision === "safe_to_recreate") {
    const now = deps.now();
    await transitionAttempt(tx, current.id, ["create_unknown"], "abandoned", now, { outcomeReason: "create_recreated" });
    const next = await claimSlot(tx, { purchaseId: purchase.id, payeeMerchantId: current.payeeMerchantId, totalSgdCents: purchase.totalSgdCents, now });
    await recordAudit(tx, { at: now, actor: "system", action: "paypal_create_recreated", purchaseId: purchase.id, attemptId: next.id, operatorVisible: true, details: { replaces: current.id } });
    return createAndRecord(tx, deps, purchase, next);
  }
  if (answer) return answer;
  return decision === "replay_same_key" ? createUnconfirmed() : appError("payment_uncertain", "We are still confirming the PayPal order for this review. Do not pay again.");
}

// Locks every purchase of this buyer with the same basket lock key, this one included, in id order
// (Gate 3 paypal/start, S7). Two starts of one basket, on any review of it, then serialize here: the
// second waits, and its basket-lock check sees the first one's attempt. A purchase without a key, a
// fixture tracer row, locks only itself.
async function lockBasket(tx: Tx, principal: BuyerPrincipal, purchaseId: string): Promise<BasketLockKey | null> {
  const [own] = await tx
    .select({ key: purchases.basketLockKey })
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)));
  if (!own?.key) return null;
  await tx.select({ id: purchases.id }).from(purchases).where(eq(purchases.basketLockKey, own.key)).orderBy(asc(purchases.id)).for("update");
  return own.key as BasketLockKey;
}

export async function startPayPal(deps: PayPalDeps, principal: BuyerPrincipal, purchaseId: string, hooks: FlowHooks = {}): Promise<StartResult | AppError> {
  try {
    return await deps.db.transaction(async (tx): Promise<StartResult | AppError> => {
      const basketKey = await lockBasket(tx, principal, purchaseId);
      // The purchase row lock serializes starts of one review: a second start waits here, then
      // finds the first start's attempt and returns the same approval link. It also serializes
      // create replays, so one key is never in flight twice.
      const [locked] = await tx
        .select({ id: purchases.id, state: purchases.state, totalSgdCents: purchases.totalSgdCents, lines: purchases.lines, destinationId: purchases.destinationId })
        .from(purchases)
        .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
        .for("update");
      if (!locked) return appError("not_found", "Purchase not found.");

      const eligibility = await assertPaymentEligible(tx, purchaseId, principal, deps.now());
      if (!eligibility.eligible) {
        // A review pinned to a replaced revision or a changed destination can never execute.
        const reason = eligibility.error.details?.reason;
        if (locked.state === "review_open" && (reason === "menu_changed" || reason === "destination_changed")) {
          await transitionPurchase(tx, purchaseId, ["review_open"], "review_invalidated", String(reason));
        }
        return eligibility.error;
      }
      const existingId = eligibility.attemptId;
      await hooks.afterExistingAttemptRead?.();
      if (existingId) {
        const [existing] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, existingId));
        if (existing?.state === "create_unknown") return recoverCreate(tx, deps, locked, existing);
        if (existing) return existingStartAnswer(existing);
      }
      if (locked.state !== "review_open") return appError("review_invalidated", "This review is closed. Review the basket again to pay.");

      // Another review of the same basket, on any revision or destination, whose money can still move.
      if (basketKey) {
        const lock = await findBasketLock(tx, { key: basketKey, exceptPurchaseId: purchaseId, lockRows: true, now: deps.now() });
        if (lock) return basketLocked(lock);
      }
      await hooks.beforeAttemptSaved?.();

      const [destination] = await tx
        .select({ sellerMerchantId: paymentDestinations.sellerMerchantId })
        .from(paymentDestinations)
        .where(eq(paymentDestinations.id, locked.destinationId ?? ""));
      if (!destination) return appError("review_invalidated", "The shop changed how it is paid since you reviewed. Nothing was charged.");

      const now = deps.now();
      const attempt = await claimSlot(tx, { purchaseId, payeeMerchantId: destination.sellerMerchantId, totalSgdCents: locked.totalSgdCents, now });
      await transitionPurchase(tx, purchaseId, ["review_open"], "pending_payment", "paypal_start");
      await recordAudit(tx, { at: now, actor: buyerActor(principal.userId), action: "paypal_attempt_created", purchaseId, attemptId: attempt.id, operatorVisible: false });
      return createAndRecord(tx, deps, locked, attempt);
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

type PurchaseFacts = Pick<OwnPurchase, "id" | "outletId" | "lines" | "totalSgdCents">;

function expectedPurchase(purchase: PurchaseFacts, attempt: PaymentAttemptRow): ExpectedPurchase {
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
    await hooks.afterDispatch?.();
    const captured = await paypal.captureOrder(attempt.orderId, captureRequestId);
    // Paid is decided on a server read of the order after the capture, never on the capture call.
    const evidence = captured.kind === "ok" ? await paypal.readOrder(attempt.orderId) : captured;
    const decision =
      evidence.kind === "ok"
        ? decideCaptureOutcome(evidence.value, expected, now())
        : { decision: "no_evidence" as const, reason: providerReason("capture", evidence) };
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
    if (attempt && !(TERMINAL_ATTEMPT_STATES as readonly string[]).includes(attempt.state)) {
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

// Provider recovery (Gate 3 Races: lost capture response, duplicate or out-of-order webhook).
// Shared by the buyer's "Check status", the verified webhook and, from S5, maintenance. Reads are
// debounced per attempt by T_PROVIDER_READ_DEBOUNCE. Only a caller holding the attempt lease may
// replay the persisted capture request id; nothing here ever mints a new capture key, creates a
// replacement payment or captures an order whose capture was never dispatched. Reads are never
// gated on PAYMENTS_ENABLED, so a dispatched capture still converges with the switch off.

// read: PayPal returned its record of the order and it was applied; no_record: PayPal answered but
// holds no usable record (the purchase keeps its state); provider_unreachable: no read got an answer.
export type ReconcileOutcome = "read" | "no_record" | "provider_unreachable" | "debounced" | "in_flight" | "no_order";

export type ReconcileDeps = {
  db: Db;
  read: PayPalReadClient;
  // Same-key capture replay; null on read-only paths such as the webhook.
  replay: Pick<PayPalWriteClient, "captureOrder"> | null;
  now: Now;
  actor: string;
};

const CAPTURE_IN_FLIGHT: readonly AttemptState[] = ["capture_dispatched", "capture_unknown"];
const CAPTURE_STATES: readonly AttemptState[] = [...CAPTURE_IN_FLIGHT, "capture_confirmed", "capture_failed"];

// Every purchase state the transition table lets move to `to`. A recovery write therefore can
// never take a purchase anywhere the table forbids, such as out of paid.
function purchaseStatesInto(to: PurchaseState, reason: string): PurchaseState[] {
  return PURCHASE_STATES.filter((from) => canTransitionPurchase({ from, to, reason }));
}

// Starts a debounce window by compare-and-set; false while one is still open.
async function claimProviderRead(db: Db, attemptId: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - durationMs("T_PROVIDER_READ_DEBOUNCE"));
  const claimed = await db
    .update(paymentAttempts)
    .set({ lastProviderReadAt: now })
    .where(
      and(
        eq(paymentAttempts.id, attemptId),
        or(isNull(paymentAttempts.lastProviderReadAt), lte(paymentAttempts.lastProviderReadAt, windowStart)),
      ),
    )
    .returning({ id: paymentAttempts.id });
  return claimed.length === 1;
}

type RecoveryVerdict =
  | { kind: "confirmed"; decision: Extract<CaptureDecision, { decision: "confirmed" }> }
  | { kind: "failed"; reason: string }
  | { kind: "inconclusive"; reason: string };

async function applyVerdict(deps: ReconcileDeps, purchaseId: string, purchaseState: PurchaseState, attempt: PaymentAttemptRow, verdict: RecoveryVerdict): Promise<void> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const audit = (action: string, operatorVisible: boolean, details: Record<string, string | number | boolean | null>) =>
      recordAudit(tx, { at: now, actor: deps.actor, action, purchaseId, attemptId: attempt.id, operatorVisible, details: { orderId: attempt.orderId, ...details } });

    if (verdict.kind === "confirmed") {
      const { evidence } = verdict.decision;
      const moved = await transitionAttempt(tx, attempt.id, ["capture_dispatched", "capture_unknown"], "capture_confirmed", now, {
        captureId: evidence.captureId,
        captureGrossSgdCents: evidence.grossSgdCents,
        captureVerifiedAt: evidence.verifiedAt,
      });
      if (!moved) {
        // Already decided. A confirmed capture after a verified failure is the operator's to see.
        if (attempt.state === "capture_failed") await audit("paypal_capture_after_failure", true, { captureId: evidence.captureId });
        return;
      }
      await transitionPurchase(tx, purchaseId, purchaseStatesInto("paid", "capture_confirmed"), "paid", "capture_confirmed");
      await audit("paypal_capture_confirmed", false, { captureId: evidence.captureId, grossSgdCents: evidence.grossSgdCents, payeeId: evidence.payeeId, recovered: true });
      return;
    }

    if (verdict.kind === "failed") {
      // A verified failure: PayPal refused the same-key replay outright and the order shows no
      // capture at all. Anything weaker stays checking payment.
      await transitionAttempt(tx, attempt.id, ["capture_dispatched"], "capture_unknown", now, { outcomeReason: verdict.reason });
      const moved = await transitionAttempt(tx, attempt.id, ["capture_unknown"], "capture_failed", now, { outcomeReason: verdict.reason });
      if (moved) {
        await transitionPurchase(tx, purchaseId, purchaseStatesInto("unpaid_closed", "capture_failed"), "unpaid_closed", "capture_failed");
        await audit("paypal_capture_failed", true, { reason: verdict.reason });
      }
      return;
    }

    // Inconclusive: quarantine (or keep quarantined) as uncertain with an operator alert. The
    // purchase only moves where the table allows, so a paid purchase is never downgraded.
    await transitionAttempt(tx, attempt.id, ["capture_dispatched"], "capture_unknown", now, { outcomeReason: verdict.reason });
    const moved = await transitionPurchase(tx, purchaseId, purchaseStatesInto("uncertain", verdict.reason), "uncertain", verdict.reason);
    const stillPaid = purchaseState === "paid" && !moved;
    await audit(stillPaid ? "paypal_paid_read_mismatch" : "paypal_recovery_inconclusive", true, { reason: verdict.reason });
  });
}

// What PayPal's reads of the order gave back: its record, an answer that it holds none (a 404 for an
// order PayPal no longer holds), or no usable answer at all. A refused token or any other error says
// nothing about the order, so it counts as unreachable and the due read stays due.
type ProviderAnswer = "record" | "no_record" | "unreachable";

function answerOf(reads: readonly ProviderResult<unknown>[]): ProviderAnswer {
  if (reads.some((read) => read.kind === "ok")) return "record";
  const answeredWithout = reads.some((read) => read.kind === "http_error" && read.status === 404);
  return answeredWithout ? "no_record" : "unreachable";
}

// Reads the order and, for a capture whose outcome is unknown, replays the persisted capture key
// as the lease holder. Paid is decided only by decideCaptureOutcome on a server read.
async function recoverCapture(deps: ReconcileDeps, purchase: PurchaseFacts & { state: PurchaseState }, attempt: PaymentAttemptRow & { orderId: string }): Promise<ProviderAnswer> {
  const expected = expectedPurchase(purchase, attempt);
  const decide = (order: PayPalOrder) => decideCaptureOutcome(order, expected, deps.now());
  const reads: ProviderResult<PayPalOrder>[] = [];
  const readOrder = async () => {
    const read = await deps.read.readOrder(attempt.orderId);
    reads.push(read);
    return read;
  };
  const apply = async (verdict: RecoveryVerdict) => {
    await applyVerdict(deps, purchase.id, purchase.state, attempt, verdict);
    return answerOf(reads);
  };

  const first = await readOrder();
  if (first.kind === "ok") {
    const decision = decide(first.value);
    if (decision.decision === "confirmed") return apply({ kind: "confirmed", decision });
    // A capture PayPal reports but that does not match, or is not complete, is never paid and
    // never failed: it stays uncertain.
    if (first.value.captures.length > 0) return apply({ kind: "inconclusive", reason: decision.reason });
  }

  const captureKey = attempt.captureRequestId;
  if (!deps.replay || !captureKey || !CAPTURE_IN_FLIGHT.includes(attempt.state as AttemptState)) {
    return apply({ kind: "inconclusive", reason: first.kind === "ok" ? "no_capture_seen" : providerReason("read", first) });
  }

  const replayed = await deps.replay.captureOrder(attempt.orderId, captureKey);
  const after = await readOrder();
  // Without PayPal's record of the order nothing is proven, whatever the replay answered.
  if (after.kind !== "ok") return apply({ kind: "inconclusive", reason: providerReason("read", after) });
  const decision = decide(after.value);
  if (decision.decision === "confirmed") return apply({ kind: "confirmed", decision });
  if (after.value.captures.length === 0 && isDefinitiveRefusal(replayed)) {
    return apply({ kind: "failed", reason: `capture_refused_${replayed.status}:${replayed.issues}` });
  }
  return apply({ kind: "inconclusive", reason: replayed.kind === "ok" ? decision.reason : providerReason("capture_replay", replayed) });
}

// Test-only barrier; production callers pass none.
export type ReconcileHooks = { afterLeaseDecision?: () => Promise<void> };

export async function reconcileAttempt(deps: ReconcileDeps, attemptId: string, hooks: ReconcileHooks = {}): Promise<ReconcileOutcome> {
  const [initial] = await deps.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
  if (!initial) throw new Error(`no attempt ${attemptId}`);
  if (!initial.orderId) return "no_order";

  // Only an in-flight capture is replayed, and only by the lease holder.
  const lease = CAPTURE_IN_FLIGHT.includes(initial.state as AttemptState) ? await acquireLease(deps.db, attemptId, deps.now()) : null;
  if (CAPTURE_IN_FLIGHT.includes(initial.state as AttemptState) && !lease) return "in_flight";
  try {
    await hooks.afterLeaseDecision?.();
    if (!(await claimProviderRead(deps.db, attemptId, deps.now()))) return "debounced";
    const [attempt] = await deps.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
    const [purchase] = await deps.db
      .select({ id: purchases.id, outletId: purchases.outletId, lines: purchases.lines, totalSgdCents: purchases.totalSgdCents, state: purchases.state })
      .from(purchases)
      .where(eq(purchases.id, initial.purchaseId));
    if (!attempt?.orderId || !purchase) throw new Error(`attempt ${attemptId} lost its order or purchase`);
    // A completion dispatched the capture after this check began: it holds the lease, so this
    // call neither reads into its outcome nor replays its key.
    if (CAPTURE_IN_FLIGHT.includes(attempt.state as AttemptState) && !lease) return "in_flight";

    // Before any capture was dispatched a read changes nothing: reconciliation never performs an
    // initial capture, and the buyer's own completion does that.
    const answer = CAPTURE_STATES.includes(attempt.state as AttemptState)
      ? await recoverCapture(deps, { ...purchase, state: purchase.state as PurchaseState }, { ...attempt, orderId: attempt.orderId })
      : answerOf([await deps.read.readOrder(attempt.orderId)]);
    if (answer === "unreachable") return "provider_unreachable";
    // The due read is done; a webhook that arrives later makes the next one due.
    await deps.db.update(paymentAttempts).set({ providerReadDueAt: null }).where(eq(paymentAttempts.id, attemptId));
    return answer === "record" ? "read" : "no_record";
  } finally {
    if (lease) await releaseLease(deps.db, attemptId, lease);
  }
}
