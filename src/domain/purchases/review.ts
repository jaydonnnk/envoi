import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { buyerActor, recordAudit } from "@/domain/audit/events";
import { computeCheckoutKey } from "@/domain/purchases/checkout-key";
import type { PriceQuote } from "@/domain/purchases/price";
import { derivePurchaseView, storeDerivedTransitions, type PaymentAttemptRow, type PurchaseRow, type PurchaseView } from "@/domain/purchases/state";
import { webEnv } from "@/env";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { outlets, paymentAttempts, paymentDestinations, purchases, type StoredLine } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { deadlineOf } from "@/lib/time";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type ReviewCreation =
  | { kind: "created"; purchaseId: string; expiresAt: Date }
  | { kind: "existing_open_review"; purchaseId: string; expiresAt: Date }
  | { kind: "conflict"; error: AppError };

// The newest attempt of a purchase: the active one if any, else the last terminal one.
export async function latestAttempt(db: Conn, purchaseId: string): Promise<PaymentAttemptRow | null> {
  const [row] = await db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.purchaseId, purchaseId))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
    .limit(1);
  return row ?? null;
}

// One open review per buyer and checkout key. A same-key review still inside T_REVIEW is returned
// as it is. A replacement is legal only once every same-key purchase is terminal: one whose money
// could still move (pending_payment not yet abandoned, or uncertain) refuses with execution_locked.
export async function createReview(db: Db, principal: BuyerPrincipal, quote: PriceQuote & { ok: true }, now: Date): Promise<ReviewCreation> {
  const checkoutKey = computeCheckoutKey({
    buyerUserId: principal.userId,
    outletId: quote.outletId,
    menuRevisionId: quote.menuRevisionId,
    destinationId: quote.destinationId,
    rail: quote.rail,
    currency: quote.currency,
    lines: quote.lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
    pyusdRateVersionId: null,
  });

  return db.transaction(async (tx) => {
    const sameKey = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.buyerUserId, principal.userId), eq(purchases.checkoutKey, checkoutKey)))
      .orderBy(asc(purchases.createdAt), asc(purchases.id))
      .for("update");

    let replaces: PurchaseRow | null = null;
    for (const row of sameKey) {
      const view = derivePurchaseView(row, await latestAttempt(tx, row.id), now);
      if (view.state === "review_open") return { kind: "existing_open_review", purchaseId: row.id, expiresAt: row.reviewExpiresAt } as const;
      if (view.state === "pending_payment" || view.state === "uncertain") {
        return {
          kind: "conflict",
          error: appError("execution_locked", "A payment for this basket may still be in progress. Check its receipt first.", {
            details: { purchaseId: row.id },
          }),
        } as const;
      }
      if (view.state !== row.state) await storeDerivedTransitions(tx, row.id, now);
      replaces = view.state === "paid" ? null : row;
    }

    const purchaseId = newId("pur");
    const expiresAt = deadlineOf("T_REVIEW", now);
    const lines: StoredLine[] = quote.lines.map((line) => ({ ...line }));
    const inserted = await tx
      .insert(purchases)
      .values({
        id: purchaseId,
        buyerUserId: principal.userId,
        outletId: quote.outletId,
        menuRevisionId: quote.menuRevisionId,
        state: "review_open",
        entryPoint: "manual",
        lines,
        totalSgdCents: quote.totalSgdCents,
        currency: quote.currency,
        reviewExpiresAt: expiresAt,
        createdAt: now,
        rail: quote.rail,
        destinationId: quote.destinationId,
        destinationVersion: quote.destinationVersion,
        checkoutKey,
        supersedesPurchaseId: replaces?.id ?? null,
      })
      .onConflictDoNothing({ target: [purchases.buyerUserId, purchases.checkoutKey], where: sql`state = 'review_open'` })
      .returning({ id: purchases.id });

    if (inserted.length === 0) {
      // A concurrent request created the open review first; return that one.
      const [open] = await tx
        .select({ id: purchases.id, expiresAt: purchases.reviewExpiresAt })
        .from(purchases)
        .where(and(eq(purchases.buyerUserId, principal.userId), eq(purchases.checkoutKey, checkoutKey), eq(purchases.state, "review_open")));
      if (!open) throw new Error("open review conflict without an open review");
      return { kind: "existing_open_review", purchaseId: open.id, expiresAt: open.expiresAt } as const;
    }

    await recordAudit(tx, {
      at: now,
      actor: buyerActor(principal.userId),
      action: "review_created",
      purchaseId,
      outletId: quote.outletId,
      operatorVisible: false,
      details: { totalSgdCents: quote.totalSgdCents, rail: quote.rail, supersedes: replaces?.id ?? null },
    });
    return { kind: "created", purchaseId, expiresAt } as const;
  });
}

export type OwnPurchase = {
  id: string;
  outletId: string;
  outletName: string;
  outletIsDemoFixture: boolean;
  state: string;
  entryPoint: string;
  rail: string | null;
  lines: StoredLine[];
  totalSgdCents: number;
  currency: string;
  reviewExpiresAt: Date;
  createdAt: Date;
  sellerMerchantId: string | null;
  attempt: PaymentAttemptRow | null;
  view: PurchaseView;
};

// Owner predicate: a purchase is readable only by the session that created it. Anything else is
// indistinguishable from a missing purchase. The returned view is derived on read.
export async function getOwnPurchase(db: Conn, principal: BuyerPrincipal, purchaseId: string, now: Date = new Date()): Promise<OwnPurchase | null> {
  const [row] = await db
    .select({ purchase: purchases, outletName: outlets.name, outletIsDemoFixture: outlets.isDemoFixture, sellerMerchantId: paymentDestinations.sellerMerchantId })
    .from(purchases)
    .innerJoin(outlets, eq(outlets.id, purchases.outletId))
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
    .limit(1);
  if (!row) return null;
  const { purchase } = row;
  const attempt = await latestAttempt(db, purchase.id);
  return {
    id: purchase.id,
    outletId: purchase.outletId,
    outletName: row.outletName,
    outletIsDemoFixture: row.outletIsDemoFixture,
    state: purchase.state,
    entryPoint: purchase.entryPoint,
    rail: purchase.rail,
    lines: purchase.lines,
    totalSgdCents: purchase.totalSgdCents,
    currency: purchase.currency,
    reviewExpiresAt: purchase.reviewExpiresAt,
    createdAt: purchase.createdAt,
    sellerMerchantId: row.sellerMerchantId,
    attempt,
    view: derivePurchaseView(purchase, attempt, now),
  };
}

export type PaymentEligibility =
  | { eligible: true; purchaseId: string; attemptId: string | null } // the active attempt, if one exists
  | { eligible: false; error: AppError };

const refuse = (error: AppError): PaymentEligibility => ({ eligible: false, error });

const ACTIVE = ["created", "create_unknown", "order_created", "externally_approved", "capture_dispatched", "capture_unknown"] as const;

// Every PayPal execution step rechecks, in order: owner, T_REVIEW, purchase state, the published
// revision, the pinned destination and, since 2026-10-12, PAYMENTS_ENABLED (D10).
export async function assertPaymentEligible(db: Conn, purchaseId: string, principal: BuyerPrincipal, now: Date): Promise<PaymentEligibility> {
  const [row] = await db
    .select({ purchase: purchases, publishedRevisionId: outlets.publishedMenuRevisionId, destination: paymentDestinations })
    .from(purchases)
    .innerJoin(outlets, eq(outlets.id, purchases.outletId))
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
    .limit(1);
  if (!row) return refuse(appError("not_found", "Purchase not found."));
  const { purchase, destination } = row;

  if (purchase.rail !== "paypal") {
    return refuse(appError("pyusd_unavailable", "PYUSD has not passed its tests yet.", { details: { reason: "rail_disabled" } }));
  }
  if (now.getTime() >= purchase.reviewExpiresAt.getTime()) {
    return refuse(appError("review_expired", "This review has expired. Review the basket again to pay."));
  }
  switch (purchase.state) {
    case "review_open":
    case "pending_payment":
      break;
    case "paid":
      return refuse(appError("capture_already_dispatched", "This purchase is already paid."));
    case "uncertain":
      return refuse(appError("payment_uncertain", "We are still checking this payment. Do not pay again."));
    case "review_expired":
      return refuse(appError("review_expired", "This review has expired. Review the basket again to pay."));
    default:
      return refuse(appError("review_invalidated", "This review is closed. Review the basket again to pay."));
  }
  if (row.publishedRevisionId !== purchase.menuRevisionId) {
    return refuse(appError("review_invalidated", "The shop changed its menu. Review the basket again.", { details: { reason: "menu_changed" } }));
  }
  if (!destination || destination.status !== "active" || destination.version !== purchase.destinationVersion) {
    return refuse(appError("review_invalidated", "The shop changed how it is paid. Review the basket again.", { details: { reason: "destination_changed" } }));
  }
  if (!webEnv().PAYMENTS_ENABLED) {
    return refuse(appError("payments_disabled", "Payments are switched off in this test environment right now. Nothing was charged."));
  }

  const [active] = await db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.purchaseId, purchaseId), inArray(paymentAttempts.state, [...ACTIVE])))
    .limit(1);
  return { eligible: true, purchaseId, attemptId: active?.id ?? null };
}
