import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { menuItemSchema, type MenuItem } from "./menu-item.js";
import { outletSummarySchema, type OutletSummary } from "./outlet-summary.js";

export type Menu = {
  outlet: OutletSummary;
  menuRevisionId: string;
  items: MenuItem[];
};

export const menuSchema: Schema<Menu> = s.object<Menu>({
  outlet: outletSummarySchema,
  menuRevisionId: s.string(),
  items: s.array(s.lazy(() => menuItemSchema)),
});
