import type { Address } from "@solana/kit";
import { and, eq, sql } from "drizzle-orm";
import { buyerActor, recordAudit } from "@/domain/audit/events";
import { PYUSD_HINT_CAP } from "@/domain/pyusd/constants";
import { checkPyusdIdentity, checkPyusdTokenAccounts, type TokenAccountCheck } from "@/domain/pyusd/identity";
import { assessMintForTransfer } from "@/domain/pyusd/mint";
import { isRateExpired, latestPyusdRate } from "@/domain/pyusd/rate";
import { reconcilePyusdAttempt, type PyusdCheck } from "@/domain/pyusd/reconcile";
import { feeToStored, pyusdAttemptLocks, type PyusdAttemptState } from "@/domain/pyusd/state";
import { basketLocked, findBasketLock, lockSameBasket } from "@/domain/purchases/review";
import { transitionPurchase, type PaymentAttemptRow, type PurchaseState } from "@/domain/purchases/state";
import { webEnv } from "@/env";
import { buildUnsignedTransfer } from "@/integrations/solana/build";
import { decodeMintAccount } from "@/integrations/solana/decode";
import type { SolanaReadClient } from "@/integrations/solana/rpc";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { enrollments, outlets, paymentAttempts, paymentDestinations, purchases, type StoredSignatureHint } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId, newMemoReference } from "@/lib/ids";
import type { Now } from "@/lib/time";

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
  // The finalized mint the identity check read; preparation never reads it twice.
  const mint = assessMintForTransfer(decodeMintAccount(identity.mint), identity.epoch);
  if (!mint.ok) return unavailable(mint.reason);

  // The merchant's account can change after the proof, so it is checked again, in the same read as
  // the buyer's.
  const [merchant, buyer] = (await checkPyusdTokenAccounts(rpc, [pre.destination.wallet, buyerWallet])) as [TokenAccountCheck, TokenAccountCheck];
  if (!merchant.ok) return unavailable(merchant.reason === "rpc_unavailable" ? "rpc_unavailable" : `merchant_account_${merchant.reason}`, "The shop's PYUSD devnet account cannot receive payments right now. Nothing was charged.");
  if (merchant.address !== pre.destination.tokenAccount) return unavailable("merchant_account_changed");

  const source = buyer.address;
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

export type { PyusdCheck };

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
