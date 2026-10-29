import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { rateLimitHits, type RATE_LIMIT_BUCKETS } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";

// Database-backed limits for public routes, wallet challenges and the shared Solana RPC budget (Gate 3
// Files; Gate 4 deltas D9 and, from S16, the wallet-challenge and RPC limits). The RPC budget is
// enforced by its own database limiter, src/integrations/solana/limiter.ts, because it counts calls
// per method and holds concurrency slots; its numbers live here with the other limits.

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

export type RateWindow = { readonly max: number; readonly windowMs: number };

// global is null for a bucket with only a per-subject window.
export type RateLimits = { readonly perSubject: RateWindow; readonly global: RateWindow | null };

// [hypothesis] D9 values, kept as reviewed code constants rather than configuration: at most 10 text
// suggestion requests per buyer in 10 minutes, and 100 across all buyers in an hour. Anonymous
// sessions are free to create, so the global window is a separate guard.
export const SUGGESTION_LIMITS: RateLimits = {
  perSubject: { max: 10, windowMs: 10 * 60_000 },
  global: { max: 100, windowMs: 60 * 60_000 },
};

// S25, Gate 3 reopening 2026-10-29 [hypothesis: starting values]: at most 20 Ask Envoi turns per
// buyer in 10 minutes and 150 across all buyers in an hour. Each admitted turn may spend model money,
// so the limiter runs before any model call.
export const ASSISTANT_LIMITS: RateLimits = {
  perSubject: { max: 20, windowMs: 10 * 60_000 },
  global: { max: 150, windowMs: 60 * 60_000 },
};

// S16, Gate 3 "PYUSD merchant wallet and rate": at most 10 wallet challenges per outlet in an hour.
// The subject is the outlet, so a member cannot spread requests across sessions to exceed it.
export const WALLET_CHALLENGE_LIMITS: RateLimits = {
  perSubject: { max: 10, windowMs: 60 * 60_000 },
  global: null,
};

// S16, Gate 3 RPC_BUDGET [hypothesis]: across the web app and the runner, at most 20 Solana RPC calls
// per 10 s, 10 per method, two at once, each abandoned at 10 s and cut off past 1 MiB, and after a
// 429 a shared backoff from 1 s up to 30 s with full jitter. Below the published devnet per-IP
// limits (100 per 10 s, 40 per method, 40 concurrent), with nothing reserved against other tenants
// of Render's outbound address.
export const RPC_BUDGET = {
  windowMs: 10_000,
  globalPerWindow: 20,
  perMethodPerWindow: 10,
  maxConcurrent: 2,
  callTimeoutMs: 10_000,
  slotLeaseMs: 15_000,
  maxResponseBytes: 1_048_576,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
} as const;

export type Admission = { kind: "admitted" } | { kind: "rate_limited"; window: "per_subject" | "global" };

// Admits one request for subject when both windows have room, recording it; a refused request
// records nothing. One transaction-scoped advisory lock per bucket serializes admissions, so two
// concurrent requests cannot both take the last slot.
export async function admit(db: Db, bucket: RateLimitBucket, subject: string, limits: RateLimits, now: Date): Promise<Admission> {
  const longest = Math.max(limits.perSubject.windowMs, limits.global?.windowMs ?? 0);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`envoi:ratelimit:${bucket}`}))`);
    await tx.delete(rateLimitHits).where(and(eq(rateLimitHits.bucket, bucket), lte(rateLimitHits.at, new Date(now.getTime() - longest))));

    const [subjectHits] = await tx
      .select({ n: count() })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.bucket, bucket), eq(rateLimitHits.subject, subject), gt(rateLimitHits.at, new Date(now.getTime() - limits.perSubject.windowMs))));
    if ((subjectHits?.n ?? 0) >= limits.perSubject.max) return { kind: "rate_limited", window: "per_subject" };

    if (limits.global) {
      const [allHits] = await tx
        .select({ n: count() })
        .from(rateLimitHits)
        .where(and(eq(rateLimitHits.bucket, bucket), gt(rateLimitHits.at, new Date(now.getTime() - limits.global.windowMs))));
      if ((allHits?.n ?? 0) >= limits.global.max) return { kind: "rate_limited", window: "global" };
    }

    await tx.insert(rateLimitHits).values({ id: newId("rlh"), bucket, subject, at: now });
    return { kind: "admitted" };
  });
}
