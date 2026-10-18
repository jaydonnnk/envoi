import { applyDerivedTransitions } from "@/domain/purchases/state";
import { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { reconcilePyusdAttempt, type PyusdCheck } from "@/domain/pyusd/reconcile";
import type { PayPalReadClient } from "@/integrations/paypal/orders-read";
import type { SolanaReadClient } from "@/integrations/solana/rpc";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import type { RedactingLogger } from "@/lib/log";
import { deadlineOf, type Now } from "@/lib/time";
import { isCapacityAlert } from "./health";
import { claimDuePyusdAttempts, expiredReviews, finishRun, purgeExpiredSessions, recordDatabaseSize, releasePyusdClaim, writeHeartbeat } from "./due";
import { reconcileAttempts } from "./paypal-task";

// The maintenance run (Gate 3 Maintenance; S5). A fixed, finite list of tasks, each reading or
// cleaning up existing state. MaintenanceDeps holds no PayPal write client, so no task can create,
// capture or replay a payment, and the runner build cannot reach the capture module (tested). Its
// Solana client (S17) is the read-only SolanaReadClient, which has no send, airdrop or signing
// method, and is null while SOLANA_RPC_URL is unset.

export type TaskName = "heartbeat" | "record_capacity" | "reconcile_attempts" | "reconcile_pyusd_attempts" | "close_expired_reviews" | "purge_expired_sessions";

export type ClaimedWork = { id: string; kind: TaskName; dueAt: Date };

export type TaskOutcome =
  | { status: "ok"; processed: number }
  | { status: "partial"; processed: number; blockedReason: string }
  | { status: "failed"; reason: string; operatorVisible: true };

export type MaintenanceDeps = { paypal: PayPalReadClient; solana: SolanaReadClient | null; now: Now; log: RedactingLogger };

// The run a task belongs to: its id, which is also the heartbeat row, and its trigger.
export type RunContext = { runId: string; trigger: "manual" | "scheduled" };

export type MaintenanceTask = {
  name: TaskName;
  timeoutMs: number;
  limit: number;
  // A task that reads devnet runs only with a Solana client; without one it claims nothing.
  requiresSolana?: true;
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
    // At 70% of the project limit the operator is alerted, here and on the health view.
    deps.log(isCapacityAlert(bytes) ? "warn" : "info", "maintenance_capacity", { runId: run.runId, databaseSizeBytes: bytes });
    return { status: "ok", processed: 1 };
  },
};

// PYUSD reconcile outcomes that read devnet and decided something. The rest (an unreachable or
// changed RPC, a lease another reconcile holds) leave the attempt first in line for the next run.
const PYUSD_CHECKED: readonly PyusdCheck[] = ["nothing_to_read", "not_found", "confirmed", "not_ours", "failed_landing", "uncertain", "scan_incomplete", "scan_complete", "held_no_match", "closed_unpaid"];

// Reads devnet for each due PYUSD attempt through the read-only client, at most two a run, each
// within the per-claim page and fetch caps: hint verification, expiry and the window scan, through
// the same reconcile the buyer's route uses. Without SOLANA_RPC_URL it claims nothing.
const reconcilePyusdAttempts: MaintenanceTask = {
  name: "reconcile_pyusd_attempts",
  timeoutMs: 45_000,
  limit: 2,
  requiresSolana: true,
  async claim(db, now, limit, run) {
    return (await claimDuePyusdAttempts(db, now, limit, run.runId, PYUSD_PROOFS.automaticUnpaidRelease)).map((row) => ({ id: row.id, kind: "reconcile_pyusd_attempts", dueAt: row.dueAt }));
  },
  async run(db, work, deps, run) {
    let checked = false;
    try {
      const outcome = await reconcilePyusdAttempt({ db, rpc: deps.solana, now: deps.now }, work.id, "maintenance", { kind: "runner", owner: run.runId });
      checked = PYUSD_CHECKED.includes(outcome);
      deps.log("info", "maintenance_reconcile_pyusd", { runId: run.runId, attemptId: work.id, outcome });
      return checked ? { status: "ok", processed: 1 } : { status: "partial", processed: 0, blockedReason: outcome };
    } finally {
      await releasePyusdClaim(db, work.id, run.runId, checked ? deps.now() : null);
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

// Exhaustive and in run order.
export const MAINTENANCE_TASKS: readonly MaintenanceTask[] = [heartbeat, recordCapacity, reconcileAttempts, reconcilePyusdAttempts, closeExpiredReviews, purgeSessions];

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

// Resolves with `work`'s result, or with `onTimeout()` once `ms` pass. The timer calls `onTimeout`
// itself, so whatever it marks is marked before any other callback runs. The work is not stopped.
async function withTimeout<T>(ms: number, work: Promise<T>, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), Math.max(0, ms));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const RUN_DEADLINE = "run_deadline";

// The run stops taking work this long before T_MAINT_RUN, leaving time to write its report and
// close its connection before the entrypoint's T_MAINT_RUN kill timer ends the process.
// [hypothesis] 10 seconds, a reviewed constant.
export const RUN_FINISH_RESERVE_MS = 10_000;

// One finite run: the heartbeat, then each task in order, each claiming its due work once and
// processing it until the work runs out, the task's own timeout or the run's deadline, which is
// T_MAINT_RUN less RUN_FINISH_RESERVE_MS. No task loops back for more work. A task that times out
// takes no further item, and the next task starts only once the item it was running has finished,
// or not at all once the run's deadline passes. A failed outcome is operator-visible and fails the
// run. `tasks` is MAINTENANCE_TASKS except in tests, which shorten a task's timeout.
export async function runMaintenance(
  db: Db,
  deps: MaintenanceDeps,
  trigger: RunContext["trigger"],
  tasks: readonly MaintenanceTask[] = MAINTENANCE_TASKS,
): Promise<MaintenanceReport> {
  const run: RunContext = { runId: newId("mnt"), trigger };
  const startedAt = deps.now();
  const deadline = deadlineOf("T_MAINT_RUN", startedAt).getTime() - RUN_FINISH_RESERVE_MS;
  const remaining = () => deadline - deps.now().getTime();
  const reports: TaskReport[] = [];

  for (const task of tasks) {
    if (remaining() <= 0) {
      reports.push(report(task.name, { status: "partial", processed: 0, blockedReason: RUN_DEADLINE }));
      continue;
    }
    if (task.requiresSolana && deps.solana === null) {
      reports.push(report(task.name, { status: "partial", processed: 0, blockedReason: "solana_rpc_unset" }));
      continue;
    }
    let processed = 0;
    let blockedReason: string | null = null;
    let timedOut = false;
    const work = async (): Promise<TaskOutcome> => {
      const claimed = await task.claim(db, task.name === "heartbeat" ? startedAt : deps.now(), task.limit, run);
      for (const item of claimed) {
        if (timedOut) return { status: "partial", processed, blockedReason: `${task.name}_timeout` };
        if (remaining() <= 0) return { status: "partial", processed, blockedReason: RUN_DEADLINE };
        const outcome = await task.run(db, item, deps, run);
        if (outcome.status === "failed") return outcome;
        processed += outcome.processed;
        if (outcome.status === "partial") blockedReason ??= outcome.blockedReason;
      }
      return blockedReason === null ? { status: "ok", processed } : { status: "partial", processed, blockedReason };
    };
    const running = work();
    let outcome: TaskOutcome;
    try {
      outcome = await withTimeout(Math.min(task.timeoutMs, remaining()), running, () => {
        timedOut = true;
        return { status: "failed", reason: `${task.name}_timeout`, operatorVisible: true };
      });
    } catch (err) {
      outcome = { status: "failed", reason: err instanceof Error ? err.name : "Error", operatorVisible: true };
    }
    // The item a timed-out task was running cannot be stopped; the next task waits for it, until
    // the run's deadline at most.
    if (timedOut) {
      await withTimeout(
        remaining(),
        running.then(
          () => undefined,
          () => undefined,
        ),
        () => undefined,
      );
    }
    reports.push(report(task.name, outcome));
    // Without a heartbeat row there is nowhere to report to; the run stops here and fails.
    if (task.name === "heartbeat" && outcome.status !== "ok") break;
  }

  const operatorVisible = reports.some((task) => task.status === "failed");
  const finishedAt = deps.now();
  if (reports[0]?.status === "ok") {
    await finishRun(db, run.runId, finishedAt, { tasks: reports, operatorVisible });
  }
  return { runId: run.runId, trigger, startedAt, finishedAt, tasks: reports, operatorVisible };
}
