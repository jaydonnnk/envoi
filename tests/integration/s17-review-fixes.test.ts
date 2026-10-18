import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { orderStatus, PYUSD_OPERATOR_CLOSED } from "@/app/merchant/orders/order-copy";
import { claimDuePyusdAttempts } from "@/domain/maintenance/due";
import { listOutletOrders, type OutletOrders } from "@/domain/purchases/orders";
import { grantOperator, resolvePyusdMismatch } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakeChain, fakeRpcFetch, type FakeChain } from "../support/fake-solana";
import { newMerchant } from "../support/merchant";
import { loadMerchantRoutes, shopApi } from "../support/publication";
import type { PyusdTestState } from "../support/pyusd";
import { LANDING_SLOT, loadRecoveryRoutes, recoveryHarness, type Prepared } from "../support/pyusd-recovery";
import { webEnvFor } from "../support/session";

const state = vi.hoisted((): PyusdTestState & { proofs: { automaticUnpaidRelease: boolean } } => ({ env: {}, fetch: null, proofs: { automaticUnpaidRelease: true } }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});
vi.mock("@/integrations/solana/rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/solana/rpc")>();
  const unlimited = { acquire: async () => ({ ok: true as const, release: async () => {} }), reportRateLimited: async () => {} };
  return { ...actual, webSolanaClient: () => (state.fetch ? actual.createSolanaReadClient({ rpcUrl: "https://fixture-devnet-rpc.invalid/", fetch: state.fetch }, unlimited) : null) };
});
// The release switch is a reviewed constant; a held attempt only exists while it is off, so these
// cases turn it off to make one and back on to see what happens next.
vi.mock("@/domain/pyusd/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/pyusd/constants")>();
  return { ...actual, PYUSD_PROOFS: state.proofs };
});

// S17 review fixes, 2026-10-18 (findings 1, 6 and 8): review-fix tests recorded in 00-status.md, not Gate 3
// named tests. Every attempt, signature and history page is a FIXTURE over a FIXTURE devnet RPC, on its
// own published FIXTURE shop, against local PostgreSQL as envoi_maintenance and envoi_web.

describe("S17 review fixes", () => {
  let database: TestDatabase;
  let chain: FakeChain;
  let h: ReturnType<typeof recoveryHarness>;
  let operatorEmail: string;

  beforeAll(async () => {
    database = await createTestDatabase("s17reviewfixes");
    Object.assign(process.env, webEnvFor(database.webUrl));
    h = recoveryHarness(database, await loadRecoveryRoutes(), shopApi(database, await loadMerchantRoutes()), () => chain);
    const operator = await newMerchant(database, "s17-review-operator", { membership: false });
    await grantOperator(h.admin, { email: operator.email, evidenceRef: "FIXTURE operator" });
    operatorEmail = operator.email;
  });

  beforeEach(() => {
    chain = createFakeChain();
    state.env = { PYUSD_ENABLED: true, PAYMENTS_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
    state.proofs.automaticUnpaidRelease = true;
  });

  afterAll(async () => {
    await h?.close();
    await database?.drop();
  });

  // An attempt whose complete, empty scan held it while release was off.
  async function heldAttempt(label: string): Promise<Prepared> {
    state.proofs.automaticUnpaidRelease = false;
    const prepared = await h.preparedAttempt(label);
    h.expireAll();
    h.setHistory(prepared, [h.older()]);
    expect(await h.runnerReconcile(prepared)).toBe("held_no_match");
    state.proofs.automaticUnpaidRelease = true;
    return prepared;
  }

  it("a held attempt is due again once release is enabled", async () => {
    const prepared = await heldAttempt("fix-held-due");
    const due = async (release: boolean) => (await claimDuePyusdAttempts(h.maintenanceDb(), new Date(), 1_000, `FIXTURE-due-${release}`, release)).map((row) => row.id);
    expect(await due(false)).not.toContain(prepared.attempt.id);
    expect(await due(true)).toContain(prepared.attempt.id);
  });

  it("a held attempt closes unpaid once release is enabled", async () => {
    const prepared = await heldAttempt("fix-held-close");
    expect(await h.purchaseState(prepared.purchaseId)).toBe("uncertain");
    await h.runnerReconcile(prepared, "FIXTURE-run-close");
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "closed_unpaid" });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("unpaid_closed");
    // The basket is free again for the same buyer.
    expect((await h.reviewRequest(prepared.cookie, prepared.shop)).status).toBe(201);
  });

  const extraRows = (attemptId: string) =>
    database.admin<{ signature: string; verification: string }[]>`select signature, verification from pyusd_extra_transfers where attempt_id = ${attemptId} order by signature`;

  // Finding 1 (Gate 3 reopening 2026-10-18). With the wallet response lost, the buyer's correct
  // transfer lands, then a newer transaction carrying the same memo text fails verification; history
  // is read newest first.
  it("a verifying landing wins over a newer failing one", async () => {
    const prepared = await h.preparedAttempt("fix-verifying-wins");
    h.expireAll();
    const paid = h.land(prepared.attempt, h.freshSignature(), { slot: LANDING_SLOT });
    const copy = h.land(prepared.attempt, h.freshSignature(), { slot: LANDING_SLOT + 10, amount: 1n });
    h.setHistory(prepared, [copy, paid, h.older()]);
    await h.runnerReconcile(prepared);
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "confirmed", finalizedSignature: paid.signature, mismatchSignature: null, scan: { reachedBeforePreparation: true } });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("paid");
    expect(await extraRows(prepared.attempt.id)).toEqual([{ signature: copy.signature, verification: "amount_mismatch" }]);
  });

  it("the oldest failing landing is the mismatch when nothing verifies", async () => {
    const prepared = await h.preparedAttempt("fix-oldest-mismatch");
    h.expireAll();
    const older = h.land(prepared.attempt, h.freshSignature(), { slot: LANDING_SLOT, amount: 2n });
    const newer = h.land(prepared.attempt, h.freshSignature(), { slot: LANDING_SLOT + 10, amount: 1n });
    h.setHistory(prepared, [newer, older, h.older()]);
    expect(await h.runnerReconcile(prepared)).toBe("uncertain");
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "mismatch", mismatchSignature: older.signature, finalizedSignature: null });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("uncertain");
    expect(await extraRows(prepared.attempt.id)).toEqual([{ signature: newer.signature, verification: "amount_mismatch" }]);
  });

  it("merchant orders say an operator-closed mismatch may have reached the shop", async () => {
    const { prepared, mismatch } = await h.mismatchedAttempt("fix-orders-operator");
    h.expireAll();
    h.setHistory(prepared, [{ signature: mismatch, slot: BigInt(LANDING_SLOT), err: null }, h.older()]);
    await h.runnerReconcile(prepared);
    await resolvePyusdMismatch(h.admin, { operatorEmail, attemptId: prepared.attempt.id, reason: "FIXTURE wrong amount", evidenceRef: "FIXTURE-EVIDENCE-F8" });
    const released = await h.preparedAttempt("fix-orders-release-shop");
    h.setHistory(released, [h.older(900_001)]);
    expect(await h.runnerReconcile(released)).toBe("closed_unpaid");

    const order = async (p: Prepared) => ((await listOutletOrders(h.webDb(), p.shop.outletId, new Date())) as OutletOrders).orders.find((o) => o.id === p.purchaseId)!;
    const operatorClosed = await order(prepared);
    expect(operatorClosed.pyusd?.closedBy).toBe("operator");
    expect(orderStatus(operatorClosed)).toEqual(PYUSD_OPERATOR_CLOSED);
    const releaseClosed = await order(released);
    expect(releaseClosed.pyusd?.closedBy).toBe("release");
    expect(orderStatus(releaseClosed).body).toBe("Closed unpaid: Envoi never verified a matching finalized devnet transfer for this order. Do not treat it as paid.");
  });
});
