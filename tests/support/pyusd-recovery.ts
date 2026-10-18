import { getBase58Decoder, type Address } from "@solana/kit";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { expect } from "vitest";
import { pyusdAtomicFor } from "@/domain/pyusd/rate";
import { reconcilePyusdAttempt, type PyusdCheck } from "@/domain/pyusd/reconcile";
import { toPyusdAttempt, type PyusdAttempt } from "@/domain/pyusd/state";
import { connectRunner } from "@/lib/db/runner";
import { connectWeb, type Db } from "@/lib/db/web";
import * as schema from "@/lib/db/schema";
import { sgdFromCents } from "@/lib/money";
import type { TestDatabase } from "./db";
import { fakeSolanaClient, fundWallet, testWallet, type FakeChain, type FixtureSignature, type TestWallet } from "./fake-solana";
import { jsonPost, routeParams } from "./payments";
import { envelope, publishedItems, type shopApi } from "./publication";
import { landedTransactionJson, seedPyusdDestination } from "./pyusd";
import { anonymousCookie, TEST_BASE_URL } from "./session";

// S17 integration support. Every chain, wallet, signature, history page and landed transaction here
// is a FIXTURE: the Solana RPC is faked at the bounded transport, wallets are key pairs made in this
// process, and no value is a real devnet read or payment. Each attempt is prepared through the real
// routes on its own published FIXTURE shop, so committed rows never cross cases.

export const RATE = 742_115n; // illustrative: 0.742115 PYUSD per S$1

// The fake chain prepares every attempt with this bound and preparation slot.
export const BOUND = 280_000_150n;
export const PREPARATION_SLOT = 300_000_000n;
export const LANDING_SLOT = 300_000_040;
export const OLDER_SLOT = 299_999_000n;

export type RecoveryRoutes = {
  auth: typeof import("@/app/api/auth/[...all]/route");
  purchases: typeof import("@/app/api/v1/purchases/route");
  prepare: typeof import("@/app/api/v1/purchases/[id]/pyusd/prepare/route");
  submitted: typeof import("@/app/api/v1/purchases/[id]/pyusd/submitted/route");
  reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
};

export async function loadRecoveryRoutes(): Promise<RecoveryRoutes> {
  return {
    auth: await import("@/app/api/auth/[...all]/route"),
    purchases: await import("@/app/api/v1/purchases/route"),
    prepare: await import("@/app/api/v1/purchases/[id]/pyusd/prepare/route"),
    submitted: await import("@/app/api/v1/purchases/[id]/pyusd/submitted/route"),
    reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
  };
}

// FIXTURE: a 64-byte transaction signature in base58, distinct for every n below 2^32.
export function historySignature(n: number): string {
  const bytes = new Uint8Array(64).fill(0x5a);
  new DataView(bytes.buffer).setUint32(0, n);
  return getBase58Decoder().decode(bytes);
}

export type PyusdShop = { outletId: string; itemId: string; unitSgdCents: number; merchant: TestWallet; tokenAccount: Address; memberUserId: string; memberCookie: string };
export type Prepared = { shop: PyusdShop; cookie: string; purchaseId: string; buyer: TestWallet; attempt: PyusdAttempt };

export function recoveryHarness(database: TestDatabase, routes: RecoveryRoutes, api: ReturnType<typeof shopApi>, chain: () => FakeChain) {
  const admin = drizzle(database.admin, { schema });
  // Distinct FIXTURE signatures per harness: a finalized signature binds to one attempt only.
  let nextSignature = 1_000_000;
  const freshSignature = () => historySignature((nextSignature += 1));
  let web: { db: Db; close: () => Promise<void> } | null = null;
  let maintenance: { db: Db; close: () => Promise<void> } | null = null;
  const webDb = () => (web ??= connectWeb(database.webUrl, 4)).db;
  const maintenanceDb = () => (maintenance ??= connectRunner(database.maintenanceUrl)).db;

  async function pyusdShop(label: string): Promise<PyusdShop> {
    const { shop } = await api.publishedShop(label);
    const [item] = await publishedItems(database, shop.outletId);
    const merchant = await testWallet();
    const tokenAccount = await fundWallet(chain(), merchant.address, 0n);
    await seedPyusdDestination(database, shop.outletId, { wallet: merchant.address, tokenAccount, atomicPerSgd: RATE, confirmedAt: new Date() });
    return { outletId: shop.outletId, itemId: item!.id, unitSgdCents: item!.unitSgdCents, merchant, tokenAccount, memberUserId: shop.merchant.userId, memberCookie: shop.cookie };
  }

  const reviewRequest = (cookie: string, shop: PyusdShop) =>
    routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId: shop.outletId, rail: "pyusd", lines: [{ menuItemId: shop.itemId, quantity: 1 }] }));

  async function attemptOf(purchaseId: string): Promise<PyusdAttempt> {
    const [row] = await admin
      .select()
      .from(schema.paymentAttempts)
      .where(and(eq(schema.paymentAttempts.purchaseId, purchaseId), eq(schema.paymentAttempts.rail, "pyusd")));
    return toPyusdAttempt(row!);
  }

  // A PYUSD attempt prepared through the real review and prepare routes, with the fake chain's
  // finalized height still below its bound.
  async function preparedAttempt(label: string, cookie?: string, existingShop?: PyusdShop): Promise<Prepared> {
    const shop = existingShop ?? (await pyusdShop(label));
    const buyerCookie = cookie ?? (await anonymousCookie(routes.auth.POST));
    const review = await reviewRequest(buyerCookie, shop);
    expect(review.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(review)).data.purchaseId;
    const buyer = await testWallet();
    await fundWallet(chain(), buyer.address, pyusdAtomicFor(sgdFromCents(shop.unitSgdCents), RATE));
    const response = await routes.prepare.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}/pyusd/prepare`, {
        method: "POST",
        headers: { cookie: buyerCookie, "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ walletAddress: buyer.address }),
      }),
      routeParams(purchaseId),
    );
    expect(response.status).toBe(201);
    const attempt = await attemptOf(purchaseId);
    expect(attempt).toMatchObject({ state: "prepared", lastValidBlockHeight: BOUND, preparationSlot: PREPARATION_SLOT });
    return { shop, cookie: buyerCookie, purchaseId, buyer, attempt };
  }

  const submitHint = (prepared: Prepared, signature: string) =>
    routes.submitted.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${prepared.purchaseId}/pyusd/submitted`, {
        method: "POST",
        headers: { cookie: prepared.cookie, "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ attemptId: prepared.attempt.id, signature }),
      }),
      routeParams(prepared.purchaseId),
    );

  // A landed FIXTURE transaction for the attempt under `signature`; options change one thing.
  function land(attempt: PyusdAttempt, signature: string, options: Parameters<typeof landedTransactionJson>[2] = {}): FixtureSignature {
    chain().transactions.set(signature, landedTransactionJson(attempt, signature, { slot: LANDING_SLOT, ...options }));
    return { signature, slot: BigInt(options.slot ?? LANDING_SLOT), err: options.err ?? null };
  }

  // A successful transaction on the merchant's account that is not Envoi's (another memo).
  function notOurs(attempt: PyusdAttempt, signature: string, slot = LANDING_SLOT): FixtureSignature {
    return land(attempt, signature, { reference: "FXTRanotherReference1234", slot });
  }

  // The merchant token account's creation, older than every preparation.
  const older = (n = 900_000): FixtureSignature => ({ signature: historySignature(n), slot: OLDER_SLOT, err: null });

  const setHistory = (prepared: Prepared, entries: FixtureSignature[]) => chain().signatures.set(prepared.shop.tokenAccount, entries);

  // Moves the fake chain's finalized height past every prepared attempt's bound.
  function expireAll(): void {
    chain().blockHeight = BOUND + 5n;
    chain().finalizedBlockHeight = BOUND + 1n;
  }

  // The shared reconcile as the maintenance runner calls it, as envoi_maintenance.
  const runnerReconcile = (prepared: Prepared, owner = "FIXTURE-run"): Promise<PyusdCheck> =>
    reconcilePyusdAttempt({ db: maintenanceDb(), rpc: fakeSolanaClient(chain()), now: () => new Date() }, prepared.attempt.id, "maintenance", { kind: "runner", owner });

  const webReconcile = (prepared: Prepared) => routes.reconcile.POST(jsonPost(`/api/v1/purchases/${prepared.purchaseId}/reconcile`, prepared.cookie), routeParams(prepared.purchaseId));

  const purchaseState = async (purchaseId: string) => (await database.admin<{ state: string }[]>`select state from purchases where id = ${purchaseId}`)[0]!.state;

  // A confirmed attempt whose hint bound `signature` before its bound passed.
  async function confirmedAttempt(label: string): Promise<{ prepared: Prepared; bound: string }> {
    const prepared = await preparedAttempt(label);
    const bound = freshSignature();
    land(prepared.attempt, bound);
    expect(await envelope(await submitHint(prepared, bound))).toMatchObject({ ok: true, data: { check: "confirmed", purchase: { state: "paid" } } });
    return { prepared: { ...prepared, attempt: await attemptOf(prepared.purchaseId) }, bound };
  }

  // A mismatched attempt whose hint landed with the wrong amount before its bound passed.
  async function mismatchedAttempt(label: string): Promise<{ prepared: Prepared; mismatch: string }> {
    const prepared = await preparedAttempt(label);
    const mismatch = freshSignature();
    land(prepared.attempt, mismatch, { amount: prepared.attempt.atomicAmount + 1n });
    expect(await envelope(await submitHint(prepared, mismatch))).toMatchObject({ ok: true, data: { check: "uncertain", purchase: { state: "uncertain" } } });
    return { prepared: { ...prepared, attempt: await attemptOf(prepared.purchaseId) }, mismatch };
  }

  async function close(): Promise<void> {
    await web?.close();
    await maintenance?.close();
  }

  return {
    admin,
    webDb,
    maintenanceDb,
    pyusdShop,
    preparedAttempt,
    confirmedAttempt,
    mismatchedAttempt,
    attemptOf,
    submitHint,
    land,
    notOurs,
    older,
    setHistory,
    expireAll,
    runnerReconcile,
    webReconcile,
    purchaseState,
    reviewRequest,
    freshSignature,
    close,
  };
}
