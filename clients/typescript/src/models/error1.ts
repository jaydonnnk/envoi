import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { detailsSchema, type Details } from "./details.js";

export type Error1 = {
  /** @default "validation_failed" */
  code?: "validation_failed";
  message: string;
  /** False: the same body gives the same answer until the body or the shop's menu changes. */
  retryable: boolean;
  details: Details;
};

export const error1Schema: Schema<Error1> = s.object<Error1>({
  code: s.defaulted(s.literal("validation_failed"), "validation_failed"),
  message: s.string(),
  retryable: s.boolean(),
  details: detailsSchema,
});
