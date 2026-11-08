import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { stickerScanCounts } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { log, toSafeErrorRecord } from "@/lib/log";
import { admit, STICKER_SCAN_LIMITS } from "@/lib/ratelimit";
import type { SgqrDecode } from "./decode";
import { isMappable, mappableIdentifier, type MappableIdentifier } from "./validate";

// Stall demand (S48, Gate 2 "Flow: stall demand", Gate 3 "Stall scan"). A buyer's scan of a sticker
// no published shop has mapped adds one to that week's count under a keyed hash. The sticker, its
// identifier and the scanner are never stored: only HMAC-SHA256(scheme, identifier) under
// STICKER_HASH_KEY, which lives only in the environment. A count can be inflated within the
// sticker_scan limit, so it is only ever shown as "scans", never as sales or demand.

// The business identifiers a no-match answer was looked up by: the same rule resolveSgqr applies, so
// a damaged, personal-only or non-SGQR code is never counted.
export function countableIdentifiers(decoded: SgqrDecode): MappableIdentifier[] {
  if (decoded.kind !== "decoded" || !decoded.checksumValid) return [];
  const seen = new Map<string, MappableIdentifier>();
  for (const field of decoded.recognized.map(mappableIdentifier).filter(isMappable)) seen.set(`${field.scheme}\n${field.identifier}`, field);
  return [...seen.values()];
}

// The scheme and identifier are joined by a newline, which neither can contain, so two different
// pairs never hash the same input.
export function stickerHash(scheme: string, identifier: string, key: string): string {
  return createHmac("sha256", key).update(`${scheme}\n${identifier}`, "utf8").digest("hex");
}

// The Monday that starts now's week in Singapore (UTC+8, no daylight saving), as YYYY-MM-DD.
export function scanWeek(now: Date): string {
  const local = new Date(now.getTime() + 8 * 60 * 60_000);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - daysSinceMonday * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

// Never throws to the buyer: a refused or failed count is logged by kind only and changes nothing
// the buyer sees. subject is the limiter's per-buyer key and is never written to the count.
export async function recordNoMatchScan(db: Db, hash: string, subject: string, now: Date): Promise<void> {
  try {
    const admission = await admit(db, "sticker_scan", subject, STICKER_SCAN_LIMITS, now);
    if (admission.kind !== "admitted") {
      log("info", "sticker_scan_not_counted", { reason: "rate_limited", window: admission.window });
      return;
    }
    await db
      .insert(stickerScanCounts)
      .values({ stickerHash: hash, week: scanWeek(now), count: 1 })
      .onConflictDoUpdate({ target: [stickerScanCounts.stickerHash, stickerScanCounts.week], set: { count: sql`${stickerScanCounts.count} + 1` } });
  } catch (err) {
    log("warn", "sticker_scan_not_counted", { reason: "failed", error: toSafeErrorRecord(err, "internal") });
  }
}

// Every week's scans for one sticker, for the merchant who later submits it.
export async function scanCount(db: Pick<Db, "select">, hash: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | null>`sum(${stickerScanCounts.count})` })
    .from(stickerScanCounts)
    .where(eq(stickerScanCounts.stickerHash, hash));
  return Number(row?.total ?? 0);
}
