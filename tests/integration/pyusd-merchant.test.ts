import { getBase64Encoder, type Address } from "@solana/kit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { associatedPyusdAccount } from "@/domain/pyusd/identity";
import { approveMembership } from "@/operator/cli";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakeChain, fakeRpcFetch, fundWallet, MAINNET_GENESIS, testWallet, type FakeChain, type TestWallet } from "../support/fake-solana";
import { jsonRequest } from "../support/merchant";
import { routeParams } from "../support/payments";
import { envelope, loadMerchantRoutes, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { FOREIGN_ORIGIN, type PyusdTestState } from "../support/pyusd";
import { webEnvFor } from "../support/session";

const state = vi.hoisted((): PyusdTestState => ({ env: {}, fetch: null }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});
vi.mock("@/integrations/solana/rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/solana/rpc")>();
  const unlimited = { acquire: async () => ({ ok: true as const, release: async () => {} }), reportRateLimited: async () => {} };
  return { ...actual, webSolanaClient: () => (state.fetch ? actual.createSolanaReadClient({ rpcUrl: "https://fixture-devnet-rpc.invalid/", fetch: state.fetch }, unlimited) : null) };
});

// S16, Gate 3 group "merchant PYUSD routes" (17 cases) and the standalone tests "wallet proof verifies
// the saved challenge bytes", "wallet challenge is single-use" and "a PYUSD-only shop cannot publish
// while PYUSD is disabled". The real challenge, proof and rate route handlers as envoi_web over a
// FIXTURE devnet RPC faked at the bounded transport; wallets are key pairs made in this process.
// Every row except its own runs with the rail enabled, a same-origin request and the pinned devnet
// identity. Each case uses its own shop, so committed rows never cross cases.

type Routes = MerchantRoutes & {
  challenge: typeof import("@/app/api/v1/merchant/outlets/[id]/destinations/pyusd/challenge/route");
  proof: typeof import("@/app/api/v1/merchant/outlets/[id]/destinations/pyusd/route");
  rate: typeof import("@/app/api/v1/merchant/outlets/[id]/pyusd-rate/route");
};

type Challenge = { challengeId: string; message: string; messageBase64: string; expiresAt: string };

describe("PYUSD merchant routes", () => {
  let database: TestDatabase;
  let routes: Routes;
  let api: ReturnType<typeof shopApi>;
  let chain: FakeChain;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdmerchant");
    Object.assign(process.env, webEnvFor(database.webUrl));
    const merchant = await loadMerchantRoutes();
    routes = {
      ...merchant,
      challenge: await import("@/app/api/v1/merchant/outlets/[id]/destinations/pyusd/challenge/route"),
      proof: await import("@/app/api/v1/merchant/outlets/[id]/destinations/pyusd/route"),
      rate: await import("@/app/api/v1/merchant/outlets/[id]/pyusd-rate/route"),
    };
    api = shopApi(database, merchant);
  });

  beforeEach(() => {
    chain = createFakeChain();
    state.env = { PYUSD_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await database?.drop();
  });

  const path = (shop: Shop, suffix: string) => `/api/v1/merchant/outlets/${shop.outletId}${suffix}`;
  const requestChallenge = (shop: Shop, wallet: Address, headers: Record<string, string> = {}) =>
    routes.challenge.POST(jsonRequest("POST", path(shop, "/destinations/pyusd/challenge"), shop.cookie, { walletAddress: wallet }, headers), routeParams(shop.outletId));
  const submitProof = (shop: Shop, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    routes.proof.PUT(jsonRequest("PUT", path(shop, "/destinations/pyusd"), shop.cookie, body, headers), routeParams(shop.outletId));
  const putRate = (shop: Shop, pyusdPerSgd: string, headers: Record<string, string> = {}) =>
    routes.rate.PUT(jsonRequest("PUT", path(shop, "/pyusd-rate"), shop.cookie, { pyusdPerSgd }, headers), routeParams(shop.outletId));

  async function issued(shop: Shop, wallet: TestWallet): Promise<Challenge> {
    const response = await requestChallenge(shop, wallet.address);
    expect(response.status).toBe(201);
    return (await envelope<Challenge>(response)).data;
  }

  const challengeBytes = (challenge: Challenge) => new Uint8Array(getBase64Encoder().encode(challenge.messageBase64));
  const signed = async (challenge: Challenge, wallet: TestWallet) => ({ challengeId: challenge.challengeId, signature: await wallet.signBase58(challengeBytes(challenge)) });

  const challengeCount = async (shop: Shop) => Number((await database.admin`select count(*)::int as n from wallet_challenges where outlet_id = ${shop.outletId}`)[0]!.n);
  const pyusdDestinations = (shop: Shop) =>
    database.admin<{ walletAddress: string; tokenAccount: string; version: number }[]>`
      select wallet_address as "walletAddress", token_account as "tokenAccount", version from payment_destinations where outlet_id = ${shop.outletId} and rail = 'pyusd'`;
  const rateCount = async (shop: Shop) => Number((await database.admin`select count(*)::int as n from pyusd_rates where outlet_id = ${shop.outletId}`)[0]!.n);

  // A merchant wallet with a PYUSD associated account on the fixture chain.
  async function merchantWallet(): Promise<TestWallet> {
    const wallet = await testWallet();
    await fundWallet(chain, wallet.address, 0n);
    return wallet;
  }

  describe("merchant PYUSD routes", () => {
    it("wallet challenge refuses while the rail is disabled", async () => {
      const shop = await api.newShop("chal-off");
      state.env = { PYUSD_ENABLED: false };
      const response = await requestChallenge(shop, (await merchantWallet()).address);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "rail_disabled" } } });
      expect(await challengeCount(shop)).toBe(0);
    });

    it("wallet proof refuses while the rail is disabled", async () => {
      const shop = await api.newShop("proof-off");
      const wallet = await merchantWallet();
      const proof = await signed(await issued(shop, wallet), wallet);
      state.env = { PYUSD_ENABLED: false };
      const response = await submitProof(shop, proof);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "rail_disabled" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("rate change refuses while the rail is disabled", async () => {
      const shop = await api.newShop("rate-off");
      state.env = { PYUSD_ENABLED: false };
      const response = await putRate(shop, "0.742115");
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "rail_disabled" } } });
      expect(await rateCount(shop)).toBe(0);
    });

    it("wallet challenge rejects a foreign Origin", async () => {
      const shop = await api.newShop("chal-origin");
      const response = await requestChallenge(shop, (await merchantWallet()).address, { origin: FOREIGN_ORIGIN });
      expect(response.status).toBe(403);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "forbidden_origin" } });
      expect(await challengeCount(shop)).toBe(0);
    });

    it("wallet proof rejects a foreign Origin", async () => {
      const shop = await api.newShop("proof-origin");
      const wallet = await merchantWallet();
      const response = await submitProof(shop, await signed(await issued(shop, wallet), wallet), { origin: FOREIGN_ORIGIN });
      expect(response.status).toBe(403);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "forbidden_origin" } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("rate change rejects a foreign Origin", async () => {
      const shop = await api.newShop("rate-origin");
      const response = await putRate(shop, "0.742115", { origin: FOREIGN_ORIGIN });
      expect(response.status).toBe(403);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "forbidden_origin" } });
      expect(await rateCount(shop)).toBe(0);
    });

    it("wallet proof refuses on an identity mismatch", async () => {
      const shop = await api.newShop("proof-genesis");
      const wallet = await merchantWallet();
      const proof = await signed(await issued(shop, wallet), wallet);
      chain.genesis = MAINNET_GENESIS;
      const response = await submitProof(shop, proof);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "genesis_mismatch" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("wallet challenge names Envoi's configured domain and devnet", async () => {
      const shop = await api.newShop("chal-host");
      const response = await requestChallenge(shop, (await merchantWallet()).address, { host: "attacker.example", "x-forwarded-host": "attacker.example" });
      const { message } = (await envelope<Challenge>(response)).data;
      expect(message.split("\n")[0]).toBe("localhost:3000 wants you to sign in with your Solana account:");
      expect(message).toContain("\nURI: http://localhost:3000\n");
      expect(message).toContain("\nChain ID: devnet\n");
      expect(message).not.toContain("attacker.example");
    });

    it("wallet challenges are rate limited per outlet", async () => {
      const shop = await api.newShop("chal-limit");
      const wallet = await merchantWallet();
      for (let n = 0; n < 10; n += 1) expect((await requestChallenge(shop, wallet.address)).status).toBe(201);
      const eleventh = await requestChallenge(shop, wallet.address);
      expect(await envelope(eleventh)).toMatchObject({ ok: false, error: { code: "rate_limited" } });
      expect(await challengeCount(shop)).toBe(10);
    });

    it("invalid wallet signature is refused", async () => {
      const shop = await api.newShop("proof-badsig");
      const wallet = await merchantWallet();
      const challenge = await issued(shop, wallet);
      const impostor = await testWallet();
      const response = await submitProof(shop, { challengeId: challenge.challengeId, signature: await impostor.signBase58(challengeBytes(challenge)) });
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "signature_invalid" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("wallet challenge expires after five minutes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const issuedAt = new Date("2026-10-27T03:00:00.000Z");
      vi.setSystemTime(issuedAt);
      const shop = await api.newShop("proof-expired");
      const wallet = await merchantWallet();
      const proof = await signed(await issued(shop, wallet), wallet);
      vi.setSystemTime(new Date(issuedAt.getTime() + 5 * 60_000));
      const response = await submitProof(shop, proof);
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "challenge_expired" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("wallet challenge for another outlet is refused", async () => {
      const shopA = await api.newShop("proof-outlet-a");
      // The same member gets a second approved membership and opens outlet B.
      await approveMembership(drizzle(database.admin, { schema }), { email: shopA.merchant.email, evidenceRef: "FIXTURE: test run" });
      const created = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", shopA.cookie, { name: "FIXTURE outlet B kopi", area: "Tiong Bahru" }));
      expect(created.status).toBe(201);
      const shopB: Shop = { ...shopA, outletId: (await envelope<{ outlet: { id: string } }>(created)).data.outlet.id };
      const wallet = await merchantWallet();
      const response = await submitProof(shopB, await signed(await issued(shopA, wallet), wallet));
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "challenge_other_outlet" } } });
      expect(await pyusdDestinations(shopA)).toEqual([]);
      expect(await pyusdDestinations(shopB)).toEqual([]);
    });

    it("merchant token account is derived, never supplied", async () => {
      const shop = await api.newShop("proof-derived");
      const wallet = await merchantWallet();
      const derived = await associatedPyusdAccount(wallet.address);
      // A real Token-2022 PYUSD account of another wallet, offered in the body.
      const offered = await fundWallet(chain, (await testWallet()).address, 0n);
      const proof = await signed(await issued(shop, wallet), wallet);
      const response = await submitProof(shop, { ...proof, tokenAccount: offered, walletAddress: (await testWallet()).address });
      expect(response.status).toBe(200);
      expect(await pyusdDestinations(shop)).toEqual([{ walletAddress: wallet.address, tokenAccount: derived, version: 1 }]);
      const checked = chain.calls.filter((call) => call.method === "getMultipleAccounts").flatMap((call) => call.params[0] as string[]);
      expect(checked).toContain(derived);
      expect(checked).not.toContain(offered);
    });

    it("missing merchant token account is refused", async () => {
      const shop = await api.newShop("proof-missing");
      const wallet = await testWallet();
      const response = await submitProof(shop, await signed(await issued(shop, wallet), wallet));
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "token_account_missing" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("merchant token account under another program is refused", async () => {
      const shop = await api.newShop("proof-program");
      const wallet = await testWallet();
      await fundWallet(chain, wallet.address, 0n, { programOwner: "11111111111111111111111111111111" as Address });
      const response = await submitProof(shop, await signed(await issued(shop, wallet), wallet));
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "token_account_not_token_2022" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("frozen merchant token account is refused", async () => {
      const shop = await api.newShop("proof-frozen");
      const wallet = await testWallet();
      await fundWallet(chain, wallet.address, 0n, { frozen: true });
      const response = await submitProof(shop, await signed(await issued(shop, wallet), wallet));
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "token_account_frozen" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("wallet proof creates no membership or enrollment", async () => {
      const shop = await api.newShop("proof-nogrant");
      const memberships = () =>
        database.admin`select id, outlet_id, approved_at, revoked_at from merchant_memberships where user_id = ${shop.merchant.userId} order by id`;
      const enrollments = () => database.admin`select id, status, approved_at from enrollments where outlet_id = ${shop.outletId} order by id`;
      const before = { memberships: [...(await memberships())], enrollments: [...(await enrollments())] };
      const wallet = await merchantWallet();
      expect((await submitProof(shop, await signed(await issued(shop, wallet), wallet))).status).toBe(200);
      expect(await pyusdDestinations(shop)).toHaveLength(1);
      expect({ memberships: [...(await memberships())], enrollments: [...(await enrollments())] }).toEqual(before);
    });
  });

  describe("PYUSD wallet proof standalone tests", () => {
    it("wallet proof verifies the saved challenge bytes", async () => {
      const shop = await api.newShop("proof-bytes");
      const wallet = await merchantWallet();
      const challenge = await issued(shop, wallet);
      // The wallet signs a message that differs from the saved one, and the request carries that text.
      const altered = challenge.message.replace("moves no tokens", "moves any tokens");
      expect(altered).not.toBe(challenge.message);
      const signature = await wallet.signBase58(new TextEncoder().encode(altered));
      const response = await submitProof(shop, { challengeId: challenge.challengeId, signature, message: altered });
      expect(await envelope(response)).toMatchObject({ ok: false, error: { code: "wallet_proof_rejected", details: { reason: "signature_invalid" } } });
      expect(await pyusdDestinations(shop)).toEqual([]);
    });

    it("wallet challenge is single-use", async () => {
      const shop = await api.newShop("proof-once");
      const wallet = await merchantWallet();
      const challenge = await issued(shop, wallet);
      const proof = await signed(challenge, wallet);
      // Barrier: a superuser transaction holds the challenge row, so both proofs pass their reads and
      // chain checks and then wait at the consuming compare-and-set on two committed connections.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let holding!: () => void;
      const held = new Promise<void>((resolve) => (holding = resolve));
      const barrier = database.admin.begin(async (sql) => {
        await sql`select id from wallet_challenges where id = ${challenge.challengeId} for update`;
        holding();
        await released;
      });
      await held;
      const proofs = Promise.all([submitProof(shop, proof), submitProof(shop, proof)]);
      // Both proofs are blocked on the row lock before the barrier lets go.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [waiting] = await database.admin<{ n: number }[]>`
          select count(*)::int as n from pg_stat_activity where datname = ${database.name} and wait_event_type = 'Lock' and query ilike '%wallet_challenges%'`;
        if (waiting!.n >= 2) break;
        if (Date.now() > deadline) throw new Error("the two proofs never reached the consuming update");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      release();
      await barrier;
      const answers = await Promise.all((await proofs).map((response) => envelope(response)));
      expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
      expect(answers.filter((answer) => !answer.ok)).toMatchObject([{ error: { code: "wallet_proof_rejected", details: { reason: "challenge_used" } } }]);
      expect(await pyusdDestinations(shop)).toEqual([{ walletAddress: wallet.address, tokenAccount: await associatedPyusdAccount(wallet.address), version: 1 }]);
    });

    // Not a Gate 3 named test: the 500 two concurrent first proofs used to answer.
    it("two concurrent first proofs from two challenges both record a destination", async () => {
      const shop = await api.newShop("proof-race");
      const [first, second] = [await merchantWallet(), await merchantWallet()];
      const proofs = [await signed(await issued(shop, first), first), await signed(await issued(shop, second), second)];
      // Barrier: a superuser transaction holds an uncommitted PYUSD destination for the outlet, so both
      // proofs find no row and both wait on its unique key at their inserts; it then rolls back.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let holding!: () => void;
      const held = new Promise<void>((resolve) => (holding = resolve));
      const barrier = database.admin
        .begin(async (sql) => {
          await sql`
            insert into payment_destinations (id, outlet_id, rail, environment, status, version, wallet_address, token_account, key_verified_at, key_verified_by_user_id, created_at)
            values ('dst_fixture_barrier', ${shop.outletId}, 'pyusd', 'devnet', 'active', 1, ${first.address}, ${await associatedPyusdAccount(first.address)}, now(), ${shop.merchant.userId}, now())`;
          holding();
          await released;
          throw new Error("FIXTURE: roll the barrier back");
        })
        .catch(() => undefined);
      await held;
      // A handler that throws is what Next.js answers with a 500, so a throw is counted as one.
      const responses = Promise.all(proofs.map((proof) => submitProof(shop, proof).catch(() => Response.json({ ok: false, error: { code: "internal" } }, { status: 500 }))));
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [waiting] = await database.admin<{ n: number }[]>`
          select count(*)::int as n from pg_stat_activity where datname = ${database.name} and wait_event_type = 'Lock' and query ilike '%insert into payment_destinations%'`;
        if (waiting!.n >= 2) break;
        if (Date.now() > deadline) throw new Error("the two proofs never reached the destination insert");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      release();
      await barrier;
      const settled = await responses;
      expect(settled.map((response) => response.status)).toEqual([200, 200]);
      const answers = await Promise.all(settled.map((response) => envelope(response)));
      expect(answers.map((answer) => answer.ok)).toEqual([true, true]);
      const rows = await pyusdDestinations(shop);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.version).toBe(2);
      expect([first.address, second.address]).toContain(rows[0]!.walletAddress);
    });

    it("a PYUSD-only shop cannot publish while PYUSD is disabled", async () => {
      // Every precondition but the PayPal connection, which this shop never has.
      const shop = await api.newShop("pyusd-only");
      const draft = await api.confirmDraft(shop, await api.saveDraft(shop, await api.getDraft(shop), [{ name: "FIXTURE Kopi", priceMinor: 180 }]));
      await api.confirmDetails(shop);
      await api.approve(shop);
      const wallet = await merchantWallet();
      expect((await submitProof(shop, await signed(await issued(shop, wallet), wallet))).status).toBe(200);

      state.env = { PYUSD_ENABLED: false };
      const refused = await api.publish(shop, draft);
      expect(await envelope(refused)).toMatchObject({ ok: false, error: { code: "validation_failed", details: { reason: "preconditions", missing: "destination" } } });
      const [outlet] = await database.admin<{ published: string | null }[]>`select published_menu_revision_id as published from outlets where id = ${shop.outletId}`;
      expect(outlet!.published).toBeNull();

      // Fixture self-check: the same shop publishes once the rail is on, so only the flag refused it.
      state.env = { PYUSD_ENABLED: true };
      expect((await api.publish(shop, draft)).status).toBe(200);
    });
  });
});
