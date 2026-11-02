import { z } from "zod";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { envoiTools, TEST_NOTICE } from "@/integrations/mcp/contracts";

// FIXTURE: real McpServer and tool definitions over in-memory transport. The fetch adapter only
// bridges JSON-RPC, so the production HTTP client runs without a network or deployment.
export const FIXTURE_BASE_URL = "https://fixture.envoi.test";
export const FIXTURE_AGENT_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
export const FIXTURE_LINK_TOKEN = "fixturelinktokenfixturelinktokenfixturelinktokenab";
export const FIXTURE_LINK = `${FIXTURE_BASE_URL}/approve/${FIXTURE_LINK_TOKEN}`;
export const FIXTURE_EXPIRES_AT = "2026-10-28T03:10:00.000Z";
export const TEST_SHOP = { id: "out_fixturetestshop", name: "FIXTURE Test Shop", area: "Test Area", isDemoFixture: true, country: "SG", currency: "SGD", label: "Demo fixture shop, not a real merchant" };
export const OTHER_SHOP = { ...TEST_SHOP, id: "out_fixtureothershop", name: "FIXTURE Other Shop", area: "Other Area" };
export const US_SHOP = { ...TEST_SHOP, id: "out_fixtureusshop", name: "FIXTURE US Shop", country: "US", currency: "USD" };
export const MENUS: Record<string, { id: string; name: string; unitMinor: number | null; available: boolean | null }[]> = {
  [TEST_SHOP.id]: [
    { id: "itm_kopic", name: "Kopi C", unitMinor: 180, available: true },
    { id: "itm_kaya", name: "Kaya toast set", unitMinor: 450, available: false },
    { id: "itm_lemontea", name: "Iced lemon tea", unitMinor: 220, available: true },
    { id: "itm_milktea", name: "Iced milk tea", unitMinor: 250, available: true },
  ],
  [OTHER_SHOP.id]: [{ id: "itm_otherkopi", name: "Kopi O", unitMinor: 160, available: true }],
  [US_SHOP.id]: [{ id: "itm_uscoffee", name: "FIXTURE Coffee", unitMinor: 1295, available: true }],
};
export type FakeEnvoiRequest = { method: string; path: string; tool: string; headers: Headers; body: unknown };
export type FakeEnvoiApi = { fetch: typeof globalThis.fetch; requests: FakeEnvoiRequest[] };
type Options = { corrupt?: (tool: string, answer: Record<string, unknown>) => Record<string, unknown>; discoverSchemas?: boolean };

export function createFakeEnvoiApi(options: Options = {}): FakeEnvoiApi {
  const requests: FakeEnvoiRequest[] = [];
  const shops = [TEST_SHOP, OTHER_SHOP, US_SHOP];
  const json = (value: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== `${FIXTURE_BASE_URL}/mcp`) throw new Error("FIXTURE fake MCP refuses an unexpected URL");
    if (request.headers.get("authorization") !== `Bearer ${FIXTURE_AGENT_TOKEN}`) return Response.json({}, { status: 401 });
    const message = JSONRPCMessageSchema.parse(await request.json());
    const tool = "method" in message && message.method === "tools/call" ? String(message.params?.name) : null;
    if (tool) requests.push({ method: request.method, path: "/mcp", tool, headers: request.headers, body: "params" in message ? message.params?.arguments : null });
    const server = new McpServer({ name: "FIXTURE-envoi", version: "1.0.0" });
    server.registerTool("search_outlets", envoiTools.search_outlets, async () => json({ notice: TEST_NOTICE, outlets: shops }));
    server.registerTool("get_menu", envoiTools.get_menu, async ({ outletId }) => {
      const outlet = shops.find((shop) => shop.id === outletId);
      if (!outlet) return { isError: true, content: [{ type: "text", text: JSON.stringify({ code: "not_found", message: "FIXTURE shop not found" }) }] };
      return json({ notice: TEST_NOTICE, outlet, currency: outlet.currency, items: MENUS[outlet.id]!.map((item) => ({ ...item, currency: outlet.currency })) });
    });
    server.registerTool("create_purchase_request", envoiTools.create_purchase_request, async ({ lines }) => {
      if (lines.some((line) => line.quantity < 1 || line.quantity > 20)) return { isError: true, content: [{ type: "text", text: JSON.stringify({ code: "validation_failed", message: "FIXTURE quantity outside 1-20" }) }] };
      return json({ notice: TEST_NOTICE, url: FIXTURE_LINK, expiresAt: FIXTURE_EXPIRES_AT, forTheBuyer: "FIXTURE: review and approve test money yourself." });
    });
    const [wire, service] = InMemoryTransport.createLinkedPair();
    await server.connect(service);
    try {
      const answer = new Promise<JSONRPCMessage>((resolve) => { wire.onmessage = resolve; });
      await wire.start();
      await wire.send(message);
      if (!("id" in message)) return new Response(null, { status: 202 });
      const reply = await answer;
      if ("result" in reply && tool && options.corrupt) {
        const value = z.record(z.string(), z.unknown()).safeParse(reply.result.structuredContent);
        if (value.success) reply.result.structuredContent = options.corrupt(tool, value.data);
      }
      if ("result" in reply && "method" in message && message.method === "tools/list" && options.discoverSchemas === false) {
        const listed = reply.result.tools;
        if (Array.isArray(listed)) for (const definition of listed) delete definition.outputSchema;
      }
      return Response.json(reply);
    } finally {
      await wire.close();
      await server.close();
    }
  };
  return { fetch, requests };
}
