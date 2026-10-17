import type { Address } from "@solana/kit";

// Reviewed devnet constants for the PYUSD rail (Gate 2 PYUSD devnet amendment; Gate 3 "PYUSD").
// These are code, never environment values: src/env.ts refuses any PYUSD_ or SOLANA_ name other than
// SOLANA_RPC_URL and PYUSD_ENABLED, so no deployment can point the rail at another mint or cluster.
// The genesis hash, mint owner program and decimals are checked against the RPC before every use.

export const PYUSD_DEVNET = {
  chain: "solana:devnet",
  genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  mint: "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM" as Address,
  // Token-2022.
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address,
  decimals: 6,
  // The non-upgradeable memo program (research.md, Gate 3 revision reads, 2026-10-11).
  memoProgram: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address,
  associatedTokenProgram: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address,
  computeBudgetProgram: "ComputeBudget111111111111111111111111111111" as Address,
  lighthouseProgram: "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95" as Address,
  // Lighthouse assertion instructions are 2..17 at commit 4c57947; 0 and 1 are MemoryWrite and
  // MemoryClose, which are never allowed (research.md, Lighthouse instruction set).
  lighthouseAssertionDiscriminators: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  // Exactly the eight extensions observed on the devnet mint on 2026-10-10 (research.md). Any other
  // extension refuses preparation pending review.
  reviewedMintExtensions: [
    "MintCloseAuthority",
    "PermanentDelegate",
    "TransferFeeConfig",
    "ConfidentialTransferMint",
    "ConfidentialTransferFee",
    "TransferHook",
    "MetadataPointer",
    "TokenMetadata",
  ],
  // Read-only Token-2022 instructions a wallet's transaction may run as inner instructions.
  innerToken2022Allowed: ["GetAccountDataSize", "AmountToUiAmount", "UiAmountToAmount"],
} as const;

export const PYUSD_PROOFS = {
  // Set true only by a reviewed change after the wallet blockhash-preservation and history-coverage
  // proofs are recorded in 00-status.md (S17).
  automaticUnpaidRelease: false,
} as const;

// Signature hints stored per attempt; later ones are audited only.
export const PYUSD_HINT_CAP = 3;
