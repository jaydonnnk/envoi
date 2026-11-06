// S34 diagnostic, 2026-11-07: does the real model send budgetMinor on propose_basket? Not scored and
// not part of the S34 evaluation. Real model calls on FIXTURE shops only, simulated links, no payment.
// The S34 evaluation cannot answer this: Envoi's body excludes the budget and the trace records no
// arguments, so this reads the tool calls in OpenAI's own response, with no application change.
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-budget-probe.mts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFile } from "@/env";
import { runAssistantTurn } from "@/integrations/assistant/agent";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase } from "../../../../tests/support/db";
import { createMeter, fixtureMcp } from "./s32-language-eval.mjs";
import { MODEL, seedAdviceMenus } from "./s34-advice-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const OUT = join(HERE, "s34-budget-probe.json");
const LEDGER = join(HERE, "s34-budget-probe-ledger.json");
const BASE = "https://fixture.envoi.test";
const FIXTURE_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
// The user's cap for this probe. A request is refused unless its worst case still fits: the meter's
// 2000 output tokens at US$10 per million, plus a US$0.005 input allowance.
const CAP_USD = 0.05;
const WORST_REQUEST_USD = 0.025;

const CASES = [
  { id: "p1", budgetMinor: 700, turns: ["What should I try under S$7?", "Yes, make that basket."] },
  { id: "p2", budgetMinor: 300, turns: ["I want one Kaya toast set. My budget is S$3."] },
  { id: "p3", budgetMinor: 500, turns: ["What should I try under S$5?", "Yes, make that basket."] },
];

type ToolCall = { turn: number; name: string; args: Record<string, unknown> };

async function main() {
  assert(!existsSync(OUT), "the probe already ran; no overwriting or silent retries");
  loadLocalEnvFile(process.env.S34_ENV_FILE ?? ".env.local");
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, "OPENAI_API_KEY is not configured");
  // Set after the env file so it can never select an external database.
  process.env.TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:5432/postgres";

  let currentCalls: ToolCall[] = [];
  let turnIndex = 0;
  const recordingSend: typeof fetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    const value = (await response.clone().json()) as { output?: { type: string; name?: string; arguments?: string }[] };
    for (const item of value.output ?? []) {
      if (item.type === "function_call" && item.name) currentCalls.push({ turn: turnIndex, name: item.name, args: JSON.parse(item.arguments ?? "{}") as Record<string, unknown> });
    }
    return response;
  };
  const meter = createMeter(LEDGER, recordingSend);
  const openaiFetch: typeof fetch = (input, init) => {
    if (meter.ledger.spentUsd + meter.ledger.reservedUsd + WORST_REQUEST_USD > CAP_USD) throw new Error("probe spend cap: request refused before forwarding");
    return meter.fetch(input, init);
  };

  const database = await createTestDatabase("s34probe");
  const web = connectWeb(database.webUrl, 2);
  const rows: Record<string, unknown>[] = [];
  const sourceHash = (file: string) => createHash("sha256").update(readFileSync(join(ROOT, file))).digest("hex");
  const save = (stopped: string | null) =>
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          label: "S34 diagnostic, not scored: FIXTURE shop, real OpenAI, simulated links, no payment and no deployment",
          model: MODEL,
          capUsd: CAP_USD,
          agentSha256: sourceHash("src/integrations/assistant/agent.ts"),
          toolsSha256: sourceHash("src/integrations/assistant/tools.ts"),
          meter: { ...meter.ledger },
          stopped,
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  let stopped: string | null = null;
  try {
    const menus = await seedAdviceMenus(database, web);
    const menu = menus.find((candidate) => candidate.outlet.name === "Lorong Demo Kopi");
    assert(menu, "no fixture menu");
    const shop = { id: menu.outlet.id, name: menu.outlet.name };
    for (const entry of CASES) {
      const fixture = fixtureMcp(menus);
      const history: { role: "buyer" | "assistant"; text: string }[] = [];
      const replies: string[] = [];
      const kinds: string[] = [];
      currentCalls = [];
      for (const [index, text] of entry.turns.entries()) {
        turnIndex = index;
        history.push({ role: "buyer", text });
        const result = await runAssistantTurn({ baseUrl: BASE, agentToken: FIXTURE_TOKEN, openaiApiKey: apiKey, model: MODEL, envoiFetch: fixture.fetch, openaiFetch }, history.slice(-8), shop);
        const reply = "text" in result ? result.text : "";
        kinds.push(result.kind);
        replies.push(reply);
        history.push({ role: "assistant", text: reply });
      }
      const proposals = currentCalls.filter((call) => call.name === "propose_basket");
      rows.push({ id: entry.id, statedBudgetMinor: entry.budgetMinor, turns: entry.turns, kinds, replies, baskets: fixture.baskets, proposals: proposals.map((call) => ({ turn: call.turn, budgetMinor: call.args.budgetMinor ?? null, lines: call.args.lines })) });
      save(null);
      console.log(JSON.stringify(rows.at(-1)));
    }
  } catch (error) {
    stopped = error instanceof Error ? error.message : String(error);
  } finally {
    save(stopped);
    await web.close();
    await database.drop();
  }
  console.log(JSON.stringify({ stopped, spentUsd: meter.ledger.spentUsd, reservedUsd: meter.ledger.reservedUsd, requests: meter.ledger.requests }));
}

void main();
