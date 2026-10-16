import { z } from "zod";
import { MENU_LIMITS } from "@/domain/menu/types";
import { OUTLET_LIMITS } from "@/domain/outlets/merchant";
import { SGQR_MAX_PAYLOAD_CHARS } from "@/domain/sgqr/decode";

// Request bodies for the merchant routes. Any field not named here, such as a published flag,
// membership or price basis, is dropped before the domain sees the request.

const text = (max: number) => z.string().trim().max(max);

export const outletBody = z.object({
  name: text(OUTLET_LIMITS.maxTextChars).min(1),
  area: text(OUTLET_LIMITS.maxTextChars).min(1),
});

// S7: saving with detailsConfirmed true confirms exactly these details; without it, any earlier
// confirmation is cleared.
export const outletUpdateBody = outletBody.extend({ detailsConfirmed: z.boolean().default(false) });

// S9: an identifier submission through the same edit route. It carries no name or area, and a body
// that mixes the two is refused rather than half applied. The payload is the decoded sticker text,
// present only when the merchant decoded one; it is never stored or logged.
export const identifierBody = z
  .object({
    identifier: z
      .object({
        scheme: z.enum(["paynow_uen", "paynow_proxy"]),
        identifier: z.string().trim().min(1).max(32),
        distinguisher: text(OUTLET_LIMITS.maxTextChars).min(1),
        payload: z.string().min(1).max(SGQR_MAX_PAYLOAD_CHARS).nullable(),
      })
      .strict(),
  })
  .strict();

const id = z.string().min(1).max(64);

const item = z.object({
  id: id.optional(),
  name: text(MENU_LIMITS.maxTextChars),
  // An empty portion is no portion.
  portion: text(MENU_LIMITS.maxTextChars)
    .nullable()
    .transform((value) => (value ? value : null)),
  // Whole cents above zero, or null when the merchant has not supplied a price. Zero is refused,
  // so a missing price can never be saved as free.
  priceSgdCents: z.number().int().min(1).max(MENU_LIMITS.maxPriceSgdCents).nullable(),
  availability: z.enum(["available", "unavailable", "unknown"]),
});

export const draftBody = z.object({
  revisionId: id,
  version: z.number().int().min(1),
  items: z.array(item).max(MENU_LIMITS.maxItems),
});

export const confirmBody = z.object({ revisionId: id, version: z.number().int().min(1) });

// The merchant names the seller id of the connection it selects; only the operator-prepared one is
// accepted. Nothing else in the body is read.
export const paypalConnectionBody = z.object({ sellerMerchantId: z.string().trim().min(1).max(64) });
