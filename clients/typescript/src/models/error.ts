import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type Error = {
  /** @default "not_found" */
  code?: "not_found";
  message: string;
  /** False: repeating the same request gives the same answer. */
  retryable: boolean;
  details: Record<string, unknown>;
};

export const errorSchema: Schema<Error> = s.object<Error>({
  code: s.defaulted(s.literal("not_found"), "not_found"),
  message: s.string(),
  retryable: s.boolean(),
  details: s.record(s.string(), s.unknown()),
});
