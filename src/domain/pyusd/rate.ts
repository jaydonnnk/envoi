import { desc, eq } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import type { OutletMemberPrincipal } from "@/lib/auth-context";
import { pyusdRates } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { requireSgd, type Money } from "@/lib/money";
import { isExpired } from "@/lib/time";

// The shop's own PYUSD rate (Gate 1; Gate 2 "Identity, destination and rate"). A rate is PYUSD atomic
// units (10^-6 PYUSD) per S$1, stored as a positive integer with its confirmation time; each set or
// re-confirmation is a new immutable version. The buyer's amount is rounded up to the next atomic
// unit, so the merchant never receives less than the shop's own rate. No float path exists: text is
// parsed by one strict pattern and every product is BigInt.

export const PYUSD_RATE_BOUNDS = { minAtomicPerSgd: 1n, maxAtomicPerSgd: 10_000_000n } as const; // 0.000001 to 10 PYUSD per S$1

export type PyusdRate = { versionId: string; outletId: string; atomicPerSgd: bigint; confirmedAt: Date };

// Digits, then optionally a point and one to six digits. No sign, exponent, space or separator.
const PLAIN_DECIMAL = /^(\d{1,8})(?:\.(\d{1,6}))?$/;

export function parsePyusdPerSgd(text: string): { ok: true; atomicPerSgd: bigint } | { ok: false; reason: "not_plain_six_place_decimal" | "out_of_bounds" } {
  const match = PLAIN_DECIMAL.exec(text);
  if (!match) return { ok: false, reason: "not_plain_six_place_decimal" };
  const [, whole, fraction = ""] = match;
  const atomicPerSgd = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (atomicPerSgd < PYUSD_RATE_BOUNDS.minAtomicPerSgd || atomicPerSgd > PYUSD_RATE_BOUNDS.maxAtomicPerSgd) return { ok: false, reason: "out_of_bounds" };
  return { ok: true, atomicPerSgd };
}

// Expired once T_RATE_AGE has passed since confirmation, computed on read.
export function isRateExpired(rate: Pick<PyusdRate, "confirmedAt">, now: Date): boolean {
  return isExpired("T_RATE_AGE", rate.confirmedAt, now);
}

// ceil(cents * atomicPerSgd / 100), in BigInt only. Accepts any positive SGD amount money allows
// (a safe integer of cents) and any rate inside the bounds; any other currency throws.
export function pyusdAtomicFor(amount: Money, atomicPerSgd: bigint): bigint {
  const sgdCents = requireSgd(amount).minor;
  if (!Number.isSafeInteger(sgdCents) || sgdCents <= 0) throw new RangeError("SGD amount must be a positive whole number of cents");
  if (atomicPerSgd < PYUSD_RATE_BOUNDS.minAtomicPerSgd || atomicPerSgd > PYUSD_RATE_BOUNDS.maxAtomicPerSgd) throw new RangeError("rate outside its bounds");
  const product = BigInt(sgdCents) * atomicPerSgd;
  return (product + 99n) / 100n;
}

// The exact six-place decimal form, for example 742115n -> "0.742115".
export function formatPyusdPerSgd(atomicPerSgd: bigint): string {
  return formatPyusdAtomic(atomicPerSgd);
}

// An atomic PYUSD amount as an exact six-place decimal, for example 2597403n -> "2.597403".
export function formatPyusdAtomic(atomic: bigint): string {
  if (atomic < 0n) throw new RangeError("PYUSD amounts are never negative");
  return `${atomic / 1_000_000n}.${String(atomic % 1_000_000n).padStart(6, "0")}`;
}

// The shop's rate: its newest version, whatever its age. Callers judge the age on read.
export async function latestPyusdRate(db: Pick<Db, "select">, outletId: string): Promise<PyusdRate | null> {
  const [row] = await db
    .select()
    .from(pyusdRates)
    .where(eq(pyusdRates.outletId, outletId))
    .orderBy(desc(pyusdRates.confirmedAt), desc(pyusdRates.id))
    .limit(1);
  return row ? { versionId: row.id, outletId: row.outletId, atomicPerSgd: row.atomicPerSgd, confirmedAt: row.confirmedAt } : null;
}

// Appends a new version, even for an unchanged value: re-confirming restarts T_RATE_AGE, and open
// PYUSD reviews priced at the older version fail at preparation. A prepared attempt keeps its amount.
export async function setPyusdRate(db: Db, principal: OutletMemberPrincipal, atomicPerSgd: bigint, now: Date): Promise<PyusdRate> {
  return db.transaction(async (tx) => {
    const versionId = newId("rat");
    await tx.insert(pyusdRates).values({ id: versionId, outletId: principal.outletId, atomicPerSgd, confirmedAt: now, confirmedByUserId: principal.userId });
    await recordAudit(tx, {
      at: now,
      actor: `merchant:${principal.userId}`,
      action: "pyusd_rate_confirmed",
      outletId: principal.outletId,
      operatorVisible: true,
      details: { rateVersionId: versionId, pyusdPerSgd: formatPyusdPerSgd(atomicPerSgd) },
    });
    return { versionId, outletId: principal.outletId, atomicPerSgd, confirmedAt: now };
  });
}
