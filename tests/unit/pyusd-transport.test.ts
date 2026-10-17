import { getCompiledTransactionMessageDecoder, getTransactionDecoder, getBase64Encoder } from "@solana/kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import { buildUnsignedTransfer } from "@/integrations/solana/build";
import { createSolanaReadClient, type RpcFetch } from "@/integrations/solana/rpc";
import { FIXTURE_RPC_URL, fixtureKey, unlimitedLimiter } from "../support/fake-solana";

// S16, Gate 3 group "bounded RPC transport" (4 cases), createSolanaReadClient over a FIXTURE
// transport, and the standalone "prepared transaction is exactly a memo and one TransferChecked".
// No database and no network.

type Sent = { method: string; params: unknown[] };

function recordingFetch(answer: (sent: Sent) => unknown): { fetch: RpcFetch; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body) as Sent;
      sent.push(request);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: answer(request) }), { status: 200 });
    },
  };
}

const commitmentOf = (sent: Sent) => (sent.params.find((param) => typeof param === "object" && param !== null && "commitment" in param) as { commitment: string } | undefined)?.commitment;

afterEach(() => {
  vi.useRealTimers();
});

describe("bounded RPC transport", () => {
  it("preparation uses a confirmed blockhash", async () => {
    const transport = recordingFetch(() => ({ context: { slot: 1 }, value: { blockhash: fixtureKey(42), lastValidBlockHeight: 150 } }));
    const client = createSolanaReadClient({ rpcUrl: FIXTURE_RPC_URL, fetch: transport.fetch }, unlimitedLimiter);
    expect(await client.getLatestBlockhashConfirmed()).toEqual({ kind: "ok", value: { blockhash: fixtureKey(42), lastValidBlockHeight: 150n, slot: 1n } });
    expect(transport.sent.map((sent) => [sent.method, commitmentOf(sent)])).toEqual([["getLatestBlockhash", "confirmed"]]);
  });

  it("verification reads at finalized commitment", async () => {
    const transport = recordingFetch((sent) => (sent.method === "getTransaction" ? null : []));
    const client = createSolanaReadClient({ rpcUrl: FIXTURE_RPC_URL, fetch: transport.fetch }, unlimitedLimiter);
    expect(await client.getTransactionFinalized("FXTRsig")).toEqual({ kind: "ok", value: null });
    expect(await client.getSignaturesFinalized(fixtureKey(3), null, 1000)).toEqual({ kind: "ok", value: [] });
    expect(transport.sent.map((sent) => [sent.method, commitmentOf(sent)])).toEqual([
      ["getTransaction", "finalized"],
      ["getSignaturesForAddress", "finalized"],
    ]);
  });

  it("oversized RPC response is refused", async () => {
    // FIXTURE: a well-formed answer just over 1 MiB.
    const huge = "1".repeat(1_048_577);
    const fetch: RpcFetch = async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: huge }), { status: 200 });
    const client = createSolanaReadClient({ rpcUrl: FIXTURE_RPC_URL, fetch }, unlimitedLimiter);
    expect(await client.getGenesisHash()).toEqual({ kind: "too_large" });
  });

  it("RPC call stops at its timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // FIXTURE: an RPC that never answers until the request is aborted.
    const fetch: RpcFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    const client = createSolanaReadClient({ rpcUrl: FIXTURE_RPC_URL, fetch }, unlimitedLimiter);
    let result: unknown = "pending";
    const call = client.getGenesisHash().then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(result).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({ kind: "unavailable" });
    await call;
  });
});

describe("prepared transaction", () => {
  it("prepared transaction is exactly a memo and one TransferChecked", () => {
    const buyer = fixtureKey(1);
    const source = fixtureKey(2);
    const destination = fixtureKey(3);
    const built = buildUnsignedTransfer({ buyerWallet: buyer, source, destination, atomicAmount: 2_597_403n, reference: "FXTRref7Jq2kVwH8ZpYbQm3s", blockhash: { blockhash: fixtureKey(42), lastValidBlockHeight: 150n } });
    const transaction = getTransactionDecoder().decode(new Uint8Array(getBase64Encoder().encode(built.wireBase64)));
    // One empty signature slot: the buyer signs in the wallet, never Envoi.
    expect(Object.entries(transaction.signatures)).toEqual([[buyer, null]]);
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    expect(message.version).toBe(0);
    if (message.version !== 0) throw new Error("not a version 0 message");
    expect(message.addressTableLookups ?? []).toEqual([]);
    expect(message.staticAccounts[0]).toBe(buyer);
    expect(message.header).toEqual({ numSignerAccounts: 1, numReadonlySignerAccounts: 0, numReadonlyNonSignerAccounts: 3 });
    expect(message.lifetimeToken).toBe(fixtureKey(42));
    const key = (index: number | undefined) => message.staticAccounts[index ?? -1];
    expect(message.instructions.map((ix) => key(ix.programAddressIndex))).toEqual([PYUSD_DEVNET.memoProgram, PYUSD_DEVNET.tokenProgram]);
    const [memo, transfer] = message.instructions;
    expect(new TextDecoder().decode(memo!.data)).toBe("FXTRref7Jq2kVwH8ZpYbQm3s");
    expect(memo!.accountIndices ?? []).toEqual([]);
    expect([...(transfer!.data ?? [])]).toEqual([12, 0x1b, 0xa2, 0x27, 0, 0, 0, 0, 0, 6]);
    expect((transfer!.accountIndices ?? []).map(key)).toEqual([source, PYUSD_DEVNET.mint, destination, buyer]);
    expect(built.messageFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
