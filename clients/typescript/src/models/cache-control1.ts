import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const CacheControl1 = {
  NoStore: "no-store",
} as const;
export type CacheControl1 = (typeof CacheControl1)[keyof typeof CacheControl1] | (string & {});

export const cacheControl1Schema: EnumSchema<CacheControl1> = s.enumOf<CacheControl1>(CacheControl1);
