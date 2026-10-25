import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { reasonSchema, type Reason } from "./reason.js";

export type Details = {
  /**
   * Present when Envoi can name the problem: a body too large, too slow or aborted; or the basket's
   * line count, a repeated item, a quantity, an unknown, unpriced or unavailable item, or no
   * connected PayPal sandbox seller.
   */
  reason?: Reason;
};

export const detailsSchema: Schema<Details> = s.object<Details>({
  reason: s.optional(s.lazy(() => reasonSchema)),
});
