import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type Error2 = {
  /** @default "unauthorized" */
  code?: "unauthorized";
  message: string;
  /** False: send a valid agent token. */
  retryable: boolean;
  details: Record<string, unknown>;
};

export const error2Schema: Schema<Error2> = s.object<Error2>({
  code: s.defaulted(s.literal("unauthorized"), "unauthorized"),
  message: s.string(),
  retryable: s.boolean(),
  details: s.record(s.string(), s.unknown()),
});
