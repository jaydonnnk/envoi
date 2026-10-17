import { createHash, randomBytes } from "node:crypto";
import { getBase58Decoder, getPublicKeyFromAddress, verifySignature, type Address, type SignatureBytes } from "@solana/kit";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { checkPyusdIdentity, checkPyusdTokenAccount, type PyusdIdentity } from "@/domain/pyusd/identity";
import type { SolanaReadClient } from "@/integrations/solana/rpc";
import type { OutletMemberPrincipal } from "@/lib/auth-context";
import { paymentDestinations, walletChallenges } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { admit, WALLET_CHALLENGE_LIMITS } from "@/lib/ratelimit";
import { deadlineOf } from "@/lib/time";

// Merchant wallet proof (Gate 2 "Identity, destination and rate"; Gate 3 "PYUSD merchant wallet and
// rate"). The member asks for a five-minute, single-use challenge in the Sign In With Solana message
// format, bound to Envoi's configured domain, the destination-enrollment purpose, the outlet, devnet,
// the wallet, a nonce and its expiry. The wallet signs those exact bytes with solana:signMessage; the
// server verifies the signature against the saved bytes and the saved wallet, never request input,
// derives the merchant's associated Token-2022 account and records the destination while consuming
// the challenge in one transaction. A verified proof records key control only: it creates no
// membership and no enrollment, and the destination counts as active only while PYUSD_ENABLED is
// true and the outlet's operator-approved enrollment exists.

export type WalletChallenge = {
  id: string;
  outletId: string;
  memberUserId: string;
  wallet: Address;
  message: Uint8Array; // exact UTF-8 bytes the wallet signs; saved verbatim
  nonceHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

const PURPOSE = "urn:envoi:purpose:pyusd-destination-enrollment";

export function buildChallengeMessage(input: { domain: string; uri: string; wallet: Address; outletId: string; nonce: string; issuedAt: Date; expiresAt: Date }): Uint8Array {
  const text = [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.wallet,
    "",
    `Envoi destination enrollment: prove that you control this wallet so outlet ${input.outletId} can receive PYUSD devnet test tokens. This proves key control only. It creates no membership or enrollment and moves no tokens.`,
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    "Chain ID: devnet",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
    "Resources:",
    `- ${PURPOSE}`,
    `- urn:envoi:outlet:${input.outletId}`,
  ].join("\n");
  return new TextEncoder().encode(text);
}

const merchantActor = (userId: string) => `merchant:${userId}`;

// appBaseUrl is APP_BASE_URL: the domain and URI never come from the Host header.
export async function issueWalletChallenge(
  db: Db,
  principal: OutletMemberPrincipal,
  wallet: Address,
  appBaseUrl: string,
  now: Date,
): Promise<{ challengeId: string; message: Uint8Array; expiresAt: Date } | { error: AppError }> {
  const admission = await admit(db, "wallet_challenge", principal.outletId, WALLET_CHALLENGE_LIMITS, now);
  if (admission.kind === "rate_limited") return { error: appError("rate_limited", "Too many wallet challenges for this shop. Try again in an hour.", { retryable: true }) };

  const base = new URL(appBaseUrl);
  // 128-bit nonce, base58 so it reads as one token in the wallet's message display.
  const nonce = getBase58Decoder().decode(randomBytes(16));
  const expiresAt = deadlineOf("T_WALLET_CHALLENGE", now);
  const message = buildChallengeMessage({ domain: base.host, uri: base.origin, wallet, outletId: principal.outletId, nonce, issuedAt: now, expiresAt });
  const challengeId = newId("wch");
  await db.insert(walletChallenges).values({
    id: challengeId,
    outletId: principal.outletId,
    memberUserId: principal.userId,
    wallet,
    message,
    nonceHash: createHash("sha256").update(nonce, "utf8").digest("hex"),
    issuedAt: now,
    expiresAt,
  });
  return { challengeId, message, expiresAt };
}

export type WalletProof =
  | { ok: true; destinationId: string; version: number }
  | {
      ok: false;
      reason:
        | "challenge_unknown"
        | "challenge_expired"
        | "challenge_used"
        | "challenge_other_outlet"
        | "signature_invalid"
        | "token_account_missing"
        | "token_account_not_token_2022"
        | "token_account_frozen"
        | "rail_unavailable";
      // The identity or RPC reason behind rail_unavailable.
      identity?: Exclude<PyusdIdentity, { ok: true }>["reason"];
    };

async function signatureVerifies(wallet: Address, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (signature.length !== 64) return false;
  try {
    const key = await getPublicKeyFromAddress(wallet);
    return await verifySignature(key, signature as SignatureBytes, message);
  } catch {
    return false;
  }
}

export async function verifyWalletProof(
  db: Db,
  rpc: SolanaReadClient | null,
  principal: OutletMemberPrincipal,
  input: { challengeId: string; signature: Uint8Array },
  now: Date,
): Promise<WalletProof> {
  const [challenge] = await db.select().from(walletChallenges).where(eq(walletChallenges.id, input.challengeId));
  if (!challenge || challenge.memberUserId !== principal.userId) return { ok: false, reason: "challenge_unknown" };
  if (challenge.outletId !== principal.outletId) return { ok: false, reason: "challenge_other_outlet" };
  if (now.getTime() >= challenge.expiresAt.getTime()) return { ok: false, reason: "challenge_expired" };
  if (challenge.consumedAt !== null) return { ok: false, reason: "challenge_used" };

  // The saved bytes and the saved wallet: nothing in the request names either.
  const wallet = challenge.wallet as Address;
  if (!(await signatureVerifies(wallet, challenge.message, input.signature))) return { ok: false, reason: "signature_invalid" };

  // Chain reads first, outside any transaction.
  const identity = await checkPyusdIdentity(rpc);
  if (!identity.ok) return { ok: false, reason: "rail_unavailable", identity: identity.reason };
  const account = await checkPyusdTokenAccount(rpc!, wallet);
  if (!account.ok) {
    if (account.reason === "rpc_unavailable") return { ok: false, reason: "rail_unavailable", identity: "rpc_unavailable" };
    return { ok: false, reason: account.reason === "missing" ? "token_account_missing" : account.reason === "frozen" ? "token_account_frozen" : "token_account_not_token_2022" };
  }

  return db.transaction(async (tx): Promise<WalletProof> => {
    const consumed = await tx
      .update(walletChallenges)
      .set({ consumedAt: now })
      .where(and(eq(walletChallenges.id, challenge.id), isNull(walletChallenges.consumedAt), gt(walletChallenges.expiresAt, now)))
      .returning({ id: walletChallenges.id });
    if (consumed.length === 0) return { ok: false, reason: "challenge_used" };

    const [existing] = await tx
      .select()
      .from(paymentDestinations)
      .where(and(eq(paymentDestinations.outletId, principal.outletId), eq(paymentDestinations.rail, "pyusd")))
      .for("update");
    let destinationId: string;
    let version: number;
    if (existing) {
      const [updated] = await tx
        .update(paymentDestinations)
        .set({ walletAddress: wallet, tokenAccount: account.address, keyVerifiedAt: now, keyVerifiedByUserId: principal.userId, version: existing.version + 1 })
        .where(eq(paymentDestinations.id, existing.id))
        .returning({ id: paymentDestinations.id, version: paymentDestinations.version });
      destinationId = updated!.id;
      version = updated!.version;
    } else {
      destinationId = newId("dst");
      version = 1;
      // Names only the PYUSD columns: the web role holds INSERT on exactly these, so it can never write
      // a PayPal seller id or acceptance (migration 0022). A query-builder insert would list every
      // column, the PayPal ones as DEFAULT, which that grant refuses.
      await tx.execute(sql`
        insert into payment_destinations (id, outlet_id, rail, environment, status, version, wallet_address, token_account, key_verified_at, key_verified_by_user_id, created_at)
        values (${destinationId}, ${principal.outletId}, 'pyusd', 'devnet', 'active', ${version}, ${wallet}, ${account.address}, ${now.toISOString()}, ${principal.userId}, ${now.toISOString()})`);
    }
    await recordAudit(tx, {
      at: now,
      actor: merchantActor(principal.userId),
      action: "pyusd_wallet_verified",
      outletId: principal.outletId,
      operatorVisible: true,
      details: { challengeId: challenge.id, destinationId, version, wallet, tokenAccount: account.address, environment: "devnet", proves: "key_control_only" },
    });
    return { ok: true, destinationId, version };
  });
}

export const WALLET_PROOF_COPY: Record<Exclude<WalletProof, { ok: true }>["reason"], string> = {
  challenge_unknown: "That wallet challenge is not known. Request a new one.",
  challenge_expired: "That wallet challenge expired after five minutes. Request a new one.",
  challenge_used: "That wallet challenge was already used. Request a new one.",
  challenge_other_outlet: "That wallet challenge was issued for another shop.",
  signature_invalid: "The signature does not match the wallet in the challenge.",
  token_account_missing: "This wallet has no PYUSD devnet token account yet. Receive any amount of devnet PYUSD to it first, then try again.",
  token_account_not_token_2022: "The wallet's PYUSD account is not a Token-2022 account for the devnet PYUSD mint.",
  token_account_frozen: "The wallet's PYUSD devnet account is frozen, so it cannot receive payments.",
  rail_unavailable: "PYUSD is unavailable right now.",
};
