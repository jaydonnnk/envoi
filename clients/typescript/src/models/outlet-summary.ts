import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type OutletSummary = {
  id: string;
  name: string;
  area: string;
  /** True for a seeded demo fixture shop, which is not a real business. */
  isDemoFixture: boolean;
};

export const outletSummarySchema: Schema<OutletSummary> = s.object<OutletSummary>({
  id: s.string(),
  name: s.string(),
  area: s.string(),
  isDemoFixture: s.boolean(),
});
