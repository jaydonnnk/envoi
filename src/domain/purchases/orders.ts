import { and, count, desc, eq, inArray, isNotNull, isNull, ne, not, or, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { derivePurchaseView, applyDerivedTransitions, type PaymentAttemptRow, type PurchaseRow, type PurchaseState } from "@/domain/purchases/state";
import { formatPyusdAtomic } from "@/domain/pyusd/rate";
import { OPERATOR_RESOLUTION } from "@/domain/pyusd/state";
import { extraTransfersOf, type ExtraTransfer } from "@/domain/pyusd/recovery";
import { merchantMemberships, outlets, paymentAttempts, paymentDestinations, purchases, type StoredLine } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";

// Merchant orders and acknowledgment (Gate 2 "GET /merchant/outlets/{id}/orders, POST
// /merchant/orders/{id}/acknowledge"; S8). Every state shown is the view derived on read, so an
// abandoned PayPal approval reads unpaid_closed before any maintenance run. Acknowledgment is its own
// field: it is allowed only on a paid order and never writes the payment state. Archive (S18) is
// also its own field: it hides an order from the merchant's list and never writes anything else.

// An order is a purchase that reached a payment. A review that never started one moved no money,
// and any buyer can open many, so listing reviews would push real orders off the page.
const ORDER_STATES = ["pending_payment", "paid", "uncertain", "unpaid_closed"] as const satisfies readonly PurchaseState[];
const ORDERS_PAGE = 50;

export type MerchantOrder = {
  id: string;
  createdAt: string;
  entryPoint: string;
  rail: string | null;
  lines: StoredLine[];
  totalSgdCents: number;
  currency: string;
  state: PurchaseState;
  recipient: { environment: "sandbox"; sellerMerchantId: string } | null;
  // PYUSD (S16): the devnet amount and recipient account, and the verified finalized signature only
  // beside a paid order.
  pyusd: {
    environment: "devnet";
    amount: string;
    recipientTokenAccount: string | null;
    attemptState: string | null;
    signature: string | null;
    // S17: extra transfers a window scan found. They never change the state above, and an order
    // never shows one as refunded: any refund is arranged between the shop and the buyer.
    extraTransfers: { signature: string; amount: string | null }[];
    // S17 review fixes: who closed a PYUSD order unpaid. The operator closes only a mismatch, whose
    // transaction may have reached the shop; release closes only a complete scan that found nothing.
    closedBy: "operator" | "release" | null;
  } | null;
  payment: {
    environment: "sandbox";
    attemptState: string | null;
    orderId: string | null;
    captureId: string | null;
    captureGrossSgdCents: number | null;
    captureVerifiedAt: string | null;
  } | null;
  acknowledgedAt: string | null;
  canAcknowledge: boolean;
};

export type OutletOrders = {
  outlet: { id: string; name: string; isDemoFixture: boolean };
  orders: MerchantOrder[];
  // Orders of this outlet the merchant archived and the list leaves out (S18).
  archivedCount: number;
  // The id to pass as `before` for the next older page, or null when no older order exists.
  nextBefore: string | null;
};

const merchantActor = (userId: string) => `merchant:${userId}`;

// An archived order stays out of the list unless it became paid after it was archived: a payment the
// merchant has not seen is never hidden (Gate 3 reopening 2026-10-24).
const listed = or(isNull(purchases.merchantArchivedAt), and(eq(purchases.state, "paid"), ne(purchases.merchantArchivedState, "paid")));

type OrderRow = { purchase: PurchaseRow; sellerMerchantId: string | null; tokenAccount: string | null };

// The latest attempt of each purchase, as `latestAttempt` picks it for one.
async function latestAttempts(db: Pick<Db, "select">, purchaseIds: string[]): Promise<Map<string, PaymentAttemptRow>> {
  const latest = new Map<string, PaymentAttemptRow>();
  if (purchaseIds.length === 0) return latest;
  const rows = await db
    .select()
    .from(paymentAttempts)
    .where(inArray(paymentAttempts.purchaseId, purchaseIds))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id));
  for (const row of rows) if (!latest.has(row.purchaseId)) latest.set(row.purchaseId, row);
  return latest;
}

function orderJson({ purchase, sellerMerchantId, tokenAccount }: OrderRow, attempt: PaymentAttemptRow | null, extras: readonly ExtraTransfer[], now: Date): MerchantOrder {
  const view = derivePurchaseView(purchase, attempt, now);
  const paid = view.state === "paid";
  return {
    id: purchase.id,
    createdAt: purchase.createdAt.toISOString(),
    entryPoint: purchase.entryPoint,
    rail: purchase.rail,
    lines: purchase.lines,
    totalSgdCents: purchase.totalSgdCents,
    currency: purchase.currency,
    state: view.state,
    recipient: sellerMerchantId ? { environment: "sandbox", sellerMerchantId } : null,
    pyusd:
      purchase.rail === "pyusd" && purchase.pyusdAtomicAmount !== null
        ? {
            environment: "devnet",
            amount: formatPyusdAtomic(purchase.pyusdAtomicAmount),
            recipientTokenAccount: attempt?.rail === "pyusd" ? attempt.pyusdDestinationTokenAccount : tokenAccount,
            attemptState: view.pyusdAttempt,
            signature: paid && attempt?.rail === "pyusd" ? attempt.pyusdFinalizedSignature : null,
            extraTransfers: extras.map((transfer) => ({ signature: transfer.signature, amount: transfer.destinationDelta === null ? null : formatPyusdAtomic(transfer.destinationDelta) })),
            closedBy: attempt?.rail !== "pyusd" || attempt.state !== "closed_unpaid" ? null : attempt.outcomeReason === OPERATOR_RESOLUTION ? "operator" : "release",
          }
        : null,
    payment: attempt && attempt.rail !== "pyusd"
      ? {
          environment: "sandbox",
          attemptState: view.paypalAttempt,
          orderId: attempt.orderId,
          // Capture evidence is shown only beside a verified payment.
          captureId: paid ? attempt.captureId : null,
          captureGrossSgdCents: paid ? attempt.captureGrossSgdCents : null,
          captureVerifiedAt: paid ? (attempt.captureVerifiedAt?.toISOString() ?? null) : null,
        }
      : null,
    acknowledgedAt: purchase.acknowledgedAt?.toISOString() ?? null,
    canAcknowledge: paid && purchase.acknowledgedAt === null,
  };
}

const orderColumns = { purchase: purchases, sellerMerchantId: paymentDestinations.sellerMerchantId, tokenAccount: paymentDestinations.tokenAccount };

// One page of the outlet's orders, newest first, older than the order `before` when it is given, so
// every order stays reachable however many follow it. The caller has already checked the membership
// for this outlet. The read is a touch: it stores the transitions the derived view already shows.
export async function listOutletOrders(db: Db, outletId: string, now: Date, before: string | null = null): Promise<OutletOrders | AppError | null> {
  const [outlet] = await db
    .select({ id: outlets.id, name: outlets.name, isDemoFixture: outlets.isDemoFixture })
    .from(outlets)
    .where(eq(outlets.id, outletId))
    .limit(1);
  if (!outlet) return null;
  if (before !== null) {
    const [cursor] = await db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.id, before), eq(purchases.outletId, outletId), inArray(purchases.state, [...ORDER_STATES]), listed))
      .limit(1);
    if (!cursor) return appError("validation_failed", "That order is not one of this shop's orders.", { details: { reason: "unknown_before" } });
  }
  // The cursor is compared in SQL, at the database's own timestamp precision.
  const older = before === null ? undefined : sql`(${purchases.createdAt}, ${purchases.id}) < (select p.created_at, p.id from ${purchases} p where p.id = ${before})`;
  const page = await db
    .select(orderColumns)
    .from(purchases)
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .where(and(eq(purchases.outletId, outletId), inArray(purchases.state, [...ORDER_STATES]), listed, older))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .limit(ORDERS_PAGE + 1);
  const rows = page.slice(0, ORDERS_PAGE);
  const attempts = await latestAttempts(db, rows.map((row) => row.purchase.id));
  const extras = await extraTransfersOf(db, [...attempts.values()].filter((attempt) => attempt.rail === "pyusd").map((attempt) => attempt.id));
  const orders = rows.map((row) => {
    const attempt = attempts.get(row.purchase.id) ?? null;
    return orderJson(row, attempt, (attempt && extras.get(attempt.id)) ?? [], now);
  });
  for (const order of orders) {
    const stored = rows.find((row) => row.purchase.id === order.id)!.purchase.state;
    if (order.state !== stored) await applyDerivedTransitions(db, order.id, now);
  }
  const [archived] = await db
    .select({ n: count() })
    .from(purchases)
    .where(and(eq(purchases.outletId, outletId), inArray(purchases.state, [...ORDER_STATES]), isNotNull(purchases.merchantArchivedAt), not(listed!)));
  return { outlet, orders, archivedCount: archived?.n ?? 0, nextBefore: page.length > ORDERS_PAGE ? rows.at(-1)!.purchase.id : null };
}

export type Acknowledgment = { order: MerchantOrder; changed: boolean };

// Acknowledges a paid order of an outlet the merchant holds a live membership for. An order of any
// other outlet answers exactly like a missing one. Anything but a paid order is refused and nothing
// is written; a repeat changes nothing. Only the two acknowledgment columns are ever written.
export async function acknowledgeOrder(db: Db, input: { purchaseId: string; userId: string; now: Date }): Promise<Acknowledgment | AppError> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select(orderColumns)
      .from(purchases)
      .innerJoin(
        merchantMemberships,
        and(eq(merchantMemberships.outletId, purchases.outletId), eq(merchantMemberships.userId, input.userId), isNull(merchantMemberships.revokedAt)),
      )
      .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
      .where(eq(purchases.id, input.purchaseId))
      .limit(1)
      .for("update", { of: purchases });
    if (!row) return appError("not_found", "Order not found.");
    const attempt = (await latestAttempts(tx, [row.purchase.id])).get(row.purchase.id) ?? null;
    const extras = attempt?.rail === "pyusd" ? ((await extraTransfersOf(tx, [attempt.id])).get(attempt.id) ?? []) : [];
    const order = orderJson(row, attempt, extras, input.now);

    if (row.purchase.state !== "paid") {
      return appError("validation_failed", "Only a paid order can be acknowledged. This order is not paid, so nothing changed.", {
        details: { reason: "payment_not_verified", state: order.state },
      });
    }
    if (row.purchase.acknowledgedAt !== null) return { order, changed: false };

    const [updated] = await tx
      .update(purchases)
      .set({ acknowledgedAt: input.now, acknowledgedByUserId: input.userId })
      .where(eq(purchases.id, row.purchase.id))
      .returning();
    await recordAudit(tx, {
      at: input.now,
      actor: merchantActor(input.userId),
      action: "order_acknowledged",
      purchaseId: row.purchase.id,
      outletId: row.purchase.outletId,
      operatorVisible: false,
    });
    return { order: orderJson({ purchase: updated!, sellerMerchantId: row.sellerMerchantId, tokenAccount: row.tokenAccount }, attempt, extras, input.now), changed: true };
  });
}

export type ArchiveOutcome = { order: MerchantOrder; changed: boolean };

// Archives an order of an outlet the merchant holds a live membership for, in any order state, as
// Gate 1 approved ("all orders, acknowledged or not"). An order of any other outlet, or a review that
// never reached a payment, answers exactly like a missing one. The state shown at that moment is kept
// so the order comes back if it is paid later; a repeat changes nothing. Only the three archive
// columns are ever written, and the database refuses to clear or change them for this role.
export async function archiveOrder(db: Db, input: { purchaseId: string; userId: string; now: Date }): Promise<ArchiveOutcome | AppError> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select(orderColumns)
      .from(purchases)
      .innerJoin(
        merchantMemberships,
        and(eq(merchantMemberships.outletId, purchases.outletId), eq(merchantMemberships.userId, input.userId), isNull(merchantMemberships.revokedAt)),
      )
      .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
      .where(and(eq(purchases.id, input.purchaseId), inArray(purchases.state, [...ORDER_STATES])))
      .limit(1)
      .for("update", { of: purchases });
    if (!row) return appError("not_found", "Order not found.");
    const attempt = (await latestAttempts(tx, [row.purchase.id])).get(row.purchase.id) ?? null;
    const extras = attempt?.rail === "pyusd" ? ((await extraTransfersOf(tx, [attempt.id])).get(attempt.id) ?? []) : [];
    const order = orderJson(row, attempt, extras, input.now);
    if (row.purchase.merchantArchivedAt !== null) return { order, changed: false };

    await tx
      .update(purchases)
      .set({ merchantArchivedAt: input.now, merchantArchivedByUserId: input.userId, merchantArchivedState: order.state })
      .where(eq(purchases.id, row.purchase.id));
    await recordAudit(tx, {
      at: input.now,
      actor: merchantActor(input.userId),
      action: "order_archived",
      purchaseId: row.purchase.id,
      outletId: row.purchase.outletId,
      operatorVisible: false,
    });
    return { order, changed: true };
  });
}

// One archived order as the operator's export writes it (S18): the order as the merchant last saw it,
// with its archive fields. It never carries the buyer's account, a session, a token or a QR payload.
export type ArchivedOrderReceipt = {
  kind: "envoi_archived_order";
  exportedAt: string;
  purchaseId: string;
  outlet: { id: string; name: string; isDemoFixture: boolean };
  lines: StoredLine[];
  totalSgdCents: number;
  currency: string;
  rail: string | null;
  state: PurchaseState;
  payment: MerchantOrder["payment"];
  pyusd: MerchantOrder["pyusd"];
  acknowledgedAt: string | null;
  archivedAt: string;
  archivedByUserId: string;
  archivedState: PurchaseState;
};

// Every archived order, or one outlet's, oldest archive first. A read only: the caller runs it in a
// READ ONLY transaction, so no derived transition is stored.
export async function archivedOrderReceipts(db: Pick<Db, "select">, outletId: string | null, now: Date): Promise<ArchivedOrderReceipt[]> {
  const rows = await db
    .select({ ...orderColumns, outletName: outlets.name, isDemoFixture: outlets.isDemoFixture })
    .from(purchases)
    .innerJoin(outlets, eq(outlets.id, purchases.outletId))
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .where(and(isNotNull(purchases.merchantArchivedAt), outletId === null ? undefined : eq(purchases.outletId, outletId)))
    .orderBy(purchases.merchantArchivedAt, purchases.id);
  const attempts = await latestAttempts(db, rows.map((row) => row.purchase.id));
  const extras = await extraTransfersOf(db, [...attempts.values()].filter((attempt) => attempt.rail === "pyusd").map((attempt) => attempt.id));
  return rows.map((row) => {
    const attempt = attempts.get(row.purchase.id) ?? null;
    const order = orderJson(row, attempt, (attempt && extras.get(attempt.id)) ?? [], now);
    return {
      kind: "envoi_archived_order",
      exportedAt: now.toISOString(),
      purchaseId: order.id,
      outlet: { id: row.purchase.outletId, name: row.outletName, isDemoFixture: row.isDemoFixture },
      lines: order.lines,
      totalSgdCents: order.totalSgdCents,
      currency: order.currency,
      rail: order.rail,
      state: order.state,
      payment: order.payment,
      pyusd: order.pyusd,
      acknowledgedAt: order.acknowledgedAt,
      archivedAt: row.purchase.merchantArchivedAt!.toISOString(),
      archivedByUserId: row.purchase.merchantArchivedByUserId!,
      archivedState: row.purchase.merchantArchivedState as PurchaseState,
    };
  });
}
