import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { parseJsonBytes } from "@/domain/handoffs/input";
import { createPurchaseRequest } from "@/domain/handoffs/redeem";
import { searchRegistry } from "@/domain/handoffs/registry";
import { getPublishedMenu } from "@/domain/outlets/search";
import { envoiTools, TEST_NOTICE } from "@/integrations/mcp/contracts";
import { webEnv } from "@/env";
import { bearerOf, isAgent, requireAgentToken, type AgentPrincipal } from "@/lib/auth-context";
import { webDb, type Db } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr } from "@/lib/http/respond";
import { hashToken } from "@/lib/ids";
import { log } from "@/lib/log";
import { admit, AGENT_MCP_LIMITS, SITE_ASSISTANT_MCP_LIMITS, type RateLimits } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Streamable HTTP MCP endpoint (Gate 2 "/mcp"; Gate 3 HTTP surface): POST only, stateless JSON
// responses, three scoped tools. A scoped agent token may search the public registry, read a
// published menu and propose a basket for a human to redeem. No tool pays, reads a receipt, writes
// a menu or reveals a destination.

// [hypothesis] A tool call with 20 lines is about 2 KiB; 16 KiB read within 5 s leaves room for a
// client's initialize message.
const MAX_BODY_BYTES = 16_384;
const BODY_READ_MS = 5_000;

const INSTRUCTIONS = [
  TEST_NOTICE,
  "Use search_outlets to find a shop, get_menu to read its published items, then create_purchase_request to get a link for the buyer.",
  "The link works once and expires 10 minutes after it is created. The buyer opens it, reviews the price Envoi calculates and approves payment themselves.",
  "You cannot pay, approve a payment or read a receipt.",
].join(" ");

const METHOD_NOT_ALLOWED = { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null } as const;

function methodNotAllowed(): Response {
  return Response.json(METHOD_NOT_ALLOWED, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

// No server-to-client stream and no session to delete: GET and DELETE are refused (Gate 2).
export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}

// Requests from a browser page must come from Envoi itself (MCP transport security: DNS
// rebinding). Clients that are not browsers send no Origin. The Host must be Envoi's own.
function sameSite(request: Request): "ok" | "origin" | "host" {
  const base = new URL(webEnv().APP_BASE_URL);
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== base.origin) return "origin";
  if (request.headers.get("host") !== base.host) return "host";
  return "ok";
}

// Every token is limited. Only the site's own Ask Envoi token, shared by all buyers, gets the larger
// allowance; digests are compared so no token value is compared directly.
function limitsFor(headers: Headers): RateLimits {
  const site = webEnv().ASSISTANT_AGENT_TOKEN;
  const presented = bearerOf(headers);
  return site && presented && hashToken(presented) === hashToken(site) ? SITE_ASSISTANT_MCP_LIMITS : AGENT_MCP_LIMITS;
}

function json(value: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function toolError(code: string, message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ code, message }) }], isError: true };
}

function outletView(outlet: { id: string; name: string; area: string; isDemoFixture: boolean }) {
  return { ...outlet, label: outlet.isDemoFixture ? "Demo fixture shop, not a real merchant" : null };
}

function agentServer(db: Db, agent: AgentPrincipal): McpServer {
  const server = new McpServer({ name: "envoi", version: "0.13.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "search_outlets",
    envoiTools.search_outlets,
    async ({ area, name }) => {
      const outlets = await searchRegistry(db, { area, name });
      log("info", "mcp_tool", { tool: "search_outlets", agentTokenId: agent.agentTokenId, results: outlets.length });
      return json({ notice: TEST_NOTICE, outlets: outlets.map(outletView) });
    },
  );

  server.registerTool(
    "get_menu",
    envoiTools.get_menu,
    async ({ outletId }) => {
      const menu = await getPublishedMenu(db, outletId);
      log("info", "mcp_tool", { tool: "get_menu", agentTokenId: agent.agentTokenId, found: menu !== null });
      if (!menu) return toolError("not_found", "That shop is not on Envoi.");
      return json({
        notice: TEST_NOTICE,
        outlet: outletView(menu.outlet),
        currency: menu.currency,
        // The currency sits beside every price, so no agent reads a USD price as SGD (S27).
        items: menu.items.map((item) => ({ id: item.id, name: item.name, unitMinor: item.unitMinor, currency: menu.currency, available: item.available })),
      });
    },
  );

  server.registerTool(
    "create_purchase_request",
    envoiTools.create_purchase_request,
    async (input) => {
      const created = await createPurchaseRequest(db, agent, input, new Date());
      log("info", "mcp_tool", { tool: "create_purchase_request", agentTokenId: agent.agentTokenId, outcome: created.kind });
      if (created.kind === "refused") return toolError(created.error.code, created.error.message);
      return json({
        notice: TEST_NOTICE,
        url: created.url,
        expiresAt: created.expiresAt.toISOString(),
        forTheBuyer: "Open this link on your phone. It works once and expires in 10 minutes. Envoi shows the price; you approve the payment in PayPal sandbox yourself.",
      });
    },
  );

  return server;
}

export async function POST(request: Request): Promise<Response> {
  const db = webDb();
  const agent = await requireAgentToken(db, request.headers);
  if (!isAgent(agent)) return httpErr(agent);

  const site = sameSite(request);
  if (site !== "ok") return httpErr(appError("forbidden_origin", "This request did not come from an allowed origin.", { details: { reason: site } }));

  // Before the body is read, so an agent over its limit reaches no tool and costs no parsing.
  const admission = await admit(db, "agent_mcp", agent.agentTokenId, limitsFor(request.headers), new Date());
  if (admission.kind === "rate_limited") {
    log("warn", "mcp_rate_limited", { agentTokenId: agent.agentTokenId });
    return httpErr(appError("rate_limited", "This agent token has reached its limit. Try again in 10 minutes.", { retryable: true, details: { window: admission.window } }));
  }

  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr(appError("validation_failed", "The MCP request body is too large or too slow.", { details: { reason: read.reason } }));
  const parsedBody = parseJsonBytes(read.bytes);
  if (parsedBody === null) {
    return Response.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error." }, id: null }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const server = agentServer(db, agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}
