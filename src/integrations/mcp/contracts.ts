import { z } from "zod";
import { purchaseRequestShape } from "../../domain/handoffs/input";

export const TEST_NOTICE = "Envoi test environment: demo fixture shops and PayPal sandbox test money only. No real money moves.";

const currency = z.enum(["SGD", "USD"]);
const outlet = z.object({
  id: z.string(), name: z.string(), area: z.string(), isDemoFixture: z.boolean(),
  country: z.enum(["SG", "US"]), currency, label: z.string().nullable(),
});

export const outputSchemas = {
  search_outlets: z.object({ notice: z.string(), outlets: z.array(outlet) }),
  get_menu: z.object({
    notice: z.string(), outlet, currency,
    items: z.array(z.object({
      id: z.string(), name: z.string(), unitMinor: z.number().int().min(1).nullable(),
      currency, available: z.boolean().nullable(),
    })),
  }).refine((menu) => menu.outlet.currency === menu.currency && menu.items.every((item) => item.currency === menu.currency), "Every menu price must use the menu currency"),
  create_purchase_request: z.object({ notice: z.string(), url: z.string().url(), expiresAt: z.string().datetime(), forTheBuyer: z.string() }),
};

// Shared by the production route and the real MCP server used by fixture tests.
export const envoiTools = {
  search_outlets: {
    title: "Search Envoi shops",
    description: `Find published Envoi shops by area or shop name. ${TEST_NOTICE}`,
    inputSchema: z.object({ area: z.string().max(80).optional().describe("Area, for example Tanjong Pagar"), name: z.string().max(80).optional().describe("Shop name") }),
    outputSchema: outputSchemas.search_outlets,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  get_menu: {
    title: "Read a shop's menu",
    description: `Read the published menu of one Envoi shop. Prices are for reference; Envoi prices the basket again when the buyer reviews it. ${TEST_NOTICE}`,
    inputSchema: z.object({ outletId: z.string().min(1).max(64).describe("Outlet id from search_outlets") }),
    outputSchema: outputSchemas.get_menu,
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  create_purchase_request: {
    title: "Propose a basket to the buyer",
    description: `Propose items from one shop and get a one-time link, valid for 10 minutes. The buyer reviews Envoi's own price and approves payment themselves. ${TEST_NOTICE}`,
    inputSchema: z.object(purchaseRequestShape),
    outputSchema: outputSchemas.create_purchase_request,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
};

export type EnvoiTool = keyof typeof envoiTools;
export type ToolArguments = { [K in EnvoiTool]: z.infer<typeof envoiTools[K]["inputSchema"]> };
export type ToolAnswers = { [K in EnvoiTool]: z.infer<typeof outputSchemas[K]> };
