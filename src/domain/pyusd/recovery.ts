import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import type { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { canTransitionPyusdAttempt, type PyusdAttempt, type PyusdAttemptState, type ScanCoverage } from "@/domain/pyusd/state";
import type { LandedTransaction, PyusdEvidence, VerificationFailure, VerificationResult } from "@/domain/pyusd/verify";
import { canTransitionPurchase, transitionPurchase, type PurchaseState } from "@/domain/purchases/state";
import { paymentAttempts, PURCHASE_STATES, pyusdExtraTransfers } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";

// PYUSD recovery decisions (Gate 3 "PYUSD recovery"; Gate 2 "Lost-response recovery and RPC", fix M).
// Pure except applyScanOutcome, which writes by compare-and-set; nothing here reads the chain. A
// prepared attempt verifies its readable signature hint and otherwise waits until the FINALIZED block
// height passes its lastValidBlockHeight bound. Then every released attempt, whatever its state, gets
// one window scan of the merchant token account's history, from a top boundary fixed when the scan
// starts down to a signature older than the preparation slot. The scan binds the first verifying
// landing when nothing is bound, marks a failing one as a mismatch, and records every other
// successful landing that carries the reference as an extra transfer, which never changes a state.

export type SignatureEntry = { signature: string; slot: bigint; failed: boolean };

export type RecoveryStep =
  | { action: "verify_hints_then_wait" }
  | { action: "start_scan" }
  | { action: "continue_scan"; before: string | null }
  | { action: "close_unpaid" }
  | { action: "hold"; reason: "automatic_release_not_enabled" }
  | { action: "operator"; reason: "mismatch" }
  | { action: "done" }; // fix M: the window scan is complete and the state needs nothing more

// fix M; rows of pyusd_extra_transfers, UNIQUE (attempt_id, signature).
export type ExtraTransfer = {
  signature: string;
  slot: bigint;
  destinationDelta: bigint | null; // from transaction metadata; null when the metadata is incomplete
  verification: "verified" | VerificationFailure;
  foundAt: Date;
  refundReference: string | null; // recorded out of band by the operator act; changes no payment state
};

export type CandidateOutcome =
  | { kind: "bind"; evidence: PyusdEvidence } // nothing bound yet, and this one verifies
  | { kind: "mismatch"; signature: string; reason: VerificationFailure } // nothing bound yet, ours, successful, fails verification
  | { kind: "extra"; transfer: ExtraTransfer } // ours and successful, while another landing is bound or in mismatch
  | { kind: "skip" }; // not ours, a failed landing, or the bound or mismatching signature itself

// Complete only once a fully decided stretch of history reached a signature older than preparation.
export function isScanComplete(coverage: ScanCoverage | null): boolean {
  return coverage !== null && coverage.reachedBeforePreparation;
}

export function startScanCoverage(finalizedBlockHeight: bigint): ScanCoverage {
  return { startedAtFinalizedHeight: finalizedBlockHeight, newestSignature: null, beforeCursor: null, reachedBeforePreparation: false, pagesRead: 0, candidatesChecked: 0, lastGap: null };
}

export function decideRecoveryStep(attempt: Pick<PyusdAttempt, "state" | "lastValidBlockHeight" | "scan">, finalizedBlockHeight: bigint, proofs: typeof PYUSD_PROOFS): RecoveryStep {
  const release = (): RecoveryStep => (proofs.automaticUnpaidRelease ? { action: "close_unpaid" } : { action: "hold", reason: "automatic_release_not_enabled" });
  if (attempt.state === "closed_unpaid") return { action: "done" };
  // A held attempt's coverage is already complete.
  if (attempt.state === "held_no_match") return release();
  // The bound has passed only when the finalized block height exceeds it: a confirmed height, wall
  // time or a wallet error proves nothing.
  if (finalizedBlockHeight <= attempt.lastValidBlockHeight) return { action: "verify_hints_then_wait" };
  if (attempt.state === "prepared" || attempt.scan === null) return { action: "start_scan" };
  if (!isScanComplete(attempt.scan)) return { action: "continue_scan", before: attempt.scan.beforeCursor };
  switch (attempt.state) {
    case "expired_scanning":
      return release();
    case "confirmed":
      return { action: "done" };
    case "mismatch":
      return { action: "operator", reason: "mismatch" };
  }
}

export type PagePlan = {
  // The page's entries inside the window, newest first: below the top boundary, and ending at the
  // first entry older than preparation. Null when the top boundary is not on a page read from the top.
  window: SignatureEntry[] | null;
  candidates: string[];
  pageReachesBeforePreparation: boolean;
  lastSignature: string | null;
};

// Plans one page of getSignaturesForAddress (newest first). Candidates are all successful signatures
// at or after preparationSlot; a failed transaction moves no tokens. The RPC's memo summary is never a
// filter. A page read from the top again, after a gap on the first page, starts at the fixed top
// boundary, so a landing after the scan started is never watched.
export function applyScanPage(coverage: ScanCoverage, page: readonly SignatureEntry[], preparationSlot: bigint): PagePlan {
  let entries = page;
  if (coverage.beforeCursor === null && coverage.newestSignature !== null) {
    const top = page.findIndex((entry) => entry.signature === coverage.newestSignature);
    if (top < 0) return { window: null, candidates: [], pageReachesBeforePreparation: false, lastSignature: null };
    entries = page.slice(top);
  }
  const older = entries.findIndex((entry) => entry.slot < preparationSlot);
  const window = older < 0 ? [...entries] : entries.slice(0, older + 1);
  return {
    window,
    candidates: window.filter((entry) => !entry.failed && entry.slot >= preparationSlot).map((entry) => entry.signature),
    pageReachesBeforePreparation: older >= 0,
    lastSignature: window.at(-1)?.signature ?? null,
  };
}

// The destination's balance change in the transaction's own metadata, or null when it is incomplete.
export function destinationDeltaOf(tx: LandedTransaction, destination: string): bigint | null {
  if (!tx.meta || tx.meta.preTokenBalances === null || tx.meta.postTokenBalances === null || tx.accountKeys === null) return null;
  const index = tx.accountKeys.indexOf(destination as (typeof tx.accountKeys)[number]);
  if (index < 0) return null;
  const post = tx.meta.postTokenBalances.find((balance) => balance.accountIndex === index)?.amount;
  if (post === undefined) return null;
  const pre = tx.meta.preTokenBalances.find((balance) => balance.accountIndex === index)?.amount ?? 0n;
  return post - pre;
}

export function classifyScanCandidate(attempt: Pick<PyusdAttempt, "state" | "finalizedSignature" | "mismatchSignature" | "destinationTokenAccount">, tx: LandedTransaction, result: VerificationResult, now: Date): CandidateOutcome {
  if (tx.signature === attempt.finalizedSignature || tx.signature === attempt.mismatchSignature) return { kind: "skip" };
  if (result.decision === "not_ours" || result.decision === "failed_landing") return { kind: "skip" };
  if (attempt.finalizedSignature !== null || attempt.state === "mismatch") {
    return {
      kind: "extra",
      transfer: {
        signature: tx.signature,
        slot: tx.slot,
        destinationDelta: destinationDeltaOf(tx, attempt.destinationTokenAccount),
        verification: result.decision === "confirmed" ? "verified" : result.reason,
        foundAt: now,
        refundReference: null,
      },
    };
  }
  return result.decision === "confirmed" ? { kind: "bind", evidence: result.evidence } : { kind: "mismatch", signature: tx.signature, reason: result.reason };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function assertPyusdTransition(from: PyusdAttemptState, to: PyusdAttemptState): void {
  if (!canTransitionPyusdAttempt(from, to)) throw new Error(`illegal PYUSD attempt transition ${from} -> ${to}`);
}

function purchaseStatesInto(to: PurchaseState, reason: string): PurchaseState[] {
  return PURCHASE_STATES.filter((from) => canTransitionPurchase({ from, to, reason }));
}

// Applies one scan outcome by compare-and-set in one short transaction. A bind or a mismatch moves
// only an attempt still in expired_scanning; an extra transfer is recorded once and never changes the
// attempt, the purchase or the bound evidence. Returns whether anything was written.
export async function applyScanOutcome(db: Db, attemptId: string, outcome: CandidateOutcome, now: Date, actor = "system"): Promise<boolean> {
  if (outcome.kind === "skip") return false;
  return db.transaction(async (tx: Tx) => {
    const [attempt] = await tx.select({ purchaseId: paymentAttempts.purchaseId }).from(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
    if (!attempt) return false;
    const audit = (action: string, operatorVisible: boolean, details: Record<string, string | number | boolean | null>) =>
      recordAudit(tx, { at: now, actor, action, purchaseId: attempt.purchaseId, attemptId, operatorVisible, details: { source: "window_scan", ...details } });
    switch (outcome.kind) {
      case "bind": {
        assertPyusdTransition("expired_scanning", "confirmed");
        const bound = await tx
          .update(paymentAttempts)
          .set({ state: "confirmed", pyusdFinalizedSignature: outcome.evidence.signature, pyusdVerifiedAt: now, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "expired_scanning")))
          .returning({ id: paymentAttempts.id });
        if (bound.length === 0) return false;
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("paid", "pyusd_confirmed"), "paid", "pyusd_confirmed");
        await audit("pyusd_transfer_confirmed", false, {
          signature: outcome.evidence.signature,
          slot: outcome.evidence.slot.toString(),
          atomicAmount: outcome.evidence.atomicAmount.toString(),
          destination: outcome.evidence.destinationTokenAccount,
        });
        return true;
      }
      case "mismatch": {
        assertPyusdTransition("expired_scanning", "mismatch");
        const moved = await tx
          .update(paymentAttempts)
          .set({ state: "mismatch", outcomeReason: outcome.reason, pyusdMismatchSignature: outcome.signature, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "expired_scanning")))
          .returning({ id: paymentAttempts.id });
        if (moved.length === 0) return false;
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("uncertain", "pyusd_mismatch"), "uncertain", "pyusd_mismatch");
        await audit("pyusd_transfer_mismatch", true, { signature: outcome.signature, reason: outcome.reason });
        return true;
      }
      case "extra": {
        const { transfer } = outcome;
        // Names exactly the columns the web and maintenance roles may insert: the query builder would
        // list the refund columns as DEFAULT, which their grants refuse.
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into pyusd_extra_transfers (id, attempt_id, signature, slot, destination_delta, verification, found_at)
          values (${newId("pxt")}, ${attemptId}, ${transfer.signature}, ${transfer.slot.toString()}, ${transfer.destinationDelta?.toString() ?? null}, ${transfer.verification}, ${transfer.foundAt.toISOString()})
          on conflict (attempt_id, signature) do nothing
          returning id`);
        if (inserted.length === 0) return false;
        await audit("pyusd_extra_transfer", true, {
          signature: transfer.signature,
          slot: transfer.slot.toString(),
          destinationDelta: transfer.destinationDelta?.toString() ?? null,
          verification: transfer.verification,
        });
        return true;
      }
    }
  });
}

// The extra transfers of each attempt, oldest first. A read for the receipt, the merchant's orders
// and the operator; it never implies a refund.
export async function extraTransfersOf(db: Pick<Db, "select">, attemptIds: readonly string[]): Promise<Map<string, ExtraTransfer[]>> {
  const byAttempt = new Map<string, ExtraTransfer[]>();
  if (attemptIds.length === 0) return byAttempt;
  const rows = await db
    .select()
    .from(pyusdExtraTransfers)
    .where(inArray(pyusdExtraTransfers.attemptId, [...attemptIds]))
    .orderBy(asc(pyusdExtraTransfers.foundAt), asc(pyusdExtraTransfers.id));
  for (const row of rows) {
    const list = byAttempt.get(row.attemptId) ?? [];
    list.push({
      signature: row.signature,
      slot: row.slot,
      destinationDelta: row.destinationDelta,
      verification: row.verification as ExtraTransfer["verification"],
      foundAt: row.foundAt,
      refundReference: row.refundReference,
    });
    byAttempt.set(row.attemptId, list);
  }
  return byAttempt;
}
