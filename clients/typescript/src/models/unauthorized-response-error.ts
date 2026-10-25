import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { error2Schema, type Error2 } from "./error2.js";

export type UnauthorizedResponseError = {
  /** Always false on an error answer. */
  ok: boolean;
  error: Error2;
};

export const unauthorizedResponseErrorSchema: Schema<UnauthorizedResponseError> =
  s.object<UnauthorizedResponseError>({
    ok: s.boolean(),
    error: error2Schema,
  });
