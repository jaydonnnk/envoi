import type { Address } from "@solana/kit";
import type { FeeEvidence } from "@/domain/pyusd/mint";
import type { ExtraTransfer } from "@/domain/pyusd/recovery";
import type { PYUSD_ATTEMPT_STATES, StoredFeeEvidence, StoredScanCoverage, StoredSignatureHint } from "@/lib/db/schema";
import type { PaymentAttemptRow } from "@/domain/purchases/state";

// The PYUSD attempt lifecycle (Gate 3 State transitions: PYUSD attempt). No transition re-prepares,
// refreshes the blockhash or submits anything, and a wallet error or a missing hint changes no state.
// prepared, expired_scanning, held_no_match and mismatch keep the purchase and its basket locked;
// only confirmed and closed_unpaid end the lock.

export type PyusdAttemptState = (typeof PYUSD_ATTEMPT_STATES)[number];

const PYUSD_TRANSITIONS: Record<PyusdAttemptState, readonly PyusdAttemptState[]> = {
  prepared: ["confirmed", "mismatch", "expired_scanning"],
  expired_scanning: ["confirmed", "mismatch", "held_no_match", "closed_unpaid"],
  held_no_match: ["closed_unpaid"],
  // The one exit is an out-of-band, audited operator resolution as unpaid (S17). There is no
  // mismatch -> confirmed: mismatched evidence is never paid.
  mismatch: ["closed_unpaid"],
  confirmed: [],
  closed_unpaid: [],
};

export function canTransitionPyusdAttempt(from: PyusdAttemptState, to: PyusdAttemptState): boolean {
  return PYUSD_TRANSITIONS[from].includes(to);
}

// The outcome reason an audited operator resolution writes when it closes a mismatch unpaid (S17).
export const OPERATOR_RESOLUTION = "operator_resolved_unpaid";

// States in which money can still move for the attempt's purchase.
export function pyusdAttemptLocks(state: PyusdAttemptState): boolean {
  return state !== "confirmed" && state !== "closed_unpaid";
}

export type SignatureHint = { signature: string; receivedAt: Date; decision: StoredSignatureHint["decision"] };

export type PyusdAttempt = {
  id: string;
  purchaseId: string;
  state: PyusdAttemptState;
  buyerWallet: Address;
  sourceTokenAccount: Address;
  destinationTokenAccount: Address;
  atomicAmount: bigint;
  rateVersionId: string;
  reference: string; // 128-bit random, base58; the only memo content
  messageFingerprint: string; // SHA-256 of the compiled message; evidence, not a matching rule
  blockhash: string;
  lastValidBlockHeight: bigint;
  preparationSlot: bigint;
  fee: FeeEvidence;
  hints: readonly SignatureHint[];
  finalizedSignature: string | null;
  // S17: the successful landing that failed verification, and the post-expiry window scan.
  mismatchSignature: string | null;
  scan: ScanCoverage | null;
};

export type ScanGap = NonNullable<StoredScanCoverage["lastGap"]>;

export type ScanCoverage = {
  startedAtFinalizedHeight: bigint;
  newestSignature: string | null; // top boundary, fixed when the scan starts after expiry
  beforeCursor: string | null; // resume point; never passes an undecided candidate
  reachedBeforePreparation: boolean; // a fully decided stretch of history held a signature older than preparationSlot
  pagesRead: number;
  candidatesChecked: number;
  lastGap: ScanGap | null;
  // Gate 3 reopening 2026-10-18: the oldest ours, successful and failing candidate seen while nothing
  // is bound. It marks the mismatch only if the complete scan binds nothing; a binding turns it into an
  // extra transfer.
  pendingMismatch: ExtraTransfer | null;
};

export function scanFromStored(scan: StoredScanCoverage): ScanCoverage {
  const pending = scan.pendingMismatch ?? null;
  return {
    ...scan,
    startedAtFinalizedHeight: BigInt(scan.startedAtFinalizedHeight),
    pendingMismatch: pending && {
      signature: pending.signature,
      slot: BigInt(pending.slot),
      destinationDelta: pending.destinationDelta === null ? null : BigInt(pending.destinationDelta),
      verification: pending.verification as ExtraTransfer["verification"],
      foundAt: new Date(pending.foundAt),
      refundReference: null,
    },
  };
}

export function scanToStored(scan: ScanCoverage): StoredScanCoverage {
  const pending = scan.pendingMismatch;
  return {
    ...scan,
    startedAtFinalizedHeight: scan.startedAtFinalizedHeight.toString(),
    pendingMismatch: pending && {
      signature: pending.signature,
      slot: pending.slot.toString(),
      destinationDelta: pending.destinationDelta?.toString() ?? null,
      verification: pending.verification,
      foundAt: pending.foundAt.toISOString(),
    },
  };
}

export function feeFromStored(fee: StoredFeeEvidence): FeeEvidence {
  const schedule = (s: StoredFeeEvidence["older"]) => ({ epoch: BigInt(s.epoch), basisPoints: s.basisPoints, maximumFee: BigInt(s.maximumFee) });
  return { preparedEpoch: BigInt(fee.preparedEpoch), older: schedule(fee.older), newer: schedule(fee.newer) };
}

export function feeToStored(fee: FeeEvidence): StoredFeeEvidence {
  const schedule = (s: FeeEvidence["older"]) => ({ epoch: s.epoch.toString(), basisPoints: s.basisPoints, maximumFee: s.maximumFee.toString() });
  return { preparedEpoch: fee.preparedEpoch.toString(), older: schedule(fee.older), newer: schedule(fee.newer) };
}

// The domain view of a stored PYUSD attempt row. Throws on a PayPal row: that is a programming error.
export function toPyusdAttempt(row: PaymentAttemptRow): PyusdAttempt {
  if (
    row.rail !== "pyusd" ||
    !row.pyusdBuyerWallet ||
    !row.pyusdSourceTokenAccount ||
    !row.pyusdDestinationTokenAccount ||
    row.pyusdAtomicAmount === null ||
    !row.pyusdRateVersionId ||
    !row.pyusdReference ||
    !row.pyusdMessageFingerprint ||
    !row.pyusdBlockhash ||
    row.pyusdLastValidBlockHeight === null ||
    row.pyusdPreparationSlot === null ||
    !row.pyusdFee
  ) {
    throw new Error(`attempt ${row.id} is not a complete PYUSD attempt`);
  }
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    state: row.state as PyusdAttemptState,
    buyerWallet: row.pyusdBuyerWallet as Address,
    sourceTokenAccount: row.pyusdSourceTokenAccount as Address,
    destinationTokenAccount: row.pyusdDestinationTokenAccount as Address,
    atomicAmount: row.pyusdAtomicAmount,
    rateVersionId: row.pyusdRateVersionId,
    reference: row.pyusdReference,
    messageFingerprint: row.pyusdMessageFingerprint,
    blockhash: row.pyusdBlockhash,
    lastValidBlockHeight: row.pyusdLastValidBlockHeight,
    preparationSlot: row.pyusdPreparationSlot,
    fee: feeFromStored(row.pyusdFee),
    hints: row.pyusdHints.map((hint) => ({ signature: hint.signature, receivedAt: new Date(hint.receivedAt), decision: hint.decision })),
    finalizedSignature: row.pyusdFinalizedSignature,
    mismatchSignature: row.pyusdMismatchSignature,
    scan: row.pyusdScan ? scanFromStored(row.pyusdScan) : null,
  };
}
