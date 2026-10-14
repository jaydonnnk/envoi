import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { readOperatorHealth, type OperatorHealth } from "@/domain/maintenance/health";
import { getAuth } from "@/lib/auth";
import { isOperator, requireOperator } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// One guard read per request, shared by the metadata and the page. The metadata is guarded too:
// otherwise its title reaches everyone in the not-found payload and tells the route apart.
const isOperatorRequest = cache(async () => isOperator(await requireOperator(getAuth(), webDb(), await headers())));

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isOperatorRequest())) notFound();
  return { title: "Operator health | Envoi", robots: { index: false, follow: false } };
}

const SINGAPORE = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "medium" });

const when = (iso: string | null) => (iso ? `${SINGAPORE.format(new Date(iso))} SGT` : "never");
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function Heartbeat({ health }: { health: OperatorHealth }) {
  const { heartbeat, lastRun } = health;
  return (
    <section className="card" aria-labelledby="heartbeat-heading">
      <div className="rail-head">
        <h2 id="heartbeat-heading">Maintenance heartbeat</h2>
        <span className={`chip ${heartbeat.overdue ? "warn" : "ok"}`}>{heartbeat.overdue ? "Overdue" : "On time"}</span>
      </div>
      <div className="row">
        <span>Last heartbeat</span>
        <strong>{when(heartbeat.lastAt)}</strong>
      </div>
      {lastRun && (
        <>
          <div className="row stacked">
            <span>Last run</span>
            <span className="mono">{lastRun.id}</span>
          </div>
          <div className="row">
            <span>Trigger and result</span>
            <span>
              {lastRun.trigger === "manual" ? "Manual run" : "Scheduled run"}, {lastRun.status === "running" ? "still running or stopped" : lastRun.status}
            </span>
          </div>
          {lastRun.tasks.map((task) => (
            <div className="row" key={task.name}>
              <span className="mono">{task.name}</span>
              <span>
                {task.status}, {task.processed} done{task.reason ? ` (${task.reason})` : ""}
              </span>
            </div>
          ))}
        </>
      )}
      <p className="fine muted">Overdue after {heartbeat.overdueAfterMinutes} minutes without a heartbeat. An operator alert only: no payment or import waits for maintenance.</p>
    </section>
  );
}

function Capacity({ health }: { health: OperatorHealth }) {
  const { capacity } = health;
  return (
    <section className="card" aria-labelledby="capacity-heading">
      <h2 id="capacity-heading">Capacity</h2>
      <div className="row">
        <span>Database size</span>
        <strong className="money">{capacity.databaseSizeBytes === null ? "not measured yet" : megabytes(capacity.databaseSizeBytes)}</strong>
      </div>
      <div className="row">
        <span>Share of the 1 GB project limit</span>
        <strong className="money">{capacity.share === null ? "unknown" : `${(capacity.share * 100).toFixed(1)}%`}</strong>
      </div>
      <div className="row">
        <span>Measured</span>
        <span>{when(capacity.measuredAt)}</span>
      </div>
      <p className="fine muted">{capacity.limitation}</p>
    </section>
  );
}

function OverdueWork({ health }: { health: OperatorHealth }) {
  const { overdueWork } = health;
  return (
    <section className="card" aria-labelledby="overdue-heading">
      <h2 id="overdue-heading">Overdue work</h2>
      <div className="row">
        <span>Attempts waiting for a maintenance check</span>
        <strong>{overdueWork.dueAttempts}</strong>
      </div>
      <div className="row">
        <span>Purchases checking payment (uncertain, never shown as paid)</span>
        <strong>{overdueWork.uncertainPurchases}</strong>
      </div>
      {overdueWork.items.map((item) => (
        <div className="row stacked" key={`${item.purchaseId}-${item.attemptId ?? "none"}`}>
          <span className="mono">{item.purchaseId}</span>
          <span>
            {item.purchaseState}
            {item.attemptState ? `, attempt ${item.attemptState}` : ""}, since {when(item.since)}
          </span>
        </div>
      ))}
    </section>
  );
}

// The operator health view (S5). Anyone but a flagged operator gets the same not-found page as an
// unknown address.
export default async function OperatorHealthPage() {
  if (!(await isOperatorRequest())) notFound();
  const health = await readOperatorHealth(webDb(), systemNow());
  return (
    <main>
      <p className="eyebrow">Operator</p>
      <h1>Health</h1>
      <p className="lead">Checked {when(health.checkedAt)}. Sandbox test money only; maintenance reads payments and never moves money.</p>
      <div className="stack">
        <Heartbeat health={health} />
        <Capacity health={health} />
        <OverdueWork health={health} />
      </div>
    </main>
  );
}
