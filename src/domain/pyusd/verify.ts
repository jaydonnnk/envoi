import type { Address } from "@solana/kit";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import type { FeeSchedule } from "@/domain/pyusd/mint";
import type { PyusdAttempt } from "@/domain/pyusd/state";

// Verification of a finalized landed transaction by its meaning (Gate 2 "Preparation, wallet
// broadcast and verification", step 5; Gate 3 "PYUSD"). Pure: no RPC. Phantom may add its own
// compute-budget and Lighthouse assertion instructions when it signs, so the landed transaction is
// not compared byte for byte; instead every rule below must hold, and anything outside them leaves
// the attempt uncertain and operator-visible, never paid.

export type TokenBalance = { accountIndex: number; mint: string; owner: string | null; programId: string | null; amount: bigint };
export type CompiledInstruction = { programIndex: number; accountIndexes: readonly number[]; data: Uint8Array };

export type LandedTransaction = {
  signature: string;
  slot: bigint;
  version: "legacy" | 0 | "unsupported";
  numRequiredSignatures: number;
  // The message's own keys. Invoked programs are always among them, so they decide whether the
  // transaction is ours even when lookup-table keys cannot be resolved. (Not in Gate 3's type; added
  // in S16 so an unresolvable transaction carrying our reference reads uncertain, not "not ours".)
  staticAccountKeys: readonly Address[];
  accountKeys: readonly Address[] | null; // static keys, then loaded writable and readonly; null when unresolvable
  recentBlockhash: string;
  outer: readonly CompiledInstruction[];
  inner: readonly CompiledInstruction[] | null; // null when metadata omits inner instructions
  meta: { err: unknown | null; preTokenBalances: TokenBalance[] | null; postTokenBalances: TokenBalance[] | null } | null;
};

export type VerificationFailure =
  | "metadata_incomplete" | "account_keys_unresolved"
  | "blockhash_mismatch" | "extra_signer" | "fee_payer_mismatch"
  | "transfer_count" | "mint_mismatch" | "decimals_mismatch" | "source_mismatch" | "destination_mismatch" | "amount_mismatch"
  | "memo_count" | "fee_nonzero_at_execution" | "balance_delta_mismatch"
  | "outer_instruction_not_allowlisted" | "lighthouse_not_assertion"
  | "inner_program_not_allowlisted" | "inner_instruction_not_allowlisted";

export type PyusdEvidence = { signature: string; slot: bigint; atomicAmount: bigint; destinationTokenAccount: Address; verifiedAt: Date };

export type VerificationResult =
  | { decision: "confirmed"; evidence: PyusdEvidence }
  | { decision: "not_ours" } // no pinned-memo instruction whose data equals this attempt's reference
  | { decision: "failed_landing" } // ours, executed with an error: no transfer happened under this signature
  | { decision: "uncertain"; reason: VerificationFailure };

// Token-2022 instruction discriminators (the first data byte).
const TOKEN_TRANSFER_CHECKED = 12;
const TOKEN_INNER_READ_ONLY: ReadonlySet<number> = new Set([21, 23, 24]); // GetAccountDataSize, AmountToUiAmount, UiAmountToAmount
const LIGHTHOUSE_ASSERTIONS: ReadonlySet<number> = new Set(PYUSD_DEVNET.lighthouseAssertionDiscriminators);

const uncertain = (reason: VerificationFailure): VerificationResult => ({ decision: "uncertain", reason });

function readU64LE(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(data[offset + i]!);
  return value;
}

function memoText(data: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

export function verifyPyusdTransfer(tx: LandedTransaction, attempt: PyusdAttempt, feeAtExecution: FeeSchedule, now: Date): VerificationResult {
  // Ours: an outer instruction of the pinned memo program whose data is exactly the reference.
  const staticKey = (index: number) => tx.staticAccountKeys[index];
  const ours = tx.outer.some((ix) => staticKey(ix.programIndex) === PYUSD_DEVNET.memoProgram && memoText(ix.data) === attempt.reference);
  if (!ours) return { decision: "not_ours" };

  if (!tx.meta || tx.meta.preTokenBalances === null || tx.meta.postTokenBalances === null || tx.inner === null) return uncertain("metadata_incomplete");
  if (tx.version === "unsupported" || tx.accountKeys === null) return uncertain("account_keys_unresolved");
  const keys = tx.accountKeys;
  // An execution error means no transfer happened under this signature.
  if (tx.meta.err !== null) return { decision: "failed_landing" };

  if (tx.recentBlockhash !== attempt.blockhash) return uncertain("blockhash_mismatch");
  if (tx.numRequiredSignatures !== 1) return uncertain("extra_signer");
  if (keys[0] !== attempt.buyerWallet) return uncertain("fee_payer_mismatch");

  // Every outer instruction is the memo, a TransferChecked, a ComputeBudget instruction or a
  // Lighthouse assertion.
  const transfers: CompiledInstruction[] = [];
  let memos = 0;
  for (const ix of tx.outer) {
    const program = keys[ix.programIndex];
    if (program === PYUSD_DEVNET.memoProgram) memos += 1;
    else if (program === PYUSD_DEVNET.tokenProgram && ix.data[0] === TOKEN_TRANSFER_CHECKED) transfers.push(ix);
    else if (program === PYUSD_DEVNET.computeBudgetProgram) continue;
    else if (program === PYUSD_DEVNET.lighthouseProgram) {
      if (!LIGHTHOUSE_ASSERTIONS.has(ix.data[0] ?? -1)) return uncertain("lighthouse_not_assertion");
    } else return uncertain("outer_instruction_not_allowlisted");
  }

  // Inner instructions come only from the pinned Token-2022 (read-only kinds), memo, ComputeBudget and
  // Lighthouse (assertions) programs, so none can move tokens or lamports or change an authority.
  for (const ix of tx.inner) {
    const program = keys[ix.programIndex];
    if (program === PYUSD_DEVNET.tokenProgram) {
      if (!TOKEN_INNER_READ_ONLY.has(ix.data[0] ?? -1)) return uncertain("inner_instruction_not_allowlisted");
    } else if (program === PYUSD_DEVNET.memoProgram) memos += 1;
    else if (program === PYUSD_DEVNET.computeBudgetProgram) continue;
    else if (program === PYUSD_DEVNET.lighthouseProgram) {
      if (!LIGHTHOUSE_ASSERTIONS.has(ix.data[0] ?? -1)) return uncertain("lighthouse_not_assertion");
    } else return uncertain("inner_program_not_allowlisted");
  }

  if (transfers.length !== 1) return uncertain("transfer_count");
  const transfer = transfers[0]!;
  // TransferChecked accounts: source, mint, destination, authority. Data: discriminator, u64 amount,
  // u8 decimals.
  const [sourceIndex, mintIndex, destinationIndex] = transfer.accountIndexes;
  if (transfer.data.length !== 10 || sourceIndex === undefined || mintIndex === undefined || destinationIndex === undefined) return uncertain("transfer_count");
  if (keys[mintIndex] !== PYUSD_DEVNET.mint) return uncertain("mint_mismatch");
  if (transfer.data[9] !== PYUSD_DEVNET.decimals) return uncertain("decimals_mismatch");
  if (keys[sourceIndex] !== attempt.sourceTokenAccount) return uncertain("source_mismatch");
  if (keys[destinationIndex] !== attempt.destinationTokenAccount) return uncertain("destination_mismatch");
  if (readU64LE(transfer.data, 1) !== attempt.atomicAmount) return uncertain("amount_mismatch");

  if (memos !== 1) return uncertain("memo_count");

  if (feeAtExecution.basisPoints !== 0 || feeAtExecution.maximumFee !== 0n) return uncertain("fee_nonzero_at_execution");

  // The destination's balance change in this transaction's own metadata, never a later live balance.
  const balanceOf = (balances: TokenBalance[]) => balances.find((balance) => balance.accountIndex === destinationIndex && balance.mint === PYUSD_DEVNET.mint)?.amount;
  const post = balanceOf(tx.meta.postTokenBalances);
  const pre = balanceOf(tx.meta.preTokenBalances) ?? 0n;
  if (post === undefined || post - pre !== attempt.atomicAmount) return uncertain("balance_delta_mismatch");

  return {
    decision: "confirmed",
    evidence: { signature: tx.signature, slot: tx.slot, atomicAmount: attempt.atomicAmount, destinationTokenAccount: attempt.destinationTokenAccount, verifiedAt: now },
  };
}
