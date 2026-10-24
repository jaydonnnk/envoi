import type { MerchantOrder } from "@/domain/purchases/orders";

export type OrderStatus = { chip: string; tone: "ok" | "warn" | "plain"; body: string };

// A capture was sent, or may have been: only a provider read can decide it now.
const CAPTURE_IN_FLIGHT = new Set(["capture_dispatched", "capture_unknown"]);

const CHECKING: OrderStatus = {
  chip: "Checking payment",
  tone: "warn",
  body: "PayPal has not confirmed this payment, so it is not paid. Its result is not known yet; do not treat it as paid unless it shows Paid.",
};

const PYUSD_CHECKING: OrderStatus = {
  chip: "Checking payment",
  tone: "warn",
  body: "The buyer's wallet may have sent PYUSD devnet test tokens, but Envoi has not verified a finalized transfer, so it is not paid. Do not treat it as paid unless it shows Paid.",
};

// S17 review fixes: the operator closes only a mismatch, so a transaction that did not match the order
// may still have moved tokens to the shop.
export const PYUSD_OPERATOR_CLOSED: OrderStatus = {
  chip: "Not paid",
  tone: "plain",
  body: "Closed unpaid by the Envoi operator: a devnet transaction for this order did not match it, so it was never verified as paid. Tokens from that transaction may have reached your PYUSD devnet account; any refund to the buyer is arranged by you outside Envoi. Do not treat the order as paid.",
};

// Only a verified capture or a verified finalized PYUSD transfer reads as paid. Every other state
// says plainly that it is not.
export function orderStatus(order: MerchantOrder): OrderStatus {
  if (order.rail === "pyusd") {
    switch (order.state) {
      case "paid":
        return { chip: "Paid", tone: "ok", body: "Transferred and finalized on Solana devnet to your PYUSD devnet account. Devnet test tokens only; this is not SGD." };
      case "pending_payment":
      case "uncertain":
        return PYUSD_CHECKING;
      case "unpaid_closed":
        if (order.pyusd?.closedBy === "operator") return PYUSD_OPERATOR_CLOSED;
        return { chip: "Not paid", tone: "plain", body: "Closed unpaid: Envoi never verified a matching finalized devnet transfer for this order. Do not treat it as paid." };
      default:
        break;
    }
  }
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

// S17, Gate 2 fix M: an extra transfer beside an order. It says what reached the shop's devnet account
// and that Envoi does not return it, never that it was refunded.
export function extraTransferNote(amount: string | null): string {
  const what = amount === null ? "A second devnet transfer of an unknown amount" : `A second devnet transfer of ${amount} PYUSD`;
  return `${what} with this order's reference reached your PYUSD devnet account. The order's payment status is unchanged. Envoi does not return it; any refund to the buyer is arranged by you outside Envoi.`;
}

// Not paid now, but a payment may still be confirmed later.
export function mayStillBePaid(order: MerchantOrder): boolean {
  return order.state === "pending_payment" || order.state === "uncertain" || order.state === "review_open";
}

// Delete on /merchant/orders (S18) archives the order; the words are the approved mockup's.
export const DELETE_COPY = {
  button: "Delete",
  heading: "Delete this order from your list?",
  body: "Envoi keeps an archived copy as a record. The payment, the buyer's receipt and any refund are not changed.",
  stillChecking:
    "This payment is still being checked. If it turns out to be paid, the order comes back to your list marked Paid, so you never miss a payment.",
  keep: "Keep it",
  confirm: "Delete order",
  failed: "Envoi could not delete the order. Nothing changed; try again.",
};

export function archivedCountLine(count: number): string {
  return `${count} deleted ${count === 1 ? "order is kept as a record" : "orders are kept as records"}. Ask the Envoi operator if you need one back.`;
}
