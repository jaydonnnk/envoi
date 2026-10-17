import { findAssociatedTokenPda } from "@solana-program/token-2022";
import type { Address } from "@solana/kit";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import type { WebEnv } from "@/env";
import { decodeMintAccount, decodeTokenAccount } from "@/integrations/solana/decode";
import type { SolanaReadClient } from "@/integrations/solana/rpc";
import { appError, type AppError } from "@/lib/errors";

// The devnet identity check and token-account checks (Gate 2 enable condition; Gate 3 "PYUSD").
// checkPyusdIdentity is exactly Gate 2's condition: the RPC's genesis hash, the mint's owner program
// and its decimals match the reviewed constants. PYUSD_ENABLED is checked separately, so recovery
// still reads while new PYUSD actions are off. A failure disables only PYUSD, never PayPal or the app.

export type PyusdIdentity =
  | { ok: true; epoch: bigint }
  | { ok: false; reason: "rpc_unconfigured" | "rpc_unavailable" | "genesis_mismatch" | "mint_program_mismatch" | "mint_decimals_mismatch" };

export async function checkPyusdIdentity(rpc: SolanaReadClient | null): Promise<PyusdIdentity> {
  if (!rpc) return { ok: false, reason: "rpc_unconfigured" };
  const genesis = await rpc.getGenesisHash();
  if (genesis.kind !== "ok") return { ok: false, reason: "rpc_unavailable" };
  if (genesis.value !== PYUSD_DEVNET.genesisHash) return { ok: false, reason: "genesis_mismatch" };

  const accounts = await rpc.getAccounts([PYUSD_DEVNET.mint], "finalized");
  if (accounts.kind !== "ok") return { ok: false, reason: "rpc_unavailable" };
  const mint = accounts.value[0];
  if (!mint || mint.programAddress !== PYUSD_DEVNET.tokenProgram) return { ok: false, reason: "mint_program_mismatch" };
  if (decodeMintAccount(mint).decimals !== PYUSD_DEVNET.decimals) return { ok: false, reason: "mint_decimals_mismatch" };

  const epoch = await rpc.getEpochInfo();
  if (epoch.kind !== "ok") return { ok: false, reason: "rpc_unavailable" };
  return { ok: true, epoch: epoch.value.epoch };
}

// Guards PYUSD pricing, challenge, proof, rate and preparation only; never reads, hints or reconcile.
export function requirePyusdEnabled(env: Pick<WebEnv, "PYUSD_ENABLED">): AppError | null {
  if (env.PYUSD_ENABLED) return null;
  return appError("pyusd_unavailable", "PYUSD is switched off in this test environment right now.", { details: { reason: "rail_disabled" } });
}

// The associated Token-2022 account of a wallet for the pinned mint. Always derived; never taken
// from a request.
export async function associatedPyusdAccount(owner: Address): Promise<Address> {
  const [address] = await findAssociatedTokenPda({ owner, mint: PYUSD_DEVNET.mint, tokenProgram: PYUSD_DEVNET.tokenProgram });
  return address;
}

export type TokenAccountCheck =
  | { ok: true; address: Address; amount: bigint }
  | { ok: false; reason: "missing" | "not_token_2022_account" | "frozen" | "rpc_unavailable"; address: Address };

// The derived account exists, belongs to Token-2022 for the pinned mint and owner, and is not frozen.
export async function checkPyusdTokenAccount(rpc: SolanaReadClient, owner: Address): Promise<TokenAccountCheck> {
  const address = await associatedPyusdAccount(owner);
  const accounts = await rpc.getAccounts([address], "confirmed");
  if (accounts.kind !== "ok") return { ok: false, reason: "rpc_unavailable", address };
  const account = accounts.value[0];
  if (!account) return { ok: false, reason: "missing", address };
  if (account.programAddress !== PYUSD_DEVNET.tokenProgram) return { ok: false, reason: "not_token_2022_account", address };
  const token = decodeTokenAccount(account);
  if (!token || token.mint !== PYUSD_DEVNET.mint || token.owner !== owner) return { ok: false, reason: "not_token_2022_account", address };
  if (token.frozen) return { ok: false, reason: "frozen", address };
  return { ok: true, address, amount: token.amount };
}

export type PyusdAvailability = { available: true } | { available: false; reason: string; message: string };

const IDENTITY_COPY: Record<Exclude<PyusdIdentity, { ok: true }>["reason"], string> = {
  rpc_unconfigured: "Envoi's Solana devnet connection is not configured.",
  rpc_unavailable: "Envoi cannot reach Solana devnet right now.",
  genesis_mismatch: "Envoi's Solana connection is not devnet, so PYUSD is off.",
  mint_program_mismatch: "The devnet PYUSD token does not match Envoi's reviewed token, so PYUSD is off.",
  mint_decimals_mismatch: "The devnet PYUSD token does not match Envoi's reviewed token, so PYUSD is off.",
};

// Whether a buyer can pick PYUSD at this shop now, with the reason when not (S16; replaces D8's
// static option). The enable flag, the shop's verified wallet and dated rate are read first, and the
// devnet identity is checked only when they all pass. Any failure makes only PYUSD unavailable.
export async function pyusdAvailability(
  input: { enabled: boolean; hasWallet: boolean; rate: { expired: boolean } | null },
  rpc: () => SolanaReadClient | null,
): Promise<PyusdAvailability> {
  if (!input.enabled) return { available: false, reason: "rail_disabled", message: "PYUSD is switched off in this test environment." };
  if (!input.hasWallet) return { available: false, reason: "no_destination", message: "This shop has not connected a PYUSD devnet wallet." };
  if (!input.rate) return { available: false, reason: "no_rate", message: "This shop has not set a PYUSD rate." };
  if (input.rate.expired) return { available: false, reason: "rate_expired", message: "This shop's PYUSD rate is more than 30 days old, so PYUSD is unavailable here." };
  let identity: PyusdIdentity;
  try {
    identity = await checkPyusdIdentity(rpc());
  } catch {
    identity = { ok: false, reason: "rpc_unavailable" };
  }
  return identity.ok ? { available: true } : { available: false, reason: identity.reason, message: IDENTITY_COPY[identity.reason] };
}
