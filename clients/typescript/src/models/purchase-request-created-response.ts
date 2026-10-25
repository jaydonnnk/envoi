import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { purchaseRequestCreatedSchema, type PurchaseRequestCreated } from "./purchase-request-created.js";

export type PurchaseRequestCreatedResponse = {
  /** Always true on a 201 answer. */
  ok: boolean;
  data: PurchaseRequestCreated;
};

export const purchaseRequestCreatedResponseSchema: Schema<PurchaseRequestCreatedResponse> =
  s.object<PurchaseRequestCreatedResponse>({
    ok: s.boolean(),
    data: purchaseRequestCreatedSchema,
  });
