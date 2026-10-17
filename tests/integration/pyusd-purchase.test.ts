import type { Address } from "@solana/kit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { preparePyusdPayment } from "@/domain/pyusd/attempts";
import { associatedPyusdAccount } from "@/domain/pyusd/identity";
import { pyusdAtomicFor } from "@/domain/pyusd/rate";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession, type BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import { sgdFromCents } from "@/lib/money";
import { durationMs } from "@/lib/time";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakeChain, fakeRpcFetch, fundWallet, MAINNET_GENESIS, mintData, reviewedExtensions, testWallet, type FakeChain, type TestWallet } from "../support/fake-solana";
import { jsonPost, routeParams } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi } from "../support/publication";
import { callsOf, FOREIGN_ORIGIN, fixtureSignature, landedTransactionJson, seedPyusdDestination, seedPyusdRate, type PyusdTestState } from "../support/pyusd";
import { anonymousCookie, TEST_BASE_URL, webEnvFor } from "../support/session";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";

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

// S16, the buyer side of the PYUSD rail against the real schema as envoi_web, over a FIXTURE devnet
// RPC faked at the bounded transport: Gate 3 groups "PYUSD pricing" (2 cases), "PYUSD preparation"
// (15), "PYUSD attempt constraints" (2) and "signature hints and reconcile before expiry" (8), and the
// standalone tests "rate change never alters a prepared attempt" and "cancel after PYUSD preparation
// reports checking". Wallets are key pairs made in this process, every landed transaction is
// synthetic, and the fake chain's finalized block height stays below every attempt's bound. Each
// case uses its own published FIXTURE shop, so committed rows never cross cases.

const RATE = 742_115n; // illustrative: 0.742115 PYUSD per S$1
const T0 = new Date("2026-10-27T03:00:00.000Z");

type Routes = {
  auth: typeof import("@/app/api/auth/[...all]/route");
  purchases: typeof import("@/app/api/v1/purchases/route");
  prepare: typeof import("@/app/api/v1/purchases/[id]/pyusd/prepare/route");
  submitted: typeof import("@/app/api/v1/purchases/[id]/pyusd/submitted/route");
  reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
  cancel: typeof import("@/app/api/v1/purchases/[id]/cancel/route");
  rate: typeof import("@/app/api/v1/merchant/outlets/[id]/pyusd-rate/route");
};

type PyusdShop = { outletId: string; itemId: string; unitSgdCents: number; merchant: TestWallet; tokenAccount: Address; rateVersionId: string; memberUserId: string; memberCookie: string };
type Review = { cookie: string; purchaseId: string; buyer: TestWallet; amount: bigint };
type AttemptRow = {
  id: string;
  state: string;
  buyerWallet: Address;
  sourceTokenAccount: Address;
  destinationTokenAccount: Address;
  atomicAmount: bigint;
  reference: string;
  blockhash: string;
  hints: { signature: string; decision: string }[];
};

describe("PYUSD purchase", () => {
  let database: TestDatabase;
  let routes: Routes;
  let api: ReturnType<typeof shopApi>;
  let chain: FakeChain;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdpurchase");
    Object.assign(process.env, webEnvFor(database.webUrl));
    api = shopApi(database, await loadMerchantRoutes());
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      prepare: await import("@/app/api/v1/purchases/[id]/pyusd/prepare/route"),
      submitted: await import("@/app/api/v1/purchases/[id]/pyusd/submitted/route"),
      reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
      cancel: await import("@/app/api/v1/purchases/[id]/cancel/route"),
      rate: await import("@/app/api/v1/merchant/outlets/[id]/pyusd-rate/route"),
    };
  });

  beforeEach(() => {
    chain = createFakeChain();
    state.env = { PYUSD_ENABLED: true, PAYMENTS_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await database?.drop();
  });

  // Freezes the wall clock at `at` for the code under test; timers keep running.
  const freeze = (at: Date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  };

  // A published FIXTURE shop with a verified PYUSD devnet wallet whose associated account exists on
  // the fake chain, and a rate confirmed at rateAt.
  async function pyusdShop(label: string, rateAt: Date = new Date()): Promise<PyusdShop> {
    const { shop } = await api.publishedShop(label);
    const [item] = await publishedItems(database, shop.outletId);
    const merchant = await testWallet();
    const tokenAccount = await fundWallet(chain, merchant.address, 0n);
    const { rateVersionId } = await seedPyusdDestination(database, shop.outletId, { wallet: merchant.address, tokenAccount, atomicPerSgd: RATE, confirmedAt: rateAt });
    return { outletId: shop.outletId, itemId: item!.id, unitSgdCents: item!.unitSgdCents, merchant, tokenAccount, rateVersionId, memberUserId: shop.merchant.userId, memberCookie: shop.cookie };
  }

  const reviewRequest = (cookie: string, shop: PyusdShop, rail: "pyusd" | "paypal" = "pyusd") =>
    routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId: shop.outletId, rail, lines: [{ menuItemId: shop.itemId, quantity: 1 }] }));

  // An open PYUSD review by a fresh buyer whose wallet holds `funds` (default: exactly the amount).
  async function pyusdReview(shop: PyusdShop, funds?: bigint | null): Promise<Review> {
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await reviewRequest(cookie, shop);
    expect(response.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(response)).data.purchaseId;
    const amount = pyusdAtomicFor(sgdFromCents(shop.unitSgdCents), RATE);
    const buyer = await testWallet();
    if (funds !== null) await fundWallet(chain, buyer.address, funds ?? amount);
    return { cookie, purchaseId, buyer, amount };
  }

  const prepare = (review: Review, wallet: Address = review.buyer.address, headers: Record<string, string> = {}, cookie = review.cookie) =>
    routes.prepare.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${review.purchaseId}/pyusd/prepare`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", origin: TEST_BASE_URL, ...headers },
        body: JSON.stringify({ walletAddress: wallet }),
      }),
      routeParams(review.purchaseId),
    );

  const submitHint = (review: Review, attemptId: string, signature: string, headers: Record<string, string> = {}, cookie = review.cookie) =>
    routes.submitted.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${review.purchaseId}/pyusd/submitted`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json", origin: TEST_BASE_URL, ...headers },
        body: JSON.stringify({ attemptId, signature }),
      }),
      routeParams(review.purchaseId),
    );

  const reconcile = (review: Review) => routes.reconcile.POST(jsonPost(`/api/v1/purchases/${review.purchaseId}/reconcile`, review.cookie), routeParams(review.purchaseId));

  async function prepared(review: Review): Promise<{ attemptId: string; transactionBase64: string }> {
    const response = await prepare(review);
    expect(response.status).toBe(201);
    return (await envelope<{ attemptId: string; transactionBase64: string }>(response)).data;
  }

  const attemptCount = async (purchaseId: string) => Number((await database.admin`select count(*)::int as n from payment_attempts where purchase_id = ${purchaseId}`)[0]!.n);
  const purchaseState = async (purchaseId: string) => (await database.admin<{ state: string }[]>`select state from purchases where id = ${purchaseId}`)[0]!.state;

  async function attemptOf(purchaseId: string): Promise<AttemptRow> {
    const [row] = await database.admin<AttemptRow[]>`
      select id, state, pyusd_buyer_wallet as "buyerWallet", pyusd_source_token_account as "sourceTokenAccount",
        pyusd_destination_token_account as "destinationTokenAccount", pyusd_atomic_amount as "atomicAmount",
        pyusd_reference as reference, pyusd_blockhash as blockhash, pyusd_hints as hints
      from payment_attempts where purchase_id = ${purchaseId} and rail = 'pyusd'`;
    return { ...row!, atomicAmount: BigInt(row!.atomicAmount) };
  }

  async function principalOf(cookie: string): Promise<BuyerPrincipal> {
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no buyer session");
    return principal;
  }

  const refusal = async (response: Response) => (await envelope(response)).error;

  describe("PYUSD pricing", () => {
    it("PYUSD pricing refuses while the rail is disabled", async () => {
      const shop = await pyusdShop("price-off");
      state.env = { ...state.env, PYUSD_ENABLED: false };
      const cookie = await anonymousCookie(routes.auth.POST);
      const response = await reviewRequest(cookie, shop);
      expect(await refusal(response)).toMatchObject({ code: "pyusd_unavailable", details: { reason: "rail_disabled" } });
      expect(Number((await database.admin`select count(*)::int as n from purchases where outlet_id = ${shop.outletId}`)[0]!.n)).toBe(0);
    });

    it("rate older than 30 days makes PYUSD unavailable", async () => {
      const shop = await pyusdShop("price-age", new Date(T0.getTime() - durationMs("T_RATE_AGE")));
      freeze(T0);
      const cookie = await anonymousCookie(routes.auth.POST);
      expect(await refusal(await reviewRequest(cookie, shop))).toMatchObject({ code: "rate_expired", details: { reason: "rate_expired" } });
      freeze(new Date(T0.getTime() - 1));
      expect((await reviewRequest(cookie, shop)).status).toBe(201);
    });
  });

  describe("PYUSD preparation", () => {
    it("preparation refuses while the rail is disabled", async () => {
      const review = await pyusdReview(await pyusdShop("prep-off"));
      state.env = { ...state.env, PYUSD_ENABLED: false };
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "rail_disabled" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("preparation rejects a foreign Origin", async () => {
      const review = await pyusdReview(await pyusdShop("prep-origin"));
      const response = await prepare(review, review.buyer.address, { origin: FOREIGN_ORIGIN });
      expect(response.status).toBe(403);
      expect(await refusal(response)).toMatchObject({ code: "forbidden_origin" });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("preparation requires the owning buyer", async () => {
      const review = await pyusdReview(await pyusdShop("prep-owner"));
      const other = await anonymousCookie(routes.auth.POST);
      const response = await prepare(review, review.buyer.address, {}, other);
      expect(response.status).toBe(404);
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("payments kill switch refuses PYUSD preparation", async () => {
      const review = await pyusdReview(await pyusdShop("prep-kill"));
      state.env = { ...state.env, PAYMENTS_ENABLED: false };
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "payments_disabled" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("stale review cannot prepare PYUSD", async () => {
      const shop = await pyusdShop("prep-stale");
      freeze(T0);
      const review = await pyusdReview(shop);
      freeze(new Date(T0.getTime() + durationMs("T_REVIEW")));
      expect(await refusal(await prepare(review))).toMatchObject({ code: "review_expired" });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("preparation refuses on an identity mismatch", async () => {
      const review = await pyusdReview(await pyusdShop("prep-genesis"));
      chain.genesis = MAINNET_GENESIS;
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "genesis_mismatch" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("preparation refuses an ineligible mint", async () => {
      const review = await pyusdReview(await pyusdShop("prep-mint"));
      const fee = { epoch: 0n, maximumFee: 0n, transferFeeBasisPoints: 10 };
      chain.accounts.set(PYUSD_DEVNET.mint, { owner: PYUSD_DEVNET.tokenProgram, data: mintData({ extensions: reviewedExtensions({ older: fee, newer: fee }) }) });
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "fee_rate_nonzero" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("rate change invalidates an unexecuted PYUSD review at preparation", async () => {
      const shop = await pyusdShop("prep-rate", new Date(Date.now() - 60_000));
      const review = await pyusdReview(shop);
      await seedPyusdRate(database, shop.outletId, shop.memberUserId, RATE, new Date());
      expect(await refusal(await prepare(review))).toMatchObject({ code: "review_invalidated", details: { reason: "rate_changed" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("rate expiry between review and preparation refuses preparation", async () => {
      const shop = await pyusdShop("prep-rate-age", new Date(T0.getTime() - durationMs("T_RATE_AGE") + 60_000));
      freeze(T0);
      const review = await pyusdReview(shop);
      freeze(new Date(T0.getTime() + 60_000));
      expect(await refusal(await prepare(review))).toMatchObject({ code: "rate_expired" });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("buyer without enough PYUSD cannot prepare", async () => {
      const shop = await pyusdShop("prep-funds");
      const missing = await pyusdReview(shop, null);
      expect(await refusal(await prepare(missing))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "buyer_insufficient" } });
      expect(await attemptCount(missing.purchaseId)).toBe(0);
      const short = await pyusdReview(shop, pyusdAtomicFor(sgdFromCents(shop.unitSgdCents), RATE) - 1n);
      expect(await refusal(await prepare(short))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "buyer_insufficient" } });
      expect(await attemptCount(short.purchaseId)).toBe(0);
    });

    it("frozen buyer token account cannot prepare", async () => {
      const shop = await pyusdShop("prep-frozen-buyer");
      const review = await pyusdReview(shop, null);
      await fundWallet(chain, review.buyer.address, review.amount, { frozen: true });
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "buyer_account_frozen" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("merchant token account is rechecked at preparation", async () => {
      const shop = await pyusdShop("prep-frozen-merchant");
      const review = await pyusdReview(shop);
      await fundWallet(chain, shop.merchant.address, 0n, { frozen: true });
      expect(await refusal(await prepare(review))).toMatchObject({ code: "pyusd_unavailable", details: { reason: "merchant_account_frozen" } });
      expect(await attemptCount(review.purchaseId)).toBe(0);
    });

    it("no unsigned bytes leave before the attempt is saved", async () => {
      const review = await pyusdReview(await pyusdShop("prep-insert-fails"));
      const web = connectWeb(database.webUrl, 2);
      try {
        const outcome = await preparePyusdPayment({ db: web.db, rpc: (await import("@/integrations/solana/rpc")).webSolanaClient(), now: () => new Date() }, await principalOf(review.cookie), review.purchaseId, review.buyer.address, {
          insertAttempt: async () => {
            throw new Error("FIXTURE: the attempt insert fails");
          },
        }).catch((error: unknown) => error);
        expect(outcome).toBeInstanceOf(Error);
        expect(JSON.stringify(outcome, Object.getOwnPropertyNames(outcome))).not.toContain("transactionBase64");
      } finally {
        await web.close();
      }
      expect(await attemptCount(review.purchaseId)).toBe(0);
      expect(await purchaseState(review.purchaseId)).toBe("review_open");
    });

    it("a prepared purchase never releases bytes again", async () => {
      const review = await pyusdReview(await pyusdShop("prep-once"));
      const { attemptId } = await prepared(review);
      for (const wallet of [review.buyer.address, (await testWallet()).address]) {
        const again = await prepare(review, wallet);
        const body = await envelope<unknown>(again);
        expect(body).toMatchObject({ ok: false, error: { code: "wallet_attempt_locked", details: { attemptId, state: "prepared" } } });
        expect(JSON.stringify(body)).not.toContain("transactionBase64");
      }
      expect(await attemptCount(review.purchaseId)).toBe(1);
    });

    it("released transaction bytes are never stored", async () => {
      const review = await pyusdReview(await pyusdShop("prep-not-stored"));
      const { attemptId, transactionBase64 } = await prepared(review);
      const wire = Buffer.from(transactionBase64, "base64");
      const needles = [wire.toString("base64"), wire.toString("base64url"), wire.toString("hex")];
      const stored = async () => {
        const rows = await database.admin<{ text: string }[]>`
          select row_to_json(a)::text as text from payment_attempts a where a.id = ${attemptId}
          union all select row_to_json(e)::text from audit_events e where e.purchase_id = ${review.purchaseId}
          union all select row_to_json(p)::text from purchases p where p.id = ${review.purchaseId}`;
        return rows.map((row) => row.text).join("\n");
      };
      const found = (haystack: string) => needles.filter((needle) => haystack.includes(needle));
      expect(found(await stored())).toEqual([]);
      // Scanner self-test: a copy planted in the attempt row is found.
      await database.admin`update payment_attempts set outcome_reason = ${needles[0]!} where id = ${attemptId}`;
      expect(found(await stored())).toEqual([needles[0]]);
    });
  });

  describe("PYUSD attempt constraints", () => {
    async function twoPrepared(label: string): Promise<[string, string]> {
      const shop = await pyusdShop(label);
      const first = await pyusdReview(shop);
      await prepared(first);
      const second = await pyusdReview(shop);
      return [first.purchaseId, second.purchaseId];
    }

    it("memo reference is unique per attempt", async () => {
      const [first, second] = await twoPrepared("constraint-ref");
      const attempt = await attemptOf(first);
      const error = await database.admin`
        insert into payment_attempts (id, purchase_id, rail, state, total_sgd_cents, currency, pyusd_buyer_wallet, pyusd_source_token_account,
          pyusd_destination_token_account, pyusd_atomic_amount, pyusd_rate_version_id, pyusd_reference, pyusd_message_fingerprint, pyusd_blockhash,
          pyusd_last_valid_block_height, pyusd_preparation_slot, pyusd_fee, pyusd_hints)
        select 'att_fixture_copy', ${second}, rail, state, total_sgd_cents, currency, pyusd_buyer_wallet, pyusd_source_token_account,
          pyusd_destination_token_account, pyusd_atomic_amount, pyusd_rate_version_id, pyusd_reference, pyusd_message_fingerprint, pyusd_blockhash,
          pyusd_last_valid_block_height, pyusd_preparation_slot, pyusd_fee, '[]'::jsonb
        from payment_attempts where id = ${attempt.id}`.catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "23505", constraint_name: "payment_attempts_pyusd_reference_unique" });
    });

    it("a finalized signature binds to one attempt", async () => {
      const shop = await pyusdShop("constraint-sig");
      const first = await pyusdReview(shop);
      await prepared(first);
      const second = await pyusdReview(shop);
      await prepared(second);
      const signature = fixtureSignature(7);
      const bind = (purchaseId: string) =>
        database.admin`update payment_attempts set state = 'confirmed', pyusd_finalized_signature = ${signature}, pyusd_verified_at = now() where purchase_id = ${purchaseId}`;
      await bind(first.purchaseId);
      expect(await bind(second.purchaseId).catch((caught: unknown) => caught)).toMatchObject({ code: "23505", constraint_name: "payment_attempts_pyusd_finalized_signature_unique" });
    });
  });

  describe("PYUSD preparation standalone tests", () => {
    it("rate change never alters a prepared attempt", async () => {
      const shop = await pyusdShop("rate-after-prep", new Date(Date.now() - 60_000));
      const review = await pyusdReview(shop);
      const { attemptId } = await prepared(review);
      const before = await attemptOf(review.purchaseId);
      // The shop's member sets a new rate through the real rate route.
      const changed = await routes.rate.PUT(
        new Request(`${TEST_BASE_URL}/api/v1/merchant/outlets/${shop.outletId}/pyusd-rate`, {
          method: "PUT",
          headers: { cookie: shop.memberCookie, "content-type": "application/json", origin: TEST_BASE_URL },
          body: JSON.stringify({ pyusdPerSgd: "1.484230" }),
        }),
        routeParams(shop.outletId),
      );
      expect(changed.status).toBe(200);
      const after = await attemptOf(review.purchaseId);
      expect(after.atomicAmount).toBe(before.atomicAmount);
      const signature = fixtureSignature(11);
      chain.transactions.set(signature, landedTransactionJson(after, signature));
      const response = await submitHint(review, attemptId, signature);
      expect(await envelope(response)).toMatchObject({ ok: true, data: { check: "confirmed", purchase: { state: "paid" } } });
    });

    it("cancel after PYUSD preparation reports checking", async () => {
      const review = await pyusdReview(await pyusdShop("cancel-prepared"));
      await prepared(review);
      const response = await routes.cancel.POST(jsonPost(`/api/v1/purchases/${review.purchaseId}/cancel`, review.cookie), routeParams(review.purchaseId));
      expect(await refusal(response)).toMatchObject({ code: "payment_uncertain" });
      expect(await purchaseState(review.purchaseId)).toBe("pending_payment");
      expect((await attemptOf(review.purchaseId)).state).toBe("prepared");
    });
  });

  describe("signature hints and reconcile before expiry", () => {
    // A prepared attempt and its landed FIXTURE transfer, not yet known to the fake chain.
    async function preparedAttempt(label: string) {
      const review = await pyusdReview(await pyusdShop(label));
      const { attemptId } = await prepared(review);
      return { review, attemptId, attempt: await attemptOf(review.purchaseId) };
    }

    const seedHints = (attemptId: string, hints: { signature: string; decision: string }[]) =>
      database.admin`update payment_attempts set pyusd_hints = ${JSON.stringify(hints.map((hint) => ({ ...hint, receivedAt: new Date().toISOString() })))}::jsonb where id = ${attemptId}`;

    it("signature hint rejects a foreign Origin", async () => {
      const { review, attemptId } = await preparedAttempt("hint-origin");
      const response = await submitHint(review, attemptId, fixtureSignature(1), { origin: FOREIGN_ORIGIN });
      expect(response.status).toBe(403);
      expect((await attemptOf(review.purchaseId)).hints).toEqual([]);
    });

    it("signature hint requires the owning buyer", async () => {
      const { review, attemptId } = await preparedAttempt("hint-owner");
      const other = await anonymousCookie(routes.auth.POST);
      const response = await submitHint(review, attemptId, fixtureSignature(1), {}, other);
      expect(response.status).toBe(404);
      expect((await attemptOf(review.purchaseId)).hints).toEqual([]);
    });

    it("submitted signature is only a hint", async () => {
      const { review, attemptId } = await preparedAttempt("hint-only");
      // The chain has no finalized transaction under this signature yet.
      const response = await submitHint(review, attemptId, fixtureSignature(2));
      expect(await envelope(response)).toMatchObject({ ok: true, data: { recorded: "appended", purchase: { state: "pending_payment" } } });
      expect(await purchaseState(review.purchaseId)).toBe("pending_payment");
      expect(await attemptOf(review.purchaseId)).toMatchObject({ state: "prepared", hints: [{ signature: fixtureSignature(2) }] });
    });

    it("user-triggered PYUSD reads are debounced", async () => {
      const { review, attemptId } = await preparedAttempt("hint-debounce");
      await seedHints(attemptId, [{ signature: fixtureSignature(3), decision: "unread" }]);
      await reconcile(review);
      await reconcile(review);
      expect(callsOf(chain, "getTransaction")).toBe(1);
    });

    it("a failed landing leaves the attempt prepared", async () => {
      const { review, attemptId, attempt } = await preparedAttempt("hint-failed");
      const signature = fixtureSignature(4);
      chain.transactions.set(signature, landedTransactionJson(attempt, signature, { err: { InstructionError: [1, { Custom: 1 }] } }));
      const response = await submitHint(review, attemptId, signature);
      expect(await envelope(response)).toMatchObject({ ok: true, data: { check: "failed_landing" } });
      expect(await attemptOf(review.purchaseId)).toMatchObject({ state: "prepared", hints: [{ signature, decision: "failed_landing" }] });
      expect(await purchaseState(review.purchaseId)).toBe("pending_payment");
    });

    it("a later hint is verified when the first is not ours", async () => {
      freeze(T0);
      const { review, attemptId, attempt } = await preparedAttempt("hint-later");
      const notOurs = fixtureSignature(5);
      chain.transactions.set(notOurs, landedTransactionJson(attempt, notOurs, { reference: "FXTRanotherReference1234" }));
      expect(await envelope(await submitHint(review, attemptId, notOurs))).toMatchObject({ data: { check: "not_ours" } });
      const real = fixtureSignature(6);
      chain.transactions.set(real, landedTransactionJson(attempt, real));
      freeze(new Date(T0.getTime() + durationMs("T_PROVIDER_READ_DEBOUNCE")));
      expect(await envelope(await submitHint(review, attemptId, real))).toMatchObject({ data: { check: "confirmed", purchase: { state: "paid" } } });
      expect(await attemptOf(review.purchaseId)).toMatchObject({ state: "confirmed" });
    });

    it("hints beyond the per-attempt cap are not read", async () => {
      const { review, attemptId } = await preparedAttempt("hint-cap");
      await seedHints(attemptId, [1, 2, 3].map((fill) => ({ signature: fixtureSignature(20 + fill), decision: "not_ours" })));
      const fourth = await submitHint(review, attemptId, fixtureSignature(30)).catch((caught: unknown) => caught);
      expect(fourth).toBeInstanceOf(Response);
      expect(await envelope(fourth as Response)).toMatchObject({ ok: true, data: { recorded: "over_cap" } });
      expect(callsOf(chain, "getTransaction")).toBe(0);
      expect((await attemptOf(review.purchaseId)).hints).toHaveLength(3);
    });

    it("disabled rail still reconciles prepared attempts", async () => {
      const { review, attemptId, attempt } = await preparedAttempt("hint-disabled");
      state.env = { ...state.env, PYUSD_ENABLED: false };
      const signature = fixtureSignature(8);
      chain.transactions.set(signature, landedTransactionJson(attempt, signature));
      expect(await envelope(await submitHint(review, attemptId, signature))).toMatchObject({ ok: true, data: { check: "confirmed", purchase: { state: "paid" } } });
      expect(await attemptOf(review.purchaseId)).toMatchObject({ state: "confirmed" });
    });
  });

  // Not a Gate 3 guard: the R17 read budget, "about 4 reads per preparation". The identity check's
  // finalized mint read is reused, and both token accounts are read together.
  it("one preparation makes five RPC reads and reads the mint once", async () => {
    const review = await pyusdReview(await pyusdShop("read-budget"));
    chain.calls.length = 0;
    await prepared(review);
    expect(chain.calls.map((call) => call.method)).toEqual(["getGenesisHash", "getMultipleAccounts", "getEpochInfo", "getMultipleAccounts", "getLatestBlockhash"]);
    const accountReads = chain.calls.filter((call) => call.method === "getMultipleAccounts").map((call) => (call.params[0] as string[]).length);
    expect(accountReads).toEqual([1, 2]);
  });

  it("FIXTURE self-check: the buyer's source is its derived PYUSD account", async () => {
    const review = await pyusdReview(await pyusdShop("self-check"));
    await prepared(review);
    expect((await attemptOf(review.purchaseId)).sourceTokenAccount).toBe(await associatedPyusdAccount(review.buyer.address));
  });
});
