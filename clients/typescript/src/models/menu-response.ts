import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { menuSchema, type Menu } from "./menu.js";

export type MenuResponse = {
  /** Always true on a 200 answer. */
  ok: boolean;
  data: Menu;
};

export const menuResponseSchema: Schema<MenuResponse> = s.object<MenuResponse>({
  ok: s.boolean(),
  data: menuSchema,
});
