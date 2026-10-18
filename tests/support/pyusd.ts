import { getBase58Decoder, type Address } from "@solana/kit";
import { drizzle } from "drizzle-orm/postgres-js";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import type { PyusdAttempt } from "@/domain/pyusd/state";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import type { RpcFetch } from "@/integrations/solana/rpc";
import type { TestDatabase } from "./db";
import { fixtureKey, type FakeChain } from "./fake-solana";
import { newMerchant } from "./merchant";

// S16 integration support. Every chain, wallet, rate and landed transaction here is a FIXTURE: the
// Solana RPC is faked at the bounded transport, wallets are key pairs made in this process, and no
// value is a real devnet read or payment.

// Test files hold this state in vi.hoisted and mock two modules with it: "@/env", so a case can turn
// PYUSD_ENABLED or PAYMENTS_ENABLED off without reloading the cached web settings, and
// "@/integrations/solana/rpc", so webSolanaClient reads the case's fake chain (null reads as an
// unconfigured RPC).
export type PyusdTestState = { env: { PYUSD_ENABLED?: boolean; PAYMENTS_ENABLED?: boolean }; fetch: RpcFetch | null };

export const FOREIGN_ORIGIN = "https://attacker.example";

// A PYUSD destination and a dated rate for an outlet, written as the operator's superuser
// connection would (FIXTURE). The member who "verified" it is a throwaway merchant account.
export async function seedPyusdDestination(
  database: TestDatabase,
  outletId: string,
  input: { wallet: Address; tokenAccount: Address; atomicPerSgd: bigint; confirmedAt: Date },
): Promise<{ destinationId: string; rateVersionId: string }> {
  const db = drizzle(database.admin, { schema });
  const member = await newMerchant(database, "pyusd-member", { membership: false });
  const destinationId = newId("dst");
  await db.insert(schema.paymentDestinations).values({
    id: destinationId,
    outletId,
    rail: "pyusd",
    environment: "devnet",
    status: "active",
    version: 1,
    walletAddress: input.wallet,
    tokenAccount: input.tokenAccount,
    keyVerifiedAt: input.confirmedAt,
    keyVerifiedByUserId: member.userId,
    createdAt: input.confirmedAt,
  });
  const rateVersionId = await seedPyusdRate(database, outletId, member.userId, input.atomicPerSgd, input.confirmedAt);
  return { destinationId, rateVersionId };
}

export async function seedPyusdRate(database: TestDatabase, outletId: string, userId: string, atomicPerSgd: bigint, confirmedAt: Date): Promise<string> {
  const id = newId("rat");
  await drizzle(database.admin, { schema }).insert(schema.pyusdRates).values({ id, outletId, atomicPerSgd, confirmedAt, confirmedByUserId: userId });
  return id;
}

function u64(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 0n; i < 8n; i += 1n) out.push(Number((value >> (8n * i)) & 0xffn));
  return out;
}

const base58 = (bytes: number[] | Uint8Array) => getBase58Decoder().decode(new Uint8Array(bytes));

// FIXTURE: a 64-byte transaction signature in base58, distinct per fill byte.
export const fixtureSignature = (fill: number) => base58(new Uint8Array(64).fill(fill));

type LandedOptions = { reference?: string; amount?: bigint; err?: unknown; extraOuter?: { program: Address; data: number[] }[]; slot?: number };

// FIXTURE: the getTransaction JSON (encoding "json", maxSupportedTransactionVersion 0) of a landed
// transfer for an attempt, shaped as Phantom lands one: Envoi's memo and TransferChecked, with a
// successful result and complete metadata unless an option changes one thing.
export function landedTransactionJson(attempt: Pick<PyusdAttempt, "buyerWallet" | "sourceTokenAccount" | "destinationTokenAccount" | "atomicAmount" | "reference" | "blockhash">, signature: string, options: LandedOptions = {}): unknown {
  const extra = options.extraOuter ?? [];
  const keys: string[] = [attempt.buyerWallet, attempt.sourceTokenAccount, attempt.destinationTokenAccount, PYUSD_DEVNET.mint, PYUSD_DEVNET.memoProgram, PYUSD_DEVNET.tokenProgram, ...extra.map((ix) => ix.program)];
  const amount = options.amount ?? attempt.atomicAmount;
  return {
    slot: options.slot ?? 300_000_040,
    version: 0,
    blockTime: 1_793_000_000,
    transaction: {
      signatures: [signature],
      message: {
        header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 3 + extra.length },
        accountKeys: keys,
        recentBlockhash: attempt.blockhash,
        instructions: [
          { programIdIndex: 4, accounts: [], data: base58(new TextEncoder().encode(options.reference ?? attempt.reference)), stackHeight: null },
          { programIdIndex: 5, accounts: [1, 3, 2, 0], data: base58([12, ...u64(amount), 6]), stackHeight: null },
          ...extra.map((ix, index) => ({ programIdIndex: 6 + index, accounts: [], data: base58(ix.data), stackHeight: null })),
        ],
        addressTableLookups: [],
      },
    },
    meta: {
      err: options.err ?? null,
      fee: 5000,
      innerInstructions: [],
      loadedAddresses: { writable: [], readonly: [] },
      preTokenBalances: [{ accountIndex: 2, mint: PYUSD_DEVNET.mint, owner: fixtureKey(77), programId: PYUSD_DEVNET.tokenProgram, uiTokenAmount: { amount: "0", decimals: 6 } }],
      postTokenBalances: [{ accountIndex: 2, mint: PYUSD_DEVNET.mint, owner: fixtureKey(77), programId: PYUSD_DEVNET.tokenProgram, uiTokenAmount: { amount: (options.err ? 0n : amount).toString(), decimals: 6 } }],
    },
  };
}

// The number of calls the fake chain answered for one RPC method.
export const callsOf = (chain: FakeChain, method: string) => chain.calls.filter((call) => call.method === method).length;
