import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { enrollments, paymentAttempts, paymentDestinations, purchases, refunds, REFUND_STATES } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import type { Currency } from "@/lib/money";
import type { PayPalWriteClient, ProviderRefund, ProviderResult } from "@/integrations/paypal/orders";

// Refund rules and state (S45, Gate 2 "Flow: refund", Gate 3 call stack "Refund"). A full refund of
// one paid PayPal order, sent only from a signed-in member's own confirmation, on the labeled demo
// seller's write client. No model output reaches this module: the copilot only proposes, and the
// refund route calls sendFullRefund after the member taps Confirm.
//
// The purchase and its attempt are never written here, so a refunded order stays recorded as Paid,
// with its refund row beside it. One refund per attempt, ever: the unique index on attempt_id is the
// claim, so two confirmations cannot both send. A lost answer leaves the row `checking`; the member's
// next confirm resends the same idempotency key as PayPal-Request-Id and PayPal's answer decides it
// (Gate 2 and 3 revision, 2026-11-08). Maintenance holds no demo seller credentials and never reads
// or sends a refund.

export type RefundState = (typeof REFUND_STATES)[number];

export type Refund = {
  id: string;
  orderId: string;
  state: RefundState;
  amountMinor: number;
  currency: Currency;
  paypalRefundId: string | null;
  createdAt: string;
};

// A `sent` row whose PayPal answer never arrived, for example because the process stopped between
// the claim and the update, is treated as `checking` once it is this old.
const STALE_SENT_MS = 2 * 60_000;

type RefundRow = typeof refunds.$inferSelect;

const refundJson = (row: RefundRow): Refund => ({
  id: row.id,
  orderId: row.purchaseId,
  state: row.state,
  amountMinor: row.amountMinor,
  currency: row.currency,
  paypalRefundId: row.paypalRefundId,
  createdAt: row.createdAt.toISOString(),
});

// The refund beside each of these orders, if any.
export async function refundsOf(db: Pick<Db, "select">, purchaseIds: readonly string[]): Promise<Map<string, Refund>> {
  const found = new Map<string, Refund>();
  if (purchaseIds.length === 0) return found;
  const rows = await db.select().from(refunds).where(inArray(refunds.purchaseId, [...purchaseIds]));
  for (const row of rows) found.set(row.purchaseId, refundJson(row));
  return found;
}

// Whether this outlet is the labeled demo shop: an approved enrollment and an active sandbox PayPal
// destination whose seller is the demo seller. Every other outlet gets no copilot turn and no refund.
export async function isDemoSellerOutlet(db: Pick<Db, "select">, outletId: string, demoMerchantId: string): Promise<boolean> {
  const [row] = await db
    .select({ seller: paymentDestinations.sellerMerchantId })
    .from(paymentDestinations)
    .innerJoin(enrollments, and(eq(enrollments.outletId, paymentDestinations.outletId), eq(enrollments.status, "approved")))
    .where(and(eq(paymentDestinations.outletId, outletId), eq(paymentDestinations.rail, "paypal"), eq(paymentDestinations.status, "active")))
    .limit(1);
  return row?.seller === demoMerchantId;
}

export type RefundableOrder = { orderId: string; attemptId: string; captureId: string; amountMinor: number; currency: Currency };

// A paid PayPal order of this outlet whose capture Envoi verified: the only kind a refund may name.
// The amount is the verified capture's gross, never a figure from the model or the browser.
export async function refundableOrder(db: Pick<Db, "select">, outletId: string, orderId: string): Promise<RefundableOrder | AppError> {
  const [purchase] = await db
    .select({ id: purchases.id, state: purchases.state, rail: purchases.rail })
    .from(purchases)
    .where(and(eq(purchases.id, orderId), eq(purchases.outletId, outletId)))
    .limit(1);
  if (!purchase) return appError("not_found", "Order not found.");
  const [attempt] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.purchaseId, purchase.id))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
    .limit(1);
  if (
    purchase.state !== "paid" ||
    purchase.rail !== "paypal" ||
    attempt?.rail !== "paypal" ||
    attempt.state !== "capture_confirmed" ||
    attempt.captureId === null ||
    attempt.captureGrossMinor === null ||
    attempt.captureVerifiedAt === null
  ) {
    return appError("validation_failed", "Only a paid PayPal order can be refunded. Nothing was sent.", { details: { reason: "not_refundable" } });
  }
  return { orderId: purchase.id, attemptId: attempt.id, captureId: attempt.captureId, amountMinor: attempt.captureGrossMinor, currency: attempt.currency };
}

type Claim = { kind: "send"; row: RefundRow } | { kind: "existing"; row: RefundRow };

// Claims the one refund of this attempt. A new row is inserted as `sent` with a fresh key; a
// `checking` (or stale `sent`) row is moved back to `sent` and resent with its own key. Every other
// existing row is returned as it is, and nothing is sent.
async function claim(db: Db, order: RefundableOrder, input: { outletId: string; actorUserId: string; now: Date }): Promise<Claim> {
  const [inserted] = await db
    .insert(refunds)
    .values({
      id: newId("rfd"),
      attemptId: order.attemptId,
      purchaseId: order.orderId,
      outletId: input.outletId,
      captureId: order.captureId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      state: "sent",
      confirmedByUserId: input.actorUserId,
      idempotencyKey: newId("rfd"),
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: refunds.attemptId })
    .returning();
  if (inserted) return { kind: "send", row: inserted };

  const stale = new Date(input.now.getTime() - STALE_SENT_MS);
  const [resend] = await db
    .update(refunds)
    .set({ state: "sent", updatedAt: input.now })
    .where(and(eq(refunds.attemptId, order.attemptId), or(eq(refunds.state, "checking"), and(eq(refunds.state, "sent"), sql`${refunds.paypalRefundId} is null`, lt(refunds.updatedAt, stale)))))
    .returning();
  if (resend) return { kind: "send", row: resend };
  const [existing] = await db.select().from(refunds).where(eq(refunds.attemptId, order.attemptId)).limit(1);
  return { kind: "existing", row: existing! };
}

// What PayPal's answer makes of the refund. Only a refund id with COMPLETED is completed; an answer
// that may not have arrived is `checking`, never failed, because the refund may have been made.
function decide(result: ProviderResult<ProviderRefund>): { state: RefundState; paypalRefundId: string | null; reason: string | null } {
  if (result.kind === "ok") {
    if (result.value.status === "COMPLETED") return { state: "completed", paypalRefundId: result.value.id, reason: null };
    if (result.value.status === "FAILED" || result.value.status === "CANCELLED") return { state: "failed", paypalRefundId: result.value.id, reason: result.value.status };
    return { state: "sent", paypalRefundId: result.value.id, reason: null };
  }
  if (result.kind === "http_error" && !result.retryable) return { state: "failed", paypalRefundId: null, reason: result.issues || `HTTP_${result.status}` };
  return { state: "checking", paypalRefundId: null, reason: null };
}

const actor = (userId: string) => `merchant:${userId}`;

export async function sendFullRefund(
  db: Db,
  client: PayPalWriteClient,
  input: { outletId: string; orderId: string; actorUserId: string; now: Date },
): Promise<Refund | AppError> {
  const order = await refundableOrder(db, input.outletId, input.orderId);
  if ("code" in order) return order;
  const claimed = await claim(db, order, input);
  if (claimed.kind === "existing") return refundJson(claimed.row);

  // Outside any transaction: the claim is committed before PayPal is called.
  const answer = decide(await client.refundCapture(order.captureId, claimed.row.idempotencyKey));
  const updatedAt = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(refunds)
      .set({ state: answer.state, paypalRefundId: answer.paypalRefundId ?? claimed.row.paypalRefundId, outcomeReason: answer.reason, updatedAt })
      .where(eq(refunds.id, claimed.row.id))
      .returning();
    await recordAudit(tx, {
      at: updatedAt,
      actor: actor(input.actorUserId),
      action: "refund_sent",
      purchaseId: order.orderId,
      attemptId: order.attemptId,
      outletId: input.outletId,
      operatorVisible: answer.state === "failed" || answer.state === "checking",
      details: { refundId: claimed.row.id, state: answer.state, amountMinor: order.amountMinor, currency: order.currency, reason: answer.reason },
    });
    return refundJson(row!);
  });
}
