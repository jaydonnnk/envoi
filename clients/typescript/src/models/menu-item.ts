import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type MenuItem = {
  id: string;
  name: string;
  /** Unit price in Singapore cents; null when the price is unknown. */
  unitSgdCents: number | null;
  /** Merchant-supplied availability; null when unknown. */
  available: boolean | null;
};

export const menuItemSchema: Schema<MenuItem> = s.object<MenuItem>({
  id: s.string(),
  name: s.string(),
  unitSgdCents: s.nullable(s.int()),
  available: s.nullable(s.boolean()),
});
