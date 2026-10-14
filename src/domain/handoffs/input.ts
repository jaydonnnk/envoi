import { z } from "zod";
import { MAX_LINES } from "@/domain/purchases/price";

// The one boundary schema for an agent's proposal, shared by POST /purchase-requests and the MCP
// create_purchase_request tool. Unknown fields, such as a price, total or payee, are dropped here
// and never reach pricing or storage.
export const purchaseRequestShape = {
  outletId: z.string().min(1).max(64).describe("Outlet id from search_outlets"),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().min(1).max(64).describe("Item id from get_menu"),
        quantity: z.number().int().describe("Whole number from 1 to 20"),
      }),
    )
    .min(1)
    .max(MAX_LINES),
};

export const purchaseRequestBody = z.object(purchaseRequestShape);

export const redeemBody = z.object({ token: z.string().min(1).max(128) });

// Agent and redeem bodies are small: [hypothesis] 4 KiB read within 5 s, as for suggestions.
export const HANDOFF_BODY_BYTES = 4_096;
export const HANDOFF_BODY_READ_MS = 5_000;

export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
