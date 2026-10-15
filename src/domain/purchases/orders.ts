import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { derivePurchaseView, applyDerivedTransitions, type PaymentAttemptRow, type PurchaseRow, type PurchaseState } from "@/domain/purchases/state";
import { merchantMemberships, outlets, paymentAttempts, paymentDestinations, purchases, type StoredLine } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";

// Merchant orders and acknowledgment (Gate 2 "GET /merchant/outlets/{id}/orders, POST
// /merchant/orders/{id}/acknowledge"; S8). Every state shown is the view derived on read, so an
// abandoned PayPal approval reads unpaid_closed before any maintenance run. Acknowledgment is its own
// field: it is allowed only on a paid order and never writes the payment state.

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
  // The id to pass as `before` for the next older page, or null when no older order exists.
  nextBefore: string | null;
};

const merchantActor = (userId: string) => `merchant:${userId}`;

type OrderRow = { purchase: PurchaseRow; sellerMerchantId: string | null };

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

function orderJson({ purchase, sellerMerchantId }: OrderRow, attempt: PaymentAttemptRow | null, now: Date): MerchantOrder {
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
    payment: attempt
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

const orderColumns = { purchase: purchases, sellerMerchantId: paymentDestinations.sellerMerchantId };

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
      .where(and(eq(purchases.id, before), eq(purchases.outletId, outletId), inArray(purchases.state, [...ORDER_STATES])))
      .limit(1);
    if (!cursor) return appError("validation_failed", "That order is not one of this shop's orders.", { details: { reason: "unknown_before" } });
  }
  // The cursor is compared in SQL, at the database's own timestamp precision.
  const older = before === null ? undefined : sql`(${purchases.createdAt}, ${purchases.id}) < (select p.created_at, p.id from ${purchases} p where p.id = ${before})`;
  const page = await db
    .select(orderColumns)
    .from(purchases)
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .where(and(eq(purchases.outletId, outletId), inArray(purchases.state, [...ORDER_STATES]), older))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .limit(ORDERS_PAGE + 1);
  const rows = page.slice(0, ORDERS_PAGE);
  const attempts = await latestAttempts(db, rows.map((row) => row.purchase.id));
  const orders = rows.map((row) => orderJson(row, attempts.get(row.purchase.id) ?? null, now));
  for (const order of orders) {
    const stored = rows.find((row) => row.purchase.id === order.id)!.purchase.state;
    if (order.state !== stored) await applyDerivedTransitions(db, order.id, now);
  }
  return { outlet, orders, nextBefore: page.length > ORDERS_PAGE ? rows.at(-1)!.purchase.id : null };
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
    const order = orderJson(row, attempt, input.now);

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
    return { order: orderJson({ purchase: updated!, sellerMerchantId: row.sellerMerchantId }, attempt, input.now), changed: true };
  });
}
