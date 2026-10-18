import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersView } from "@/app/merchant/orders/orders-view";
import { PyusdExtraTransfers, pyusdReceiptStatus } from "@/app/receipt/[purchaseId]/pyusd-receipt";
import { listOutletOrders, type OutletOrders } from "@/domain/purchases/orders";
import { applyScanOutcome } from "@/domain/pyusd/recovery";
import { formatPyusdAtomic } from "@/domain/pyusd/rate";
import { grantOperator, recordExtraTransferRefund, resolvePyusdMismatch } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakeChain, fakeRpcFetch, type FakeChain } from "../support/fake-solana";
import { newMerchant } from "../support/merchant";
import { loadMerchantRoutes, shopApi } from "../support/publication";
import type { PyusdTestState } from "../support/pyusd";
import { LANDING_SLOT, loadRecoveryRoutes, recoveryHarness, type Prepared } from "../support/pyusd-recovery";
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

// S17 named additions (Gate 4): the merchant's view of an extra transfer and the two D1 PYUSD operator
// acts, resolve-pyusd-mismatch and record-extra-transfer-refund, run as the CLI runs them, with
// migration credentials. Every attempt, signature and transfer is a FIXTURE on its own published
// FIXTURE shop, over a FIXTURE devnet RPC; operator accounts are throwaway permanent accounts.

describe("PYUSD extra transfers and operator acts", () => {
  let database: TestDatabase;
  let chain: FakeChain;
  let h: ReturnType<typeof recoveryHarness>;
  let operatorEmail: string;
  let operatorUserId: string;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdoperator");
    Object.assign(process.env, webEnvFor(database.webUrl));
    const api = shopApi(database, await loadMerchantRoutes());
    h = recoveryHarness(database, await loadRecoveryRoutes(), api, () => chain);
    const operator = await newMerchant(database, "pyusd-operator", { membership: false });
    await grantOperator(h.admin, { email: operator.email, evidenceRef: "FIXTURE operator" });
    operatorEmail = operator.email;
    operatorUserId = operator.userId;
  });

  beforeEach(() => {
    chain = createFakeChain();
    state.env = { PYUSD_ENABLED: true, PAYMENTS_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
  });

  afterAll(async () => {
    await h?.close();
    await database?.drop();
  });

  const auditRows = (attemptId: string, action: string) =>
    database.admin<{ actor: string; details: Record<string, unknown> }[]>`select actor, details from audit_events where attempt_id = ${attemptId} and action = ${action}`;

  // A mismatch whose window scan ran to completion, or stopped short when `complete` is false.
  async function scannedMismatch(label: string, complete: boolean): Promise<Prepared> {
    const { prepared, mismatch } = await h.mismatchedAttempt(label);
    h.expireAll();
    h.setHistory(prepared, [{ signature: mismatch, slot: BigInt(LANDING_SLOT), err: null }, h.older()]);
    if (!complete) chain.faults.push({ method: "getSignaturesForAddress", answer: "429" });
    await h.runnerReconcile(prepared);
    const attempt = await h.attemptOf(prepared.purchaseId);
    expect(attempt).toMatchObject({ state: "mismatch", scan: { reachedBeforePreparation: complete } });
    return { ...prepared, attempt };
  }

  // A paid attempt with one extra transfer recorded by the window scan's outcome writer.
  async function paidWithExtra(label: string): Promise<{ prepared: Prepared; extra: string }> {
    const { prepared } = await h.confirmedAttempt(label);
    const extra = h.freshSignature();
    const transfer = { signature: extra, slot: BigInt(LANDING_SLOT + 9), destinationDelta: prepared.attempt.atomicAmount, verification: "verified" as const, foundAt: new Date(), refundReference: null };
    expect(await applyScanOutcome(h.maintenanceDb(), prepared.attempt.id, { kind: "extra", transfer }, new Date(), "maintenance")).toBe(true);
    return { prepared, extra };
  }

  it("merchant orders show a detected extra transfer", async () => {
    const { prepared, extra } = await paidWithExtra("ops-orders-extra");
    const orders = (await listOutletOrders(h.webDb(), prepared.shop.outletId, new Date())) as OutletOrders;
    const order = orders.orders.find((candidate) => candidate.id === prepared.purchaseId)!;
    expect(order.state).toBe("paid");
    const amount = formatPyusdAtomic(prepared.attempt.atomicAmount);
    expect(order.pyusd?.extraTransfers).toEqual([{ signature: extra, amount }]);
    const page = renderToStaticMarkup(createElement(OrdersView, { initial: orders }));
    expect(page).toContain("Extra transfer");
    expect(page).toContain(`A second devnet transfer of ${amount} PYUSD`);
    expect(page).toContain(extra);
    expect(page).not.toMatch(/refunded/i);
  });

  it("mismatch resolution waits for a complete window scan", async () => {
    const prepared = await scannedMismatch("ops-wait-scan", false);
    await expect(resolvePyusdMismatch(h.admin, { operatorEmail, attemptId: prepared.attempt.id, reason: "FIXTURE no tokens reached the shop", evidenceRef: "FIXTURE-EVIDENCE-1" })).rejects.toThrow(
      /window scan .* is not complete/,
    );
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "mismatch" });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("uncertain");
    expect(await auditRows(prepared.attempt.id, "pyusd_mismatch_resolved_unpaid")).toEqual([]);
  });

  it("mismatch resolution needs recorded evidence", async () => {
    const prepared = await scannedMismatch("ops-evidence", true);
    for (const evidenceRef of [null, "", "   "]) {
      await expect(resolvePyusdMismatch(h.admin, { operatorEmail, attemptId: prepared.attempt.id, reason: "FIXTURE no tokens reached the shop", evidenceRef })).rejects.toThrow(
        "An evidence reference is required",
      );
    }
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "mismatch" });
    await resolvePyusdMismatch(h.admin, { operatorEmail, attemptId: prepared.attempt.id, reason: "FIXTURE no tokens reached the shop", evidenceRef: "FIXTURE-EVIDENCE-2" });
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "closed_unpaid" });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("unpaid_closed");
    expect(await auditRows(prepared.attempt.id, "pyusd_mismatch_resolved_unpaid")).toEqual([
      { actor: `operator:${operatorUserId}`, details: { operatorUserId, reason: "FIXTURE no tokens reached the shop", evidenceRef: "FIXTURE-EVIDENCE-2" } },
    ]);
    // The receipt shows the operator's resolution rather than claiming no transfer happened.
    expect(pyusdReceiptStatus("unpaid_closed", "11:05", { attemptState: "closed_unpaid", closedBy: "operator" }).body).toContain("The Envoi operator reviewed it and closed this purchase as unpaid");
  });

  it("a refund needs an out-of-band reference", async () => {
    const { prepared, extra } = await paidWithExtra("ops-refund-empty");
    for (const reference of [null, "", "  "]) {
      await expect(recordExtraTransferRefund(h.admin, { operatorEmail, attemptId: prepared.attempt.id, signature: extra, reason: "FIXTURE shop returned it", reference })).rejects.toThrow(
        "An out-of-band refund reference is required",
      );
    }
    const [row] = await database.admin<{ refund_reference: string | null }[]>`select refund_reference from pyusd_extra_transfers where attempt_id = ${prepared.attempt.id}`;
    expect(row?.refund_reference).toBeNull();
  });

  it("a refund reference changes no payment state", async () => {
    const { prepared, extra } = await paidWithExtra("ops-refund-state");
    const before = await database.admin`select * from payment_attempts where id = ${prepared.attempt.id}`;
    const result = await recordExtraTransferRefund(h.admin, { operatorEmail, attemptId: prepared.attempt.id, signature: extra, reason: "FIXTURE shop returned it", reference: "FIXTURE-REFUND-1" });
    expect(result).toMatchObject({ status: "recorded", refundReference: "FIXTURE-REFUND-1" });
    expect(await h.purchaseState(prepared.purchaseId)).toBe("paid");
    expect(await database.admin`select * from payment_attempts where id = ${prepared.attempt.id}`).toEqual(before);
    const [row] = await database.admin<{ refund_reference: string }[]>`select refund_reference from pyusd_extra_transfers where attempt_id = ${prepared.attempt.id} and signature = ${extra}`;
    expect(row?.refund_reference).toBe("FIXTURE-REFUND-1");
    expect(await auditRows(prepared.attempt.id, "pyusd_extra_transfer_refund_recorded")).toEqual([
      { actor: `operator:${operatorUserId}`, details: { operatorUserId, reason: "FIXTURE shop returned it", evidenceRef: "FIXTURE-REFUND-1", signature: extra } },
    ]);
    const receipt = `${pyusdReceiptStatus("paid", "11:05").body} ${renderToStaticMarkup(PyusdExtraTransfers({ transfers: [{ signature: extra, amount: "1.335807" }] }) ?? "")}`;
    expect(receipt).not.toMatch(/refunded|Envoi (has )?refund/i);
  });

  it("mismatch resolution needs a flagged operator account", async () => {
    const prepared = await scannedMismatch("ops-flag-resolve", true);
    const unflagged = await newMerchant(database, "pyusd-not-operator", { membership: false });
    const input = { attemptId: prepared.attempt.id, reason: "FIXTURE no tokens reached the shop", evidenceRef: "FIXTURE-EVIDENCE-3" };
    await expect(resolvePyusdMismatch(h.admin, { ...input, operatorEmail: unflagged.email })).rejects.toThrow("does not hold the operator flag");
    await expect(resolvePyusdMismatch(h.admin, { ...input, operatorEmail: "nobody-fixture@merchant.example.test" })).rejects.toThrow("No permanent account");
    expect(await auditRows(prepared.attempt.id, "pyusd_mismatch_resolved_unpaid")).toEqual([]);
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "mismatch" });
    await resolvePyusdMismatch(h.admin, { ...input, operatorEmail });
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "closed_unpaid" });
  });

  it("a refund reference needs a flagged operator account", async () => {
    const { prepared, extra } = await paidWithExtra("ops-flag-refund");
    const unflagged = await newMerchant(database, "pyusd-not-operator", { membership: false });
    const input = { attemptId: prepared.attempt.id, signature: extra, reason: "FIXTURE shop returned it", reference: "FIXTURE-REFUND-2" };
    await expect(recordExtraTransferRefund(h.admin, { ...input, operatorEmail: unflagged.email })).rejects.toThrow("does not hold the operator flag");
    const [row] = await database.admin<{ refund_reference: string | null }[]>`select refund_reference from pyusd_extra_transfers where attempt_id = ${prepared.attempt.id}`;
    expect(row?.refund_reference).toBeNull();
    expect(await auditRows(prepared.attempt.id, "pyusd_extra_transfer_refund_recorded")).toEqual([]);
    expect(await recordExtraTransferRefund(h.admin, { ...input, operatorEmail })).toMatchObject({ status: "recorded" });
  });
});
