import type { Address } from "@solana/kit";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { buyerActor, recordAudit } from "@/domain/audit/events";
import { PYUSD_DEVNET, PYUSD_HINT_CAP, PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { associatedPyusdAccount, checkPyusdIdentity, checkPyusdTokenAccount } from "@/domain/pyusd/identity";
import { assessMintForTransfer, epochOfSlot, feeAtEpoch } from "@/domain/pyusd/mint";
import { isRateExpired, latestPyusdRate } from "@/domain/pyusd/rate";
import { decideRecoveryStep } from "@/domain/pyusd/recovery";
import { canTransitionPyusdAttempt, feeToStored, pyusdAttemptLocks, toPyusdAttempt, type PyusdAttempt, type PyusdAttemptState } from "@/domain/pyusd/state";
import { verifyPyusdTransfer, type VerificationResult } from "@/domain/pyusd/verify";
import { basketLocked, findBasketLock, lockSameBasket } from "@/domain/purchases/review";
import { canTransitionPurchase, transitionPurchase, type PaymentAttemptRow, type PurchaseState } from "@/domain/purchases/state";
import { webEnv } from "@/env";
import { buildUnsignedTransfer } from "@/integrations/solana/build";
import { decodeMintAccount } from "@/integrations/solana/decode";
import type { SolanaReadClient } from "@/integrations/solana/rpc";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { enrollments, outlets, paymentAttempts, paymentDestinations, PURCHASE_STATES, purchases, type StoredSignatureHint } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId, newMemoReference } from "@/lib/ids";
import { durationMs, type Now } from "@/lib/time";

// PYUSD preparation, the lock and signature binding (Gate 3 "PYUSD purchase"; Gate 2 "Preparation,
// wallet broadcast and verification"). Preparation reads every chain fact first, outside any
// transaction, and only then opens one short transaction that locks the buyer's same-basket
// purchases, rechecks, and saves the attempt. The unsigned bytes leave the server once, in the
// response to that call, and are never stored: a repeated call, a reload or a second tab gets the
// attempt's state, never the bytes, a refreshed blockhash or a second transaction. A signature the
// browser posts is a hint the server verifies at finalized, never a command.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type PyusdDeps = { db: Db; rpc: SolanaReadClient | null; now: Now };

// Test-only barriers; production callers pass none.
export type PrepareHooks = { beforeAttemptSaved?: () => Promise<void>; insertAttempt?: (tx: Tx, values: typeof paymentAttempts.$inferInsert) => Promise<void> };

export type Preparation =
  | { kind: "prepared"; attemptId: string; transactionBase64: string; chain: "solana:devnet" } // the only response that carries bytes, sent once
  | { kind: "locked"; attemptId: string; state: PyusdAttemptState }
  | { kind: "refused"; error: AppError };

const refused = (error: AppError): Preparation => ({ kind: "refused", error });
const unavailable = (reason: string, message = "PYUSD is unavailable right now. Nothing was charged; PayPal still works."): Preparation =>
  refused(appError("pyusd_unavailable", message, { details: { reason } }));

type Eligible = {
  eligible: true;
  purchase: typeof purchases.$inferSelect;
  destination: { id: string; wallet: Address; tokenAccount: Address };
};
type Eligibility = Eligible | { eligible: false; error: AppError };

const notEligible = (error: AppError): Eligibility => ({ eligible: false, error });

// Every PYUSD preparation rechecks, in order: owner, T_REVIEW, the purchase state, the published
// revision, the pinned destination and its enrollment, the rate version and its age, and
// PAYMENTS_ENABLED. Read-only.
export async function assertPyusdEligible(db: Conn, purchaseId: string, principal: BuyerPrincipal, now: Date): Promise<Eligibility> {
  const [row] = await db
    .select({ purchase: purchases, publishedRevisionId: outlets.publishedMenuRevisionId, destination: paymentDestinations, enrollment: enrollments.status })
    .from(purchases)
    .innerJoin(outlets, eq(outlets.id, purchases.outletId))
    .leftJoin(paymentDestinations, eq(paymentDestinations.id, purchases.destinationId))
    .leftJoin(enrollments, eq(enrollments.outletId, purchases.outletId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
    .limit(1);
  if (!row) return notEligible(appError("not_found", "Purchase not found."));
  const { purchase, destination } = row;
  if (purchase.rail !== "pyusd") return notEligible(appError("validation_failed", "This review is for PayPal.", { details: { reason: "other_rail" } }));
  if (now.getTime() >= purchase.reviewExpiresAt.getTime()) return notEligible(appError("review_expired", "This review has expired. Review the basket again to pay."));
  switch (purchase.state as PurchaseState) {
    case "review_open":
      break;
    case "paid":
      return notEligible(appError("capture_already_dispatched", "This purchase is already paid."));
    case "pending_payment":
    case "uncertain":
      return notEligible(appError("payment_uncertain", "We are checking this payment. Do not pay again."));
    case "review_expired":
      return notEligible(appError("review_expired", "This review has expired. Review the basket again to pay."));
    default:
      return notEligible(appError("review_invalidated", "This review is closed. Review the basket again to pay."));
  }
  if (row.publishedRevisionId !== purchase.menuRevisionId) {
    return notEligible(appError("review_invalidated", "The shop changed its menu or prices since you reviewed. Nothing was charged.", { details: { reason: "menu_changed" } }));
  }
  if (!destination || destination.rail !== "pyusd" || destination.status !== "active" || destination.version !== purchase.destinationVersion || !destination.walletAddress || !destination.tokenAccount) {
    return notEligible(appError("review_invalidated", "The shop changed how it is paid since you reviewed. Nothing was charged.", { details: { reason: "destination_changed" } }));
  }
  if (row.enrollment !== "approved") return notEligible(appError("pyusd_unavailable", "This shop is not enrolled for PYUSD.", { details: { reason: "enrollment_missing" } }));
  const rate = await latestPyusdRate(db, purchase.outletId);
  if (!rate || rate.versionId !== purchase.pyusdRateVersionId) {
    return notEligible(appError("review_invalidated", "The shop changed its PYUSD rate since you reviewed. Nothing was charged.", { details: { reason: "rate_changed" } }));
  }
  if (isRateExpired(rate, now)) {
    return notEligible(appError("rate_expired", "This shop's PYUSD rate is more than 30 days old, so PYUSD is unavailable here until the shop confirms it again.", { details: { reason: "rate_expired" } }));
  }
  if (!webEnv().PAYMENTS_ENABLED) {
    return notEligible(appError("pyusd_unavailable", "Payments are switched off in this test environment right now. Nothing was charged.", { details: { reason: "payments_disabled" } }));
  }
  return { eligible: true, purchase, destination: { id: destination.id, wallet: destination.walletAddress as Address, tokenAccount: destination.tokenAccount as Address } };
}

const INVALIDATING = new Set(["menu_changed", "destination_changed", "rate_changed"]);

// A review pinned to a replaced menu, destination or rate can never execute, so it is closed.
async function closeIfInvalidated(db: Conn, purchaseId: string, error: AppError): Promise<void> {
  const reason = error.details?.reason;
  if (error.code === "review_invalidated" && typeof reason === "string" && INVALIDATING.has(reason)) {
    await transitionPurchase(db, purchaseId, ["review_open"], "review_invalidated", reason);
  }
}

async function pyusdAttemptOf(db: Conn, purchaseId: string): Promise<PaymentAttemptRow | null> {
  const [row] = await db
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.purchaseId, purchaseId), eq(paymentAttempts.rail, "pyusd")))
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  for (let current: unknown = err; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export async function preparePyusdPayment(deps: PyusdDeps, principal: BuyerPrincipal, purchaseId: string, buyerWallet: Address, hooks: PrepareHooks = {}): Promise<Preparation> {
  const { db } = deps;
  // A plain read, no row lock: an existing attempt answers locked for any wallet, with no RPC call.
  const [own] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)));
  if (!own) return refused(appError("not_found", "Purchase not found."));
  const existing = await pyusdAttemptOf(db, purchaseId);
  if (existing) return { kind: "locked", attemptId: existing.id, state: existing.state as PyusdAttemptState };

  const pre = await assertPyusdEligible(db, purchaseId, principal, deps.now());
  if (!pre.eligible) {
    await closeIfInvalidated(db, purchaseId, pre.error);
    return refused(pre.error);
  }
  const atomicAmount = pre.purchase.pyusdAtomicAmount;
  const rateVersionId = pre.purchase.pyusdRateVersionId;
  if (atomicAmount === null || rateVersionId === null) throw new Error("a PYUSD review has no priced amount");

  // Every chain fact, read through the shared limiter outside any transaction.
  const identity = await checkPyusdIdentity(deps.rpc);
  if (!identity.ok) return unavailable(identity.reason);
  const rpc = deps.rpc!;
  const mintRead = await rpc.getAccounts([PYUSD_DEVNET.mint], "finalized");
  if (mintRead.kind !== "ok") return unavailable("rpc_unavailable");
  if (!mintRead.value[0]) return unavailable("mint_unreadable");
  const mint = assessMintForTransfer(decodeMintAccount(mintRead.value[0]), identity.epoch);
  if (!mint.ok) return unavailable(mint.reason);

  // The merchant's account can change after the proof, so it is checked again.
  const merchant = await checkPyusdTokenAccount(rpc, pre.destination.wallet);
  if (!merchant.ok) return unavailable(merchant.reason === "rpc_unavailable" ? "rpc_unavailable" : `merchant_account_${merchant.reason}`, "The shop's PYUSD devnet account cannot receive payments right now. Nothing was charged.");
  if (merchant.address !== pre.destination.tokenAccount) return unavailable("merchant_account_changed");

  const source = await associatedPyusdAccount(buyerWallet);
  const buyer = await checkPyusdTokenAccount(rpc, buyerWallet);
  if (!buyer.ok && buyer.reason === "rpc_unavailable") return unavailable("rpc_unavailable");
  if (!buyer.ok && buyer.reason === "frozen") return unavailable("buyer_account_frozen", "Your PYUSD devnet account is frozen, so it cannot pay. Nothing was charged.");
  if (!buyer.ok && buyer.reason === "not_token_2022_account") return unavailable("buyer_account_invalid", "Your wallet's PYUSD account is not a devnet PYUSD account. Nothing was charged.");
  // A missing account holds nothing.
  const balance = buyer.ok ? buyer.amount : 0n;
  if (balance < atomicAmount) return unavailable("buyer_insufficient", "This wallet does not hold enough PYUSD devnet test tokens for this purchase. Nothing was charged.");

  const blockhash = await rpc.getLatestBlockhashConfirmed();
  if (blockhash.kind !== "ok") return unavailable("rpc_unavailable");
  const reference = newMemoReference();
  const built = buildUnsignedTransfer({ buyerWallet, source, destination: pre.destination.tokenAccount, atomicAmount, reference, blockhash: blockhash.value });

  const attemptId = newId("att");
  let outcome: Preparation | null;
  try {
    outcome = await db.transaction(async (tx): Promise<Preparation | null> => {
      const basket = await lockSameBasket(tx, principal, purchaseId);
      const [locked] = await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
        .for("update");
      if (!locked) return refused(appError("not_found", "Purchase not found."));
      const raced = await pyusdAttemptOf(tx, purchaseId);
      if (raced) return { kind: "locked", attemptId: raced.id, state: raced.state as PyusdAttemptState };
      const now = deps.now();
      const again = await assertPyusdEligible(tx, purchaseId, principal, now);
      if (!again.eligible) {
        await closeIfInvalidated(tx, purchaseId, again.error);
        return refused(again.error);
      }
      if (again.purchase.pyusdRateVersionId !== rateVersionId || again.destination.tokenAccount !== pre.destination.tokenAccount) {
        return refused(appError("review_invalidated", "The shop changed how it is paid since you reviewed. Nothing was charged."));
      }
      // Another review of the same basket, on either rail, whose money can still move.
      if (basket) {
        const lock = await findBasketLock(tx, { key: basket.key, exceptPurchaseId: purchaseId, held: basket.held, now });
        if (lock) return refused(basketLocked(lock));
      }
      await hooks.beforeAttemptSaved?.();

      const values: typeof paymentAttempts.$inferInsert = {
        id: attemptId,
        purchaseId,
        rail: "pyusd",
        state: "prepared",
        totalSgdCents: again.purchase.totalSgdCents,
        currency: "SGD",
        pyusdBuyerWallet: buyerWallet,
        pyusdSourceTokenAccount: source,
        pyusdDestinationTokenAccount: pre.destination.tokenAccount,
        pyusdAtomicAmount: atomicAmount,
        pyusdRateVersionId: rateVersionId,
        pyusdReference: reference,
        pyusdMessageFingerprint: built.messageFingerprint,
        pyusdBlockhash: blockhash.value.blockhash,
        pyusdLastValidBlockHeight: blockhash.value.lastValidBlockHeight,
        pyusdPreparationSlot: blockhash.value.slot,
        pyusdFee: feeToStored(mint.fee),
        pyusdHints: [],
        createdAt: now,
        updatedAt: now,
      };
      if (hooks.insertAttempt) await hooks.insertAttempt(tx, values);
      else await tx.insert(paymentAttempts).values(values);
      await transitionPurchase(tx, purchaseId, ["review_open"], "pending_payment", "pyusd_prepared");
      await recordAudit(tx, {
        at: now,
        actor: buyerActor(principal.userId),
        action: "pyusd_attempt_prepared",
        purchaseId,
        attemptId,
        operatorVisible: false,
        // Evidence only: never the transaction bytes.
        details: { reference, messageFingerprint: built.messageFingerprint, atomicAmount: atomicAmount.toString(), lastValidBlockHeight: blockhash.value.lastValidBlockHeight.toString() },
      });
      return null;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await pyusdAttemptOf(db, purchaseId);
    if (!raced) throw err;
    return { kind: "locked", attemptId: raced.id, state: raced.state as PyusdAttemptState };
  }
  if (outcome) return outcome;
  // Only now, after the commit, do the bytes leave; they were built in memory and are dropped here.
  return { kind: "prepared", attemptId, transactionBase64: built.wireBase64, chain: "solana:devnet" };
}

// Throws on a transition the PYUSD table forbids: that is a programming error, never a runtime outcome.
function assertPyusdTransition(from: PyusdAttemptState, to: PyusdAttemptState): void {
  if (!canTransitionPyusdAttempt(from, to)) throw new Error(`illegal PYUSD attempt transition ${from} -> ${to}`);
}

// Every purchase state the transition table lets move to `to` for this reason.
function purchaseStatesInto(to: PurchaseState, reason: string): PurchaseState[] {
  return PURCHASE_STATES.filter((from) => canTransitionPurchase({ from, to, reason }));
}

export type HintResult = { recorded: "appended" | "repeated" | "over_cap" | "closed"; check: PyusdCheck | null };

// Appends a hint by compare-and-set on the hint count while the attempt is not terminal and holds
// fewer than PYUSD_HINT_CAP; a repeated hint changes nothing; past the cap a hint is audited only and
// read never. Then, if the debounce allows, the readable hint is verified at finalized.
export async function recordSignatureHint(deps: PyusdDeps, principal: BuyerPrincipal, purchaseId: string, input: { attemptId: string; signature: string }): Promise<HintResult | AppError> {
  const { db } = deps;
  const [row] = await db
    .select({ attempt: paymentAttempts })
    .from(paymentAttempts)
    .innerJoin(purchases, eq(purchases.id, paymentAttempts.purchaseId))
    .where(and(eq(paymentAttempts.id, input.attemptId), eq(paymentAttempts.purchaseId, purchaseId), eq(paymentAttempts.rail, "pyusd"), eq(purchases.buyerUserId, principal.userId)));
  if (!row) return appError("not_found", "Purchase not found.");
  const actor = buyerActor(principal.userId);

  for (let tries = 0; tries < PYUSD_HINT_CAP + 1; tries += 1) {
    const [attempt] = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, input.attemptId));
    if (!attempt) return appError("not_found", "Purchase not found.");
    if (!pyusdAttemptLocks(attempt.state as PyusdAttemptState)) return { recorded: "closed", check: null };
    if (attempt.pyusdHints.some((hint) => hint.signature === input.signature)) return { recorded: "repeated", check: await reconcilePyusdAttempt(deps, attempt.id, actor) };
    if (attempt.pyusdHints.length >= PYUSD_HINT_CAP) {
      await recordAudit(db, {
        at: deps.now(),
        actor,
        action: "pyusd_hint_over_cap",
        purchaseId,
        attemptId: attempt.id,
        operatorVisible: true,
        details: { signature: input.signature },
      });
      return { recorded: "over_cap", check: null };
    }
    const now = deps.now();
    const hint: StoredSignatureHint = { signature: input.signature, receivedAt: now.toISOString(), decision: "unread" };
    const appended = await db
      .update(paymentAttempts)
      .set({ pyusdHints: sql`${paymentAttempts.pyusdHints} || ${JSON.stringify([hint])}::jsonb`, updatedAt: now })
      .where(
        and(
          eq(paymentAttempts.id, attempt.id),
          sql`jsonb_array_length(${paymentAttempts.pyusdHints}) = ${attempt.pyusdHints.length}`,
          sql`${paymentAttempts.state} not in ('confirmed', 'closed_unpaid')`,
        ),
      )
      .returning({ id: paymentAttempts.id });
    if (appended.length === 1) {
      await recordAudit(db, { at: now, actor, action: "pyusd_hint_received", purchaseId, attemptId: attempt.id, operatorVisible: false, details: { signature: input.signature } });
      return { recorded: "appended", check: await reconcilePyusdAttempt(deps, attempt.id, actor) };
    }
  }
  return appError("execution_locked", "Several hints arrived at once. Check the receipt.", { retryable: true });
}

// The hint that may be read now: the oldest one still unread or not found, and only while every
// older hint is decided not ours or a failed landing. A hint behind an undecided one waits.
export function readableHint(hints: PyusdAttempt["hints"]): { index: number; signature: string } | null {
  for (let index = 0; index < hints.length; index += 1) {
    const decision = hints[index]!.decision;
    if (decision === "not_ours" || decision === "failed_landing") continue;
    if (decision === "unread" || decision === "not_found") return { index, signature: hints[index]!.signature };
    return null;
  }
  return null;
}

export type PyusdCheck = "debounced" | "nothing_to_read" | "rpc_unavailable" | "identity_changed" | "not_found" | VerificationResult["decision"];

// Starts a debounce window by compare-and-set; false while one is still open.
async function claimRead(db: Db, attemptId: string, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - durationMs("T_PROVIDER_READ_DEBOUNCE"));
  const claimed = await db
    .update(paymentAttempts)
    .set({ lastProviderReadAt: now })
    .where(and(eq(paymentAttempts.id, attemptId), or(isNull(paymentAttempts.lastProviderReadAt), lte(paymentAttempts.lastProviderReadAt, windowStart))))
    .returning({ id: paymentAttempts.id });
  return claimed.length === 1;
}

async function decideHint(db: Conn, attemptId: string, index: number, signature: string, decision: StoredSignatureHint["decision"]): Promise<void> {
  await db
    .update(paymentAttempts)
    .set({ pyusdHints: sql`jsonb_set(${paymentAttempts.pyusdHints}, ${`{${index},decision}`}::text[], ${JSON.stringify(decision)}::jsonb)` })
    .where(and(eq(paymentAttempts.id, attemptId), sql`${paymentAttempts.pyusdHints} -> ${index}::int ->> 'signature' = ${signature}`));
}

// Reconcile before expiry (S16's hint branch of Gate 3's PYUSD recovery). Shared by the hint route and
// the buyer's "Check status"; never checks PYUSD_ENABLED, so a prepared attempt still converges with
// the rail switched off. At most one provider read per attempt per T_PROVIDER_READ_DEBOUNCE, and no
// RPC call while there is nothing to read. Every state change is a compare-and-set after the read.
export async function reconcilePyusdAttempt(deps: PyusdDeps, attemptId: string, actor: string): Promise<PyusdCheck> {
  const { db } = deps;
  const [row] = await db.select().from(paymentAttempts).where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.rail, "pyusd")));
  if (!row) return "nothing_to_read";
  const attempt = toPyusdAttempt(row);
  if (attempt.state !== "prepared") return "nothing_to_read";
  const hint = readableHint(attempt.hints);
  if (!hint) return "nothing_to_read";
  if (!(await claimRead(db, attemptId, deps.now()))) return "debounced";

  const identity = await checkPyusdIdentity(deps.rpc);
  if (!identity.ok) {
    if (identity.reason === "rpc_unavailable" || identity.reason === "rpc_unconfigured") return "rpc_unavailable";
    await recordAudit(db, { at: deps.now(), actor, action: "pyusd_identity_changed", purchaseId: attempt.purchaseId, attemptId, operatorVisible: true, details: { reason: identity.reason } });
    return "identity_changed";
  }
  const rpc = deps.rpc!;
  const height = await rpc.getBlockHeight("finalized");
  if (height.kind !== "ok") return "rpc_unavailable";
  if (decideRecoveryStep(attempt, height.value, PYUSD_PROOFS).action !== "verify_hints_then_wait") return "nothing_to_read";

  const read = await rpc.getTransactionFinalized(hint.signature);
  if (read.kind !== "ok") return "rpc_unavailable";
  if (read.value === null) {
    await decideHint(db, attemptId, hint.index, hint.signature, "not_found");
    return "not_found";
  }
  const schedule = await rpc.getEpochSchedule();
  if (schedule.kind !== "ok") return "rpc_unavailable";
  const now = deps.now();
  const result = verifyPyusdTransfer(read.value, attempt, feeAtEpoch(attempt.fee, epochOfSlot(schedule.value, read.value.slot)), now);

  await db.transaction(async (tx) => {
    const audit = (action: string, operatorVisible: boolean, details: Record<string, string | number | boolean | null>) =>
      recordAudit(tx, { at: now, actor, action, purchaseId: attempt.purchaseId, attemptId, operatorVisible, details: { signature: hint.signature, ...details } });
    switch (result.decision) {
      case "confirmed": {
        assertPyusdTransition("prepared", "confirmed");
        const bound = await tx
          .update(paymentAttempts)
          .set({ state: "confirmed", pyusdFinalizedSignature: result.evidence.signature, pyusdVerifiedAt: now, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "prepared")))
          .returning({ id: paymentAttempts.id });
        if (bound.length === 0) return;
        await decideHint(tx, attemptId, hint.index, hint.signature, "confirmed");
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("paid", "pyusd_confirmed"), "paid", "pyusd_confirmed");
        await audit("pyusd_transfer_confirmed", false, { slot: result.evidence.slot.toString(), atomicAmount: result.evidence.atomicAmount.toString(), destination: result.evidence.destinationTokenAccount });
        return;
      }
      case "not_ours":
      case "failed_landing":
        await decideHint(tx, attemptId, hint.index, hint.signature, result.decision);
        await audit(result.decision === "not_ours" ? "pyusd_hint_not_ours" : "pyusd_hint_failed_landing", false, {});
        return;
      case "uncertain": {
        assertPyusdTransition("prepared", "mismatch");
        const moved = await tx
          .update(paymentAttempts)
          .set({ state: "mismatch", outcomeReason: result.reason, updatedAt: now })
          .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.state, "prepared")))
          .returning({ id: paymentAttempts.id });
        if (moved.length === 0) return;
        await decideHint(tx, attemptId, hint.index, hint.signature, "uncertain");
        await transitionPurchase(tx, attempt.purchaseId, purchaseStatesInto("uncertain", "pyusd_mismatch"), "uncertain", "pyusd_mismatch");
        await audit("pyusd_transfer_mismatch", true, { reason: result.reason });
        return;
      }
    }
  });
  return result.decision;
}
