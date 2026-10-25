import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { error1Schema, type Error1 } from "./error1.js";

export type ValidationFailedResponse = {
  /** Always false on an error answer. */
  ok: boolean;
  error: Error1;
};

export const validationFailedResponseSchema: Schema<ValidationFailedResponse> =
  s.object<ValidationFailedResponse>({
    ok: s.boolean(),
    error: error1Schema,
  });
