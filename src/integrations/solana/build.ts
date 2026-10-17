import { createHash } from "node:crypto";
import {
  appendTransactionMessageInstructions,
  blockhash as toBlockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from "@solana/kit";
import { getAddMemoInstruction } from "@solana-program/memo";
import { getTransferCheckedInstruction } from "@solana-program/token-2022";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";

// Unsigned transfer construction from pinned constants (Gate 3 "PYUSD"; Gate 2 step 3). A version 0
// message with no address lookup tables and the buyer as fee payer, holding exactly two
// instructions: one memo carrying only the reference under the pinned memo program, then one
// Token-2022 TransferChecked of the exact amount at 6 decimals from the buyer's associated account
// to the merchant's, with the buyer as authority. The memo comes first so a merchant account that
// requires incoming memos still accepts it. No compute-budget, account-creation, authority, delegate
// or durable-nonce instruction is added, and the signature slot stays empty: Phantom chooses its own
// priority fee and signs. The wire bytes are returned once and never stored; only the message
// fingerprint is.

export function buildUnsignedTransfer(input: {
  buyerWallet: Address;
  source: Address;
  destination: Address;
  atomicAmount: bigint;
  reference: string;
  blockhash: { blockhash: string; lastValidBlockHeight: bigint };
}): { wireBase64: string; messageFingerprint: string } {
  const memo = getAddMemoInstruction({ memo: input.reference }, { programAddress: PYUSD_DEVNET.memoProgram });
  const transfer = getTransferCheckedInstruction(
    {
      source: input.source,
      mint: PYUSD_DEVNET.mint,
      destination: input.destination,
      authority: input.buyerWallet,
      amount: input.atomicAmount,
      decimals: PYUSD_DEVNET.decimals,
    },
    { programAddress: PYUSD_DEVNET.tokenProgram },
  );
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.buyerWallet, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: toBlockhash(input.blockhash.blockhash), lastValidBlockHeight: input.blockhash.lastValidBlockHeight }, m),
    (m) => appendTransactionMessageInstructions([memo, transfer], m),
  );
  const transaction = compileTransaction(message);
  const wire = getTransactionEncoder().encode(transaction);
  return {
    wireBase64: getBase64Decoder().decode(wire),
    messageFingerprint: createHash("sha256").update(new Uint8Array(transaction.messageBytes)).digest("hex"),
  };
}
