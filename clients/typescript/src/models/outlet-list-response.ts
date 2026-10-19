import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { outletListSchema, type OutletList } from "./outlet-list.js";

export type OutletListResponse = {
  /** Always true on a 200 answer. */
  ok: boolean;
  data: OutletList;
};

export const outletListResponseSchema: Schema<OutletListResponse> = s.object<OutletListResponse>({
  ok: s.boolean(),
  data: outletListSchema,
});
