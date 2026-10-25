import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { error2Schema, type Error2 } from "./error2.js";

export type UnauthorizedResponse = {
  /** Always false on an error answer. */
  ok: boolean;
  error: Error2;
};

export const unauthorizedResponseSchema: Schema<UnauthorizedResponse> = s.object<UnauthorizedResponse>({
  ok: s.boolean(),
  error: error2Schema,
});
