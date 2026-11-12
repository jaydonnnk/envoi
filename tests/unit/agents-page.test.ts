import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgentsPage from "@/app/agents/page";
import { newSecretToken } from "@/lib/ids";
import { holdsTokenValue, scanServedAgentsPage } from "../../scripts/scan-agents-page";

const rendered = () => renderToStaticMarkup(createElement(AgentsPage));
const plant = (needle: string) => rendered().replace("</main>", `<span>${needle}</span></main>`);

describe("the agents page", () => {
  it("the agents page holds no token value", () => {
    const fixtureSiteToken = `envoi_agent_${newSecretToken()}`;
    const previous = process.env.ASSISTANT_AGENT_TOKEN;
    process.env.ASSISTANT_AGENT_TOKEN = fixtureSiteToken;
    try {
      expect(holdsTokenValue(rendered(), [fixtureSiteToken])).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.ASSISTANT_AGENT_TOKEN;
      else process.env.ASSISTANT_AGENT_TOKEN = previous;
    }
  });

  it("the scan finds a planted prefixed token on the rendered page", () => {
    expect(holdsTokenValue(plant("envoi_agent_FIXTURE1"))).toBe(true);
  });

  it("the scan finds a planted bare secret on the rendered page", () => {
    expect(holdsTokenValue(plant(newSecretToken()))).toBe(true);
  });

  it("the scan finds a planted known value of any shape", () => {
    expect(holdsTokenValue(plant("FIXTURE-known-value"), ["FIXTURE-known-value"])).toBe(true);
  });

  it("the served scan finds a token in the page and in a script it loads, and names no value", async () => {
    const needle = `envoi_agent_${newSecretToken()}`;
    const served = (page: string, script: string): typeof fetch =>
      (async (input: string | URL | Request) => new Response(String(input).endsWith("/agents") ? page : script)) as typeof fetch;
    const shell = (extra = "") => `<h1>Bring your own assistant</h1>${extra}<script src="/_next/static/chunks/a.js"></script>`;

    expect(await scanServedAgentsPage("http://fixture.test", [], served(shell(), "const a=1"))).toEqual({ pages: 1, scripts: 1, hits: [] });
    expect((await scanServedAgentsPage("http://fixture.test", [], served(shell(needle), "const a=1"))).hits).toEqual(["/agents"]);
    expect((await scanServedAgentsPage("http://fixture.test", [], served(shell(), `const a="${needle}"`))).hits).toEqual(["/_next/static/chunks/a.js"]);
  });

  it("shows the approved copy and says who cannot pay", () => {
    const text = rendered().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replaceAll("&quot;", '"');
    for (const copy of [
      "Agents",
      "Bring your own assistant",
      "Connect an AI assistant to Envoi. It can find shops, read menus and hand you a one-time link. It cannot pay, approve or read your receipt.",
      "Connect",
      "Add this MCP server to your assistant: https://envoi-helx.onrender.com/mcp",
      "Use your test token as the bearer token. Judges: it is in the submission form.",
      'Ask: "Two Kopi O at Lorong Demo Kopi."',
      "Open the link it gives you, check the price and approve in PayPal sandbox yourself.",
      "Test environment. Demo fixture shops and test money only.",
    ]) expect(text).toContain(copy);
  });
});
