import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { readImportHealth, type ImportHealth } from "@/domain/imports/health";
import { maintenanceRuns, paymentAttempts, purchases, pyusdExtraTransfers, type MaintenanceReportJson, type StoredScanCoverage } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { durationMs } from "@/lib/time";
import { attemptDue, isHeartbeatOverdue } from "./due";

// The operator health view (Gate 2 "GET /health" private view; S5): the last heartbeat, capacity
// and overdue work. Read by the operator only, behind requireOperator.

// Neon Free's project storage limit as Gate 3 records it, taken as 10^9 bytes so the share shown
// errs high.
export const NEON_STORAGE_LIMIT_BYTES = 1_000_000_000;

// Gate 3's capacity table: record_capacity "alerts the operator at 70%" of the project limit. An
// operator alert only; no import or payment admission depends on it (R2).
export const CAPACITY_ALERT_SHARE = 0.7;

export function isCapacityAlert(databaseSizeBytes: number | null): boolean {
  return databaseSizeBytes !== null && databaseSizeBytes >= CAPACITY_ALERT_SHARE * NEON_STORAGE_LIMIT_BYTES;
}

export const CAPACITY_LIMITATION =
  "pg_database_size covers this database only; Neon's history and restore storage also counts against the project limit and is not included. Read the Neon console for the provider figure.";

export type OverdueItem = { purchaseId: string; purchaseState: string; attemptId: string | null; attemptState: string | null; since: string };

export type OperatorHealth = {
  checkedAt: string;
  heartbeat: { lastAt: string | null; overdue: boolean; overdueAfterMinutes: number };
  lastRun: { id: string; trigger: string; status: string; startedAt: string; finishedAt: string | null; tasks: MaintenanceReportJson["tasks"] } | null;
  capacity: { databaseSizeBytes: number | null; measuredAt: string | null; limitBytes: number; share: number | null; alert: boolean; limitation: string };
  overdueWork: { dueAttempts: number; uncertainPurchases: number; items: OverdueItem[] };
  // Since S11. Menu imports never depend on maintenance; they are shown here for the operator only.
  imports: ImportHealth;
  // Since S17: PYUSD attempts held, in mismatch or still scanning, with their window-scan coverage,
  // and every extra transfer a window scan recorded.
  pyusd: PyusdHealth;
};

export type PyusdAttemptHealth = {
  purchaseId: string;
  purchaseState: string;
  attemptId: string;
  attemptState: string;
  reason: string | null;
  mismatchSignature: string | null;
  scan: (Omit<StoredScanCoverage, "startedAtFinalizedHeight"> & { startedAtFinalizedHeight: string; complete: boolean }) | null;
  since: string;
};

export type ExtraTransferHealth = {
  purchaseId: string;
  purchaseState: string;
  attemptId: string;
  signature: string;
  slot: string;
  destinationDelta: string | null;
  verification: string;
  foundAt: string;
  refundReference: string | null;
};

export type PyusdHealth = { attempts: PyusdAttemptHealth[]; extraTransfers: ExtraTransferHealth[] };

// The PYUSD attempt states an operator watches: held after a complete empty scan, a mismatch only an
// audited operator act can close, and one still scanning after expiry.
export const PYUSD_WATCHED_STATES = ["held_no_match", "mismatch", "expired_scanning"] as const;

async function readPyusdHealth(db: Pick<Db, "select">): Promise<PyusdHealth> {
  const attempts = await db
    .select({
      purchaseId: purchases.id,
      purchaseState: purchases.state,
      attemptId: paymentAttempts.id,
      attemptState: paymentAttempts.state,
      reason: paymentAttempts.outcomeReason,
      mismatchSignature: paymentAttempts.pyusdMismatchSignature,
      scan: paymentAttempts.pyusdScan,
      since: paymentAttempts.updatedAt,
    })
    .from(paymentAttempts)
    .innerJoin(purchases, eq(purchases.id, paymentAttempts.purchaseId))
    .where(and(eq(paymentAttempts.rail, "pyusd"), inArray(paymentAttempts.state, [...PYUSD_WATCHED_STATES])))
    .orderBy(asc(paymentAttempts.createdAt), asc(paymentAttempts.id))
    .limit(ITEMS_SHOWN);
  const extras = await db
    .select({
      purchaseId: purchases.id,
      purchaseState: purchases.state,
      attemptId: pyusdExtraTransfers.attemptId,
      signature: pyusdExtraTransfers.signature,
      slot: pyusdExtraTransfers.slot,
      destinationDelta: pyusdExtraTransfers.destinationDelta,
      verification: pyusdExtraTransfers.verification,
      foundAt: pyusdExtraTransfers.foundAt,
      refundReference: pyusdExtraTransfers.refundReference,
    })
    .from(pyusdExtraTransfers)
    .innerJoin(paymentAttempts, eq(paymentAttempts.id, pyusdExtraTransfers.attemptId))
    .innerJoin(purchases, eq(purchases.id, paymentAttempts.purchaseId))
    .orderBy(desc(pyusdExtraTransfers.foundAt), asc(pyusdExtraTransfers.id))
    .limit(ITEMS_SHOWN);
  return {
    attempts: attempts.map((row) => ({
      ...row,
      scan: row.scan ? { ...row.scan, complete: row.scan.reachedBeforePreparation } : null,
      since: row.since.toISOString(),
    })),
    extraTransfers: extras.map((row) => ({
      ...row,
      slot: row.slot.toString(),
      destinationDelta: row.destinationDelta?.toString() ?? null,
      foundAt: row.foundAt.toISOString(),
    })),
  };
}

const ITEMS_SHOWN = 20;

export async function readOperatorHealth(db: Pick<Db, "select">, now: Date, importConfig: { enabled: boolean; model: string | null } = { enabled: false, model: null }): Promise<OperatorHealth> {
  const [last] = await db.select().from(maintenanceRuns).orderBy(desc(maintenanceRuns.startedAt)).limit(1);
  const [measured] = await db
    .select({ bytes: maintenanceRuns.databaseSizeBytes, at: maintenanceRuns.startedAt })
    .from(maintenanceRuns)
    .where(isNotNull(maintenanceRuns.databaseSizeBytes))
    .orderBy(desc(maintenanceRuns.startedAt))
    .limit(1);

  // Overdue work: attempts maintenance must still check, and purchases Envoi cannot call paid or
  // unpaid. Uncertain is never shown to anyone as paid.
  const overdue = await db
    .select({
      purchaseId: purchases.id,
      purchaseState: purchases.state,
      attemptId: paymentAttempts.id,
      attemptState: paymentAttempts.state,
      since: paymentAttempts.updatedAt,
      createdAt: purchases.createdAt,
      due: sql<boolean>`coalesce(${attemptDue(now)}, false)`.mapWith(Boolean),
    })
    .from(purchases)
    .leftJoin(paymentAttempts, eq(paymentAttempts.purchaseId, purchases.id))
    .where(or(eq(purchases.state, "uncertain"), and(isNotNull(paymentAttempts.id), attemptDue(now))))
    .orderBy(asc(purchases.createdAt), asc(purchases.id));
  const dueAttempts = new Set(overdue.filter((row) => row.due && row.attemptId !== null).map((row) => row.attemptId)).size;
  const uncertainPurchases = new Set(overdue.filter((row) => row.purchaseState === "uncertain").map((row) => row.purchaseId)).size;

  return {
    checkedAt: now.toISOString(),
    heartbeat: {
      lastAt: last?.startedAt.toISOString() ?? null,
      overdue: isHeartbeatOverdue(last?.startedAt ?? null, now),
      overdueAfterMinutes: durationMs("T_MAINT_OVERDUE") / 60_000,
    },
    lastRun: last
      ? { id: last.id, trigger: last.trigger, status: last.status, startedAt: last.startedAt.toISOString(), finishedAt: last.finishedAt?.toISOString() ?? null, tasks: last.report?.tasks ?? [] }
      : null,
    capacity: {
      databaseSizeBytes: measured?.bytes ?? null,
      measuredAt: measured?.at.toISOString() ?? null,
      limitBytes: NEON_STORAGE_LIMIT_BYTES,
      share: measured?.bytes == null ? null : measured.bytes / NEON_STORAGE_LIMIT_BYTES,
      alert: isCapacityAlert(measured?.bytes ?? null),
      limitation: CAPACITY_LIMITATION,
    },
    overdueWork: {
      dueAttempts,
      uncertainPurchases,
      items: overdue.slice(0, ITEMS_SHOWN).map((row) => ({
        purchaseId: row.purchaseId,
        purchaseState: row.purchaseState,
        attemptId: row.attemptId,
        attemptState: row.attemptState,
        since: (row.since ?? row.createdAt).toISOString(),
      })),
    },
    imports: await readImportHealth(db, now, importConfig),
    pyusd: await readPyusdHealth(db),
  };
}

