import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/**
 * Present when Envoi can name the problem: a body too large, too slow or aborted; or the basket's
 * line count, a repeated item, a quantity, an unknown, unpriced or unavailable item, or no
 * connected PayPal sandbox seller.
 */
export const Reason = {
  TooLarge: "too_large",
  Timeout: "timeout",
  Aborted: "aborted",
  LineCount: "line_count",
  DuplicateItem: "duplicate_item",
  Quantity: "quantity",
  UnknownItem: "unknown_item",
  PriceUnknown: "price_unknown",
  Unavailable: "unavailable",
  NoDestination: "no_destination",
} as const;
export type Reason = (typeof Reason)[keyof typeof Reason] | (string & {});

export const reasonSchema: EnumSchema<Reason> = s.enumOf<Reason>(Reason);
