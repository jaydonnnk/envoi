import { and, eq, sql } from "drizzle-orm";
import { outlets, paymentAttempts, purchases } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { CURRENCY_BY_COUNTRY, money, sum, type Country, type Money } from "@/lib/money";

// S28: PayPal's PYUSD rewards, as PayPal advertises them [vendor claim]. A reviewed constant with
// the date it was read, never a fetch: it can go stale, so the card shows the date beside it.
// Changing it means reopening Gate 3.
export const PAYPAL_PYUSD_REWARDS = {
  advertisedAnnualRateBasisPoints: 400, // [vendor claim], variable, PayPal's
  eligibleCountry: "US",
  checkedOn: "2026-10-29",
  sourceUrl: "https://www.paypal.com/us/business/accept-crypto-payments",
} as const satisfies { advertisedAnnualRateBasisPoints: number; eligibleCountry: Country; checkedOn: string; sourceUrl: string };

// "This month" is the outlet's own calendar month, not the server's or the merchant's browser's.
export const OUTLET_TIME_ZONE: Record<Country, string> = { SG: "Asia/Singapore", US: "America/New_York" };

export type RewardsCard = { country: Country; paidThisMonth: Money; eligible: boolean; illustration: Money | null };

// One year at the advertised rate, rounded down so the illustration never overstates.
export function illustrateOneYear(paid: Money, basisPoints: number): Money {
  return money(paid.currency, Math.floor((paid.minor * basisPoints) / 10_000));
}

// What the outlet was paid this month through PayPal: confirmed captures only (a PayPal state; PYUSD
// confirms as `confirmed`), by the time Envoi verified them, in the outlet's currency. A pending,
// uncertain or failed attempt adds nothing.
export async function rewardsCard(db: Pick<Db, "select">, outletId: string, now: Date): Promise<RewardsCard> {
  const [outlet] = await db.select({ country: outlets.country }).from(outlets).where(eq(outlets.id, outletId));
  if (!outlet) throw new Error("rewards card for an unknown outlet");
  const { country } = outlet;
  const zone = OUTLET_TIME_ZONE[country];
  const monthStart = sql`(date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${zone}) at time zone ${zone})`;
  const rows = await db
    .select({ currency: paymentAttempts.currency, minor: sql<string>`sum(${paymentAttempts.captureGrossMinor})` })
    .from(paymentAttempts)
    .innerJoin(purchases, eq(purchases.id, paymentAttempts.purchaseId))
    .where(
      and(
        eq(purchases.outletId, outletId),
        eq(paymentAttempts.state, "capture_confirmed"),
        sql`${paymentAttempts.captureVerifiedAt} >= ${monthStart}`,
        // Up to now, which also ends the month: now is always inside the month it starts.
        sql`${paymentAttempts.captureVerifiedAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .groupBy(paymentAttempts.currency);
  // sum throws on any capture in another currency: it is never added into this shop's total.
  const paidThisMonth = sum(
    CURRENCY_BY_COUNTRY[country],
    rows.map((row) => money(row.currency, Number(row.minor))),
  );
  const eligible = country === PAYPAL_PYUSD_REWARDS.eligibleCountry;
  return { country, paidThisMonth, eligible, illustration: eligible ? illustrateOneYear(paidThisMonth, PAYPAL_PYUSD_REWARDS.advertisedAnnualRateBasisPoints) : null };
}
