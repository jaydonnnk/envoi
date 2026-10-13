import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { rateLimitHits, type RATE_LIMIT_BUCKETS } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";

// Database-backed limiter for public routes (Gate 3 Files; Gate 4 delta D9). S16 adds the
// wallet-challenge and RPC limits to this file.

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

export type RateWindow = { readonly max: number; readonly windowMs: number };

export type RateLimits = { readonly perSubject: RateWindow; readonly global: RateWindow };

// [hypothesis] D9 values, kept as reviewed code constants rather than configuration: at most 10 text
// suggestion requests per buyer in 10 minutes, and 100 across all buyers in an hour. Anonymous
// sessions are free to create, so the global window is a separate guard.
export const SUGGESTION_LIMITS: RateLimits = {
  perSubject: { max: 10, windowMs: 10 * 60_000 },
  global: { max: 100, windowMs: 60 * 60_000 },
};

export type Admission = { kind: "admitted" } | { kind: "rate_limited"; window: "per_subject" | "global" };

// Admits one request for subject when both windows have room, recording it; a refused request
// records nothing. One transaction-scoped advisory lock per bucket serializes admissions, so two
// concurrent requests cannot both take the last slot.
export async function admit(db: Db, bucket: RateLimitBucket, subject: string, limits: RateLimits, now: Date): Promise<Admission> {
  const longest = Math.max(limits.perSubject.windowMs, limits.global.windowMs);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`envoi:ratelimit:${bucket}`}))`);
    await tx.delete(rateLimitHits).where(and(eq(rateLimitHits.bucket, bucket), lte(rateLimitHits.at, new Date(now.getTime() - longest))));

    const [subjectHits] = await tx
      .select({ n: count() })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.bucket, bucket), eq(rateLimitHits.subject, subject), gt(rateLimitHits.at, new Date(now.getTime() - limits.perSubject.windowMs))));
    if ((subjectHits?.n ?? 0) >= limits.perSubject.max) return { kind: "rate_limited", window: "per_subject" };

    const [allHits] = await tx
      .select({ n: count() })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.at, new Date(now.getTime() - limits.global.windowMs))));
    if ((allHits?.n ?? 0) >= limits.global.max) return { kind: "rate_limited", window: "global" };

    await tx.insert(rateLimitHits).values({ id: newId("rlh"), bucket, subject, at: now });
    return { kind: "admitted" };
  });
}
