import { reconcileAttempt, type ReconcileOutcome } from "@/domain/payments/attempts";
import { claimDueAttempts, releaseAttemptClaim } from "./due";
import type { MaintenanceTask } from "./tasks";

// The PayPal maintenance task, in its own module so that reconcile_attempts stays PayPal-only and
// imports nothing from Solana (Gate 3 Maintenance; tested by "PayPal code imports no Solana module").

// Reconcile outcomes that read the attempt's record: only these count as a maintenance check.
// "in_flight" (a completion holds the capture lease) and "debounced" (a provider read happened
// within T_PROVIDER_READ_DEBOUNCE) skip the read, so the attempt stays first in line for the next run.
const CHECKED_OUTCOMES: readonly ReconcileOutcome[] = ["read", "no_record", "no_order"];

// Reads PayPal's record of each due attempt through the read-only client and applies what it
// proves. A capture whose outcome is unknown is never replayed here: replay is null, so an attempt
// PayPal shows no capture for stays uncertain, for the buyer's own check or the operator.
export const reconcileAttempts: MaintenanceTask = {
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
      checked = CHECKED_OUTCOMES.includes(outcome);
      deps.log("info", "maintenance_reconcile", { runId: run.runId, attemptId: work.id, outcome });
      return checked ? { status: "ok", processed: 1 } : { status: "partial", processed: 0, blockedReason: outcome };
    } finally {
      await releaseAttemptClaim(db, work.id, run.runId, checked ? deps.now() : null);
    }
  },
};
