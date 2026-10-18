import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { readOperatorHealth, type OperatorHealth } from "@/domain/maintenance/health";
import { formatPyusdAtomic } from "@/domain/pyusd/rate";
import { getAuth } from "@/lib/auth";
import { isOperator, requireOperator } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { systemNow } from "@/lib/time";
import { webEnv } from "@/env";

export const dynamic = "force-dynamic";

// One guard read per request, shared by the metadata and the page. The metadata is guarded too:
// otherwise its title reaches everyone in the not-found payload and tells the route apart. It
// returns the layout's defaults rather than calling notFound(), which from metadata answers an error
// shell with no page body instead of the not-found page an unknown address gets.
const isOperatorRequest = cache(async () => isOperator(await requireOperator(getAuth(), webDb(), await headers())));

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isOperatorRequest())) return {};
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
      <div className="row stacked">
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
      <div className="rail-head">
        <h2 id="capacity-heading">Capacity</h2>
        {capacity.databaseSizeBytes !== null && <span className={`chip ${capacity.alert ? "warn" : "ok"}`}>{capacity.alert ? "Over 70%" : "Under 70%"}</span>}
      </div>
      {capacity.alert && (
        <p className="status" role="alert">
          Storage has reached 70% of the 1 GB project limit. At the limit, inserts, updates and deletes fail; check the Neon console and free space.
        </p>
      )}
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
            {item.attemptState ? `, attempt ${item.attemptState}` : ""}, since <span className="nowrap">{when(item.since)}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

const usd = (micros: number | null) => (micros === null ? "none recorded" : `US$${(micros / 1_000_000).toFixed(4)}`);

function MenuImports({ health }: { health: OperatorHealth }) {
  const { imports } = health;
  const open = imports.enabled && imports.boundsReviewed && imports.ceilingUsdMicros !== null;
  return (
    <section className="card" aria-labelledby="imports-heading">
      <div className="rail-head">
        <h2 id="imports-heading">Menu photo imports</h2>
        <span className={`chip ${open ? "ok" : "warn"}`}>{open ? "Open" : "Closed"}</span>
      </div>
      <div className="row stacked">
        <span>Vision model</span>
        <span className="mono">{imports.model ?? "not set"}{imports.model && !imports.boundsReviewed ? " (no reviewed bounds)" : ""}</span>
      </div>
      <div className="row">
        <span>Imports switched on</span>
        <strong>{imports.enabled ? "Yes" : "No"}</strong>
      </div>
      <div className="row">
        <span>Admitted today (UTC day)</span>
        <strong>{imports.today.admitted}</strong>
      </div>
      {Object.entries(imports.today.outcomes).map(([outcome, count]) => (
        <div className="row" key={outcome}>
          <span className="mono">{outcome}</span>
          <span>{count}</span>
        </div>
      ))}
      <div className="row">
        <span>Held reservations today, of the daily ceiling</span>
        <strong className="money">
          {usd(imports.today.heldUsdMicros)} of {usd(imports.ceilingUsdMicros)}
        </strong>
      </div>
      <div className="row">
        <span>Recorded spend today</span>
        <strong className="money">{usd(imports.today.actualUsdMicros)}</strong>
      </div>
      <div className="row">
        <span>Slowest import today</span>
        <span>{imports.today.maxLatencyMs === null ? "none" : `${(imports.today.maxLatencyMs / 1000).toFixed(1)} s`}</span>
      </div>
      <div className="row">
        <span>Highest process memory after a decode today</span>
        <span>{imports.today.maxPeakRssBytes === null ? "none" : megabytes(imports.today.maxPeakRssBytes)}</span>
      </div>
      {imports.recent.map((row) => (
        <div className="row stacked" key={row.id}>
          <span className="mono">{row.id}</span>
          <span>
            {row.outcome}, {when(row.admittedAt)}
            {row.latencyMs === null ? "" : `, ${(row.latencyMs / 1000).toFixed(1)} s`}, reserved {usd(row.reservedUsdMicros)}, spent {usd(row.actualUsdMicros)}
            {row.peakRssBytes === null ? "" : `, peak ${megabytes(row.peakRssBytes)}`}
          </span>
        </div>
      ))}
      <p className="fine muted">Peak memory is the process&apos;s highest resident memory so far, read after the decode; Render Free allows 512 MB.</p>
    </section>
  );
}

const GAP_LABEL: Record<string, string> = {
  rate_limited: "devnet RPC rate limit",
  null_transaction: "a candidate transaction was not returned",
  rpc_unavailable: "devnet RPC unreachable",
  too_large: "an RPC answer over 1 MiB",
  page_cap: "per-run page or fetch cap",
  identity_changed: "devnet identity changed",
};

const ATTEMPT_LABEL: Record<string, string> = {
  held_no_match: "Held: complete scan found no transfer",
  mismatch: "Mismatch: a landing failed verification",
  expired_scanning: "Expired, window scan running",
};

function coverageText(scan: OperatorHealth["pyusd"]["attempts"][number]["scan"]): string {
  if (!scan) return "Window scan not started";
  const progress = `${scan.pagesRead} ${scan.pagesRead === 1 ? "page" : "pages"}, ${scan.candidatesChecked} ${scan.candidatesChecked === 1 ? "candidate" : "candidates"} checked`;
  if (scan.complete) return `Window scan complete: reached before preparation; ${progress}`;
  return `Window scan incomplete: ${progress}${scan.lastGap ? `; stopped at ${GAP_LABEL[scan.lastGap] ?? scan.lastGap}` : ""}`;
}

function PyusdRecovery({ health }: { health: OperatorHealth }) {
  const { attempts, extraTransfers } = health.pyusd;
  const attention = attempts.some((row) => row.attemptState !== "expired_scanning") || extraTransfers.some((row) => row.refundReference === null);
  return (
    <section className="card" aria-labelledby="pyusd-heading">
      <div className="rail-head">
        <h2 id="pyusd-heading">PYUSD recovery</h2>
        <span className={`chip ${attention ? "warn" : "ok"}`}>{attention ? "Needs attention" : "Clear"}</span>
      </div>
      <p className="muted">Solana devnet test tokens only. Held and mismatched attempts keep their basket locked; Envoi never marks a mismatch paid.</p>
      {attempts.length === 0 && <p className="muted">No PYUSD attempt is held, in mismatch or scanning.</p>}
      {attempts.map((row) => (
        <div className="row address" key={row.attemptId}>
          <span className="mono">{row.purchaseId}</span>
          <span>
            {ATTEMPT_LABEL[row.attemptState] ?? row.attemptState}, purchase {row.purchaseState}
            {row.reason ? ` (${row.reason})` : ""}, since <span className="nowrap">{when(row.since)}</span>
          </span>
          <span className="muted">{coverageText(row.scan)}</span>
          {row.mismatchSignature && <span className="mono">{row.mismatchSignature}</span>}
        </div>
      ))}
      <h3>Extra transfers</h3>
      {extraTransfers.length === 0 && <p className="muted">No window scan has found an extra transfer.</p>}
      {extraTransfers.map((row) => (
        <div className="row address" key={`${row.attemptId}-${row.signature}`}>
          <span className="mono">{row.signature}</span>
          <span>
            {row.destinationDelta === null ? "Amount unknown (incomplete metadata)" : `${formatPyusdAtomic(BigInt(row.destinationDelta))} PYUSD to the shop`} on devnet, purchase{" "}
            <span className="mono">{row.purchaseId}</span> ({row.purchaseState}), found <span className="nowrap">{when(row.foundAt)}</span>
          </span>
          <span className="muted">
            {row.verification === "verified" ? "Verifies as a copy of the transfer" : `Does not verify (${row.verification})`}; refund reference:{" "}
            {row.refundReference ?? "none recorded"}
          </span>
        </div>
      ))}
      <p className="fine muted">
        An extra transfer never changes the payment state. Envoi does not refund it: any refund is arranged with the shop outside Envoi, and its reference is recorded with
        record-extra-transfer-refund. A mismatch closes only as unpaid, with evidence, after its window scan completes, through resolve-pyusd-mismatch.
      </p>
    </section>
  );
}

// The operator health view (S5). Anyone but a flagged operator gets the same not-found page as an
// unknown address.
export default async function OperatorHealthPage() {
  if (!(await isOperatorRequest())) notFound();
  const health = await readOperatorHealth(webDb(), systemNow(), { enabled: webEnv().MENU_IMPORTS_ENABLED, model: webEnv().AI_MENU_MODEL ?? null });
  return (
    <main>
      <p className="eyebrow">Operator</p>
      <h1>Health</h1>
      <p className="lead">Checked {when(health.checkedAt)}. Sandbox test money and devnet test tokens only; maintenance reads payments and never moves money.</p>
      <div className="stack">
        <Heartbeat health={health} />
        <Capacity health={health} />
        <OverdueWork health={health} />
        <PyusdRecovery health={health} />
        <MenuImports health={health} />
      </div>
    </main>
  );
}
