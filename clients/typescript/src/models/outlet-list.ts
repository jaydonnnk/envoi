import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { outletSummarySchema, type OutletSummary } from "./outlet-summary.js";

export type OutletList = {
  outlets: OutletSummary[];
};

export const outletListSchema: Schema<OutletList> = s.object<OutletList>({
  outlets: s.array(s.lazy(() => outletSummarySchema)),
});
