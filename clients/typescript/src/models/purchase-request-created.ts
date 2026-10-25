import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type PurchaseRequestCreated = {
  /** The one-time link for the buyer to open. It is not payment authority. */
  url: string;
  /** When the link stops working, as an ISO 8601 UTC time, 10 minutes after it was created. */
  expiresAt: string;
};

export const purchaseRequestCreatedSchema: Schema<PurchaseRequestCreated> = s.object<PurchaseRequestCreated>({
  url: s.string(),
  expiresAt: s.string(),
});
