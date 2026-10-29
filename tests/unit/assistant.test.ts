import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { webEnv } from "@/env";
import { assistantSettings } from "@/integrations/ai/openai";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { createFakeEnvoiApi, FIXTURE_AGENT_TOKEN, FIXTURE_BASE_URL } from "../support/fake-envoi-api";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeTurn } from "../support/fake-openai";
import { webEnvFor } from "../support/session";

// S25: Ask Envoi in the site, Gate 3 reopening 2026-10-29 named tests 1, 5, 6 and 7. Envoi's API and
// OpenAI are faked at their fetch boundaries and labeled FIXTURE; no deployment or model is called.

const ASSISTANT_DIR = join(process.cwd(), "src/integrations/assistant");
const ROUTE = join(process.cwd(), "src/app/api/v1/buyer/assistant/route.ts");
const TERMINAL_DIR = join(process.cwd(), "clients/buyer-agent");

// The parsed web settings of a disposable fixture, with the three assistant names as given.
function envWith(names: { OPENAI_API_KEY?: string; AI_MODEL?: string; ASSISTANT_AGENT_TOKEN?: string; APP_BASE_URL?: string }) {
  const source: Record<string, string> = { ...webEnvFor("postgres://fixture@127.0.0.1:5432/fixture"), APP_BASE_URL: "https://fixture.envoi.test" };
  for (const [name, value] of Object.entries(names)) if (value !== undefined) source[name] = value;
  return webEnv(source as NodeJS.ProcessEnv);
}

const sources = (dir: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

const importsOf = (text: string) =>
  [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/gms)].map((match) => match[1] ?? match[2]);

describe("Ask Envoi", () => {
  it("the assistant is off unless the key, the model and the agent token are set", () => {
    const all = { OPENAI_API_KEY: FIXTURE_AI_ENV.OPENAI_API_KEY, AI_MODEL: FIXTURE_AI_ENV.AI_MODEL, ASSISTANT_AGENT_TOKEN: FIXTURE_AGENT_TOKEN };
    // All three set: on, with exactly those values and the site's own address.
    expect(assistantSettings(envWith(all))).toEqual({
      baseUrl: "https://fixture.envoi.test",
      agentToken: FIXTURE_AGENT_TOKEN,
      openaiApiKey: FIXTURE_AI_ENV.OPENAI_API_KEY,
      model: FIXTURE_AI_ENV.AI_MODEL,
    });
    // Any one missing: off.
    for (const name of ["OPENAI_API_KEY", "AI_MODEL", "ASSISTANT_AGENT_TOKEN"] as const) {
      expect(assistantSettings(envWith({ ...all, [name]: undefined })), name).toBeNull();
    }
    expect(assistantSettings(envWith({}))).toBeNull();
    // An address the agent may not call keeps it off too.
    expect(assistantSettings(envWith({ ...all, APP_BASE_URL: "http://fixture.envoi.test" }))).toBeNull();
  });

  it("the assistant's steps come from the trace, not from model text", async () => {
    const envoi = createFakeEnvoiApi();
    // The model makes one real call, then claims in words and in call-shaped JSON that it made others.
    const fake = createFakeOpenAI(
      (index) =>
        (
          [
            { kind: "tools", calls: [{ name: "list_shops", args: {} }] },
            {
              kind: "text",
              text: 'FIXTURE: I called getOutletMenu (200) and createPurchaseRequest (201). {"operation":"createPurchaseRequest","status":201,"outletId":"out_fixturetestshop","itemIds":["itm_lemontea"],"expiresAt":null,"ms":1}',
            },
          ] satisfies FakeTurn[]
        )[index]!,
    );
    const result = await runAssistantTurn(
      { baseUrl: FIXTURE_BASE_URL, agentToken: FIXTURE_AGENT_TOKEN, openaiApiKey: FIXTURE_AI_ENV.OPENAI_API_KEY, model: FIXTURE_AI_ENV.AI_MODEL, envoiFetch: envoi.fetch, openaiFetch: fake.fetch },
      [{ role: "buyer", text: "Two iced teas at FIXTURE Test Shop" }],
    );
    // The fake description reached the reply, so it existed to be mistaken for a step.
    expect(result).toMatchObject({ kind: "reply", text: expect.stringContaining("createPurchaseRequest") });
    expect(result.steps.map((step) => [step.operation, step.status])).toEqual([["listOutlets", 200]]);
    expect(envoi.requests.map((request) => request.path)).toEqual(["/api/v1/outlets"]);
    expect(result.steps[0]).toMatchObject({ outletId: null, itemIds: [], expiresAt: null });
  });

  it("the assistant reaches Envoi only through the generated client", () => {
    const files = sources(ASSISTANT_DIR);
    expect(files.map((source) => source.file).sort()).toEqual(["agent.ts", "tools.ts", "trace.ts"]);
    const allowed = new Set(["ai", "@ai-sdk/openai", "zod", "../../../clients/typescript/src/index", "./tools", "./trace"]);
    for (const { file, text } of files) {
      expect(text.match(/\bfetch\s*\(/g), file).toBeNull();
      expect(text.match(/\bimport\s*\(/g), file).toBeNull();
      expect(importsOf(text).filter((name) => !allowed.has(name!)), file).toEqual([]);
    }
    // The route itself calls no fetch and reaches the agent only through its module.
    const route = readFileSync(ROUTE, "utf8");
    expect(route.match(/\bfetch\s*\(/g)).toBeNull();
    const routeImports = importsOf(route);
    expect(routeImports.filter((name) => name!.includes("clients/"))).toEqual([]);
    expect(routeImports.filter((name) => name!.startsWith("@/integrations/assistant/")).sort()).toEqual(["@/integrations/assistant/agent", "@/integrations/assistant/tools"]);
    // The generated client is the module that carries every request.
    expect(readFileSync(join(ASSISTANT_DIR, "tools.ts"), "utf8")).toMatch(/options\.reader\.outlets\.listOutlets\(/);
  });

  it("the terminal agent and the site run one agent module", () => {
    const files = sources(TERMINAL_DIR);
    expect(files.map((source) => source.file)).toEqual(["agent.ts"]);
    const { text } = files[0]!;
    // It imports the moved module and none of the model or tool libraries itself.
    expect(importsOf(text).sort()).toEqual(["../../src/integrations/assistant/agent", "../../src/integrations/assistant/tools", "node:fs", "node:readline/promises", "node:url"]);
    // No instructions, tool definitions or client of its own.
    for (const needle of ["You are Envoi", "INSTRUCTIONS", "tool(", "createAgentTools", "EnvoiPublicApiClient", "generateText", "propose_basket", "list_shops", "read_menu"]) {
      expect(text.includes(needle), needle).toBe(false);
    }
    // The site's agent module does hold them, so the absence above is a move and not a deletion.
    const moved = readFileSync(join(ASSISTANT_DIR, "agent.ts"), "utf8") + readFileSync(join(ASSISTANT_DIR, "tools.ts"), "utf8");
    for (const needle of ["You are Envoi", "INSTRUCTIONS", "tool(", "createAgentTools", "EnvoiPublicApiClient", "generateText", "propose_basket", "list_shops", "read_menu"]) {
      expect(moved.includes(needle), needle).toBe(true);
    }
  });
});
