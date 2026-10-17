import { getBase58Encoder, isAddress, type Address } from "@solana/kit";
import { z } from "zod";

// PYUSD request bodies (S16). A wallet address must be a base58 Ed25519 public key; a signature, the
// 64 bytes a wallet returns, in base58. Any other field, such as an amount, token account, RPC URL or
// rate, is dropped here and never reaches the domain.

export const walletAddress = z
  .string()
  .min(32)
  .max(44)
  .refine((value) => isAddress(value), "must be a Solana address")
  .transform((value) => value as Address);

export function signatureBytes(value: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value)) return null;
  try {
    const bytes = new Uint8Array(getBase58Encoder().encode(value));
    return bytes.length === 64 ? bytes : null;
  } catch {
    return null;
  }
}

export const base58Signature = z.string().refine((value) => signatureBytes(value) !== null, "must be a base58 64-byte signature");

export const walletChallengeBody = z.object({ walletAddress });
export const walletProofBody = z.object({ challengeId: z.string().min(1).max(64), signature: base58Signature });
export const pyusdRateBody = z.object({ pyusdPerSgd: z.string().max(32) });
export const prepareBody = z.object({ walletAddress });
export const submittedBody = z.object({ attemptId: z.string().min(1).max(64), signature: base58Signature });
