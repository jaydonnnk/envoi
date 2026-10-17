import { getBase58Encoder, getBase64Encoder, type Address, type EncodedAccount, type Lamports } from "@solana/kit";
import { AccountState, getMintDecoder, getTokenDecoder, type Extension } from "@solana-program/token-2022";
import { z } from "zod";
import type { DecodedMint, MintExtension } from "@/domain/pyusd/mint";
import type { CompiledInstruction, LandedTransaction, TokenBalance } from "@/domain/pyusd/verify";

// Landed-transaction and account decoding into domain shapes (Gate 3 Files). Nothing here decides
// whether a payment is valid: verify.ts does, on what this returns. A shape this module does not
// recognize decodes to null fields, which verification treats as incomplete, never as empty.

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export function decodeEncodedAccount(address: Address, json: { data: [string, "base64"]; owner: string; lamports: bigint; executable: boolean; space?: bigint }): EncodedAccount {
  const data = new Uint8Array(getBase64Encoder().encode(json.data[0]));
  return {
    address,
    data,
    executable: json.executable,
    lamports: json.lamports as Lamports,
    programAddress: json.owner as Address,
    space: json.space ?? BigInt(data.length),
    exists: true,
  } as EncodedAccount;
}

function toMintExtension(extension: Extension): MintExtension {
  switch (extension.__kind) {
    case "TransferFeeConfig":
      return {
        kind: "TransferFeeConfig",
        older: { epoch: extension.olderTransferFee.epoch, basisPoints: extension.olderTransferFee.transferFeeBasisPoints, maximumFee: extension.olderTransferFee.maximumFee },
        newer: { epoch: extension.newerTransferFee.epoch, basisPoints: extension.newerTransferFee.transferFeeBasisPoints, maximumFee: extension.newerTransferFee.maximumFee },
      };
    case "TransferHook":
      return { kind: "TransferHook", programId: extension.programId === SYSTEM_PROGRAM ? null : extension.programId };
    default:
      return { kind: extension.__kind };
  }
}

// The mint's decimals and extensions. Extensions that fail to decode read "unreadable", which
// refuses preparation.
export function decodeMintAccount(account: EncodedAccount): DecodedMint {
  const decimals = account.data[44] ?? -1;
  try {
    const mint = getMintDecoder().decode(account.data);
    const extensions = mint.extensions.__option === "Some" ? mint.extensions.value.map(toMintExtension) : [];
    return { decimals: mint.decimals, extensions };
  } catch {
    return { decimals, extensions: "unreadable" };
  }
}

export type DecodedTokenAccount = { mint: Address; owner: Address; amount: bigint; frozen: boolean };

export function decodeTokenAccount(account: EncodedAccount): DecodedTokenAccount | null {
  try {
    const token = getTokenDecoder().decode(account.data);
    return { mint: token.mint, owner: token.owner, amount: token.amount, frozen: token.state === AccountState.Frozen };
  } catch {
    return null;
  }
}

const instructionJson = z.object({ programIdIndex: z.number().int().nonnegative(), accounts: z.array(z.number().int().nonnegative()), data: z.string() });
const balanceJson = z.object({
  accountIndex: z.number().int().nonnegative(),
  mint: z.string(),
  owner: z.string().optional(),
  programId: z.string().optional(),
  uiTokenAmount: z.object({ amount: z.string().regex(/^\d+$/) }),
});
const transactionJson = z.object({
  slot: z.number().int().nonnegative(),
  version: z.union([z.literal("legacy"), z.number()]).optional(),
  transaction: z.object({
    signatures: z.array(z.string()),
    message: z.object({
      header: z.object({ numRequiredSignatures: z.number().int() }),
      accountKeys: z.array(z.string()),
      recentBlockhash: z.string(),
      instructions: z.array(instructionJson),
      addressTableLookups: z.array(z.unknown()).optional(),
    }),
  }),
  meta: z
    .object({
      err: z.unknown().nullable(),
      loadedAddresses: z.object({ writable: z.array(z.string()), readonly: z.array(z.string()) }).optional(),
      innerInstructions: z.array(z.object({ index: z.number(), instructions: z.array(instructionJson) })).nullable().optional(),
      preTokenBalances: z.array(balanceJson).nullable().optional(),
      postTokenBalances: z.array(balanceJson).nullable().optional(),
    })
    .nullable(),
});

const base58 = getBase58Encoder();

function compiled(ix: z.infer<typeof instructionJson>): CompiledInstruction {
  return { programIndex: ix.programIdIndex, accountIndexes: ix.accounts, data: new Uint8Array(base58.encode(ix.data)) };
}

function balances(list: z.infer<typeof balanceJson>[] | null | undefined): TokenBalance[] | null {
  if (!list) return null;
  return list.map((b) => ({ accountIndex: b.accountIndex, mint: b.mint, owner: b.owner ?? null, programId: b.programId ?? null, amount: BigInt(b.uiTokenAmount.amount) }));
}

// getTransaction with encoding "json" and maxSupportedTransactionVersion 0. Returns null when the
// response is not a transaction at all; partial metadata decodes to null fields.
export function decodeLandedTransaction(signature: string, json: unknown): LandedTransaction | null {
  const parsed = transactionJson.safeParse(json);
  if (!parsed.success) return null;
  const { slot, transaction, meta } = parsed.data;
  const message = transaction.message;
  const version = parsed.data.version === "legacy" || parsed.data.version === undefined ? "legacy" : parsed.data.version === 0 ? 0 : "unsupported";
  const staticKeys = message.accountKeys as Address[];
  const lookups = message.addressTableLookups ?? [];
  let accountKeys: Address[] | null = staticKeys;
  if (version === "unsupported") accountKeys = null;
  else if (lookups.length > 0) {
    accountKeys = meta?.loadedAddresses ? [...staticKeys, ...(meta.loadedAddresses.writable as Address[]), ...(meta.loadedAddresses.readonly as Address[])] : null;
  }
  let outer: CompiledInstruction[];
  let inner: CompiledInstruction[] | null;
  try {
    outer = message.instructions.map(compiled);
    inner = meta?.innerInstructions ? meta.innerInstructions.flatMap((group) => group.instructions.map(compiled)) : null;
  } catch {
    return null;
  }
  return {
    signature,
    slot: BigInt(slot),
    version,
    numRequiredSignatures: message.header.numRequiredSignatures,
    staticAccountKeys: staticKeys,
    accountKeys,
    recentBlockhash: message.recentBlockhash,
    outer,
    inner,
    meta: meta ? { err: meta.err ?? null, preTokenBalances: balances(meta.preTokenBalances), postTokenBalances: balances(meta.postTokenBalances) } : null,
  };
}
