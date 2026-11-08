import { and, eq, gte, lt, sql } from "drizzle-orm";
import { paymentAttempts, purchases, refunds } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import type { Currency } from "@/lib/money";

// The sales desk's totals (S46; Gate 2 "GET /merchant/outlets/{id}/sales-summary", Gate 3 Types).
// Computed on the server over every paid order in the range, because the browser holds only one
// page of orders. Only paid orders count: a pending, uncertain or closed order adds nothing, and
// neither does a paid order whose refund PayPal completed, because its money went back to the
// buyer (the user's choice on the S46 Render check, 2026-11-08). A refund still sent or checking
// leaves the order counted: no money is known to have gone back yet.
// PayPal's fee and net are summed only where PayPal gave them; the rest are counted as unknown,
// never added as zero. A PYUSD order moved devnet test tokens straight to the shop, with no PayPal
// fee, so its total is also what reached the shop.

export type RailTotal =
  | { rail: "paypal"; paidMinor: number; paidCount: number; knownFeeMinor: number; knownNetMinor: number; unknownFeeCount: number }
  | { rail: "pyusd"; paidMinor: number; paidCount: number };

export type SalesSummary = {
  currency: Currency;
  paidMinor: number;
  paidCount: number;
  knownFeeMinor: number;
  knownNetMinor: number;
  unknownFeeCount: number;
  byRail: RailTotal[];
};

type Group = { currency: Currency; rail: string | null; paidCount: number; paidMinor: number; knownFeeMinor: number; knownNetMinor: number; unknownFeeCount: number };

// One summary per currency, in a fixed order, from `from` inclusive to `to` exclusive.
export async function salesSummary(db: Db, outletId: string, from: Date, to: Date): Promise<SalesSummary[]> {
  const groups: Group[] = await db
    .select({
      currency: purchases.currency,
      rail: purchases.rail,
      paidCount: sql<number>`count(*)::int`,
      // What the capture verified, as the orders table shows it; the review's total for PYUSD.
      paidMinor: sql<number>`coalesce(sum(coalesce(${paymentAttempts.captureGrossMinor}, ${purchases.totalMinor})), 0)::int`,
      knownFeeMinor: sql<number>`coalesce(sum(${paymentAttempts.captureFeeMinor}), 0)::int`,
      knownNetMinor: sql<number>`coalesce(sum(${paymentAttempts.captureNetMinor}), 0)::int`,
      unknownFeeCount: sql<number>`(count(*) filter (where ${paymentAttempts.captureFeeMinor} is null))::int`,
    })
    .from(purchases)
    // The one confirmed PayPal attempt of a paid PayPal order. A PYUSD order has none and joins null.
    .leftJoin(paymentAttempts, and(eq(paymentAttempts.purchaseId, purchases.id), eq(paymentAttempts.rail, "paypal"), eq(paymentAttempts.state, "capture_confirmed")))
    .where(
      and(
        eq(purchases.outletId, outletId),
        eq(purchases.state, "paid"),
        gte(purchases.createdAt, from),
        lt(purchases.createdAt, to),
        sql`not exists (select 1 from ${refunds} where ${refunds.purchaseId} = ${purchases.id} and ${refunds.state} = 'completed')`,
      ),
    )
    .groupBy(purchases.currency, purchases.rail)
    .orderBy(purchases.currency, purchases.rail);

  const byCurrency = new Map<Currency, SalesSummary>();
  for (const group of groups) {
    const summary = byCurrency.get(group.currency) ?? { currency: group.currency, paidMinor: 0, paidCount: 0, knownFeeMinor: 0, knownNetMinor: 0, unknownFeeCount: 0, byRail: [] };
    summary.paidMinor += group.paidMinor;
    summary.paidCount += group.paidCount;
    if (group.rail === "pyusd") {
      summary.knownNetMinor += group.paidMinor;
      summary.byRail.push({ rail: "pyusd", paidMinor: group.paidMinor, paidCount: group.paidCount });
    } else {
      summary.knownFeeMinor += group.knownFeeMinor;
      summary.knownNetMinor += group.knownNetMinor;
      summary.unknownFeeCount += group.unknownFeeCount;
      summary.byRail.push({ rail: "paypal", paidMinor: group.paidMinor, paidCount: group.paidCount, knownFeeMinor: group.knownFeeMinor, knownNetMinor: group.knownNetMinor, unknownFeeCount: group.unknownFeeCount });
    }
    byCurrency.set(group.currency, summary);
  }
  return [...byCurrency.values()];
}
