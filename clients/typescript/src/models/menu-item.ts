import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type MenuItem = {
  id: string;
  name: string;
  /**
   * Unit price in Singapore cents, at least 1; null when the price is unknown. A menu is confirmed
   * only with every price known, so a published menu currently never carries null.
   */
  unitSgdCents: number | null;
  /**
   * Merchant-supplied availability; null when unknown. A menu is confirmed only with every
   * availability known, so a published menu currently never carries null.
   */
  available: boolean | null;
};

export const menuItemSchema: Schema<MenuItem> = s.object<MenuItem>({
  id: s.string(),
  name: s.string(),
  unitSgdCents: s.nullable(s.int()),
  available: s.nullable(s.boolean()),
});
