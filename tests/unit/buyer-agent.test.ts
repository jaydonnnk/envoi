import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBaseUrl, createAgent, TURN_BUDGET_MS } from "../../src/integrations/assistant/agent";
import { createAgentTools, MAX_TOOL_CALLS, type TurnGate } from "../../src/integrations/assistant/tools";
import { createTrace } from "../../src/integrations/assistant/trace";
import { EnvoiPublicApiClient } from "../../clients/typescript/src/index";
import {
  createFakeEnvoiApi,
  FIXTURE_AGENT_TOKEN,
  FIXTURE_BASE_URL,
  FIXTURE_EXPIRES_AT,
  FIXTURE_LINK,
  FIXTURE_LINK_TOKEN,
  MENUS,
  OTHER_SHOP,
  TEST_SHOP,
} from "../support/fake-envoi-api";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeTurn } from "../support/fake-openai";

// S20: the reference buyer agent, Gate 3 named tests 13-16. Since S25 it lives in
// src/integrations/assistant, and only the imports and AGENT_DIR below moved with it. Envoi's API and
// OpenAI are both faked at their fetch boundaries and labeled FIXTURE; no deployment or model is
// called.

const AGENT_DIR = join(process.cwd(), "src/integrations/assistant");
// The only modules the agent may import: the model SDK, its schema library, the generated client and
// its own two files. The command line's Node built-ins stayed in clients/buyer-agent/agent.ts.
const ALLOWED_IMPORTS = new Set(["ai", "@ai-sdk/openai", "zod", "../../../clients/typescript/src/index", "./tools", "./trace"]);

function agentSources(): { file: string; text: string }[] {
  return readdirSync(AGENT_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(join(AGENT_DIR, file), "utf8") }));
}

function setup() {
  const envoi = createFakeEnvoiApi();
  const lines: string[] = [];
  const gate: TurnGate = { signal: new AbortController().signal, spend: () => {} };
  const links: { url: string; expiresAt: string }[] = [];
  const reader = new EnvoiPublicApiClient({ serverOptions: { baseUrl: FIXTURE_BASE_URL }, fetch: envoi.fetch, retry: { maxRetries: 0 } });
  const agent = new EnvoiPublicApiClient({ serverOptions: { baseUrl: FIXTURE_BASE_URL }, agentBearer: FIXTURE_AGENT_TOKEN, fetch: envoi.fetch, retry: { maxRetries: 0 } });
  const tools = createAgentTools({ reader, agent, trace: createTrace((line) => lines.push(line)), gate: () => gate, onLink: (link) => links.push(link) });
  return { envoi, lines, links, tools };
}

const posts = (envoi: ReturnType<typeof createFakeEnvoiApi>) => envoi.requests.filter((request) => request.method === "POST");

function agentWith(script: (index: number) => FakeTurn) {
  const envoi = createFakeEnvoiApi();
  const openai = createFakeOpenAI((index) => script(index));
  const trace: string[] = [];
  const agent = createAgent({
    baseUrl: FIXTURE_BASE_URL,
    agentToken: FIXTURE_AGENT_TOKEN,
    openaiApiKey: FIXTURE_AI_ENV.OPENAI_API_KEY,
    model: FIXTURE_AI_ENV.AI_MODEL,
    writeTrace: (line) => trace.push(line),
    envoiFetch: envoi.fetch,
    openaiFetch: openai.fetch,
  });
  return { agent, envoi, openai, trace };
}

const call = (name: string, args: Record<string, unknown> = {}): FakeTurn => ({ kind: "tools", calls: [{ name, args }] });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reference buyer agent", () => {
  it("agent tools call only the generated client", async () => {
    // Statically: no source calls fetch, and every import is on the allowed list, so neither MCP nor
    // another HTTP library can carry a request.
    const sources = agentSources();
    expect(sources.map((source) => source.file).sort()).toEqual(["agent.ts", "tools.ts", "trace.ts"]);
    for (const { file, text } of sources) {
      expect(text.match(/\bfetch\s*\(/g), file).toBeNull();
      // Named, namespace and re-export forms, and bare side-effect imports.
      const imports = [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/gms)].map((match) => match[1] ?? match[2]);
      expect(imports.filter((name) => !ALLOWED_IMPORTS.has(name!)), file).toEqual([]);
      expect(text.match(/\bimport\s*\(/g), file).toBeNull();
    }

    // At run time: with the global fetch refusing everything, each tool makes exactly one request,
    // through the generated client's fetch, to its own route.
    vi.stubGlobal("fetch", () => {
      throw new Error("FIXTURE: the global fetch must not be used");
    });
    const { envoi, tools } = setup();
    await tools.listShops();
    await tools.readMenu({ outletId: TEST_SHOP.id });
    await tools.proposeBasket({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 2 }] });
    expect(envoi.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /api/v1/outlets",
      `GET /api/v1/outlets/${TEST_SHOP.id}/menu`,
      "POST /api/v1/purchase-requests",
    ]);
    // Only the purchase request carries the agent token.
    expect(envoi.requests.map((request) => request.headers.get("authorization"))).toEqual([null, null, `Bearer ${FIXTURE_AGENT_TOKEN}`]);
  });

  it("agent refuses an item id or quantity the menu did not allow", async () => {
    const { envoi, tools, links } = setup();
    // No menu read yet for this shop.
    expect(await tools.proposeBasket({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 1 }] })).toHaveProperty("refused");

    await tools.readMenu({ outletId: TEST_SHOP.id });
    const refusedLines = [
      { menuItemId: "itm_invented", quantity: 1 },
      // On another shop's menu, never read for this one.
      { menuItemId: MENUS[OTHER_SHOP.id]![0]!.id, quantity: 1 },
      { menuItemId: "itm_kopic", quantity: 0 },
      { menuItemId: "itm_kopic", quantity: 21 },
      { menuItemId: "itm_kopic", quantity: 1.5 },
      { menuItemId: "itm_kopic", quantity: -2 },
      { menuItemId: "itm_kopic", quantity: Number.NaN },
    ];
    for (const line of refusedLines) {
      expect(await tools.proposeBasket({ outletId: TEST_SHOP.id, lines: [line] }), JSON.stringify(line)).toHaveProperty("refused");
      // One bad line refuses the whole basket.
      expect(await tools.proposeBasket({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 1 }, line] })).toHaveProperty("refused");
    }
    // Another shop's id with this shop's menu read does not open that shop either.
    expect(await tools.proposeBasket({ outletId: OTHER_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 1 }] })).toHaveProperty("refused");
    expect(posts(envoi)).toEqual([]);
    expect(links).toEqual([]);

    // The bounds themselves are allowed, so the refusals above are the check and not a closed door.
    expect(await tools.proposeBasket({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 1 }, { menuItemId: "itm_milktea", quantity: 20 }] })).toMatchObject({ created: true });
    expect(posts(envoi)).toHaveLength(1);
  });

  it("agent never sends an amount", async () => {
    // The model's tool arguments carry a price, total, amount and payee beside the ids. The tool is
    // driven through the whole model loop, so the SDK's own argument handling is included.
    const { agent, envoi } = agentWith((index) =>
      [
        call("read_menu", { outletId: TEST_SHOP.id }),
        call("propose_basket", {
          outletId: TEST_SHOP.id,
          total: 1,
          amountMinor: 1,
          payee: "FIXTURE-payee",
          lines: [{ menuItemId: "itm_lemontea", quantity: 2, unitMinor: 1, price: 0.01 }],
        }),
      ][index] ?? { kind: "text", text: "FIXTURE done." },
    );
    const result = await agent.turn("Two iced lemon teas from Test Shop");
    expect(result.kind).toBe("link");
    const sent = posts(envoi);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_lemontea", quantity: 2 }] });

    // Called directly, with the schema bypassed, the body is still ids and quantities only.
    const direct = setup();
    await direct.tools.readMenu({ outletId: TEST_SHOP.id });
    const extra = { outletId: TEST_SHOP.id, amount: 1, lines: [{ menuItemId: "itm_kopic", quantity: 1, unitMinor: 1 }] };
    await direct.tools.proposeBasket(extra);
    expect(posts(direct.envoi)[0]!.body).toEqual({ outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_kopic", quantity: 1 }] });
  });

  it("agent trace holds no token, key or link", async () => {
    const FIRST = "Two iced teas from Test Shop, FIXTURE prompt";
    const SECOND = "The lemon one please, FIXTURE answer";
    const { agent, trace, openai } = agentWith((index) =>
      [
        call("list_shops"),
        call("read_menu", { outletId: TEST_SHOP.id }),
        { kind: "text", text: "Which iced tea: Iced lemon tea S$2.20 or Iced milk tea S$2.50?" } as FakeTurn,
        call("propose_basket", { outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_lemontea", quantity: 2 }] }),
        { kind: "text", text: "FIXTURE: the link is on its way to you." } as FakeTurn,
      ][index]!,
    );
    expect(await agent.turn(FIRST)).toEqual({ kind: "reply", text: "Which iced tea: Iced lemon tea S$2.20 or Iced milk tea S$2.50?" });
    const second = await agent.turn(SECOND);
    // The link reached the person, so it existed to leak.
    expect(second).toMatchObject({ kind: "link", link: { url: FIXTURE_LINK, expiresAt: FIXTURE_EXPIRES_AT } });

    // The system prompt really went to the model, so it too existed to leak.
    const systemPrompt = "You are Envoi's reference buyer agent";
    expect(JSON.stringify(openai.calls[0]!.body)).toContain(systemPrompt);

    const needles = { agentToken: FIXTURE_AGENT_TOKEN, openaiKey: FIXTURE_AI_ENV.OPENAI_API_KEY, link: FIXTURE_LINK, linkToken: FIXTURE_LINK_TOKEN, firstPrompt: FIRST, secondPrompt: SECOND, systemPrompt };
    // A needle counts as found raw, JSON-escaped, URL-encoded or with its slashes escaped.
    const found = (surface: string) =>
      Object.entries(needles)
        .filter(([, needle]) => [needle, JSON.stringify(needle).slice(1, -1), encodeURIComponent(needle), needle.replaceAll("/", "\\/")].some((form) => surface.includes(form)))
        .map(([name]) => name);

    // Self-test on the actual serialized surface: each needle planted in a trace line is found.
    for (const [name, needle] of Object.entries(needles)) {
      const planted = [...trace, JSON.stringify({ operation: "createPurchaseRequest", planted: needle })].join("\n");
      expect(found(planted), name).toContain(name);
    }
    // The scan runs before any shape check, so a leak fails here and is named.
    expect(found(trace.join("\n"))).toEqual([]);

    // Then one line per client call, with the contract's fields.
    const entries = trace.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => [entry.operation, entry.status])).toEqual([
      ["listOutlets", 200],
      ["getOutletMenu", 200],
      ["createPurchaseRequest", 201],
    ]);
    expect(entries[2]).toMatchObject({ outletId: TEST_SHOP.id, itemIds: ["itm_lemontea"], expiresAt: FIXTURE_EXPIRES_AT });

    // And every line carries the contract's fields and no other.
    for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(["expiresAt", "itemIds", "ms", "operation", "outletId", "status"]);
  });

  it("agent stops after six tool calls in a turn", async () => {
    const { agent, envoi } = agentWith(() => call("list_shops"));
    expect(await agent.turn("Kopi from FIXTURE Test Shop")).toEqual({ kind: "stopped", reason: "tool_calls" });
    expect(envoi.requests).toHaveLength(MAX_TOOL_CALLS);
  });

  it("agent stops a turn after 60 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { agent, envoi } = agentWith(() => ({ kind: "hang" }));
    const turn = agent.turn("Kopi from FIXTURE Test Shop");
    await vi.advanceTimersByTimeAsync(TURN_BUDGET_MS - 1);
    let settled = false;
    void turn.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    // setImmediate is not faked, so these waits let the aborted request unwind without moving the clock.
    for (let wait = 0; wait < 20 && !settled; wait += 1) await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(true);
    expect(await turn).toEqual({ kind: "stopped", reason: "time" });
    expect(posts(envoi)).toEqual([]);
  });

  it("agent accepts only an https or local base URL", () => {
    expect(checkBaseUrl("https://envoi.example/")).toBe("https://envoi.example");
    expect(checkBaseUrl("http://localhost:3100")).toBe("http://localhost:3100");
    for (const bad of ["http://envoi.example", "http://localhost.envoi.example", "ftp://localhost", "https://user:pass@envoi.example", "https://envoi.example/?token=1", "not a url"]) {
      expect(checkBaseUrl(bad), bad).toBeNull();
    }
  });
});
