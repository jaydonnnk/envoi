import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const CacheControl = {
  PublicMaxAge30: "public, max-age=30",
} as const;
export type CacheControl = (typeof CacheControl)[keyof typeof CacheControl] | (string & {});

export const cacheControlSchema: EnumSchema<CacheControl> = s.enumOf<CacheControl>(CacheControl);
