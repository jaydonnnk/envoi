// FIXTURE: a fake of PayPal's hosted MCP server and its token endpoint, at the fetch boundary (S45).
// Nothing here talks to PayPal. It speaks the SSE transport the real server answers on [verified
// 2026-11-07]: GET /sse opens a stream whose first event names the message endpoint, and each
// JSON-RPC POST to that endpoint is answered on the stream. Tool results are text holding JSON, and
// an expired token answers {"ok":false,"status":401,...} inside a normal result, as PayPal's does.
// Every token and id it makes is FIXTURE-labeled.

const HOST = "https://mcp.sandbox.paypal.com";
const TOKEN_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token";

// The write tools the real server offers next to the reads [verified 2026-11-07]; Envoi must never
// pass them on.
export const PAYPAL_WRITE_TOOLS = ["pay_order", "create_order", "create_refund", "accept_dispute_claim", "create_invoice", "send_invoice"];
export const PAYPAL_READ_TOOLS = ["get_order", "list_transactions", "list_disputes", "get_dispute", "get_merchant_insights"];

export type McpCall = { name: string; args: Record<string, unknown>; bearer: string };

export type FakePayPalMcp = {
  fetch: typeof globalThis.fetch;
  // Every tools/call that reached the server.
  calls: McpCall[];
  // Every SSE connection opened, with its bearer token.
  connections: string[];
  // Token requests to PayPal's OAuth endpoint.
  tokens(): number;
  // The tool names tools/list answers.
  listed: string[];
  // The JSON a tool answers, or { status: 401 } for an expired token. Defaults to an empty object.
  answer: (call: McpCall) => unknown;
  // The HTTP status of the SSE GET for this bearer; anything but 200 refuses the connection.
  connectStatus: (bearer: string) => number;
};

const encoder = new TextEncoder();
const event = (name: string, data: string) => encoder.encode(`event: ${name}\ndata: ${data}\n\n`);

export function createFakePayPalMcp(): FakePayPalMcp {
  let tokenCount = 0;
  let sessionCount = 0;
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

  const fake: FakePayPalMcp = {
    calls: [],
    connections: [],
    tokens: () => tokenCount,
    listed: [...PAYPAL_READ_TOOLS, ...PAYPAL_WRITE_TOOLS],
    answer: () => ({}),
    connectStatus: () => 200,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (url.href === TOKEN_URL) {
        tokenCount += 1;
        return Response.json({ access_token: `FIXTURE-paypal-token-${tokenCount}`, token_type: "Bearer", expires_in: 32_400 });
      }
      if (url.origin !== HOST) throw new Error(`FIXTURE fake PayPal MCP refuses an unexpected URL: ${url.href}`);
      const bearer = (headers.get("authorization") ?? "").replace(/^Bearer /, "");

      if (url.pathname === "/sse" && (init?.method ?? "GET") === "GET") {
        fake.connections.push(bearer);
        const status = fake.connectStatus(bearer);
        if (status !== 200) return new Response("FIXTURE refused", { status });
        const session = `FIXTURE-session-${++sessionCount}`;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streams.set(session, controller);
            controller.enqueue(event("endpoint", `/messages?sessionId=${session}`));
            init?.signal?.addEventListener("abort", () => {
              streams.delete(session);
              try {
                controller.close();
              } catch {
                // already closed
              }
            });
          },
          cancel() {
            streams.delete(session);
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }

      if (url.pathname === "/messages" && init?.method === "POST") {
        const stream = streams.get(url.searchParams.get("sessionId") ?? "");
        if (!stream) return new Response("FIXTURE no session", { status: 404 });
        const message = JSON.parse(String(init.body)) as { id?: number | string; method: string; params?: Record<string, unknown> };
        const reply = (result: unknown) => queueMicrotask(() => stream.enqueue(event("message", JSON.stringify({ jsonrpc: "2.0", id: message.id, result }))));
        if (message.method === "initialize") {
          reply({ protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "FIXTURE PayPal MCP", version: "0.0.0" } });
        } else if (message.method === "tools/list") {
          reply({ tools: fake.listed.map((name) => ({ name, description: `FIXTURE ${name}`, inputSchema: { type: "object" } })) });
        } else if (message.method === "tools/call") {
          const call: McpCall = { name: String(message.params?.name), args: (message.params?.arguments ?? {}) as Record<string, unknown>, bearer };
          fake.calls.push(call);
          reply({ content: [{ type: "text", text: JSON.stringify(fake.answer(call)) }] });
        } else if (message.id !== undefined) {
          reply({});
        }
        return new Response("Accepted", { status: 202 });
      }
      return new Response("FIXTURE not found", { status: 404 });
    }) as typeof globalThis.fetch,
  };
  return fake;
}

// PayPal's answer to an expired or refused token, inside a normal tool result [verified 2026-11-07].
export const EXPIRED_TOKEN = { ok: false, status: 401, code: "PAYPAL_API_HTTP_ERROR", message: "FIXTURE: the access token has expired" };

// A get_order answer shaped like the sandbox's [verified 2026-11-07 by key shape], with planted
// payer needles that must never reach the model.
export const PAYER_NEEDLES = { email: "needle-payer@buyer.example.test", accountId: "NEEDLEACCT01Z", givenName: "Needlegiven", surname: "Needlesurname" };

export function fixtureOrder(input: { id: string; payee: string; currency: string; value: string; captureId: string | null; description?: string }) {
  return {
    id: input.id,
    intent: "CAPTURE",
    status: input.captureId ? "COMPLETED" : "PAYER_ACTION_REQUIRED",
    payment_source: {
      paypal: {
        email_address: PAYER_NEEDLES.email,
        account_id: PAYER_NEEDLES.accountId,
        account_status: "VERIFIED",
        name: { given_name: PAYER_NEEDLES.givenName, surname: PAYER_NEEDLES.surname },
        address: { country_code: "US" },
      },
    },
    purchase_units: [
      {
        reference_id: "FIXTURE-ref",
        amount: { currency_code: input.currency, value: input.value },
        payee: { email_address: "fixture-seller@business.example.test", merchant_id: input.payee },
        description: input.description ?? "FIXTURE order",
        items: [{ name: "FIXTURE Kopi", unit_amount: { currency_code: input.currency, value: input.value }, quantity: "1" }],
        shipping: { name: { full_name: `${PAYER_NEEDLES.givenName} ${PAYER_NEEDLES.surname}` } },
        payments: input.captureId
          ? { captures: [{ id: input.captureId, status: "COMPLETED", amount: { currency_code: input.currency, value: input.value }, seller_receivable_breakdown: { gross_amount: { currency_code: input.currency, value: input.value } } }] }
          : {},
      },
    ],
  };
}
