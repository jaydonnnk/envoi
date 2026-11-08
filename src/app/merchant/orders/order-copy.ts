import type { OrderFilter, OrderSort, OrderState, OrderView } from "@/domain/purchases/order-filter";
import type { MerchantOrder } from "@/domain/purchases/orders";
import type { SalesSummary } from "@/domain/purchases/sales-summary";
import { formatMoney, money, type Country } from "@/lib/money";

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

// Tokens may have reached the shop outside the order's own payment. The record says so in full, so it
// stays open under the table whatever is filtered or selected.
export function needsReading(order: MerchantOrder): boolean {
  return Boolean(order.pyusd && (order.pyusd.extraTransfers.length > 0 || order.pyusd.closedBy === "operator"));
}

// The table's amount: what the capture verified once paid, and the review's total until then.
export function orderTotal(order: MerchantOrder): string {
  return formatMoney(money(order.currency, order.state === "paid" ? (order.payment?.captureGrossMinor ?? order.totalMinor) : order.totalMinor));
}

const RAIL_WORDS: Record<string, string> = { paypal: "PayPal", pyusd: "PYUSD" };

// The "Paid via" column names a rail as the way a payment arrived only on a paid order, so a row that
// is not paid never reads as paid through that rail.
export function paidVia(order: MerchantOrder): string {
  const rail = order.rail === null ? null : (RAIL_WORDS[order.rail] ?? null);
  if (order.state === "paid") return rail ?? "Unknown";
  return rail === null ? "Not paid" : `${rail}, not paid`;
}

// A filter's states, as the words the sentence is answered in.
const STATE_WORDS: Record<OrderState, string> = { paid: "Paid", pending_payment: "Not paid yet", uncertain: "Checking payment", unpaid_closed: "Closed unpaid" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month! - 1]}`;
}

function dateWords(from: string | undefined, to: string | undefined): string | null {
  if (from && to) return from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`;
  if (from) return `From ${shortDate(from)}`;
  return to ? `Up to ${shortDate(to)}` : null;
}

// "Filters set: Paid · PayPal · 29 Oct to 4 Nov." shows the merchant exactly what the model chose.
export function filterWords(filter: OrderFilter, shopCountry: Country = "SG"): string[] {
  return [
    ...(filter.states ?? []).map((state) => STATE_WORDS[state]),
    ...(filter.rails ?? []).map((rail) => RAIL_WORDS[rail]!),
    ...(filter.currencies ?? []),
    ...[dateWords(filter.from, filter.to)].filter((words) => words !== null),
    ...(filter.view === "overseas" ? [`PayPal account outside ${SHOP_COUNTRY_NAMES[shopCountry]}`] : filter.view && filter.view !== "all" ? [VIEW_WORDS[filter.view]] : []),
    ...(filter.sort ? [SORT_WORDS[filter.sort.column][filter.sort.direction]] : []),
  ];
}

// S46: the view and sort the merchant asked for, in the mockup's words.
const VIEW_WORDS: Record<Exclude<OrderView, "all" | "overseas">, string> = {
  paid: "Paid",
  needs_attention: "Needs attention",
};
const SHOP_COUNTRY_NAMES: Record<Country, string> = { SG: "Singapore", US: "the United States" };
const SORT_WORDS: Record<OrderSort["column"], Record<OrderSort["direction"], string>> = {
  time: { asc: "oldest first", desc: "newest first" },
  total: { asc: "smallest first", desc: "largest first" },
  fee: { asc: "smallest PayPal fee first", desc: "largest PayPal fee first" },
  net: { asc: "smallest net first", desc: "largest net first" },
};

// S46: the desk's three PayPal columns. A paid PayPal order without PayPal's figure reads Unknown,
// never zero. A PYUSD order paid in devnet test tokens has no PayPal fee, so its net is its total.
// An order that is not paid shows nothing here: nothing was charged yet.
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const UNKNOWN = "Unknown";
const NO_PAYPAL_FEE = "No PayPal fee";

export function feeText(order: MerchantOrder): string {
  if (order.state !== "paid") return "";
  if (order.rail === "pyusd") return NO_PAYPAL_FEE;
  const fee = order.payment?.captureFeeMinor ?? null;
  return fee === null ? UNKNOWN : formatMoney(money(order.currency, fee));
}

export function netMinor(order: MerchantOrder): number | null {
  if (order.state !== "paid") return null;
  if (order.rail === "pyusd") return order.totalMinor;
  return order.payment?.captureNetMinor ?? null;
}

export function netText(order: MerchantOrder): string {
  if (order.state !== "paid") return "";
  const net = netMinor(order);
  return net === null ? UNKNOWN : formatMoney(money(order.currency, net));
}

export function countryText(order: MerchantOrder): string {
  if (order.state !== "paid" || order.rail === "pyusd") return "";
  const code = order.payment?.payerCountry ?? null;
  return code === null ? UNKNOWN : (COUNTRY_NAMES.of(code) ?? code);
}

// S45: a refund is its own line beside the payment state. A refunded order stays Paid.
export function refundCopy(refund: NonNullable<MerchantOrder["refund"]>): { chip: string; tone: "ok" | "warn" | "plain"; body: string } {
  const amount = formatMoney(money(refund.currency, refund.amountMinor));
  switch (refund.state) {
    case "completed":
      return { chip: "Refunded", tone: "plain", body: `${amount} refunded to the customer in PayPal sandbox. Test money. The order stays recorded as Paid.` };
    case "sent":
      return { chip: "Refund sent", tone: "warn", body: `A ${amount} refund was sent to PayPal sandbox and is not completed yet. The order stays recorded as Paid.` };
    case "checking":
      return { chip: "Refund checking", tone: "warn", body: `PayPal's answer to the ${amount} refund did not arrive. Confirm it again to check: Envoi resends the same request, so the customer is never refunded twice.` };
    case "failed":
      return { chip: "Refund refused", tone: "warn", body: `PayPal refused the ${amount} refund, so no money went back. The order stays recorded as Paid.` };
  }
}

// The copilot panel shows the model's reply as plain text, so Markdown emphasis it adds around a
// figure or a name (**S$16.70**, *2 x Ebi fry*, `pur_...`) is dropped and every word is kept. A marker
// must hug its text, so "2 * 3" and snake_case stay as written.
export function plainReply(text: string): string {
  return text
    .replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, "$1")
    .replace(/__(?=\S)([^_]*?\S)__/g, "$1")
    .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?![\w*])/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1");
}

// The Payment column's value: every chip its cell shows. The grid re-renders a cell only when this
// value changes, so a refund or an extra transfer on a Paid order must change it (S45 Render check,
// 2026-11-08: a confirmed refund stayed off the row until the page was reloaded).
export function paymentChips(order: MerchantOrder): string {
  const chips = [orderStatus(order).chip];
  if (order.pyusd && order.pyusd.extraTransfers.length > 0) chips.push("Extra transfer");
  if (order.refund) chips.push(refundCopy(order.refund).chip);
  return chips.join(", ");
}

// A total of PayPal's figures counts only orders whose figure PayPal gave. When it gave none, the
// total is unknown, not S$0.00 (S46 Render check, 2026-11-08: four paid orders, all without a fee,
// read "Net after PayPal fees S$0.00"). PYUSD orders count as known: they carry no PayPal fee.
function knownFigureCount(total: { paidCount: number; unknownFeeCount: number }): number {
  return total.paidCount - total.unknownFeeCount;
}

export function knownTotalText(summary: SalesSummary, minor: number): string {
  return knownFigureCount(summary) === 0 ? UNKNOWN : `${formatMoney(money(summary.currency, minor))} known`;
}

// S46: the "By payment method" table, one row per currency and method, from the server's summary.
export type MethodRow = { id: string; method: string; paid: string; fees: string };

export function methodRows(summary: SalesSummary): MethodRow[] {
  return summary.byRail.map((total) => {
    const paid = formatMoney(money(summary.currency, total.paidMinor));
    if (total.rail === "pyusd") return { id: `${summary.currency}-pyusd`, method: "PYUSD, devnet test tokens", paid, fees: NO_PAYPAL_FEE };
    const fee = formatMoney(money(summary.currency, total.knownFeeMinor));
    const fees = total.unknownFeeCount === 0 ? fee : knownFigureCount(total) === 0 ? `${total.unknownFeeCount} unknown` : `${fee} known, ${total.unknownFeeCount} unknown`;
    return { id: `${summary.currency}-paypal`, method: "PayPal", paid, fees };
  });
}

// The desk's two tiles for one currency. Net counts only what is known; an unknown fee is named.
export function deskTiles(summary: SalesSummary): { paid: string; net: string; note: string | null } {
  return {
    paid: formatMoney(money(summary.currency, summary.paidMinor)),
    net: knownFigureCount(summary) === 0 ? UNKNOWN : formatMoney(money(summary.currency, summary.knownNetMinor)),
    note: summary.unknownFeeCount === 0 ? null : `${summary.unknownFeeCount} paid ${summary.unknownFeeCount === 1 ? "order has" : "orders have"} no fee from PayPal, so ${summary.unknownFeeCount === 1 ? "its" : "their"} net is not counted.`,
  };
}

// CSV of the rows shown, then the server's totals. A cell a spreadsheet would read as a formula
// (=, +, -, @, a tab or a return first) is prefixed with an apostrophe, so a menu item's name can
// never run in the merchant's spreadsheet.
const CSV_HEADER = ["Time (Singapore)", "Items", "Total", "PayPal fee", "Net", "PayPal account from", "Payment"];

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function ordersCsv(rows: readonly { time: string; order: MerchantOrder }[], summaries: readonly SalesSummary[]): string {
  const lines = [CSV_HEADER];
  for (const { time, order } of rows) {
    lines.push([time, order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", "), orderTotal(order), feeText(order), netText(order), countryText(order), paymentChips(order)]);
  }
  for (const summary of summaries) {
    lines.push([`Totals, paid only (${summary.currency})`, `${summary.paidCount} paid`, formatMoney(money(summary.currency, summary.paidMinor)), knownTotalText(summary, summary.knownFeeMinor), knownTotalText(summary, summary.knownNetMinor), "", ""]);
  }
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
