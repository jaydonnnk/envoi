import type { Address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import type { FeeSchedule } from "@/domain/pyusd/mint";
import type { PyusdAttempt } from "@/domain/pyusd/state";
import { verifyPyusdTransfer, type CompiledInstruction, type LandedTransaction, type VerificationResult } from "@/domain/pyusd/verify";
import { fixtureKey } from "../support/fake-solana";

// S16, Gate 3 group "PYUSD verification by meaning", 22 cases. verifyPyusdTransfer on synthetic
// landed transactions (FIXTURE: none is a real devnet transaction), each changing one thing in one
// Phantom-shaped valid fixture. Pure: no RPC and no database. The mint and decimals fixtures are
// marked successful although Token-2022 would refuse them on chain, so each isolates its own rule.

const BUYER = fixtureKey(1);
const SOURCE = fixtureKey(2);
const DESTINATION = fixtureKey(3);
const OTHER = fixtureKey(4);
const SYSTEM = "11111111111111111111111111111111" as Address;
const AMOUNT = 2_597_403n;
const REFERENCE = "FXTRref7Jq2kVwH8ZpYbQm3s";

const ATTEMPT: PyusdAttempt = {
  id: "att_fixture",
  purchaseId: "pur_fixture",
  state: "prepared",
  buyerWallet: BUYER,
  sourceTokenAccount: SOURCE,
  destinationTokenAccount: DESTINATION,
  atomicAmount: AMOUNT,
  rateVersionId: "rat_fixture",
  reference: REFERENCE,
  messageFingerprint: "0".repeat(64),
  blockhash: fixtureKey(42),
  lastValidBlockHeight: 280_000_150n,
  preparationSlot: 300_000_000n,
  fee: { preparedEpoch: 700n, older: { epoch: 0n, basisPoints: 0, maximumFee: 0n }, newer: { epoch: 0n, basisPoints: 0, maximumFee: 0n } },
  hints: [],
  finalizedSignature: null,
  mismatchSignature: null,
  scan: null,
};
const ZERO_FEE: FeeSchedule = { epoch: 700n, basisPoints: 0, maximumFee: 0n };
const NOW = new Date("2026-10-27T03:00:00.000Z");

// Key indexes in the valid fixture.
const K = { buyer: 0, source: 1, destination: 2, mint: 3, memo: 4, token: 5, computeBudget: 6, lighthouse: 7, other: 8, system: 9 } as const;
const KEYS: Address[] = [BUYER, SOURCE, DESTINATION, PYUSD_DEVNET.mint, PYUSD_DEVNET.memoProgram, PYUSD_DEVNET.tokenProgram, PYUSD_DEVNET.computeBudgetProgram, PYUSD_DEVNET.lighthouseProgram, OTHER, SYSTEM];

function u64(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 0n; i < 8n; i += 1n) out.push(Number((value >> (8n * i)) & 0xffn));
  return out;
}

const memo = (text: string): CompiledInstruction => ({ programIndex: K.memo, accountIndexes: [], data: new TextEncoder().encode(text) });
const transferChecked = (input: { amount?: bigint; decimals?: number; source?: number; mint?: number; destination?: number } = {}): CompiledInstruction => ({
  programIndex: K.token,
  accountIndexes: [input.source ?? K.source, input.mint ?? K.mint, input.destination ?? K.destination, K.buyer],
  data: new Uint8Array([12, ...u64(input.amount ?? AMOUNT), input.decimals ?? 6]),
});
const computeUnitPrice: CompiledInstruction = { programIndex: K.computeBudget, accountIndexes: [], data: new Uint8Array([3, ...u64(5_000n)]) };
const lighthouse = (discriminator: number): CompiledInstruction => ({ programIndex: K.lighthouse, accountIndexes: [K.destination], data: new Uint8Array([discriminator, 0, 1]) });

// The valid fixture: what Envoi prepares, landed successfully with complete metadata.
function valid(): LandedTransaction {
  return {
    signature: "FXTRsig",
    slot: 300_000_040n,
    version: 0,
    numRequiredSignatures: 1,
    staticAccountKeys: KEYS,
    accountKeys: KEYS,
    recentBlockhash: ATTEMPT.blockhash,
    outer: [memo(REFERENCE), transferChecked()],
    inner: [],
    meta: {
      err: null,
      preTokenBalances: [{ accountIndex: K.destination, mint: PYUSD_DEVNET.mint, owner: OTHER, programId: PYUSD_DEVNET.tokenProgram, amount: 1_000_000n }],
      postTokenBalances: [{ accountIndex: K.destination, mint: PYUSD_DEVNET.mint, owner: OTHER, programId: PYUSD_DEVNET.tokenProgram, amount: 1_000_000n + AMOUNT }],
    },
  };
}

const verify = (tx: LandedTransaction, fee: FeeSchedule = ZERO_FEE): VerificationResult => verifyPyusdTransfer(tx, ATTEMPT, fee, NOW);
const uncertain = (reason: string) => ({ decision: "uncertain", reason });

describe("PYUSD verification by meaning", () => {
  it("the valid fixture is confirmed with its evidence (fixture self-check)", () => {
    expect(verify(valid())).toEqual({ decision: "confirmed", evidence: { signature: "FXTRsig", slot: 300_000_040n, atomicAmount: AMOUNT, destinationTokenAccount: DESTINATION, verifiedAt: NOW } });
  });

  it("ComputeBudget and Lighthouse assertions are accepted", () => {
    const tx = valid();
    tx.outer = [computeUnitPrice, ...tx.outer, lighthouse(5)];
    expect(verify(tx).decision).toBe("confirmed");
  });

  it("failed transaction is never paid", () => {
    const tx = valid();
    tx.meta = { ...tx.meta!, err: { InstructionError: [1, { Custom: 1 }] } };
    expect(verify(tx)).toEqual({ decision: "failed_landing" });
  });

  it("other blockhash leaves the transfer uncertain", () => {
    expect(verify({ ...valid(), recentBlockhash: fixtureKey(43) })).toEqual(uncertain("blockhash_mismatch"));
  });

  it("second signer leaves the transfer uncertain", () => {
    expect(verify({ ...valid(), numRequiredSignatures: 2 })).toEqual(uncertain("extra_signer"));
  });

  it("another fee payer leaves the transfer uncertain", () => {
    const keys = [OTHER, ...KEYS.slice(1)];
    expect(verify({ ...valid(), staticAccountKeys: keys, accountKeys: keys })).toEqual(uncertain("fee_payer_mismatch"));
  });

  it("zero or two TransferChecked leave the transfer uncertain", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE)] })).toEqual(uncertain("transfer_count"));
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked(), transferChecked()] })).toEqual(uncertain("transfer_count"));
  });

  it("transfer of another mint is not paid", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ mint: K.other })] })).toEqual(uncertain("mint_mismatch"));
  });

  it("transfer with other decimals is not paid", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ decimals: 9 })] })).toEqual(uncertain("decimals_mismatch"));
  });

  it("transfer from another source is not paid", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ source: K.other })] })).toEqual(uncertain("source_mismatch"));
  });

  it("transfer to another destination is not paid", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ destination: K.other })] })).toEqual(uncertain("destination_mismatch"));
  });

  it("amount off by one atomic unit is not paid", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ amount: AMOUNT + 1n })] })).toEqual(uncertain("amount_mismatch"));
    expect(verify({ ...valid(), outer: [memo(REFERENCE), transferChecked({ amount: AMOUNT - 1n })] })).toEqual(uncertain("amount_mismatch"));
  });

  it("duplicate memo leaves the transfer uncertain", () => {
    expect(verify({ ...valid(), outer: [memo(REFERENCE), memo("FXTR another memo"), transferChecked()] })).toEqual(uncertain("memo_count"));
  });

  it("memo without the reference is not ours", () => {
    expect(verify({ ...valid(), outer: [memo("FXTR some other memo"), transferChecked()] })).toEqual({ decision: "not_ours" });
  });

  it("fee at the execution epoch must be zero", () => {
    // The balance delta is still exact: only the schedule for the execution epoch is non-zero.
    expect(verify(valid(), { epoch: 700n, basisPoints: 25, maximumFee: 5_000n })).toEqual(uncertain("fee_nonzero_at_execution"));
  });

  it("destination delta must equal the amount", () => {
    const tx = valid();
    tx.meta = { ...tx.meta!, postTokenBalances: [{ ...tx.meta!.postTokenBalances![0]!, amount: 1_000_000n + AMOUNT - 1n }] };
    expect(verify(tx)).toEqual(uncertain("balance_delta_mismatch"));
  });

  it("incomplete metadata leaves the transfer uncertain", () => {
    const missingBalances = valid();
    missingBalances.meta = { ...missingBalances.meta!, postTokenBalances: null };
    expect(verify(missingBalances)).toEqual(uncertain("metadata_incomplete"));
    expect(verify({ ...valid(), inner: null })).toEqual(uncertain("metadata_incomplete"));
  });

  it("an added non-allowlisted instruction leaves the transfer uncertain", () => {
    const systemTransfer: CompiledInstruction = { programIndex: K.system, accountIndexes: [K.buyer, K.other], data: new Uint8Array([2, 0, 0, 0, ...u64(1n)]) };
    expect(verify({ ...valid(), outer: [...valid().outer, systemTransfer] })).toEqual(uncertain("outer_instruction_not_allowlisted"));
  });

  it("outer Lighthouse memory instruction is not allowlisted", () => {
    expect(verify({ ...valid(), outer: [...valid().outer, lighthouse(0)] })).toEqual(uncertain("lighthouse_not_assertion"));
  });

  it("inner Lighthouse memory instruction is not allowlisted", () => {
    expect(verify({ ...valid(), inner: [lighthouse(0)] })).toEqual(uncertain("lighthouse_not_assertion"));
  });

  it("inner instruction from another program leaves the transfer uncertain", () => {
    expect(verify({ ...valid(), inner: [{ programIndex: K.system, accountIndexes: [], data: new Uint8Array([2]) }] })).toEqual(uncertain("inner_program_not_allowlisted"));
  });

  it("inner instruction that moves tokens or changes authority leaves it uncertain", () => {
    const innerTransfer: CompiledInstruction = { programIndex: K.token, accountIndexes: [K.source, K.other, K.buyer], data: new Uint8Array([3, ...u64(1n)]) };
    const setAuthority: CompiledInstruction = { programIndex: K.token, accountIndexes: [K.destination, K.buyer], data: new Uint8Array([6, 2, 0]) };
    expect(verify({ ...valid(), inner: [innerTransfer] })).toEqual(uncertain("inner_instruction_not_allowlisted"));
    expect(verify({ ...valid(), inner: [setAuthority] })).toEqual(uncertain("inner_instruction_not_allowlisted"));
    // The read-only kinds a wallet's transaction may run stay allowed.
    expect(verify({ ...valid(), inner: [{ programIndex: K.token, accountIndexes: [K.mint], data: new Uint8Array([21]) }] }).decision).toBe("confirmed");
  });

  it("unresolvable account keys leave the transfer uncertain", () => {
    expect(verify({ ...valid(), version: "unsupported", accountKeys: null })).toEqual(uncertain("account_keys_unresolved"));
    expect(verify({ ...valid(), accountKeys: null })).toEqual(uncertain("account_keys_unresolved"));
  });
});
