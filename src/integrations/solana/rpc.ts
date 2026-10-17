import type { Address, EncodedAccount } from "@solana/kit";
import { z } from "zod";
import type { EpochSchedule } from "@/domain/pyusd/mint";
import type { SignatureEntry } from "@/domain/pyusd/recovery";
import type { LandedTransaction } from "@/domain/pyusd/verify";
import { decodeEncodedAccount, decodeLandedTransaction } from "@/integrations/solana/decode";
import { createDatabaseRpcLimiter, RPC_BUDGET, type RpcLimiter } from "@/integrations/solana/limiter";
import { webEnv } from "@/env";
import { webDb } from "@/lib/db/web";
import { readCountedBody } from "@/lib/http/bounded-body";
import { systemNow } from "@/lib/time";

// Read-only devnet RPC client over a bounded transport (Gate 3 Files; Gate 2 "Lost-response recovery
// and RPC"). It has no send, airdrop or signing method, and builds no request that could submit
// anything: every call names one of the read methods below. Each call first takes an admission from
// the shared database limiter, is abandoned at T_RPC_CALL, and stops reading a response past 1 MiB.
// An unavailable, oversized or throttled read is never evidence that something is absent.

export type RpcResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "rate_limited" }
  | { kind: "unavailable" }
  | { kind: "too_large" }
  | { kind: "local_budget_exhausted" };

export type LatestBlockhash = { blockhash: string; lastValidBlockHeight: bigint; slot: bigint };

export type SolanaReadClient = {
  getGenesisHash(): Promise<RpcResult<string>>;
  getAccounts(addresses: readonly Address[], commitment: "confirmed" | "finalized"): Promise<RpcResult<(EncodedAccount | null)[]>>;
  getLatestBlockhashConfirmed(): Promise<RpcResult<LatestBlockhash>>;
  getBlockHeight(commitment: "confirmed" | "finalized"): Promise<RpcResult<bigint>>;
  getEpochInfo(): Promise<RpcResult<{ epoch: bigint; absoluteSlot: bigint }>>;
  getEpochSchedule(): Promise<RpcResult<EpochSchedule>>;
  getTransactionFinalized(signature: string): Promise<RpcResult<LandedTransaction | null>>;
  getSignaturesFinalized(address: Address, before: string | null, limit: 1000): Promise<RpcResult<SignatureEntry[]>>;
};

// The transport is fetch-shaped so a test can fake it; production passes the global fetch.
export type RpcFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

const u64 = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform((value) => BigInt(value));

const accountJson = z
  .object({
    data: z.tuple([z.string(), z.literal("base64")]),
    owner: z.string(),
    lamports: u64,
    executable: z.boolean(),
    space: u64.optional(),
  })
  .nullable();

const signatureJson = z.object({ signature: z.string(), slot: u64, err: z.unknown().nullable() });

export function createSolanaReadClient(cfg: { rpcUrl: string; fetch?: RpcFetch }, limiter: RpcLimiter): SolanaReadClient {
  const send: RpcFetch = cfg.fetch ?? ((url, init) => fetch(url, init));

  async function call<T>(method: string, params: unknown[], schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const admission = await limiter.acquire(method);
    if (!admission.ok) return { kind: "local_budget_exhausted" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_BUDGET.callTimeoutMs);
    const started = Date.now();
    try {
      let response: Response;
      try {
        response = await send(cfg.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: controller.signal,
        });
      } catch {
        return { kind: "unavailable" };
      }
      if (response.status === 429) {
        await response.body?.cancel().catch(() => {});
        await limiter.reportRateLimited();
        return { kind: "rate_limited" };
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { kind: "unavailable" };
      }
      const remaining = Math.max(0, RPC_BUDGET.callTimeoutMs - (Date.now() - started));
      const body = await readCountedBody(response.body, RPC_BUDGET.maxResponseBytes, remaining, controller.signal);
      if (!body.ok) return body.reason === "too_large" ? { kind: "too_large" } : { kind: "unavailable" };
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(body.bytes));
      } catch {
        return { kind: "unavailable" };
      }
      const envelope = z.object({ result: z.unknown().optional(), error: z.object({ code: z.number() }).optional() }).safeParse(json);
      if (!envelope.success) return { kind: "unavailable" };
      if (envelope.data.error) {
        // -32429 and -32005 are the codes RPC providers use for throttling.
        if (envelope.data.error.code === -32429 || envelope.data.error.code === -32005) {
          await limiter.reportRateLimited();
          return { kind: "rate_limited" };
        }
        return { kind: "unavailable" };
      }
      const parsed = schema.safeParse(envelope.data.result);
      return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "unavailable" };
    } finally {
      clearTimeout(timer);
      await admission.release();
    }
  }

  return {
    getGenesisHash: () => call("getGenesisHash", [], z.string()),

    async getAccounts(addresses, commitment) {
      const result = await call(
        "getMultipleAccounts",
        [addresses, { encoding: "base64", commitment }],
        z.object({ value: z.array(accountJson) }),
      );
      if (result.kind !== "ok") return result;
      if (result.value.value.length !== addresses.length) return { kind: "unavailable" };
      return { kind: "ok", value: result.value.value.map((account, index) => (account ? decodeEncodedAccount(addresses[index]!, account) : null)) };
    },

    async getLatestBlockhashConfirmed() {
      const result = await call(
        "getLatestBlockhash",
        [{ commitment: "confirmed" }],
        z.object({ context: z.object({ slot: u64 }), value: z.object({ blockhash: z.string(), lastValidBlockHeight: u64 }) }),
      );
      if (result.kind !== "ok") return result;
      return { kind: "ok", value: { blockhash: result.value.value.blockhash, lastValidBlockHeight: result.value.value.lastValidBlockHeight, slot: result.value.context.slot } };
    },

    getBlockHeight: (commitment) => call("getBlockHeight", [{ commitment }], u64),

    async getEpochInfo() {
      const result = await call("getEpochInfo", [{ commitment: "confirmed" }], z.object({ epoch: u64, absoluteSlot: u64 }));
      return result.kind === "ok" ? { kind: "ok", value: { epoch: result.value.epoch, absoluteSlot: result.value.absoluteSlot } } : result;
    },

    getEpochSchedule: () =>
      call(
        "getEpochSchedule",
        [],
        z.object({ slotsPerEpoch: u64, leaderScheduleSlotOffset: u64, warmup: z.boolean(), firstNormalEpoch: u64, firstNormalSlot: u64 }),
      ),

    async getTransactionFinalized(signature) {
      const result = await call(
        "getTransaction",
        [signature, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
        z.unknown(),
      );
      if (result.kind !== "ok") return result;
      if (result.value === null) return { kind: "ok", value: null };
      const decoded = decodeLandedTransaction(signature, result.value);
      return decoded ? { kind: "ok", value: decoded } : { kind: "unavailable" };
    },

    async getSignaturesFinalized(address, before, limit) {
      const result = await call(
        "getSignaturesForAddress",
        [address, { commitment: "finalized", limit, ...(before ? { before } : {}) }],
        z.array(signatureJson),
      );
      if (result.kind !== "ok") return result;
      return { kind: "ok", value: result.value.map((entry) => ({ signature: entry.signature, slot: entry.slot, failed: entry.err !== null })) };
    },
  };
}

// The web app's client: the configured devnet RPC URL behind the shared database limiter. Null
// while SOLANA_RPC_URL is unset, which reads as "rpc_unconfigured" and makes only PYUSD unavailable.
export function webSolanaClient(): SolanaReadClient | null {
  const url = webEnv().SOLANA_RPC_URL;
  if (!url) return null;
  return createSolanaReadClient({ rpcUrl: url }, createDatabaseRpcLimiter(webDb(), systemNow));
}
