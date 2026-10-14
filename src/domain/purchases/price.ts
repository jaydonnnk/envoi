import { and, eq } from "drizzle-orm";
import { getPublishedMenu } from "@/domain/outlets/search";
import { isValidQuantity, MAX_QUANTITY, type PurchaseLine, type RailId } from "@/domain/purchases/checkout-key";
import { paymentDestinations } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { multiplySgd, sgdFromCents, sumSgd, type SgdCents } from "@/lib/money";

// Server pricing (Gate 3, Purchases). Prices come only from the outlet's published, confirmed
// revision; the client sends item ids and quantities, never a price, payee or total.

export type PricedLine = { menuItemId: string; name: string; quantity: number; unitSgdCents: SgdCents; lineSgdCents: SgdCents };

export type CostProvenance = {
  payerFee: { amountSgdCents: SgdCents | null; payer: "buyer" | "merchant" | "unknown"; basis: string; quotedAt: Date | null };
  merchantFee: { amountSgdCents: SgdCents | null; basis: string };
  fx: { known: false };
};

export type PriceQuote =
  | {
      ok: true;
      // outletId, rail and destinationVersion are not in Gate 3's PriceQuote; createReview needs them
      // to compute the CheckoutKey and pin the destination version, so the quote carries them.
      outletId: string;
      rail: RailId;
      lines: PricedLine[];
      totalSgdCents: SgdCents;
      currency: "SGD";
      menuRevisionId: string;
      destinationId: string;
      destinationVersion: number;
      provenance: CostProvenance;
      pricedAt: Date;
      pyusd: null;
    }
  | { ok: false; error: AppError };

export const MAX_LINES = 20;

const PAYPAL_PROVENANCE: CostProvenance = {
  payerFee: { amountSgdCents: null, payer: "unknown", basis: "Funding currency and any conversion are confirmed in PayPal.", quotedAt: null },
  merchantFee: { amountSgdCents: null, basis: "Merchant fees are separate from the basket price and are not quoted." },
  fx: { known: false },
};

const refuse = (error: AppError): PriceQuote => ({ ok: false, error });

export async function priceBasket(db: Pick<Db, "select">, input: { outletId: string; lines: readonly PurchaseLine[]; rail: RailId; now: Date }): Promise<PriceQuote> {
  // Only PayPal exists before S16 (D8): the same answer Gate 3 gives while PYUSD is switched off.
  if (input.rail !== "paypal") {
    return refuse(appError("pyusd_unavailable", "PYUSD has not passed its tests yet.", { details: { reason: "rail_disabled" } }));
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

  const items = new Map(menu.items.map((item) => [item.id, item]));
  const lines: PricedLine[] = [];
  for (const line of input.lines) {
    const item = items.get(line.menuItemId);
    if (!item) return refuse(appError("validation_failed", "An item is not on the shop's current menu.", { details: { reason: "unknown_item" } }));
    // Unknown price never becomes zero: the item cannot be bought until the shop sets its price.
    if (item.unitSgdCents === null) {
      return refuse(appError("validation_failed", `${item.name} has no price yet, so it cannot be bought.`, { details: { reason: "price_unknown" } }));
    }
    if (item.available === false) {
      return refuse(appError("validation_failed", `${item.name} is not available.`, { details: { reason: "unavailable" } }));
    }
    const unit = sgdFromCents(item.unitSgdCents);
    lines.push({ menuItemId: item.id, name: item.name, quantity: line.quantity, unitSgdCents: unit, lineSgdCents: multiplySgd(unit, line.quantity) });
  }

  const [destination] = await db
    .select({ id: paymentDestinations.id, version: paymentDestinations.version })
    .from(paymentDestinations)
    .where(and(eq(paymentDestinations.outletId, menu.outlet.id), eq(paymentDestinations.rail, "paypal"), eq(paymentDestinations.status, "active")))
    .limit(1);
  if (!destination) {
    return refuse(appError("validation_failed", "This shop has no PayPal sandbox seller connected yet.", { details: { reason: "no_destination" } }));
  }

  return {
    ok: true,
    outletId: menu.outlet.id,
    rail: "paypal",
    lines,
    totalSgdCents: sumSgd(lines.map((line) => line.lineSgdCents)),
    currency: "SGD",
    menuRevisionId: menu.menuRevisionId,
    destinationId: destination.id,
    destinationVersion: destination.version,
    provenance: PAYPAL_PROVENANCE,
    pricedAt: input.now,
    pyusd: null,
  };
}
