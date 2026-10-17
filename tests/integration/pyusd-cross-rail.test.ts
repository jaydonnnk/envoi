import type { Address } from "@solana/kit";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startPayPal, type StartResult } from "@/domain/payments/attempts";
import { preparePyusdPayment, type Preparation } from "@/domain/pyusd/attempts";
import { pyusdAvailability } from "@/domain/pyusd/identity";
import { pyusdAtomicFor } from "@/domain/pyusd/rate";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession, type BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import type { AppError } from "@/lib/errors";
import { sgdFromCents } from "@/lib/money";
import { durationMs } from "@/lib/time";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createFakeChain, fakeRpcFetch, fundWallet, MAINNET_GENESIS, testWallet, type FakeChain } from "../support/fake-solana";
import { jsonPost, routeParams } from "../support/payments";
import { envelope, loadMerchantRoutes, publishedItems, shopApi } from "../support/publication";
import { seedPyusdDestination, type PyusdTestState } from "../support/pyusd";
import { anonymousCookie, TEST_BASE_URL, webEnvFor } from "../support/session";
import { waitFor } from "../support/wait";

const state = vi.hoisted((): PyusdTestState & { paypal: PayPalWriteClient | null } => ({ env: {}, fetch: null, paypal: null }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});
vi.mock("@/integrations/solana/rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/solana/rpc")>();
  const unlimited = { acquire: async () => ({ ok: true as const, release: async () => {} }), reportRateLimited: async () => {} };
  return { ...actual, webSolanaClient: () => (state.fetch ? actual.createSolanaReadClient({ rpcUrl: "https://fixture-devnet-rpc.invalid/", fetch: state.fetch }, unlimited) : null) };
});
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => state.paypal,
}));

// S16: the three Gate 3 basket-lock tests that need both rails ("an unresolved payment blocks the same
// basket on the other rail", "an abandoned PayPal order does not lock its basket", "two open reviews
// of one basket cannot both start payment") and "PYUSD failure leaves PayPal working". The real route
// handlers and domain starts as envoi_web; PayPal is the labeled fixture fake at the
// PayPalWriteClient boundary and Solana a FIXTURE devnet RPC faked at the bounded transport.

const RATE = 742_115n;
const T0 = new Date("2026-10-27T03:00:00.000Z");

describe("PYUSD across rails", () => {
  let database: TestDatabase;
  let api: ReturnType<typeof shopApi>;
  let chain: FakeChain;
  let fake: FakePayPal;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdrails");
    Object.assign(process.env, webEnvFor(database.webUrl));
    api = shopApi(database, await loadMerchantRoutes());
  });

  beforeEach(() => {
    chain = createFakeChain();
    fake = createFakePayPal();
    state.env = { PYUSD_ENABLED: true, PAYMENTS_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
    state.paypal = fake.client;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await database?.drop();
  });

  const routes = async () => ({
    auth: await import("@/app/api/auth/[...all]/route"),
    purchases: await import("@/app/api/v1/purchases/route"),
    purchase: await import("@/app/api/v1/purchases/[id]/route"),
    start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
    complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    prepare: await import("@/app/api/v1/purchases/[id]/pyusd/prepare/route"),
  });

  // A published FIXTURE shop that takes both rails.
  async function bothRailsShop(label: string) {
    const { shop } = await api.publishedShop(label);
    const [item] = await publishedItems(database, shop.outletId);
    const merchant = await testWallet();
    const tokenAccount = await fundWallet(chain, merchant.address, 0n);
    await seedPyusdDestination(database, shop.outletId, { wallet: merchant.address, tokenAccount, atomicPerSgd: RATE, confirmedAt: new Date(T0.getTime() - 60_000) });
    return { outletId: shop.outletId, itemId: item!.id, unitSgdCents: item!.unitSgdCents };
  }

  async function review(cookie: string, shop: { outletId: string; itemId: string }, rail: "paypal" | "pyusd") {
    const response = await (await routes()).purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId: shop.outletId, rail, lines: [{ menuItemId: shop.itemId, quantity: 1 }] }));
    return { status: response.status, body: await envelope<{ purchaseId: string }>(response) };
  }

  async function principalOf(cookie: string): Promise<BuyerPrincipal> {
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no buyer session");
    return principal;
  }

  const freeze = (at: Date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  };

  it("an unresolved payment blocks the same basket on the other rail", async () => {
    const shop = await bothRailsShop("lock-rails");
    const r = await routes();

    // A PayPal purchase left uncertain blocks a PYUSD review of the same basket.
    const paypalBuyer = await anonymousCookie(r.auth.POST);
    const paypal = await review(paypalBuyer, shop, "paypal");
    expect(paypal.status).toBe(201);
    // FIXTURE: the state a capture_unknown that recovery could not decide leaves behind.
    await database.admin`update purchases set state = 'uncertain' where id = ${paypal.body.data.purchaseId}`;
    expect((await review(paypalBuyer, shop, "pyusd")).body).toMatchObject({ ok: false, error: { code: "execution_locked", details: { reason: "purchase_uncertain" } } });

    // A prepared PYUSD attempt blocks a PayPal review of the same basket.
    const pyusdBuyer = await anonymousCookie(r.auth.POST);
    const pyusd = await review(pyusdBuyer, shop, "pyusd");
    expect(pyusd.status).toBe(201);
    const wallet = await testWallet();
    await fundWallet(chain, wallet.address, pyusdAtomicFor(sgdFromCents(shop.unitSgdCents), RATE));
    const prepared = await r.prepare.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${pyusd.body.data.purchaseId}/pyusd/prepare`, {
        method: "POST",
        headers: { cookie: pyusdBuyer, "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ walletAddress: wallet.address }),
      }),
      routeParams(pyusd.body.data.purchaseId),
    );
    expect(prepared.status).toBe(201);
    expect((await review(pyusdBuyer, shop, "paypal")).body).toMatchObject({ ok: false, error: { code: "execution_locked", details: { reason: "pyusd_attempt_open" } } });
  });

  it("an abandoned PayPal order does not lock its basket", async () => {
    const shop = await bothRailsShop("lock-abandoned");
    const r = await routes();
    freeze(T0);
    const buyer = await anonymousCookie(r.auth.POST);
    const first = await review(buyer, shop, "paypal");
    const purchaseId = first.body.data.purchaseId;
    expect((await r.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    const [attempt] = await database.admin<{ state: string }[]>`select state from payment_attempts where purchase_id = ${purchaseId}`;
    expect(attempt!.state).toBe("order_created");

    // The buyer never approves at PayPal; T_REVIEW passes with no maintenance run.
    freeze(new Date(T0.getTime() + durationMs("T_REVIEW")));
    const read = await r.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { cookie: buyer } }), routeParams(purchaseId));
    expect(await envelope(read)).toMatchObject({ ok: true, data: { state: "unpaid_closed", payment: { attemptState: "abandoned" } } });
    expect((await review(buyer, shop, "pyusd")).status).toBe(201);
    expect((await review(buyer, shop, "paypal")).status).toBe(201);
  });

  it("two open reviews of one basket cannot both start payment", async () => {
    const shop = await bothRailsShop("lock-race-rails");
    const r = await routes();
    const buyer = await anonymousCookie(r.auth.POST);
    const principal = await principalOf(buyer);
    const paypalId = (await review(buyer, shop, "paypal")).body.data.purchaseId;
    const pyusdId = (await review(buyer, shop, "pyusd")).body.data.purchaseId;
    const wallet = await testWallet();
    await fundWallet(chain, wallet.address, pyusdAtomicFor(sgdFromCents(shop.unitSgdCents), RATE));

    const web = connectWeb(database.webUrl, 4);
    const admin = database.admin;
    const waitingOnLock = async () =>
      (await admin`select count(*)::int as n from pg_stat_activity where datname = ${database.name} and wait_event_type = 'Lock'`)[0]!.n > 0;
    let paypalHeld!: () => void;
    const paypalInBarrier = new Promise<void>((resolve) => (paypalHeld = resolve));
    let pyusdReturned = false;
    try {
      // The PayPal start holds after its locks and eligibility check, before its attempt is saved,
      // until the PYUSD preparation has returned or waits on a lock.
      const first = startPayPal({ db: web.db, paypal: fake.client, now: () => new Date(), appBaseUrl: TEST_BASE_URL }, principal, paypalId, {
        beforeAttemptSaved: async () => {
          paypalHeld();
          await waitFor(async () => pyusdReturned || (await waitingOnLock()), 10_000, "the PYUSD preparation to return or wait on a lock");
        },
      });
      await paypalInBarrier;
      const rpc = (await import("@/integrations/solana/rpc")).webSolanaClient();
      const second = preparePyusdPayment({ db: web.db, rpc, now: () => new Date() }, principal, pyusdId, wallet.address as Address).finally(() => {
        pyusdReturned = true;
      });
      const [paypal, pyusd]: [StartResult | AppError, Preparation] = await Promise.all([first, second]);

      expect(paypal).not.toHaveProperty("code");
      expect(pyusd).toMatchObject({ kind: "refused", error: { code: "execution_locked", details: { purchaseId: paypalId } } });
      const attempts = await admin`select purchase_id from payment_attempts where purchase_id in (${paypalId}, ${pyusdId})`;
      expect(attempts).toEqual([{ purchase_id: paypalId }]);
    } finally {
      await web.close();
    }
  });

  it("PYUSD failure leaves PayPal working", async () => {
    const failures: [(chain: FakeChain) => void, string][] = [
      [(c) => (c.outage = "unreachable"), "rpc_unavailable"],
      [(c) => (c.genesis = MAINNET_GENESIS), "genesis_mismatch"],
    ];
    for (const [fail, reason] of failures) {
      chain = createFakeChain();
      fake = createFakePayPal();
      state.fetch = fakeRpcFetch(chain);
      state.paypal = fake.client;
      const shop = await bothRailsShop(`paypal-ok-${reason}`);
      fail(chain);
      // The app boots afresh with the failing devnet RPC configured: every module loads again.
      vi.resetModules();
      const loaded = await routes().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      expect(loaded.ok, `${reason}: the app modules load`).toBe(true);
      if (!loaded.ok) return;
      const r = loaded.value;
      const availability = await pyusdAvailability({ enabled: true, hasWallet: true, rate: { expired: false } }, (await import("@/integrations/solana/rpc")).webSolanaClient);
      expect(availability, reason).toMatchObject({ available: false, reason });

      // The labeled PayPal fixture journey starts and completes.
      const buyer = await anonymousCookie(r.auth.POST);
      const created = await review(buyer, shop, "paypal");
      expect(created.status, reason).toBe(201);
      const purchaseId = created.body.data.purchaseId;
      expect((await r.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status, reason).toBe(200);
      fake.approve(fake.calls[0]!.orderId!);
      const completed = await r.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId));
      expect(await envelope(completed), reason).toMatchObject({ ok: true, data: { status: "paid" } });
    }
  });
});
