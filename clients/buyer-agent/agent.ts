import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { checkBaseUrl, createAgent, TURN_BUDGET_MS } from "../../src/integrations/assistant/agent";
import { MAX_TOOL_CALLS } from "../../src/integrations/assistant/tools";

// S20: Envoi's reference buyer agent in a terminal. Since S25 the agent itself, its instructions,
// tools and trace, lives in src/integrations/assistant/, which the site's Ask Envoi route also runs;
// this file is only the command line around it.
//
//   ENVOI_BASE_URL=... ENVOI_AGENT_TOKEN=... OPENAI_API_KEY=... AI_MODEL=... npm run agent -- "Two iced teas from Test Shop"
//
// The trace, one JSON line per client call, goes to stderr; the conversation and the link go to
// stdout. The link is never written to the trace.

const STOPPED: Record<"tool_calls" | "time", string> = {
  tool_calls: `Stopped: this turn used its ${MAX_TOOL_CALLS} tool calls without finishing. No link was created.`,
  time: `Stopped: this turn ran past ${TURN_BUDGET_MS / 1000} seconds. No link was created.`,
};

async function main(argv: string[]): Promise<number> {
  const first = argv.join(" ").trim();
  if (!first) {
    console.error('usage: npm run agent -- "Two iced teas from Test Shop"');
    return 2;
  }
  const env = process.env;
  const missing = ["ENVOI_BASE_URL", "ENVOI_AGENT_TOKEN", "OPENAI_API_KEY", "AI_MODEL"].filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(`Set ${missing.join(", ")} in your environment first.`);
    return 2;
  }
  const baseUrl = checkBaseUrl(env.ENVOI_BASE_URL!);
  if (!baseUrl) {
    console.error("ENVOI_BASE_URL must be an https address, or http://localhost for a local build.");
    return 2;
  }

  const agent = createAgent({
    baseUrl,
    agentToken: env.ENVOI_AGENT_TOKEN!,
    openaiApiKey: env.OPENAI_API_KEY!,
    model: env.AI_MODEL!,
    writeTrace: (line) => process.stderr.write(`${line}\n`),
  });
  console.log(`Envoi reference agent at ${baseUrl}. TEST ENVIRONMENT: demo fixture shops, PayPal sandbox test money only.`);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let text = first;
    for (;;) {
      const result = await agent.turn(text);
      if (result.kind === "failed") {
        console.log("The agent could not answer. No link was created.");
        return 1;
      }
      if (result.kind === "stopped") {
        console.log(STOPPED[result.reason]);
        return 1;
      }
      if (result.text) console.log(result.text);
      if (result.kind === "link") {
        console.log(`Open this link on your phone to review Envoi's price and pay with PayPal sandbox. It works once and expires at ${result.link.expiresAt}:`);
        console.log(result.link.url);
        return 0;
      }
      // An empty answer, or the end of input, ends the conversation without a link.
      const answer = (await input.question("> ").catch(() => "")).trim();
      if (!answer) return 0;
      text = answer;
    }
  } finally {
    input.close();
  }
}

function isEntrypoint(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) process.exitCode = await main(process.argv.slice(2));
