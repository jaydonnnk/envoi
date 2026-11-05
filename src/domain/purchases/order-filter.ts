import { z } from "zod";
import type { MerchantOrder } from "@/domain/purchases/orders";
import { CURRENCIES, type Currency } from "@/lib/money";

// Ask your orders (S35; Gate 2 "Flow: orders filter"). A merchant's sentence becomes a filter of five
// fields and nothing else. The filter only chooses among rows the browser already holds: it changes
// no row, so an order's state is what the server said it is. Safe to import in the browser.

// An order is a purchase that reached a payment. A review that never started one moved no money,
// and any buyer can open many, so listing reviews would push real orders off the page.
export const ORDER_STATES = ["pending_payment", "paid", "uncertain", "unpaid_closed"] as const;
export type OrderState = (typeof ORDER_STATES)[number];

const ORDER_RAILS = ["paypal", "pyusd"] as const;

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

export function applyOrderFilter(orders: readonly MerchantOrder[], filter: OrderFilter): MerchantOrder[] {
  return orders.filter((order) => {
    if (filter.states && !(filter.states as readonly string[]).includes(order.state)) return false;
    if (filter.rails && !(filter.rails as readonly (string | null)[]).includes(order.rail)) return false;
    if (filter.currencies && !filter.currencies.includes(order.currency)) return false;
    const day = singaporeDate(new Date(order.createdAt));
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    return true;
  });
}
