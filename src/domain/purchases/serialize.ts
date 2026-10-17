import { formatPyusdAtomic, formatPyusdPerSgd } from "@/domain/pyusd/rate";
import type { OwnPurchase } from "@/domain/purchases/review";

// The buyer-facing JSON of a purchase. The state is the derived view, never a stored state that
// time has already overtaken.
export function purchaseJson(purchase: OwnPurchase) {
  const attempt = purchase.attempt;
  return {
    id: purchase.id,
    outletId: purchase.outletId,
    outletName: purchase.outletName,
    outletIsDemoFixture: purchase.outletIsDemoFixture,
    state: purchase.view.state,
    entryPoint: purchase.entryPoint,
    rail: purchase.rail,
    lines: purchase.lines,
    totalSgdCents: purchase.totalSgdCents,
    currency: purchase.currency,
    reviewExpiresAt: purchase.reviewExpiresAt.toISOString(),
    createdAt: purchase.createdAt.toISOString(),
    recipient: purchase.sellerMerchantId ? { environment: "sandbox", sellerMerchantId: purchase.sellerMerchantId } : null,
    // PYUSD (S16): the shop's rate and its date, the rounded-up amount in devnet test tokens, the
    // recipient account, and, once paid, the finalized signature that was verified.
    pyusd: purchase.pyusd
      ? {
          environment: "devnet",
          pyusdPerSgd: formatPyusdPerSgd(purchase.pyusd.atomicPerSgd),
          rateConfirmedAt: purchase.pyusd.rateConfirmedAt.toISOString(),
          amount: formatPyusdAtomic(purchase.pyusd.atomicAmount),
          recipientWallet: purchase.pyusd.wallet,
          recipientTokenAccount: purchase.pyusd.tokenAccount,
          attemptState: purchase.view.pyusdAttempt,
          signature: purchase.view.state === "paid" && attempt?.rail === "pyusd" ? attempt.pyusdFinalizedSignature : null,
          verifiedAt: purchase.view.state === "paid" && attempt?.rail === "pyusd" ? (attempt.pyusdVerifiedAt?.toISOString() ?? null) : null,
        }
      : null,
    payment: attempt && attempt.rail !== "pyusd"
      ? {
          environment: "sandbox",
          attemptState: purchase.view.paypalAttempt,
          orderId: attempt.orderId,
          captureId: purchase.view.state === "paid" ? attempt.captureId : null,
          captureVerifiedAt: purchase.view.state === "paid" ? (attempt.captureVerifiedAt?.toISOString() ?? null) : null,
        }
      : null,
    // Its own field: acknowledgment never changes or implies the payment state above.
    acknowledgment: purchase.acknowledgedAt ? { acknowledgedAt: purchase.acknowledgedAt.toISOString() } : null,
  };
}
