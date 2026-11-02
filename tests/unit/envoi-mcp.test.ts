import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connectEnvoi, type EnvoiConnection } from "@/integrations/assistant/envoi-mcp";
import { createAgentTools } from "@/integrations/assistant/tools";
import { outputSchemas } from "@/integrations/mcp/contracts";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { createFakeEnvoiApi, FIXTURE_AGENT_TOKEN, FIXTURE_BASE_URL, US_SHOP } from "../support/fake-envoi-api";
import { createFakeOpenAI, FIXTURE_AI_ENV } from "../support/fake-openai";

const connections: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(connections.splice(0).map((connection) => connection.close())); });
const signal = () => new AbortController().signal;
async function connect(fake = createFakeEnvoiApi()): Promise<EnvoiConnection> {
  const client = await connectEnvoi(FIXTURE_BASE_URL, FIXTURE_AGENT_TOKEN, fake.fetch);
  connections.push(client);
  return client;
}
const menu = { notice: "FIXTURE", outlet: US_SHOP, currency: "USD", items: [{ id: "itm_fixture", name: "FIXTURE Coffee", unitMinor: 1295, currency: "USD", available: true }] };

const corruptions = {
  "missing currency": (answer: Record<string, unknown>) => { const copy = { ...answer }; delete copy.currency; return copy; },
  "string price": (answer: Record<string, unknown>) => ({ ...answer, items: [{ ...menu.items[0], unitMinor: "1295" }] }),
  "item currency mismatch": (answer: Record<string, unknown>) => ({ ...answer, items: [{ ...menu.items[0], currency: "SGD" }] }),
};

describe("the assistant's MCP client reads a USD menu and rejects a price without its currency", () => {
  it("reads the USD amount unchanged", async () => {
    const client = await connect();
    expect(await client.callEnvoi("get_menu", { outletId: US_SHOP.id }, signal())).toMatchObject({ ok: true, status: 200, value: { currency: "USD", items: [{ unitMinor: 1295, currency: "USD" }] } });
  });
  for (const [name, corrupt] of Object.entries(corruptions)) {
    it(name, async () => {
      // No advertised schema: this proves Envoi's own validator, independently of the SDK.
      const fake = createFakeEnvoiApi({ discoverSchemas: false, corrupt: (tool, answer) => tool === "get_menu" ? corrupt(answer) : answer });
      const client = await connect(fake);
      const links: unknown[] = [];
      const tools = createAgentTools({ callEnvoi: client.callEnvoi, trace: () => {}, gate: () => ({ signal: signal(), spend: () => {} }), onLink: (link) => links.push(link) });
      expect(await tools.readMenu({ outletId: US_SHOP.id })).toEqual({ error: "invalid_answer" });
      expect(await tools.proposeBasket({ outletId: US_SHOP.id, lines: [{ menuItemId: "itm_uscoffee", quantity: 1 }] })).toHaveProperty("refused");
      expect(links).toEqual([]);
      expect(fake.requests.map((request) => request.tool)).toEqual(["get_menu"]);
    });
  }
  it("passes only the invalid-answer error to the model", async () => {
    const fake = createFakeEnvoiApi({ discoverSchemas: false, corrupt: (tool, answer) => tool === "get_menu" ? corruptions["string price"](answer) : answer });
    const model = createFakeOpenAI((index) => index === 0 ? { kind: "tools", calls: [{ name: "read_menu", args: { outletId: US_SHOP.id } }] } : { kind: "text", text: "FIXTURE: could not read this menu." });
    const result = await runAssistantTurn({ baseUrl: FIXTURE_BASE_URL, agentToken: FIXTURE_AGENT_TOKEN, openaiApiKey: FIXTURE_AI_ENV.OPENAI_API_KEY, model: FIXTURE_AI_ENV.AI_MODEL, envoiFetch: fake.fetch, openaiFetch: model.fetch }, [{ role: "buyer", text: "Read the FIXTURE US menu" }]);
    expect(result.kind).toBe("reply");
    const sent = JSON.stringify(model.calls[1]!.body);
    expect(sent).toContain("invalid_answer");
    expect(sent).not.toContain("1295");
    expect(result.steps[0]).toMatchObject({ status: 200, error: "invalid_answer" });
  });
});

describe("MCP output contracts", () => {
  it("rejects EUR currency", () => {
    expect(outputSchemas.search_outlets.safeParse({ notice: "FIXTURE", outlets: [{ ...US_SHOP, currency: "EUR" }] }).success).toBe(false);
  });
  it("rejects item currency mismatch", () => {
    expect(outputSchemas.get_menu.safeParse(corruptions["item currency mismatch"](menu)).success).toBe(false);
  });
  it("rejects outlet currency mismatch", () => {
    expect(outputSchemas.get_menu.safeParse({ ...menu, outlet: { ...US_SHOP, currency: "SGD" } }).success).toBe(false);
  });
  it("rejects a string price", () => {
    expect(outputSchemas.get_menu.safeParse(corruptions["string price"](menu)).success).toBe(false);
  });
  it("requires the purchase url", () => {
    expect(outputSchemas.create_purchase_request.safeParse({ notice: "FIXTURE", expiresAt: "2026-11-02T00:00:00.000Z", forTheBuyer: "FIXTURE" }).success).toBe(false);
  });
  it("accepts unknown prices, refuses zero and fractional prices", () => {
    for (const unitMinor of [0, 12.5, -1]) expect(outputSchemas.get_menu.safeParse({ ...menu, items: [{ ...menu.items[0], unitMinor }] }).success).toBe(false);
    expect(outputSchemas.get_menu.safeParse({ ...menu, items: [{ ...menu.items[0], unitMinor: null, available: null }] }).success).toBe(true);
  });
  it("the SDK validates discovered output schemas before Envoi's validator", async () => {
    const fake = createFakeEnvoiApi({ corrupt: (tool, answer) => tool === "get_menu" ? corruptions["string price"](answer) : answer });
    const client = new Client({ name: "FIXTURE-sdk-only", version: "1.0" });
    connections.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${FIXTURE_BASE_URL}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${FIXTURE_AGENT_TOKEN}` } }, fetch: fake.fetch }));
    await client.listTools();
    await expect(client.callTool({ name: "get_menu", arguments: { outletId: US_SHOP.id } })).rejects.toThrow(/output schema/);
  });
});

it("MCP errors preserve tool codes and the actual HTTP status", async () => {
  const client = await connect();
  expect(await client.callEnvoi("get_menu", { outletId: "out_unknown" }, signal())).toEqual({ ok: false, error: "not_found", status: 200 });
  expect(await client.callEnvoi("create_purchase_request", { outletId: US_SHOP.id, lines: [{ menuItemId: "itm_uscoffee", quantity: 21 }] }, signal())).toMatchObject({ ok: false, error: "status_validation_failed", status: 200 });
  await expect(connectEnvoi(FIXTURE_BASE_URL, "FIXTURE-wrong-token", createFakeEnvoiApi().fetch)).rejects.toThrow();
});

it("an aborted turn also stops the initialized notification", async () => {
  const fake = createFakeEnvoiApi();
  const controller = new AbortController();
  let release: () => void = () => {};
  let started: () => void = () => {};
  const notification = new Promise<void>((resolve) => { started = resolve; });
  const requestFetch: typeof globalThis.fetch = async (input, init) => {
    const message = await new Request(input, init).json();
    if (message.method !== "notifications/initialized") return fake.fetch(input, init);
    started();
    return new Promise<Response>((resolve, reject) => {
      release = () => resolve(new Response(null, { status: 202 }));
      if (init?.signal?.aborted) reject(new DOMException("FIXTURE aborted", "AbortError"));
      else init?.signal?.addEventListener("abort", () => reject(new DOMException("FIXTURE aborted", "AbortError")), { once: true });
    });
  };
  let outcome = "pending";
  const pending = connectEnvoi(FIXTURE_BASE_URL, FIXTURE_AGENT_TOKEN, requestFetch, controller.signal).then(async (client) => { outcome = "connected"; await client.close(); }, () => { outcome = "aborted"; });
  try {
    await notification;
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(outcome).toBe("aborted");
  } finally {
    release();
    await pending;
  }
});

it("a malformed MCP envelope is invalid_answer", async () => {
  const fake = createFakeEnvoiApi();
  const client = await connectEnvoi(FIXTURE_BASE_URL, FIXTURE_AGENT_TOKEN, async (input, init) => {
    const response = await fake.fetch(input, init);
    const message = await new Request(input, init).json();
    if (message.method !== "tools/call") return response;
    return Response.json({ jsonrpc: "2.0", id: message.id, result: { content: "FIXTURE malformed", structuredContent: {} } });
  });
  connections.push(client);
  expect(await client.callEnvoi("search_outlets", {}, signal())).toEqual({ ok: false, error: "invalid_answer", status: 200 });
});
