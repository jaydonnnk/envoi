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
    payment: attempt
      ? {
          environment: "sandbox",
          attemptState: purchase.view.paypalAttempt,
          orderId: attempt.orderId,
          captureId: purchase.view.state === "paid" ? attempt.captureId : null,
          captureVerifiedAt: purchase.view.state === "paid" ? (attempt.captureVerifiedAt?.toISOString() ?? null) : null,
        }
      : null,
  };
}
