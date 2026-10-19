import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { errorSchema, type Error } from "./error.js";

export type NotFoundResponseError = {
  /** Always false on an error answer. */
  ok: boolean;
  error: Error;
};

export const notFoundResponseErrorSchema: Schema<NotFoundResponseError> = s.object<NotFoundResponseError>({
  ok: s.boolean(),
  error: errorSchema,
});
