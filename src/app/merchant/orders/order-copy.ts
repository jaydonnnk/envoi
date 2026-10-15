import type { MerchantOrder } from "@/domain/purchases/orders";

export type OrderStatus = { chip: string; tone: "ok" | "warn" | "plain"; body: string };

// A capture was sent, or may have been: only a provider read can decide it now.
const CAPTURE_IN_FLIGHT = new Set(["capture_dispatched", "capture_unknown"]);

const CHECKING: OrderStatus = {
  chip: "Checking payment",
  tone: "warn",
  body: "PayPal has not confirmed this payment, so it is not paid. Its result is not known yet; do not treat it as paid unless it shows Paid.",
};

// Only a verified capture reads as paid. Every other state says plainly that it is not.
export function orderStatus(order: MerchantOrder): OrderStatus {
  switch (order.state) {
    case "paid":
      return { chip: "Paid", tone: "ok", body: "PayPal sandbox confirmed this capture to your sandbox seller. Test money only." };
    case "pending_payment":
      if (order.payment?.attemptState && CAPTURE_IN_FLIGHT.has(order.payment.attemptState)) return CHECKING;
      if (order.payment?.attemptState === "externally_approved") {
        return { chip: "Not paid yet", tone: "warn", body: "The buyer approved in PayPal, but the payment has not been captured. Nothing has been charged yet." };
      }
      return { chip: "Not paid yet", tone: "warn", body: "The buyer has not approved this payment in PayPal. Nothing has been charged." };
    case "uncertain":
      return CHECKING;
    case "unpaid_closed":
      return { chip: "Not paid", tone: "plain", body: "Closed without a payment. Nothing was charged." };
    case "review_open":
      return { chip: "Not paid", tone: "plain", body: "The buyer is still reviewing. No payment has started." };
    case "review_expired":
      return { chip: "Not paid", tone: "plain", body: "The review expired before any payment started. Nothing was charged." };
    case "review_invalidated":
      return { chip: "Not paid", tone: "plain", body: "The review closed after a menu or connection change. Nothing was charged." };
    case "superseded":
      return { chip: "Not paid", tone: "plain", body: "The buyer replaced this review with a newer one. Nothing was charged." };
  }
}

// Not paid now, but a payment may still be confirmed later.
export function mayStillBePaid(order: MerchantOrder): boolean {
  return order.state === "pending_payment" || order.state === "uncertain" || order.state === "review_open";
}
