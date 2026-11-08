import { z } from "zod";
import type { MerchantOrder } from "@/domain/purchases/orders";
import type { PurchaseState } from "@/domain/purchases/state";
import { CURRENCIES, type Country, type Currency } from "@/lib/money";

// Ask your orders (S35; Gate 2 "Flow: orders filter"). A merchant's sentence becomes a filter of five
// fields, from S46 also a sort and a view, and nothing else. The filter only chooses and orders rows
// the browser already holds: it changes no row, so an order's state is what the server said it is.
// Safe to import in the browser.

// An order is a purchase that reached a payment. A review that never started one moved no money,
// and any buyer can open many, so listing reviews would push real orders off the page.
export const ORDER_STATES = ["pending_payment", "paid", "uncertain", "unpaid_closed"] as const satisfies readonly PurchaseState[];
export type OrderState = (typeof ORDER_STATES)[number];

const ORDER_RAILS = ["paypal", "pyusd"] as const;

// S46 (Gate 3 least confident decision 6): a fixed list of sorts and views. The browser applies them
// with Community grid calls; neither changes a row.
export const SORT_COLUMNS = ["time", "total", "fee", "net"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const ORDER_VIEWS = ["all", "paid", "needs_attention", "overseas"] as const;
export type OrderSort = { column: (typeof SORT_COLUMNS)[number]; direction: (typeof SORT_DIRECTIONS)[number] };
export type OrderView = (typeof ORDER_VIEWS)[number];

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
});

export const OrderFilterSchema = z
  .object({
    states: z.array(z.enum(ORDER_STATES)).min(1).optional(),
    rails: z.array(z.enum(ORDER_RAILS)).min(1).optional(),
    currencies: z.array(z.enum(CURRENCIES as readonly [Currency, ...Currency[]])).min(1).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    sort: z.object({ column: z.enum(SORT_COLUMNS), direction: z.enum(SORT_DIRECTIONS) }).strict().optional(),
    view: z.enum(ORDER_VIEWS).optional(),
  })
  .strict()
  .refine((filter) => !filter.from || !filter.to || filter.from <= filter.to);

export type OrderFilter = z.infer<typeof OrderFilterSchema>;

export type OrderFilterModel = (input: { text: string; today: string }) => Promise<unknown>;

// The model's answer is untrusted: anything but a valid filter is no filter. The model is given the
// sentence and the date only.
export async function parseOrderFilter(text: string, today: string, model: OrderFilterModel): Promise<OrderFilter | null> {
  const parsed = OrderFilterSchema.safeParse(await model({ text, today }));
  return parsed.success ? parsed.data : null;
}

const SINGAPORE_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Singapore" });

// The date an instant falls on as YYYY-MM-DD. Outlets store no time zone and the orders page shows
// Singapore time, so dates are Singapore dates for every shop.
export function singaporeDate(at: Date): string {
  return SINGAPORE_DAY.format(at);
}

// An order is overseas only when PayPal gave the payer's country and it is not the shop's own. No
// other field, such as the currency, the language or the entry point, ever makes an order overseas.
export function isOverseas(order: MerchantOrder, shopCountry: Country): boolean {
  const country = order.payment?.payerCountry ?? null;
  return order.state === "paid" && country !== null && country !== shopCountry;
}

// Needs attention: Envoi could not confirm the payment, a PyUSD record must be read, or a refund is
// still being checked or failed. Pending orders are waiting on the buyer, not on the shop.
export function needsAttention(order: MerchantOrder): boolean {
  if (order.state === "uncertain") return true;
  if (order.pyusd && (order.pyusd.extraTransfers.length > 0 || order.pyusd.closedBy === "operator")) return true;
  return order.refund?.state === "checking" || order.refund?.state === "failed";
}

function inView(order: MerchantOrder, view: OrderView, shopCountry: Country): boolean {
  if (view === "paid") return order.state === "paid";
  if (view === "needs_attention") return needsAttention(order);
  if (view === "overseas") return isOverseas(order, shopCountry);
  return true;
}

export function applyOrderFilter(orders: readonly MerchantOrder[], filter: OrderFilter, shopCountry: Country): MerchantOrder[] {
  return orders.filter((order) => {
    if (filter.view && !inView(order, filter.view, shopCountry)) return false;
    if (filter.states && !(filter.states as readonly string[]).includes(order.state)) return false;
    if (filter.rails && !(filter.rails as readonly (string | null)[]).includes(order.rail)) return false;
    if (filter.currencies && !filter.currencies.includes(order.currency)) return false;
    const day = singaporeDate(new Date(order.createdAt));
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  });
}
