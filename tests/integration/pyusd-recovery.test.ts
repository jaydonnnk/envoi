import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readOperatorHealth } from "@/domain/maintenance/health";
import { claimDuePyusdAttempts } from "@/domain/maintenance/due";
import { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { reconcilePyusdAttempt } from "@/domain/pyusd/reconcile";
import { pyusdReceiptStatus } from "@/app/receipt/[purchaseId]/pyusd-receipt";
import { applyScanOutcome, decideRecoveryStep } from "@/domain/pyusd/recovery";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { createFakeChain, fakeRpcFetch, fakeSolanaClient, MAINNET_GENESIS, type FakeChain, type FixtureSignature } from "../support/fake-solana";
import { envelope, loadMerchantRoutes, shopApi } from "../support/publication";
import { callsOf, type PyusdTestState } from "../support/pyusd";
import { BOUND, historySignature, LANDING_SLOT, loadRecoveryRoutes, recoveryHarness, type Prepared, type RecoveryRoutes } from "../support/pyusd-recovery";
import { transcript } from "../support/transcript";
import { webEnvFor } from "../support/session";

const state = vi.hoisted((): PyusdTestState & { proofs: { automaticUnpaidRelease: boolean } } => ({ env: {}, fetch: null, proofs: { automaticUnpaidRelease: false } }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});
vi.mock("@/integrations/solana/rpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/integrations/solana/rpc")>();
  const unlimited = { acquire: async () => ({ ok: true as const, release: async () => {} }), reportRateLimited: async () => {} };
  return { ...actual, webSolanaClient: () => (state.fetch ? actual.createSolanaReadClient({ rpcUrl: "https://fixture-devnet-rpc.invalid/", fetch: state.fetch }, unlimited) : null) };
});
// The release switch is a reviewed constant; one case turns it on through this mock, and every other
// case reads the constant's own value.
vi.mock("@/domain/pyusd/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/pyusd/constants")>();
  return { ...actual, PYUSD_PROOFS: state.proofs };
});

// S17, Gate 3 group "PYUSD recovery over a fake chain" (15 cases) and the standalone test "web and
// runner cannot scan one attempt at once": the shared reconcile path against PostgreSQL, as
// envoi_maintenance for the runner and envoi_web for the route, over a FIXTURE devnet RPC faked at
// the bounded transport with injected confirmed and finalized heights. Every signature, history page
// and landed transaction is synthetic. Each case prepares its own attempt on its own published
// FIXTURE shop through the real routes and keeps its committed rows (as every earlier slice does),
// rather than rolling back per case as Gate 3's sentence says: the routes commit their own
// transactions, so a per-case rollback cannot hold them.

describe("PYUSD recovery", () => {
  let database: TestDatabase;
  let routes: RecoveryRoutes;
  let chain: FakeChain;
  let h: ReturnType<typeof recoveryHarness>;
  let actualRelease: boolean;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdrecovery");
    Object.assign(process.env, webEnvFor(database.webUrl));
    const api = shopApi(database, await loadMerchantRoutes());
    routes = await loadRecoveryRoutes();
    h = recoveryHarness(database, routes, api, () => chain);
    actualRelease = (await vi.importActual<typeof import("@/domain/pyusd/constants")>("@/domain/pyusd/constants")).PYUSD_PROOFS.automaticUnpaidRelease;
  });

  beforeEach(() => {
    chain = createFakeChain();
    state.env = { PYUSD_ENABLED: true, PAYMENTS_ENABLED: true };
    state.fetch = fakeRpcFetch(chain);
    state.proofs.automaticUnpaidRelease = actualRelease;
  });

  afterAll(async () => {
    await h?.close();
    await database?.drop();
  });

  const scanOf = async (purchaseId: string) => (await h.attemptOf(purchaseId)).scan;
  // n FIXTURE history entries on the merchant's account, newest first, at or after preparation.
  const failedEntries = (from: number, n: number): FixtureSignature[] =>
    Array.from({ length: n }, (_, i) => ({ signature: historySignature(from + i), slot: BigInt(LANDING_SLOT + 500 - Math.floor(i / 10)), err: { InstructionError: [0, "Custom"] } }));

  describe("PYUSD recovery over a fake chain", () => {
    it("release waits for finalized height past the saved bound", async () => {
      const prepared = await h.preparedAttempt("rec-final-height");
      chain.blockHeight = BOUND + 10n;
      chain.finalizedBlockHeight = BOUND;
      h.setHistory(prepared, [h.older()]);
      expect(await h.runnerReconcile(prepared)).toBe("nothing_to_read");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "prepared", scan: null });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("pending_payment");
    });

    it("scan starts only after expiry is final", async () => {
      const prepared = await h.preparedAttempt("rec-no-early-scan");
      chain.blockHeight = BOUND - 5n;
      chain.finalizedBlockHeight = BOUND - 5n;
      h.setHistory(prepared, [h.older()]);
      chain.calls.length = 0;
      await h.runnerReconcile(prepared);
      expect(callsOf(chain, "getSignaturesForAddress")).toBe(0);
    });

    it("scan that never reaches before preparation is incomplete", async () => {
      const prepared = await h.preparedAttempt("rec-incomplete");
      h.expireAll();
      // The whole history the RPC holds is newer than preparation: the account's creation is missing.
      h.setHistory(prepared, failedEntries(1, 40));
      expect(await h.runnerReconcile(prepared)).toBe("scan_incomplete");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { reachedBeforePreparation: false, pagesRead: 1, lastGap: null } });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("pending_payment");
    });

    it("scan stops at the page cap without releasing", async () => {
      const prepared = await h.preparedAttempt("rec-page-cap");
      h.expireAll();
      h.setHistory(prepared, [...failedEntries(10_000, 3_000), h.older()]);
      expect(await h.runnerReconcile(prepared)).toBe("scan_incomplete");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { reachedBeforePreparation: false, pagesRead: 3, lastGap: "page_cap" } });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("pending_payment");
    });

    it("scan stops at the fetch cap without releasing", async () => {
      const prepared = await h.preparedAttempt("rec-fetch-cap");
      h.expireAll();
      const candidates = Array.from({ length: 21 }, (_, i) => h.notOurs(prepared.attempt, historySignature(20_000 + i), LANDING_SLOT + 30 - i));
      h.setHistory(prepared, [...candidates, h.older()]);
      expect(await h.runnerReconcile(prepared)).toBe("scan_incomplete");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({
        state: "expired_scanning",
        scan: { reachedBeforePreparation: false, candidatesChecked: 20, lastGap: "page_cap", beforeCursor: candidates[19]!.signature },
      });
      expect(callsOf(chain, "getTransaction")).toBe(20);
    });

    it("scan resumes from its saved cursor", async () => {
      const prepared = await h.preparedAttempt("rec-resume");
      h.expireAll();
      const page = failedEntries(30_000, 1_000);
      h.setHistory(prepared, [...page, h.older()]);
      // The second page is rate limited, so the first claim stops after one full page.
      chain.faults.push({ method: "getSignaturesForAddress", when: (params) => (params[1] as { before?: string }).before !== undefined, answer: "429" });
      await h.runnerReconcile(prepared);
      const saved = await scanOf(prepared.purchaseId);
      expect(saved).toMatchObject({ beforeCursor: page.at(-1)!.signature, lastGap: "rate_limited" });
      chain.calls.length = 0;
      await h.runnerReconcile(prepared);
      const pages = chain.calls.filter((call) => call.method === "getSignaturesForAddress");
      expect((pages[0]!.params[1] as { before?: string }).before).toBe(page.at(-1)!.signature);
    });

    it("429 or null transaction keeps the attempt locked", async () => {
      // A rate-limited page.
      const limited = await h.preparedAttempt("rec-429");
      h.expireAll();
      h.setHistory(limited, [h.notOurs(limited.attempt, historySignature(40_001)), h.older()]);
      chain.faults.push({ method: "getSignaturesForAddress", answer: "429" });
      await h.runnerReconcile(limited);
      expect(await h.attemptOf(limited.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { beforeCursor: null, lastGap: "rate_limited", reachedBeforePreparation: false } });

      // A candidate the RPC returns as null.
      const missing = await h.preparedAttempt("rec-null-tx");
      h.setHistory(missing, [{ signature: historySignature(40_002), slot: BigInt(LANDING_SLOT), err: null }, h.older()]);
      await h.runnerReconcile(missing);
      expect(await h.attemptOf(missing.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { beforeCursor: null, lastGap: "null_transaction", reachedBeforePreparation: false } });

      // A candidate read that times out as unavailable.
      const timedOut = await h.preparedAttempt("rec-unavailable-tx");
      h.setHistory(timedOut, [h.notOurs(timedOut.attempt, historySignature(40_003)), h.older()]);
      chain.faults.push({ method: "getTransaction", answer: "unreachable" });
      await h.runnerReconcile(timedOut);
      expect(await h.attemptOf(timedOut.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { beforeCursor: null, lastGap: "rpc_unavailable", reachedBeforePreparation: false } });
      for (const prepared of [limited, missing, timedOut]) expect(await h.purchaseState(prepared.purchaseId)).toBe("pending_payment");
    });

    it("a successful transaction with our reference that fails verification blocks release", async () => {
      const prepared = await h.preparedAttempt("rec-mismatch");
      h.expireAll();
      const wrong = h.land(prepared.attempt, historySignature(50_001), { amount: prepared.attempt.atomicAmount + 1n });
      h.setHistory(prepared, [wrong, h.older()]);
      await h.runnerReconcile(prepared);
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "mismatch", mismatchSignature: wrong.signature, finalizedSignature: null });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("uncertain");
    });

    it("automatic unpaid release stays off until its proofs are recorded", async () => {
      const prepared = await h.preparedAttempt("rec-held");
      h.expireAll();
      h.setHistory(prepared, [h.older()]);
      expect(await h.runnerReconcile(prepared)).toBe("held_no_match");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "held_no_match", scan: { reachedBeforePreparation: true } });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("uncertain");
    });

    it("a complete empty scan closes the attempt once release is enabled", async () => {
      state.proofs.automaticUnpaidRelease = true;
      const prepared = await h.preparedAttempt("rec-release");
      h.expireAll();
      h.setHistory(prepared, [h.older()]);
      expect(await h.runnerReconcile(prepared)).toBe("closed_unpaid");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "closed_unpaid" });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("unpaid_closed");
      // The basket is unlocked: the same buyer can review the same basket again.
      expect((await h.reviewRequest(prepared.cookie, prepared.shop)).status).toBe(201);
    });

    it("devnet reset stops verification and scanning", async () => {
      const prepared = await h.preparedAttempt("rec-identity");
      h.expireAll();
      h.setHistory(prepared, [h.older()]);
      chain.faults.push({ method: "getSignaturesForAddress", answer: "429" });
      await h.runnerReconcile(prepared);
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { lastGap: "rate_limited" } });
      chain.genesis = MAINNET_GENESIS;
      chain.calls.length = 0;
      expect(await h.runnerReconcile(prepared)).toBe("identity_changed");
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "expired_scanning", scan: { lastGap: "identity_changed", reachedBeforePreparation: false } });
      expect(callsOf(chain, "getSignaturesForAddress")).toBe(0);
      expect(await h.purchaseState(prepared.purchaseId)).toBe("pending_payment");
    });

    it("a confirmed or mismatched attempt is still scanned after expiry", async () => {
      const { prepared: confirmed, bound } = await h.confirmedAttempt("rec-scan-confirmed");
      const { prepared: mismatched, mismatch } = await h.mismatchedAttempt("rec-scan-mismatch");
      h.expireAll();
      h.setHistory(confirmed, [{ signature: bound, slot: BigInt(LANDING_SLOT), err: null }, h.older(1)]);
      h.setHistory(mismatched, [{ signature: mismatch, slot: BigInt(LANDING_SLOT), err: null }, h.older(2)]);
      for (const prepared of [confirmed, mismatched]) {
        await h.runnerReconcile(prepared);
        expect((await scanOf(prepared.purchaseId))?.reachedBeforePreparation).toBe(true);
      }
      expect(decideRecoveryStep(await h.attemptOf(confirmed.purchaseId), BOUND + 1n, PYUSD_PROOFS)).toEqual({ action: "done" });
      expect(decideRecoveryStep(await h.attemptOf(mismatched.purchaseId), BOUND + 1n, PYUSD_PROOFS)).toEqual({ action: "operator", reason: "mismatch" });
      expect(await h.attemptOf(confirmed.purchaseId)).toMatchObject({ state: "confirmed", finalizedSignature: bound });
      expect(await h.attemptOf(mismatched.purchaseId)).toMatchObject({ state: "mismatch", mismatchSignature: mismatch });
    });

    it("the scan continues after a transfer binds", async () => {
      const prepared = await h.preparedAttempt("rec-bind-continue");
      h.expireAll();
      const transfer = h.land(prepared.attempt, historySignature(60_001), { slot: LANDING_SLOT + 5 });
      const after = h.notOurs(prepared.attempt, historySignature(60_002), LANDING_SLOT);
      h.setHistory(prepared, [transfer, after, h.older()]);
      await h.runnerReconcile(prepared);
      expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "confirmed", finalizedSignature: transfer.signature, scan: { reachedBeforePreparation: true, candidatesChecked: 2 } });
      expect(await h.purchaseState(prepared.purchaseId)).toBe("paid");
    });

    it("an extra transfer keeps the purchase paid and alerts the operator", async () => {
      const { prepared, bound } = await h.confirmedAttempt("rec-extra-paid");
      const before = await h.attemptOf(prepared.purchaseId);
      const extra = h.freshSignature();
      const written = await applyScanOutcome(
        h.maintenanceDb(),
        prepared.attempt.id,
        { kind: "extra", transfer: { signature: extra, slot: BigInt(LANDING_SLOT + 7), destinationDelta: prepared.attempt.atomicAmount, verification: "verified", foundAt: new Date(), refundReference: null } },
        new Date(),
        "maintenance",
      );
      expect(written).toBe(true);
      const [row] = await database.admin<{ destination_delta: string }[]>`select destination_delta::text from pyusd_extra_transfers where attempt_id = ${prepared.attempt.id} and signature = ${extra}`;
      expect(row?.destination_delta).toBe(prepared.attempt.atomicAmount.toString());
      expect(await h.purchaseState(prepared.purchaseId)).toBe("paid");
      const after = await h.attemptOf(prepared.purchaseId);
      expect(after).toMatchObject({ state: "confirmed", finalizedSignature: bound });
      expect(after.finalizedSignature).toBe(before.finalizedSignature);
      const health = await readOperatorHealth(h.webDb(), new Date());
      expect(health.pyusd.extraTransfers).toContainEqual(expect.objectContaining({ purchaseId: prepared.purchaseId, signature: extra, destinationDelta: prepared.attempt.atomicAmount.toString(), refundReference: null }));
    });

    it("an extra transfer is recorded once per attempt", async () => {
      const { prepared } = await h.confirmedAttempt("rec-extra-once");
      const extra = h.freshSignature();
      const insert = () =>
        database.admin`insert into pyusd_extra_transfers (id, attempt_id, signature, slot, destination_delta, verification, found_at)
          values (${`pxt_fixture_${Math.random().toString(36).slice(2)}`}, ${prepared.attempt.id}, ${extra}, ${LANDING_SLOT}, ${prepared.attempt.atomicAmount.toString()}, 'verified', now())`.then(
          () => "ok",
          (err: { code?: string }) => err.code ?? "no_code",
        );
      expect(await insert()).toBe("ok");
      expect(await insert()).toBe("23505");
    });
  });

  // Not a Gate 3 guard: the S17 visible result, walked once and printed as the labeled FIXTURE
  // transcript when ENVOI_TRANSCRIPT is set (evidence/s17-fake-chain-transcript.txt).
  it("FIXTURE transcript: lost wallet responses recovered over a fake chain", async () => {
    const log = transcript("S17 PYUSD recovery over a FIXTURE devnet RPC; every signature and transaction is synthetic");
    const receipt = async (prepared: Prepared) => {
      const status = pyusdReceiptStatus(await h.purchaseState(prepared.purchaseId), "11:05", { attemptState: (await h.attemptOf(prepared.purchaseId)).state, closedBy: null });
      return `${status.title} (${status.chip})`;
    };
    const step = async (label: string, prepared: Prepared, check?: string) => {
      const attempt = await h.attemptOf(prepared.purchaseId);
      const scan = attempt.scan ? `scan ${attempt.scan.reachedBeforePreparation ? "complete" : "incomplete"}, ${attempt.scan.pagesRead} page(s), ${attempt.scan.candidatesChecked} candidate(s)` : "no scan";
      log.step(`${label}: ${check ? `reconcile ${check}; ` : ""}attempt ${attempt.state}, purchase ${await h.purchaseState(prepared.purchaseId)}, ${scan}; receipt "${await receipt(prepared)}"`);
    };
    const paid = await h.preparedAttempt("rec-transcript-paid");
    const mismatched = await h.preparedAttempt("rec-transcript-mismatch");
    const empty = await h.preparedAttempt("rec-transcript-empty");
    log.step(`three attempts prepared with bound ${BOUND}; each wallet response is lost, so no signature hint arrives`);
    const transfer = h.land(paid.attempt, historySignature(80_001));
    const wrong = h.land(mismatched.attempt, historySignature(80_002), { amount: mismatched.attempt.atomicAmount + 1n });
    h.setHistory(paid, [transfer, h.older(80_101)]);
    h.setHistory(mismatched, [wrong, h.older(80_102)]);
    h.setHistory(empty, [h.older(80_103)]);
    chain.blockHeight = BOUND + 3n;
    chain.finalizedBlockHeight = BOUND;
    for (const [label, prepared] of [["verified", paid], ["mismatching", mismatched], ["empty", empty]] as const) await step(`${label}, confirmed height past the bound, finalized at it`, prepared, await h.runnerReconcile(prepared));
    expect(await receipt(paid)).toBe("Checking payment (Not confirmed)");
    h.expireAll();
    log.step(`finalized height ${BOUND + 1n} passes the bound`);
    for (const [label, prepared] of [["verified", paid], ["mismatching", mismatched], ["empty", empty]] as const) await step(label, prepared, await h.runnerReconcile(prepared));
    expect(await h.attemptOf(paid.purchaseId)).toMatchObject({ state: "confirmed", scan: { reachedBeforePreparation: true } });
    expect(await h.attemptOf(mismatched.purchaseId)).toMatchObject({ state: "mismatch" });
    expect(await h.attemptOf(empty.purchaseId)).toMatchObject({ state: "held_no_match" });
    expect(await receipt(paid)).toBe("Paid (Paid)");
    expect(await receipt(empty)).toBe("Checking payment (Not confirmed)");
    log.print();
  });

  it("web and runner cannot scan one attempt at once", async () => {
    const prepared = await h.preparedAttempt("rec-web-runner");
    h.expireAll();
    const candidates = [h.notOurs(prepared.attempt, historySignature(70_001), LANDING_SLOT + 2), h.notOurs(prepared.attempt, historySignature(70_002), LANDING_SLOT + 1)];
    h.setHistory(prepared, [...candidates, h.older()]);
    // The runner claims the attempt first, then holds at its first history read until the web
    // reconcile has run; every read after that answers at once.
    let releaseRunner!: () => void;
    const runnerHeld = new Promise<void>((resolve) => (releaseRunner = resolve));
    let runnerReached!: () => void;
    const reached = new Promise<void>((resolve) => (runnerReached = resolve));
    let held = false;
    chain.beforeAnswer = async (method) => {
      if (method === "getSignaturesForAddress" && !held) {
        held = true;
        runnerReached();
        await runnerHeld;
      }
    };
    // Earlier cases leave due attempts behind, so the claim takes every due attempt.
    const claimed = await claimDuePyusdAttempts(h.maintenanceDb(), new Date(), 1_000, "FIXTURE-run-race", false);
    expect(claimed.map((row) => row.id)).toContain(prepared.attempt.id);
    const runner = reconcilePyusdAttempt({ db: h.maintenanceDb(), rpc: fakeSolanaClient(chain), now: () => new Date() }, prepared.attempt.id, "maintenance", { kind: "runner", owner: "FIXTURE-run-race" });
    await reached;
    const web = await h.webReconcile(prepared);
    releaseRunner();
    expect(await runner).toBe("held_no_match");
    expect(await envelope(web)).toMatchObject({ ok: true, data: { check: "in_flight" } });
    expect(callsOf(chain, "getSignaturesForAddress")).toBe(1);
    expect(callsOf(chain, "getTransaction")).toBe(2);
    expect(await h.attemptOf(prepared.purchaseId)).toMatchObject({ state: "held_no_match", scan: { pagesRead: 1, candidatesChecked: 2, reachedBeforePreparation: true } });
  });
});
