import type { Address } from "@solana/kit";
import type { FeeEvidence } from "@/domain/pyusd/mint";
import type { PYUSD_ATTEMPT_STATES, StoredFeeEvidence, StoredSignatureHint } from "@/lib/db/schema";
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
};

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
  };
}
