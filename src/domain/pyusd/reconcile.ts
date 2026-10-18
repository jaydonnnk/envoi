import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { checkPyusdIdentity } from "@/domain/pyusd/identity";
import { epochOfSlot, feeAtEpoch, type EpochSchedule } from "@/domain/pyusd/mint";
import { applyScanOutcome, applyScanPage, classifyScanCandidate, decideRecoveryStep, isScanComplete, startScanCoverage } from "@/domain/pyusd/recovery";
import { canTransitionPyusdAttempt, scanToStored, toPyusdAttempt, type PyusdAttempt, type PyusdAttemptState, type ScanCoverage, type ScanGap } from "@/domain/pyusd/state";
import { verifyPyusdTransfer, type VerificationResult } from "@/domain/pyusd/verify";
import { canTransitionPurchase, transitionPurchase, type PurchaseState } from "@/domain/purchases/state";
import type { RpcResult, SolanaReadClient } from "@/integrations/solana/rpc";
import { paymentAttempts, PURCHASE_STATES, type StoredSignatureHint } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { deadlineOf, durationMs, type Now } from "@/lib/time";

// PYUSD reconcile (Gate 3 call stack "PYUSD recovery"), shared by the buyer's reconcile route and the
// maintenance task reconcile_pyusd_attempts. Both claim the attempt lease (T_LEASE) first, so a web
// reconcile and a runner never read or scan one attempt at once; the web path is also debounced by
// T_PROVIDER_READ_DEBOUNCE per attempt. Neither checks PYUSD_ENABLED, so a prepared attempt still
// converges with the rail switched off. No RPC call runs inside a database transaction, and every
// state change is a compare-and-set after the read. This module imports no web setting, so the
// maintenance runner can load it.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type ReconcileDeps = { db: Db; rpc: SolanaReadClient | null; now: Now };

// Per claim, as Gate 3's capacity table budgets it.
export const SCAN_CAPS = { pages: 3, fetches: 20 } as const;
const PAGE_LIMIT = 1000;

export type PyusdCheck =
  | "debounced"
  | "in_flight"
  | "nothing_to_read"
  | "rpc_unavailable"
  | "identity_changed"
  | "not_found"
  | VerificationResult["decision"]
  | "scan_incomplete"
  | "scan_complete"
  | "held_no_match"
  | "closed_unpaid";

// web: the buyer's reconcile route, debounced; runner: a maintenance claim already holding the lease
// under `owner`.
export type ReconcileMode = { kind: "web" } | { kind: "runner"; owner: string };

// The hint that may be read now: the oldest one still unread or not found, and only while every
// older hint is decided not ours or a failed landing. A hint behind an undecided one waits.
export function readableHint(hints: PyusdAttempt["hints"]): { index: number; signature: string } | null {
  for (let index = 0; index < hints.length; index += 1) {
    const decision = hints[index]!.decision;
    if (decision === "not_ours" || decision === "failed_landing") continue;
    if (decision === "unread" || decision === "not_found") return { index, signature: hints[index]!.signature };
    return null;
  }
  return null;
}

// Nothing can change without a reconcile: a closed attempt, a held one while release is off, and a
// confirmed or mismatched one whose window scan is complete.
export function recoverySettled(attempt: Pick<PyusdAttempt, "state" | "scan">): boolean {
  switch (attempt.state) {
    case "closed_unpaid":
      return true;
    case "held_no_match":
      return !PYUSD_PROOFS.automaticUnpaidRelease;
    case "confirmed":
    case "mismatch":
      return isScanComplete(attempt.scan);
    default:
      return false;
  }
}

// Starts a debounce window by compare-and-set; false while one is still open.
async function claimRead(db: Db, attemptId: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - durationMs("T_PROVIDER_READ_DEBOUNCE"));
  const claimed = await db
    .update(paymentAttempts)
    .set({ lastProviderReadAt: now })
    .where(and(eq(paymentAttempts.id, attemptId), or(isNull(paymentAttempts.lastProviderReadAt), lte(paymentAttempts.lastProviderReadAt, windowStart))))
    .returning({ id: paymentAttempts.id });
  return claimed.length === 1;
}

// Claims the attempt lease until T_LEASE from now: free, expired, or already held by `owner`.
export async function claimPyusdLease(db: Db, attemptId: string, owner: string, now: Date): Promise<boolean> {
  const claimed = await db
    .update(paymentAttempts)
    .set({ leaseOwner: owner, leaseExpiresAt: deadlineOf("T_LEASE", now) })
    .where(
      and(
        eq(paymentAttempts.id, attemptId),
        eq(paymentAttempts.rail, "pyusd"),
        or(isNull(paymentAttempts.leaseExpiresAt), lte(paymentAttempts.leaseExpiresAt, now), eq(paymentAttempts.leaseOwner, owner)),
      ),
    )
    .returning({ id: paymentAttempts.id });
  return claimed.length === 1;
}

export async function releasePyusdLease(db: Db, attemptId: string, owner: string): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ leaseOwner: null, leaseExpiresAt: null })
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.leaseOwner, owner)));
}

async function decideHint(db: Conn, attemptId: string, index: number, signature: string, decision: StoredSignatureHint["decision"]): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ pyusdHints: sql`jsonb_set(${paymentAttempts.pyusdHints}, ${`{${index},decision}`}::text[], ${JSON.stringify(decision)}::jsonb)` })
    .where(and(eq(paymentAttempts.id, attemptId), sql`${paymentAttempts.pyusdHints} -> ${index}::int ->> 'signature' = ${signature}`));
}

function assertPyusdTransition(from: PyusdAttemptState, to: PyusdAttemptState): void {
  if (!canTransitionPyusdAttempt(from, to)) throw new Error(`illegal PYUSD attempt transition ${from} -> ${to}`);
}

function purchaseStatesInto(to: PurchaseState, reason: string): PurchaseState[] {
  return PURCHASE_STATES.filter((from) => canTransitionPurchase({ from, to, reason }));
}

const gapOf = (result: Exclude<RpcResult<unknown>, { kind: "ok" }>): ScanGap =>
  result.kind === "too_large" ? "too_large" : result.kind === "unavailable" ? "rpc_unavailable" : "rate_limited";

async function loadAttempt(db: Db, attemptId: string): Promise<PyusdAttempt | null> {
  const rows = await db.select().from(paymentAttempts).where(and(eq(paymentAttempts.rail, "pyusd"), eq(paymentAttempts.id, attemptId)));
  return rows[0] ? toPyusdAttempt(rows[0]) : null;
}

// Saves coverage while this reconcile holds the lease, and only over an existing scan.
async function saveCoverage(db: Db, attemptId: string, owner: string, coverage: ScanCoverage, now: Date): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ pyusdScan: scanToStored(coverage), updatedAt: now })
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.leaseOwner, owner), sql`${paymentAttempts.pyusdScan} is not null`));
}

// Verifies the readable hint of a prepared attempt at finalized (S16's hint branch), on either side
// of the bound. The caller holds the lease and the debounce.
async function verifyReadableHint(deps: ReconcileDeps, rpc: SolanaReadClient, attempt: PyusdAttempt, hint: { index: number; signature: string }, actor: string): Promise<PyusdCheck> {
  const { db } = deps;
  const attemptId = attempt.id;
  const read = await rpc.getTransactionFinalized(hint.signature);
  if (read.kind !== "ok") return "rpc_unavailable";
  if (read.value === null) {
    await decideHint(db, attemptId, hint.index, hint.signature, "not_found");
    return "not_found";
  }
  const schedule = await rpc.getEpochSchedule();
  if (schedule.kind !== "ok") return "rpc_unavailable";
  const now = deps.now();
  const result = verifyPyusdTransfer(read.value, attempt, feeAtEpoch(attempt.fee, epochOfSlot(schedule.value, read.value.slot)), now);

  await db.transaction(async (tx) => {
    const audit = (action: string, operatorVisible: boolean, details: Record<string, string | number | boolean | null>) =>
      recordAudit(tx, { at: now, actor, action, purchaseId: attempt.purchaseId, attemptId, operatorVisible, details: { signature: hint.signature, ...details } });
    switch (result.decision) {
      case "confirmed": {
        assertPyusdTransition("prepared", "confirmed");
        const bound = await tx
          .update(paymentAttempts)
          .set({ state: "confirmed", pyusdFinalizedSignature: result.evidence.signature, pyusdVerifiedAt: now, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "prepared")))
          .returning({ id: paymentAttempts.id });
        if (bound.length === 0) return;
        await decideHint(tx, attemptId, hint.index, hint.signature, "confirmed");
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("paid", "pyusd_confirmed"), "paid", "pyusd_confirmed");
        await audit("pyusd_transfer_confirmed", false, { slot: result.evidence.slot.toString(), atomicAmount: result.evidence.atomicAmount.toString(), destination: result.evidence.destinationTokenAccount });
        return;
      }
      case "not_ours":
      case "failed_landing":
        await decideHint(tx, attemptId, hint.index, hint.signature, result.decision);
        await audit(result.decision === "not_ours" ? "pyusd_hint_not_ours" : "pyusd_hint_failed_landing", false, {});
        return;
      case "uncertain": {
        assertPyusdTransition("prepared", "mismatch");
        const moved = await tx
          .update(paymentAttempts)
          .set({ state: "mismatch", outcomeReason: result.reason, pyusdMismatchSignature: hint.signature, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "prepared")))
          .returning({ id: paymentAttempts.id });
        if (moved.length === 0) return;
        await decideHint(tx, attemptId, hint.index, hint.signature, "uncertain");
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("uncertain", "pyusd_mismatch"), "uncertain", "pyusd_mismatch");
        await audit("pyusd_transfer_mismatch", true, { reason: result.reason });
        return;
      }
    }
  });
  return result.decision;
}

// prepared -> expired_scanning, with the scan's coverage started at this finalized height.
async function expireAttempt(db: Db, attempt: PyusdAttempt, height: bigint, actor: string, now: Date): Promise<void> {
  assertPyusdTransition("prepared", "expired_scanning");
  await db.transaction(async (tx) => {
    const moved = await tx
      .update(paymentAttempts)
      .set({ state: "expired_scanning", pyusdScan: scanToStored(startScanCoverage(height)), updatedAt: now })
      .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.state, "prepared")))
      .returning({ id: paymentAttempts.id });
    if (moved.length === 1) {
      await recordAudit(tx, {
        at: now,
        actor,
        action: "pyusd_attempt_expired",
        purchaseId: attempt.purchaseId,
        attemptId: attempt.id,
        operatorVisible: false,
        details: { finalizedBlockHeight: height.toString(), lastValidBlockHeight: attempt.lastValidBlockHeight.toString() },
      });
    }
  });
}

// A confirmed or mismatched attempt past its bound starts its window scan with no state change.
async function startWindowScan(db: Db, attemptId: string, height: bigint, now: Date): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ pyusdScan: scanToStored(startScanCoverage(height)), updatedAt: now })
    .where(and(eq(paymentAttempts.id, attemptId), isNull(paymentAttempts.pyusdScan)));
}

// One claim's share of the window scan: at most SCAN_CAPS.pages pages and SCAN_CAPS.fetches candidate
// reads. The cursor only ever moves past entries that are decided, in order, so a gap leaves every
// undecided candidate ahead of it, and a page with more candidates than the fetch cap still completes
// across claims. Any gap is recorded and stops this claim.
async function scanWindow(deps: ReconcileDeps, rpc: SolanaReadClient, start: PyusdAttempt, owner: string, actor: string): Promise<void> {
  let attempt = start;
  const coverage: ScanCoverage = { ...attempt.scan!, lastGap: null };
  let fetches = 0;
  let schedule: EpochSchedule | null = null;
  const stop = async (gap: ScanGap | null) => {
    coverage.lastGap = gap;
    await saveCoverage(deps.db, attempt.id, owner, coverage, deps.now());
  };

  for (let pages = 0; pages < SCAN_CAPS.pages; pages += 1) {
    const page = await rpc.getSignaturesFinalized(attempt.destinationTokenAccount, coverage.beforeCursor, PAGE_LIMIT);
    if (page.kind !== "ok") return stop(gapOf(page));
    coverage.pagesRead += 1;
    // The top boundary is fixed by the first page read after expiry.
    if (coverage.beforeCursor === null && coverage.newestSignature === null) coverage.newestSignature = page.value[0]?.signature ?? null;
    const plan = applyScanPage(coverage, page.value, attempt.preparationSlot);
    // The fixed top boundary fell off the newest page: more landed since than one page holds.
    if (plan.window === null) return stop("page_cap");
    const candidates = new Set(plan.candidates);
    for (const entry of plan.window) {
      const decided = entry.signature === attempt.finalizedSignature || entry.signature === attempt.mismatchSignature;
      if (candidates.has(entry.signature) && !decided) {
        if (fetches >= SCAN_CAPS.fetches) return stop("page_cap");
        fetches += 1;
        const read = await rpc.getTransactionFinalized(entry.signature);
        if (read.kind !== "ok") return stop(gapOf(read));
        if (read.value === null) return stop("null_transaction");
        if (!schedule) {
          const answer = await rpc.getEpochSchedule();
          if (answer.kind !== "ok") return stop(gapOf(answer));
          schedule = answer.value;
        }
        coverage.candidatesChecked += 1;
        const now = deps.now();
        const result = verifyPyusdTransfer(read.value, attempt, feeAtEpoch(attempt.fee, epochOfSlot(schedule, read.value.slot)), now);
        const outcome = classifyScanCandidate(attempt, read.value, result, now);
        if (await applyScanOutcome(deps.db, attempt.id, outcome, now, actor)) attempt = (await loadAttempt(deps.db, attempt.id)) ?? attempt;
      }
      coverage.beforeCursor = entry.signature;
    }
    if (plan.pageReachesBeforePreparation) {
      coverage.reachedBeforePreparation = true;
      return stop(null);
    }
    // A short page is the end of the history the RPC holds, without a signature older than
    // preparation: incomplete, so the attempt stays locked (R17's falsifier).
    if (page.value.length < PAGE_LIMIT) return stop(null);
  }
  return stop("page_cap");
}

// Closes a complete, empty scan as Gate 3 says: unpaid once automatic release is enabled, otherwise
// held for the operator with the purchase uncertain.
async function releaseOrHold(db: Db, attempt: PyusdAttempt, close: boolean, actor: string, now: Date): Promise<PyusdCheck> {
  return db.transaction(async (tx) => {
    const to: PyusdAttemptState = close ? "closed_unpaid" : "held_no_match";
    const from: PyusdAttemptState[] = close ? ["expired_scanning", "held_no_match"] : ["expired_scanning"];
    for (const state of from) assertPyusdTransition(state, to);
    const moved = await tx
      .update(paymentAttempts)
      .set({ state: to, updatedAt: now })
      .where(and(eq(paymentAttempts.id, attempt.id), inArray(paymentAttempts.state, from)))
      .returning({ id: paymentAttempts.id });
    if (moved.length === 1) {
      if (close) await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("unpaid_closed", "pyusd_closed_unpaid"), "unpaid_closed", "pyusd_closed_unpaid");
      else await transitionPurchase(tx, attempt.purchaseId, ["pending_payment"], "uncertain", "pyusd_held_no_match");
      await recordAudit(tx, {
        at: now,
        actor,
        action: close ? "pyusd_attempt_closed_unpaid" : "pyusd_attempt_held",
        purchaseId: attempt.purchaseId,
        attemptId: attempt.id,
        operatorVisible: !close,
        details: { pagesRead: attempt.scan?.pagesRead ?? 0, candidatesChecked: attempt.scan?.candidatesChecked ?? 0 },
      });
    }
    return to;
  });
}

export async function reconcilePyusdAttempt(deps: ReconcileDeps, attemptId: string, actor: string, mode: ReconcileMode = { kind: "web" }): Promise<PyusdCheck> {
  const { db } = deps;
  const [row] = await db.select().from(paymentAttempts).where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.rail, "pyusd")));
  if (!row) return "nothing_to_read";
  if (recoverySettled(toPyusdAttempt(row))) return "nothing_to_read";
  if (mode.kind === "web" && !(await claimRead(db, attemptId, deps.now()))) return "debounced";
  const owner = mode.kind === "runner" ? mode.owner : newId("rcn");
  if (!(await claimPyusdLease(db, attemptId, owner, deps.now()))) return "in_flight";
  try {
    return await recover(deps, attemptId, owner, actor);
  } finally {
    await releasePyusdLease(db, attemptId, owner);
  }
}

async function recover(deps: ReconcileDeps, attemptId: string, owner: string, actor: string): Promise<PyusdCheck> {
  const { db } = deps;
  let attempt = await loadAttempt(db, attemptId);
  if (!attempt) return "nothing_to_read";
  const identity = await checkPyusdIdentity(deps.rpc);
  if (!identity.ok) {
    const unreachable = identity.reason === "rpc_unavailable" || identity.reason === "rpc_unconfigured";
    if (attempt.scan) await saveCoverage(db, attemptId, owner, { ...attempt.scan, lastGap: unreachable ? "rpc_unavailable" : "identity_changed" }, deps.now());
    if (unreachable) return "rpc_unavailable";
    await recordAudit(db, { at: deps.now(), actor, action: "pyusd_identity_changed", purchaseId: attempt.purchaseId, attemptId, operatorVisible: true, details: { reason: identity.reason } });
    return "identity_changed";
  }
  const rpc = deps.rpc!;
  const height = await rpc.getBlockHeight("finalized");
  if (height.kind !== "ok") {
    if (attempt.scan) await saveCoverage(db, attemptId, owner, { ...attempt.scan, lastGap: gapOf(height) }, deps.now());
    return "rpc_unavailable";
  }

  let hintChecked: PyusdCheck | null = null;
  let scanned = false;
  // Each pass moves the attempt forward once; four passes cover hint, expiry, scan and release.
  for (let pass = 0; pass < 4; pass += 1) {
    const step = decideRecoveryStep(attempt, height.value, PYUSD_PROOFS);
    switch (step.action) {
      case "verify_hints_then_wait": {
        const hint = attempt.state === "prepared" ? readableHint(attempt.hints) : null;
        return hint ? verifyReadableHint(deps, rpc, attempt, hint, actor) : "nothing_to_read";
      }
      case "start_scan": {
        if (attempt.state === "prepared") {
          // The readable hint is verified first; a verified or mismatching one decides the state.
          const hint = hintChecked === null ? readableHint(attempt.hints) : null;
          if (hint) {
            hintChecked = await verifyReadableHint(deps, rpc, attempt, hint, actor);
            if (hintChecked === "rpc_unavailable") return hintChecked;
          } else {
            await expireAttempt(db, attempt, height.value, actor, deps.now());
          }
        } else {
          await startWindowScan(db, attemptId, height.value, deps.now());
        }
        break;
      }
      case "continue_scan": {
        if (scanned) return isScanComplete(attempt.scan) ? "scan_complete" : "scan_incomplete";
        scanned = true;
        await scanWindow(deps, rpc, attempt, owner, actor);
        break;
      }
      case "close_unpaid":
      case "hold":
        return releaseOrHold(db, attempt, step.action === "close_unpaid", actor, deps.now());
      case "operator":
      case "done":
        return attempt.state === "closed_unpaid" ? "closed_unpaid" : "scan_complete";
    }
    const next = await loadAttempt(db, attemptId);
    if (!next) return "nothing_to_read";
    attempt = next;
  }
  return hintChecked ?? (isScanComplete(attempt.scan) ? "scan_complete" : "scan_incomplete");
}
