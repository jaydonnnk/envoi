import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type PurchaseLine = {
  /** An item id from getOutletMenu. */
  menuItemId: string;
  /** Whole number from 1 to 20. */
  quantity: number;
};

export const purchaseLineSchema: Schema<PurchaseLine> = s.object<PurchaseLine>({
  menuItemId: s.string(),
  quantity: s.int(),
});
