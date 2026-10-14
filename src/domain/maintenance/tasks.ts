import { reconcileAttempt } from "@/domain/payments/attempts";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import type { PayPalReadClient } from "@/integrations/paypal/orders-read";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import type { RedactingLogger } from "@/lib/log";
import { deadlineOf, type Now } from "@/lib/time";
import { claimDueAttempts, expiredReviews, finishRun, purgeExpiredSessions, recordDatabaseSize, releaseAttemptClaim, writeHeartbeat } from "./due";

// The maintenance run (Gate 3 Maintenance; S5). A fixed, finite list of tasks, each reading or
// cleaning up existing state. MaintenanceDeps holds no PayPal write client, so no task can create,
// capture or replay a payment, and the runner build cannot reach the capture module (tested).

export type TaskName = "heartbeat" | "record_capacity" | "reconcile_attempts" | "reconcile_pyusd_attempts" | "close_expired_reviews" | "purge_expired_sessions";

export type ClaimedWork = { id: string; kind: TaskName; dueAt: Date };

export type TaskOutcome =
  | { status: "ok"; processed: number }
  | { status: "partial"; processed: number; blockedReason: string }
  | { status: "failed"; reason: string; operatorVisible: true };

// S17 adds the PYUSD read client; until then there is none.
export type MaintenanceDeps = { paypal: PayPalReadClient; solana: null; now: Now; log: RedactingLogger };

// The run a task belongs to: its id, which is also the heartbeat row, and its trigger.
export type RunContext = { runId: string; trigger: "manual" | "scheduled" };

export type MaintenanceTask = {
  name: TaskName;
  timeoutMs: number;
  limit: number;
  claim(db: Db, now: Date, limit: number, run: RunContext): Promise<ClaimedWork[]>;
  run(db: Db, work: ClaimedWork, deps: MaintenanceDeps, run: RunContext): Promise<TaskOutcome>;
};

const once = (kind: TaskName) => async (_db: Db, now: Date, _limit: number, run: RunContext): Promise<ClaimedWork[]> => [{ id: run.runId, kind, dueAt: now }];

const heartbeat: MaintenanceTask = {
  name: "heartbeat",
  timeoutMs: 15_000,
  limit: 1,
  claim: once("heartbeat"),
  async run(db, work, _deps, run) {
    await writeHeartbeat(db, { id: run.runId, trigger: run.trigger, startedAt: work.dueAt });
    return { status: "ok", processed: 1 };
  },
};

const recordCapacity: MaintenanceTask = {
  name: "record_capacity",
  timeoutMs: 15_000,
  limit: 1,
  claim: once("record_capacity"),
  async run(db, _work, deps, run) {
    const bytes = await recordDatabaseSize(db, run.runId);
    deps.log("info", "maintenance_capacity", { runId: run.runId, databaseSizeBytes: bytes });
    return { status: "ok", processed: 1 };
  },
};

// Reads PayPal's record of each due attempt through the read-only client and applies what it
// proves. A capture whose outcome is unknown is never replayed here: replay is null, so an attempt
// PayPal shows no capture for stays uncertain, for the buyer's own check or the operator.
const reconcileAttempts: MaintenanceTask = {
  name: "reconcile_attempts",
  timeoutMs: 75_000,
  limit: 10,
  async claim(db, now, limit, run) {
    return (await claimDueAttempts(db, now, limit, run.runId)).map((row) => ({ id: row.id, kind: "reconcile_attempts", dueAt: row.dueAt }));
  },
  async run(db, work, deps, run) {
    let checked = false;
    try {
      const outcome = await reconcileAttempt({ db, read: deps.paypal, replay: null, now: deps.now, actor: "maintenance" }, work.id);
      checked = outcome !== "provider_unreachable";
      deps.log("info", "maintenance_reconcile", { runId: run.runId, attemptId: work.id, outcome });
      return checked ? { status: "ok", processed: 1 } : { status: "partial", processed: 0, blockedReason: "provider_unreachable" };
    } finally {
      await releaseAttemptClaim(db, work.id, run.runId, checked ? deps.now() : null);
    }
  },
};

const closeExpiredReviews: MaintenanceTask = {
  name: "close_expired_reviews",
  timeoutMs: 20_000,
  limit: 100,
  async claim(db, now, limit) {
    return (await expiredReviews(db, now, limit)).map((row) => ({ id: row.id, kind: "close_expired_reviews", dueAt: row.dueAt }));
  },
  async run(db, work, deps) {
    await applyDerivedTransitions(db, work.id, deps.now());
    return { status: "ok", processed: 1 };
  },
};

const SESSIONS_PER_RUN = 500;

const purgeSessions: MaintenanceTask = {
  name: "purge_expired_sessions",
  timeoutMs: 20_000,
  limit: 1,
  claim: once("purge_expired_sessions"),
  async run(db, _work, deps, run) {
    const deleted = await purgeExpiredSessions(db, deps.now(), SESSIONS_PER_RUN);
    deps.log("info", "maintenance_sessions_purged", { runId: run.runId, deleted });
    return { status: "ok", processed: deleted };
  },
};

// Exhaustive and in run order. reconcile_pyusd_attempts joins in S17, so that edit shows there.
export const MAINTENANCE_TASKS: readonly MaintenanceTask[] = [heartbeat, recordCapacity, reconcileAttempts, closeExpiredReviews, purgeSessions];

export type TaskReport = { name: TaskName; status: "ok" | "partial" | "failed"; processed: number; reason: string | null };

export type MaintenanceReport = {
  runId: string;
  trigger: RunContext["trigger"];
  startedAt: Date;
  finishedAt: Date;
  tasks: TaskReport[];
  operatorVisible: boolean;
};

function report(name: TaskName, outcome: TaskOutcome): TaskReport {
  if (outcome.status === "failed") return { name, status: "failed", processed: 0, reason: outcome.reason };
  return { name, status: outcome.status, processed: outcome.processed, reason: outcome.status === "partial" ? outcome.blockedReason : null };
}

// Resolves with `onTimeout` once `ms` pass. The work itself is not cancelled; the entrypoint ends
// the process, and with it any call still running, when the run is over.
async function withTimeout<T>(ms: number, work: () => Promise<T>, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), Math.max(0, ms));
  });
  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const RUN_DEADLINE = "run_deadline";

// One finite run: the heartbeat, then each task in order, each claiming its due work once and
// processing it until the work runs out, the task's own timeout or the run's T_MAINT_RUN deadline.
// No task loops back for more work. A failed outcome is operator-visible and fails the run.
export async function runMaintenance(db: Db, deps: MaintenanceDeps, trigger: RunContext["trigger"]): Promise<MaintenanceReport> {
  const run: RunContext = { runId: newId("mnt"), trigger };
  const startedAt = deps.now();
  const deadline = deadlineOf("T_MAINT_RUN", startedAt).getTime();
  const remaining = () => deadline - deps.now().getTime();
  const tasks: TaskReport[] = [];

  for (const task of MAINTENANCE_TASKS) {
    if (remaining() <= 0) {
      tasks.push(report(task.name, { status: "partial", processed: 0, blockedReason: RUN_DEADLINE }));
      continue;
    }
    let processed = 0;
    let blockedReason: string | null = null;
    const work = async (): Promise<TaskOutcome> => {
      const claimed = await task.claim(db, task.name === "heartbeat" ? startedAt : deps.now(), task.limit, run);
      for (const item of claimed) {
        if (remaining() <= 0) return { status: "partial", processed, blockedReason: RUN_DEADLINE };
        const outcome = await task.run(db, item, deps, run);
        if (outcome.status === "failed") return outcome;
        processed += outcome.processed;
        if (outcome.status === "partial") blockedReason ??= outcome.blockedReason;
      }
      return blockedReason === null ? { status: "ok", processed } : { status: "partial", processed, blockedReason };
    };
    let outcome: TaskOutcome;
    try {
      outcome = await withTimeout(Math.min(task.timeoutMs, remaining()), work, { status: "failed", reason: `${task.name}_timeout`, operatorVisible: true });
    } catch (err) {
      outcome = { status: "failed", reason: err instanceof Error ? err.name : "Error", operatorVisible: true };
    }
    tasks.push(report(task.name, outcome));
    // Without a heartbeat row there is nowhere to report to; the run stops here and fails.
    if (task.name === "heartbeat" && outcome.status !== "ok") break;
  }

  const operatorVisible = tasks.some((task) => task.status === "failed");
  const finishedAt = deps.now();
  if (tasks[0]?.status === "ok") {
    await finishRun(db, run.runId, finishedAt, { tasks, operatorVisible });
  }
  return { runId: run.runId, trigger, startedAt, finishedAt, tasks, operatorVisible };
}
