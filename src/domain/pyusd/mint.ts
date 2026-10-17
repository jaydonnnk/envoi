import { PYUSD_DEVNET } from "@/domain/pyusd/constants";

// Mint eligibility for one transfer (Gate 2 "Preparation", step 2; Gate 3 "PYUSD"). Pure: the RPC
// read and the account decoding happen in src/integrations/solana; this decides on the decoded mint.
// TransferChecked is used only when every fee that can apply while the prepared blockhash is valid
// is zero, so no fee can be withheld from the merchant's receipt; any active transfer hook or
// extension outside the eight reviewed on 2026-10-10 refuses preparation pending review.

export type FeeSchedule = { epoch: bigint; basisPoints: number; maximumFee: bigint };
export type FeeEvidence = { preparedEpoch: bigint; older: FeeSchedule; newer: FeeSchedule };

export type MintExtension =
  | { kind: "TransferFeeConfig"; older: FeeSchedule; newer: FeeSchedule }
  | { kind: "TransferHook"; programId: string | null } // null when no hook program is set
  | { kind: string };

export type DecodedMint = { decimals: number; extensions: readonly MintExtension[] | "unreadable" };

export type MintEligibility =
  | { ok: true; fee: FeeEvidence }
  | { ok: false; reason: "fee_rate_nonzero" | "max_fee_nonzero" | "fee_next_epoch_nonzero" | "transfer_hook_active" | "unreviewed_extension" | "mint_unreadable" };

// The schedule in force at an epoch: Token-2022 uses the older schedule until the newer one's epoch.
export function feeAtEpoch(fee: Pick<FeeEvidence, "older" | "newer">, epoch: bigint): FeeSchedule {
  return epoch >= fee.newer.epoch ? fee.newer : fee.older;
}

const REVIEWED: ReadonlySet<string> = new Set(PYUSD_DEVNET.reviewedMintExtensions);

export function assessMintForTransfer(mint: DecodedMint, currentEpoch: bigint): MintEligibility {
  if (mint.extensions === "unreadable") return { ok: false, reason: "mint_unreadable" };
  for (const extension of mint.extensions) {
    if (!REVIEWED.has(extension.kind)) return { ok: false, reason: "unreviewed_extension" };
  }
  const hook = mint.extensions.find((extension): extension is Extract<MintExtension, { kind: "TransferHook" }> => extension.kind === "TransferHook");
  if (hook && hook.programId !== null) return { ok: false, reason: "transfer_hook_active" };

  const config = mint.extensions.find((extension): extension is Extract<MintExtension, { kind: "TransferFeeConfig" }> => extension.kind === "TransferFeeConfig");
  // A mint with no fee extension charges no fee at any epoch.
  const zero: FeeSchedule = { epoch: 0n, basisPoints: 0, maximumFee: 0n };
  const fee = config ? { older: config.older, newer: config.newer } : { older: zero, newer: zero };
  const current = feeAtEpoch(fee, currentEpoch);
  if (current.basisPoints !== 0) return { ok: false, reason: "fee_rate_nonzero" };
  if (current.maximumFee !== 0n) return { ok: false, reason: "max_fee_nonzero" };
  // A blockhash stays valid for about a minute, so the transfer can execute in this epoch or the
  // next; a non-zero schedule that takes effect then refuses preparation too.
  const next = feeAtEpoch(fee, currentEpoch + 1n);
  if (next.basisPoints !== 0 || next.maximumFee !== 0n) return { ok: false, reason: "fee_next_epoch_nonzero" };
  return { ok: true, fee: { preparedEpoch: currentEpoch, older: fee.older, newer: fee.newer } };
}

// Solana's EpochSchedule: the epoch a slot belongs to, including the warmup epochs before the first
// normal slot. Verification uses it to find the fee schedule of a transaction's execution epoch.
export type EpochSchedule = { slotsPerEpoch: bigint; leaderScheduleSlotOffset: bigint; warmup: boolean; firstNormalEpoch: bigint; firstNormalSlot: bigint };

const MINIMUM_SLOTS_PER_EPOCH = 32n;

export function epochOfSlot(schedule: EpochSchedule, slot: bigint): bigint {
  if (slot < schedule.firstNormalSlot) {
    let power = 1n;
    while (power < slot + MINIMUM_SLOTS_PER_EPOCH + 1n) power *= 2n;
    const trailingZeros = (value: bigint) => {
      let n = 0n;
      while (value > 1n && value % 2n === 0n) {
        value /= 2n;
        n += 1n;
      }
      return n;
    };
    return trailingZeros(power) - trailingZeros(MINIMUM_SLOTS_PER_EPOCH) - 1n;
  }
  return (slot - schedule.firstNormalSlot) / schedule.slotsPerEpoch + schedule.firstNormalEpoch;
}
