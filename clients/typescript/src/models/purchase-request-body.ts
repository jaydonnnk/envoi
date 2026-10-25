import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { purchaseLineSchema, type PurchaseLine } from "./purchase-line.js";

export type PurchaseRequestBody = {
  /** A shop id from listOutlets. */
  outletId: string;
  /** 1 to 20 lines, each item at most once. */
  lines: PurchaseLine[];
};

export const purchaseRequestBodySchema: Schema<PurchaseRequestBody> = s.object<PurchaseRequestBody>({
  outletId: s.string(),
  lines: s.array(s.lazy(() => purchaseLineSchema)),
});
