import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { PAYPAL_SANDBOX_API_BASE } from "./client";

// PayPal's hosted MCP server for the merchant copilot (S45, Gate 2 "Flow: copilot turn" steps 4, 5
// and 8). Envoi connects over SSE at /sse with a Bearer token from the labeled demo seller's own
// client credentials; Streamable HTTP answered Not Found there [verified 2026-11-07]. The host is a
// sandbox-only code constant, never a setting.
//
// Only ALLOWED_PAYPAL_TOOLS can be called, and only when the server also lists them. Every write
// tool the server offers, such as pay_order, create_order and create_refund, is refused here before
// anything leaves Envoi (R-F3). The payer's name, email, account id, phone and address are removed
// from every result before it is returned, so the model never sees them.

export const PAYPAL_MCP_HOST = "https://mcp.sandbox.paypal.com";

// get_merchant_insights is left out: PayPal answers that it is not supported in sandbox [verified
// 2026-11-07].
export const ALLOWED_PAYPAL_TOOLS = ["get_order", "list_transactions", "list_disputes", "get_dispute"] as const;
export type AllowedPayPalTool = (typeof ALLOWED_PAYPAL_TOOLS)[number];

// status is PayPal's HTTP status as the tool reported it, or null when no answer arrived.
export type ToolAnswer = { ok: true; data: unknown; status: number } | { ok: false; error: string; status: number | null };

export type PayPalTools = {
  // The allowed tools this server also lists.
  names: readonly AllowedPayPalTool[];
  call(name: AllowedPayPalTool, args: unknown, signal: AbortSignal): Promise<ToolAnswer>;
  close(): Promise<void>;
};

const CONNECT_TIMEOUT_MS = 15_000;

export const isAllowedPayPalTool = (name: string): name is AllowedPayPalTool => (ALLOWED_PAYPAL_TOOLS as readonly string[]).includes(name);

// Keys that name or reach the payer. A whole object under one of these is dropped; `name` is dropped
// only when it is an object (a person's name), so item names stay.
const PAYER_KEYS = new Set([
  "payer",
  "payer_info",
  "payment_source",
  "shipping",
  "shipping_info",
  "email_address",
  "email",
  "account_id",
  "paypal_account_id",
  "payer_id",
  "phone",
  "phone_number",
  "phone_type",
  "address",
  "full_name",
  "given_name",
  "surname",
  "alternate_full_name",
  "buyer",
]);

export function redactPayer(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayer);
  if (typeof value !== "object" || value === null) return value;
  const kept: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (PAYER_KEYS.has(key)) continue;
    if (key === "name" && typeof inner === "object" && inner !== null) continue;
    kept[key] = redactPayer(inner);
  }
  return kept;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// An expired or refused token does not fail the transport: the tool answers a normal result whose
// text is {"ok":false,"status":401,"code":"PAYPAL_API_HTTP_ERROR",...} [verified 2026-11-07].
type Read = { kind: "data"; data: unknown } | { kind: "error"; status: number | null; code: string } | { kind: "unreadable" };

function readResult(result: { content: { type: string; text?: string }[]; isError?: boolean }): Read {
  const text = result.content.find((item) => item.type === "text")?.text;
  const parsed = typeof text === "string" ? parseJson(text) : undefined;
  if (typeof parsed !== "object" || parsed === null) return { kind: "unreadable" };
  const reported = parsed as { ok?: unknown; status?: unknown; code?: unknown };
  const status = typeof reported.status === "number" ? reported.status : null;
  if (result.isError || reported.ok === false || (status !== null && status >= 400)) {
    return { kind: "error", status, code: typeof reported.code === "string" && /^[A-Z0-9_]{1,64}$/.test(reported.code) ? reported.code : "PAYPAL_TOOL_ERROR" };
  }
  return { kind: "data", data: parsed };
}

type Session = { client: Client; listed: ReadonlySet<string> };

async function open(bearer: string, requestFetch: typeof globalThis.fetch): Promise<Session> {
  const transport = new SSEClientTransport(new URL(`${PAYPAL_MCP_HOST}/sse`), {
    requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    fetch: requestFetch,
  });
  const client = new Client({ name: "envoi-merchant-copilot", version: "1.0.0" });
  const signal = AbortSignal.timeout(CONNECT_TIMEOUT_MS);
  try {
    await client.connect(transport, { signal });
    const { tools } = await client.listTools({}, { signal });
    return { client, listed: new Set(tools.map((tool) => tool.name)) };
  } catch (error) {
    await client.close();
    throw error;
  }
}

const unauthorizedAtConnect = (error: unknown) => error instanceof SseError && error.code === 401;

// One connection for one copilot turn. token() must return a fresh token each time it is called: a
// 401, at connect or inside a tool result, refreshes it once and retries once, and a second 401
// answers `unauthorized`, which ends the turn.
export async function connectPayPalTools(token: () => Promise<string>, requestFetch: typeof globalThis.fetch = globalThis.fetch): Promise<PayPalTools> {
  let refreshed = false;
  let session: Session;
  try {
    session = await open(await token(), requestFetch);
  } catch (error) {
    if (!unauthorizedAtConnect(error)) throw error;
    refreshed = true;
    session = await open(await token(), requestFetch);
  }

  async function refresh(): Promise<void> {
    refreshed = true;
    await session.client.close();
    session = await open(await token(), requestFetch);
  }

  async function callOnce(name: AllowedPayPalTool, args: unknown, signal: AbortSignal): Promise<Read> {
    const result = CallToolResultSchema.parse(await session.client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> }, CallToolResultSchema, { signal }));
    return readResult(result as { content: { type: string; text?: string }[]; isError?: boolean });
  }

  return {
    names: ALLOWED_PAYPAL_TOOLS.filter((name) => session.listed.has(name)),
    async call(name, args, signal) {
      // The allow-list is checked here, at the only call site, so a name the model or a caller made
      // up never reaches the transport, whatever the server lists.
      if (!isAllowedPayPalTool(name) || !session.listed.has(name)) return { ok: false, error: "not_allowed", status: null };
      try {
        let read = await callOnce(name, args, signal);
        if (read.kind === "error" && read.status === 401) {
          if (refreshed) return { ok: false, error: "unauthorized", status: 401 };
          await refresh();
          read = await callOnce(name, args, signal);
          if (read.kind === "error" && read.status === 401) return { ok: false, error: "unauthorized", status: 401 };
        }
        if (read.kind === "unreadable") return { ok: false, error: "unreadable_answer", status: null };
        if (read.kind === "error") return { ok: false, error: read.code, status: read.status };
        return { ok: true, data: redactPayer(read.data), status: 200 };
      } catch (error) {
        if (unauthorizedAtConnect(error)) return { ok: false, error: "unauthorized", status: 401 };
        return { ok: false, error: "unreachable", status: null };
      }
    },
    close: () => session.client.close(),
  };
}

// A fresh client-credentials token for the demo seller's sandbox app on every call, so a refresh is
// a real one. The API host is the reviewed sandbox constant; the token never reaches a log.
export function demoSellerToken(credentials: { clientId: string; clientSecret: string }, requestFetch: typeof globalThis.fetch = globalThis.fetch): () => Promise<string> {
  return async () => {
    const response = await requestFetch(`${PAYPAL_SANDBOX_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
    if (!response.ok || typeof body?.access_token !== "string") throw new Error(`PayPal token request answered ${response.status}`);
    return body.access_token;
  };
}
