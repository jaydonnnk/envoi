import { and, eq, inArray } from "drizzle-orm";
import { getPublishedMenu } from "@/domain/outlets/search";
import { NOT_SGD_SHOP, NOT_SGD_SHOP_MESSAGE, requirePyusdEnabled } from "@/domain/pyusd/identity";
import { isRateExpired, latestPyusdRate, pyusdAtomicFor } from "@/domain/pyusd/rate";
import { webEnv } from "@/env";
import { isValidQuantity, MAX_QUANTITY, type BasketLockLine, type PurchaseLine, type RailId } from "@/domain/purchases/checkout-key";
import { menuItems, paymentDestinations } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { CURRENCY_BY_COUNTRY, money, multiply, sum, type Currency } from "@/lib/money";

// Server pricing (Gate 3, Purchases). Prices come only from the outlet's published, confirmed
// revision; the client sends item ids and quantities, never a price, payee or total.

export type PricedLine = { menuItemId: string; name: string; quantity: number; unitMinor: number; lineMinor: number };

export type CostProvenance = {
  payerFee: { amountMinor: number | null; payer: "buyer" | "merchant" | "unknown"; basis: string; quotedAt: Date | null };
  merchantFee: { amountMinor: number | null; basis: string };
  fx: { known: false };
};

export type PriceQuote =
  | {
      ok: true;
      // outletId, rail, destinationVersion and lockLines are not in Gate 3's PriceQuote; createReview
      // needs them to compute the CheckoutKey and the BasketLockKey and to pin the destination
      // version, so the quote carries them.
      outletId: string;
      rail: RailId;
      lines: PricedLine[];
      lockLines: BasketLockLine[];
      totalMinor: number;
      // The outlet's currency, beside every amount of the quote: its lines and its total.
      currency: Currency;
      menuRevisionId: string;
      destinationId: string;
      destinationVersion: number;
      provenance: CostProvenance;
      pricedAt: Date;
      // PYUSD only: the shop's rate version and the total rounded up to the next atomic unit.
      pyusd: PyusdQuote | null;
    }
  | { ok: false; error: AppError };

export type PyusdQuote = { rateVersionId: string; atomicPerSgd: bigint; rateConfirmedAt: Date; atomicAmount: bigint };

export const MAX_LINES = 20;

const PAYPAL_PROVENANCE: CostProvenance = {
  payerFee: { amountMinor: null, payer: "unknown", basis: "Funding currency and any conversion are confirmed in PayPal.", quotedAt: null },
  merchantFee: { amountMinor: null, basis: "Merchant fees are separate from the basket price and are not quoted." },
  fx: { known: false },
};

const PYUSD_PROVENANCE: CostProvenance = {
  payerFee: { amountMinor: null, payer: "unknown", basis: "Network fees are paid in devnet SOL by your wallet. Funding and off-ramp costs are unknown.", quotedAt: null },
  merchantFee: { amountMinor: null, basis: "The shop receives PYUSD devnet test tokens, not SGD. Any conversion costs are not quoted." },
  fx: { known: false },
};

const refuse = (error: AppError): PriceQuote => ({ ok: false, error });

export async function priceBasket(db: Pick<Db, "select">, input: { outletId: string; lines: readonly PurchaseLine[]; rail: RailId; now: Date }): Promise<PriceQuote> {
  // PYUSD pricing runs only while the rail is switched on (S16; D8's answer before then).
  if (input.rail === "pyusd") {
    const disabled = requirePyusdEnabled(webEnv());
    if (disabled) return refuse(disabled);
  }
  if (input.lines.length === 0 || input.lines.length > MAX_LINES) {
    return refuse(appError("validation_failed", `Choose between 1 and ${MAX_LINES} items.`, { details: { reason: "line_count" } }));
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.menuItemId)) return refuse(appError("validation_failed", "Each item may appear once.", { details: { reason: "duplicate_item" } }));
    seen.add(line.menuItemId);
    if (!isValidQuantity(line.quantity)) {
      return refuse(appError("validation_failed", `Quantities must be whole numbers from 1 to ${MAX_QUANTITY}.`, { details: { reason: "quantity" } }));
    }
  }

  const menu = await getPublishedMenu(db, input.outletId);
  if (!menu) return refuse(appError("not_found", "That shop is not on Envoi."));

  const currency = CURRENCY_BY_COUNTRY[menu.outlet.country];
  // PYUSD is priced in SGD at the shop's rate; a shop in another currency has no PYUSD quote (S27).
  if (input.rail === "pyusd" && currency !== "SGD") return refuse(appError("pyusd_unavailable", NOT_SGD_SHOP_MESSAGE, { details: { reason: NOT_SGD_SHOP } }));
  const items = new Map(menu.items.map((item) => [item.id, item]));
  const lines: PricedLine[] = [];
  for (const line of input.lines) {
    const item = items.get(line.menuItemId);
    if (!item) return refuse(appError("validation_failed", "An item is not on the shop's current menu.", { details: { reason: "unknown_item" } }));
    // Unknown price never becomes zero: the item cannot be bought until the shop sets its price.
    if (item.unitMinor === null) {
      return refuse(appError("validation_failed", `${item.name} has no price yet, so it cannot be bought.`, { details: { reason: "price_unknown" } }));
    }
    if (item.available === false) {
      return refuse(appError("validation_failed", `${item.name} is not available.`, { details: { reason: "unavailable" } }));
    }
    const unit = money(currency, item.unitMinor);
    lines.push({ menuItemId: item.id, name: item.name, quantity: line.quantity, unitMinor: unit.minor, lineMinor: multiply(unit, line.quantity).minor });
  }

  // Each item's key across revisions, read from the same published revision as its price.
  const keys = await db
    .select({ id: menuItems.id, itemKey: menuItems.itemKey })
    .from(menuItems)
    .where(and(eq(menuItems.menuRevisionId, menu.menuRevisionId), inArray(menuItems.id, lines.map((line) => line.menuItemId))));
  const keyOf = new Map(keys.map((row) => [row.id, row.itemKey]));
  const lockLines = lines.map((line) => {
    const itemKey = keyOf.get(line.menuItemId);
    if (itemKey === undefined) throw new Error("a priced item has no key in its own revision");
    return { itemKey, quantity: line.quantity };
  });

  const [destination] = await db
    .select({ id: paymentDestinations.id, version: paymentDestinations.version })
    .from(paymentDestinations)
    .where(and(eq(paymentDestinations.outletId, menu.outlet.id), eq(paymentDestinations.rail, input.rail), eq(paymentDestinations.status, "active")))
    .limit(1);
  if (!destination) {
    return input.rail === "paypal"
      ? refuse(appError("validation_failed", "This shop has no PayPal sandbox seller connected yet.", { details: { reason: "no_destination" } }))
      : refuse(appError("pyusd_unavailable", "This shop has not connected a PYUSD devnet wallet.", { details: { reason: "no_destination" } }));
  }
  const total = sum(currency, lines.map((line) => money(currency, line.lineMinor)));
  const totalMinor = total.minor;

  let pyusd: PyusdQuote | null = null;
  if (input.rail === "pyusd") {
    const rate = await latestPyusdRate(db, menu.outlet.id);
    if (!rate) return refuse(appError("pyusd_unavailable", "This shop has not set a PYUSD rate.", { details: { reason: "no_rate" } }));
    if (isRateExpired(rate, input.now)) {
      return refuse(appError("rate_expired", "This shop's PYUSD rate is more than 30 days old, so PYUSD is unavailable here until the shop confirms it again.", { details: { reason: "rate_expired" } }));
    }
    pyusd = { rateVersionId: rate.versionId, atomicPerSgd: rate.atomicPerSgd, rateConfirmedAt: rate.confirmedAt, atomicAmount: pyusdAtomicFor(total, rate.atomicPerSgd) };
  }

  return {
    ok: true,
    outletId: menu.outlet.id,
    rail: input.rail,
    lines,
    lockLines,
    totalMinor,
    currency,
    menuRevisionId: menu.menuRevisionId,
    destinationId: destination.id,
    destinationVersion: destination.version,
    provenance: input.rail === "pyusd" ? PYUSD_PROVENANCE : PAYPAL_PROVENANCE,
    pricedAt: input.now,
    pyusd,
  };
}
