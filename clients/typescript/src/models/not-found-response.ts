import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { errorSchema, type Error } from "./error.js";

export type NotFoundResponse = {
  /** Always false on an error answer. */
  ok: boolean;
  error: Error;
};

export const notFoundResponseSchema: Schema<NotFoundResponse> = s.object<NotFoundResponse>({
  ok: s.boolean(),
  error: errorSchema,
});
