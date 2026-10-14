import { and, asc, eq, exists, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { PRE_CAPTURE_STATES } from "@/domain/payments/state";
import { maintenanceRuns, paymentAttempts, purchases, session, type MaintenanceReportJson } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { deadlineOf, durationMs } from "@/lib/time";

// Due-work queries for the maintenance runner (S5). Every claim is a row-level
// UPDATE ... WHERE ... RETURNING, never an advisory lock, so it is safe through any pooler.

export type DueRow = { id: string; dueAt: Date };

// A capture whose outcome Envoi does not know, or a provider read a verified webhook made due.
// Maintenance only reads these; it never creates, captures or replays anything.
export const CAPTURE_OUTCOME_UNKNOWN = ["capture_dispatched", "capture_unknown"] as const;

export const attemptDue = (now: Date): SQL => or(inArray(paymentAttempts.state, [...CAPTURE_OUTCOME_UNKNOWN]), lte(paymentAttempts.providerReadDueAt, now))!;

// Claims up to `limit` due attempts for `owner` until T_LEASE from now. An attempt another runner
// still holds is skipped, so overlapping runs take disjoint attempts; a claim left by a crashed run
// becomes claimable again once its T_LEASE passes.
export async function claimDueAttempts(db: Db, now: Date, limit: number, owner: string): Promise<DueRow[]> {
  const claimFree = or(isNull(paymentAttempts.maintenanceClaimExpiresAt), lte(paymentAttempts.maintenanceClaimExpiresAt, now));
  const candidates = db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(and(attemptDue(now), claimFree))
    .orderBy(asc(sql`coalesce(${paymentAttempts.providerReadDueAt}, ${paymentAttempts.updatedAt})`), asc(paymentAttempts.id))
    .limit(limit)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(paymentAttempts)
    .set({ maintenanceClaimOwner: owner, maintenanceClaimExpiresAt: deadlineOf("T_LEASE", now) })
    .where(and(inArray(paymentAttempts.id, candidates), claimFree))
    .returning({ id: paymentAttempts.id, providerReadDueAt: paymentAttempts.providerReadDueAt, updatedAt: paymentAttempts.updatedAt });
  return claimed
    .map((row) => ({ id: row.id, dueAt: row.providerReadDueAt ?? row.updatedAt }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id));
}

// Gives the claim back and records the check. Only the owner's claim is released.
export async function releaseAttemptClaim(db: Db, attemptId: string, owner: string, checkedAt: Date | null): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({
      maintenanceClaimOwner: null,
      maintenanceClaimExpiresAt: null,
      ...(checkedAt ? { maintenanceChecks: sql`${paymentAttempts.maintenanceChecks} + 1`, maintenanceCheckedAt: checkedAt } : {}),
    })
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.maintenanceClaimOwner, owner)));
}

// Purchases whose stored state lags what derivePurchaseView reads: an open review past T_REVIEW,
// or a pending payment whose attempt never dispatched a capture. Storing them is cleanup only; no
// buyer path waits for it.
export async function expiredReviews(db: Db, now: Date, limit: number): Promise<DueRow[]> {
  const preCaptureAttempt = db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.purchaseId, purchases.id), inArray(paymentAttempts.state, [...PRE_CAPTURE_STATES])));
  const rows = await db
    .select({ id: purchases.id, dueAt: purchases.reviewExpiresAt })
    .from(purchases)
    .where(
      and(
        lte(purchases.reviewExpiresAt, now),
        or(eq(purchases.state, "review_open"), and(eq(purchases.state, "pending_payment"), exists(preCaptureAttempt))),
      ),
    )
    .orderBy(asc(purchases.reviewExpiresAt), asc(purchases.id))
    .limit(limit);
  return rows;
}

// Deletes up to `limit` sessions that expired before `now`. The users they belonged to, and every
// purchase those users own, stay.
export async function purgeExpiredSessions(db: Db, now: Date, limit: number): Promise<number> {
  const expired = db.select({ id: session.id }).from(session).where(lte(session.expiresAt, now)).limit(limit);
  const deleted = await db.delete(session).where(inArray(session.id, expired)).returning({ id: session.id });
  return deleted.length;
}

// The heartbeat: the run's row, written first.
export async function writeHeartbeat(db: Db, run: { id: string; trigger: "manual" | "scheduled"; startedAt: Date }): Promise<void> {
  await db.insert(maintenanceRuns).values({ id: run.id, trigger: run.trigger, status: "running", startedAt: run.startedAt });
}

// pg_database_size covers the current database only; Neon's history and restore storage, which
// also counts against the project limit, is not in it.
export async function recordDatabaseSize(db: Db, runId: string): Promise<number> {
  const [row] = await db.execute<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`);
  const bytes = Number(row?.bytes);
  if (!Number.isSafeInteger(bytes)) throw new Error("pg_database_size returned no size");
  await db.update(maintenanceRuns).set({ databaseSizeBytes: bytes }).where(eq(maintenanceRuns.id, runId));
  return bytes;
}

export async function finishRun(db: Db, runId: string, finishedAt: Date, report: MaintenanceReportJson): Promise<void> {
  await db
    .update(maintenanceRuns)
    .set({ status: report.operatorVisible ? "failed" : "ok", finishedAt, report })
    .where(eq(maintenanceRuns.id, runId));
}

// T_MAINT_OVERDUE: past it, maintenance is overdue for the operator. An alert only.
export function isHeartbeatOverdue(lastHeartbeatAt: Date | null, now: Date): boolean {
  return lastHeartbeatAt === null || now.getTime() - lastHeartbeatAt.getTime() > durationMs("T_MAINT_OVERDUE");
}
