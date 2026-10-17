import { generateKeyPair, getAddressFromPublicKey, getBase58Decoder, getBase64Decoder, signBytes, type Address } from "@solana/kit";
import { AccountState, getMintEncoder, getTokenEncoder, type ExtensionArgs } from "@solana-program/token-2022";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import { associatedPyusdAccount } from "@/domain/pyusd/identity";
import type { RpcLimiter } from "@/integrations/solana/limiter";
import { createSolanaReadClient, type RpcFetch, type SolanaReadClient } from "@/integrations/solana/rpc";

// FIXTURE: a fake Solana devnet JSON-RPC endpoint, faked at the bounded transport (the fetch the read
// client calls), as the slice rules require. Every account, blockhash and landed transaction here is
// synthetic test data built with the real Token-2022 codecs; none is a real devnet read or payment.

export const FIXTURE_RPC_URL = "https://fixture-devnet-rpc.invalid/";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const ORIGINAL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAX8ifEPRhCxumGVLYBa6y1b3jv" as Address;
const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
// FIXTURE 32-byte values, base58-encoded: never real keys or blockhashes.
export const fixtureKey = (fill: number) => getBase58Decoder().decode(new Uint8Array(32).fill(fill)) as Address;
const FEE_AUTHORITY = fixtureKey(9);

export type FixtureAccount = { owner: Address; data: Uint8Array; executable?: boolean };

export type FakeChain = {
  genesis: string;
  accounts: Map<string, FixtureAccount>;
  epoch: bigint;
  slot: bigint;
  blockHeight: bigint;
  blockhash: { blockhash: string; lastValidBlockHeight: bigint };
  // getTransaction answers by signature: JSON, null (not found) or absent (null too).
  transactions: Map<string, unknown>;
  calls: { method: string; params: unknown[] }[];
  // When set, every call answers this way instead.
  outage: "unreachable" | null;
};

export const zeroFee = (epoch: bigint) => ({ epoch, maximumFee: 0n, transferFeeBasisPoints: 0 });

// The eight extensions observed on the devnet mint on 2026-10-10, with zero fees and no hook program.
export function reviewedExtensions(overrides: { older?: ReturnType<typeof zeroFee>; newer?: ReturnType<typeof zeroFee>; hookProgram?: Address; extra?: ExtensionArgs[] } = {}): ExtensionArgs[] {
  return [
    { __kind: "MintCloseAuthority", closeAuthority: FEE_AUTHORITY },
    { __kind: "PermanentDelegate", delegate: FEE_AUTHORITY },
    {
      __kind: "TransferFeeConfig",
      transferFeeConfigAuthority: FEE_AUTHORITY,
      withdrawWithheldAuthority: FEE_AUTHORITY,
      withheldAmount: 0n,
      olderTransferFee: overrides.older ?? zeroFee(0n),
      newerTransferFee: overrides.newer ?? zeroFee(0n),
    },
    { __kind: "TransferHook", authority: FEE_AUTHORITY, programId: overrides.hookProgram ?? SYSTEM_PROGRAM },
    { __kind: "MetadataPointer", authority: FEE_AUTHORITY, metadataAddress: PYUSD_DEVNET.mint },
    ...(overrides.extra ?? []),
  ];
}

export function mintData(input: { decimals?: number; extensions?: ExtensionArgs[] } = {}): Uint8Array {
  return new Uint8Array(
    getMintEncoder().encode({
      mintAuthority: FEE_AUTHORITY,
      supply: 1_000_000_000_000n,
      decimals: input.decimals ?? PYUSD_DEVNET.decimals,
      isInitialized: true,
      freezeAuthority: FEE_AUTHORITY,
      extensions: input.extensions ?? reviewedExtensions(),
    }),
  );
}

export function tokenAccountData(input: { owner: Address; amount: bigint; frozen?: boolean; mint?: Address }): Uint8Array {
  return new Uint8Array(
    getTokenEncoder().encode({
      mint: input.mint ?? PYUSD_DEVNET.mint,
      owner: input.owner,
      amount: input.amount,
      delegate: null,
      state: input.frozen ? AccountState.Frozen : AccountState.Initialized,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
      extensions: [{ __kind: "ImmutableOwner" }],
    }),
  );
}

export function createFakeChain(): FakeChain {
  const chain: FakeChain = {
    genesis: PYUSD_DEVNET.genesisHash,
    accounts: new Map(),
    epoch: 700n,
    slot: 300_000_000n,
    blockHeight: 280_000_000n,
    blockhash: { blockhash: fixtureKey(42), lastValidBlockHeight: 280_000_150n },
    transactions: new Map(),
    calls: [],
    outage: null,
  };
  chain.accounts.set(PYUSD_DEVNET.mint, { owner: PYUSD_DEVNET.tokenProgram, data: mintData() });
  return chain;
}

export const setMintOwnedByOriginalProgram = (chain: FakeChain) => chain.accounts.set(PYUSD_DEVNET.mint, { owner: ORIGINAL_TOKEN_PROGRAM, data: mintData() });

// Gives a wallet a PYUSD associated account holding amount, and returns the account address.
export async function fundWallet(chain: FakeChain, owner: Address, amount: bigint, options: { frozen?: boolean; programOwner?: Address } = {}): Promise<Address> {
  const address = await associatedPyusdAccount(owner);
  chain.accounts.set(address, { owner: options.programOwner ?? PYUSD_DEVNET.tokenProgram, data: tokenAccountData({ owner, amount, frozen: options.frozen }) });
  return address;
}

const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200, headers: { "content-type": "application/json" } });

export function fakeRpcFetch(chain: FakeChain): RpcFetch {
  return async (_url, init) => {
    const { method, params } = JSON.parse(init.body) as { method: string; params: unknown[] };
    chain.calls.push({ method, params });
    if (chain.outage === "unreachable") throw new TypeError("fetch failed (FIXTURE outage)");
    switch (method) {
      case "getGenesisHash":
        return ok(chain.genesis);
      case "getMultipleAccounts": {
        const addresses = params[0] as string[];
        return ok({
          context: { slot: Number(chain.slot) },
          value: addresses.map((address) => {
            const account = chain.accounts.get(address);
            return account
              ? { data: [getBase64Decoder().decode(account.data), "base64"], owner: account.owner, lamports: 2_039_280, executable: account.executable ?? false, space: account.data.length }
              : null;
          }),
        });
      }
      case "getEpochInfo":
        return ok({ epoch: Number(chain.epoch), absoluteSlot: Number(chain.slot), blockHeight: Number(chain.blockHeight), slotIndex: 1, slotsInEpoch: 432_000 });
      case "getLatestBlockhash":
        return ok({ context: { slot: Number(chain.slot) }, value: { blockhash: chain.blockhash.blockhash, lastValidBlockHeight: Number(chain.blockhash.lastValidBlockHeight) } });
      case "getBlockHeight":
        return ok(Number(chain.blockHeight));
      case "getEpochSchedule":
        return ok({ slotsPerEpoch: 432_000, leaderScheduleSlotOffset: 432_000, warmup: false, firstNormalEpoch: 0, firstNormalSlot: 0 });
      case "getTransaction":
        return ok(chain.transactions.get(params[0] as string) ?? null);
      case "getSignaturesForAddress":
        return ok([]);
      default:
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }), { status: 200 });
    }
  };
}

// FIXTURE: admits every call. Route tests use it so the shared budget never decides an unrelated case;
// the real database limiter has its own group.
export const unlimitedLimiter: RpcLimiter = {
  acquire: async () => ({ ok: true, release: async () => {} }),
  reportRateLimited: async () => {},
};

export function fakeSolanaClient(chain: FakeChain, limiter: RpcLimiter = unlimitedLimiter): SolanaReadClient {
  return createSolanaReadClient({ rpcUrl: FIXTURE_RPC_URL, fetch: fakeRpcFetch(chain) }, limiter);
}

export type TestWallet = { address: Address; sign: (bytes: Uint8Array) => Promise<Uint8Array>; signBase58: (bytes: Uint8Array) => Promise<string> };

// A fresh Ed25519 key pair made in this process for one test; never a real wallet.
export async function testWallet(): Promise<TestWallet> {
  const keys = await generateKeyPair();
  const address = await getAddressFromPublicKey(keys.publicKey);
  const sign = async (bytes: Uint8Array) => new Uint8Array(await signBytes(keys.privateKey, bytes));
  return { address, sign, signBase58: async (bytes) => getBase58Decoder().decode(await sign(bytes)) };
}
