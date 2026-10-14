import { runMaintenance, type RunContext } from "@/domain/maintenance/tasks";
import { loadLocalEnvFile, maintenanceEnv } from "@/env";
import { paypalConfigFromEnv } from "@/integrations/paypal/client";
import { createPayPalReadClient } from "@/integrations/paypal/orders-read";
import { connectRunner } from "@/lib/db/runner";
import { isEntrypoint } from "@/lib/entrypoint";
import { log, redact } from "@/lib/log";
import { durationMs, systemNow } from "@/lib/time";

// Maintenance entrypoint (Gate 3 call stack "Maintenance run"; S5). Compiled by `npm run
// runner:build` and started by `npm run runner:start`: connect as envoi_maintenance, run every task
// once, write the report, close the connection and exit, non-zero when any outcome is
// operator-visible. It holds only a PayPal read client. Pass --trigger=scheduled from a schedule;
// every other start is recorded as manual.

export async function main(argv: readonly string[]): Promise<number> {
  loadLocalEnvFile();
  const env = maintenanceEnv();
  process.env.LOG_LEVEL ??= env.LOG_LEVEL;
  const trigger: RunContext["trigger"] = argv.includes("--trigger=scheduled") ? "scheduled" : "manual";
  const { db, close } = connectRunner(env.MAINTENANCE_DATABASE_URL);
  try {
    const report = await runMaintenance(db, { paypal: createPayPalReadClient(paypalConfigFromEnv(env)), solana: null, now: systemNow, log }, trigger);
    log(report.operatorVisible ? "error" : "info", "maintenance_run_finished", {
      runId: report.runId,
      trigger: report.trigger,
      startedAt: report.startedAt.toISOString(),
      finishedAt: report.finishedAt.toISOString(),
      tasks: report.tasks.map((task) => `${task.name}:${task.status}:${task.processed}${task.reason ? `:${task.reason}` : ""}`).join(" "),
    });
    return report.operatorVisible ? 1 : 0;
  } finally {
    await close();
  }
}

if (isEntrypoint(import.meta.url)) {
  // The run never outlives T_MAINT_RUN: if anything still holds the process open by then, it ends.
  // runMaintenance stops taking work RUN_FINISH_RESERVE_MS earlier, so its report is written first.
  setTimeout(() => {
    log("error", "maintenance_run_killed", { afterMs: durationMs("T_MAINT_RUN") });
    process.exit(1);
  }, durationMs("T_MAINT_RUN")).unref();
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      log("error", "maintenance_run_failed", { error: redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error") });
      process.exitCode = 1;
    });
}
