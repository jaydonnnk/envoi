import { z } from "zod";
import { assistantSettings } from "@/integrations/ai/openai";
import { MAX_ASSISTANT_TURN_CHARS, MAX_ASSISTANT_TURNS, runAssistantTurn, TURN_BUDGET_MS, type AssistantStep } from "@/integrations/assistant/agent";
import { MAX_TOOL_CALLS } from "@/integrations/assistant/tools";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";
import { admit, ASSISTANT_LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eight turns of 280 characters fit well inside 16 KiB even fully escaped; a slow or oversized body
// is refused unread (Gate 3 reopening 2026-10-29).
const MAX_BODY_BYTES = 16_384;
const BODY_READ_MS = 5_000;

// Text turns only: no tool role, no tool result and no other key is accepted from the browser, and
// the last turn is the buyer's, the one this request answers.
const body = z
  .object({
    turns: z
      .array(z.object({ role: z.enum(["buyer", "assistant"]), text: z.string().trim().min(1).max(MAX_ASSISTANT_TURN_CHARS) }).strict())
      .min(1)
      .max(MAX_ASSISTANT_TURNS)
      .refine((turns) => turns.at(-1)?.role === "buyer"),
  })
  .strict();

const STOPPED: Record<"tool_calls" | "time", string> = {
  tool_calls: `I stopped after ${MAX_TOOL_CALLS} steps without finishing. No review was created. Try again, or pick a shop from the list.`,
  time: `I stopped after ${TURN_BUDGET_MS / 1000} seconds without finishing. No review was created. Try again, or pick a shop from the list.`,
};

// Ask Envoi (S25): one buyer turn of the agent, which reads shops and menus and may ask Envoi for a
// one-time review link, all through the generated client. The limiter admits the turn before any
// model call. The link is answered beside the reply, never inside it or the steps.
export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const invalid = appError("validation_failed", `Send at most ${MAX_ASSISTANT_TURNS} messages of ${MAX_ASSISTANT_TURN_CHARS} characters or fewer, ending with yours.`);
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const admission = await admit(webDb(), "buyer_assistant", principal.userId, ASSISTANT_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many messages to Ask Envoi. Pick a shop from the list instead.", { retryable: true, details: { window: admission.window } }));
  }

  const settings = assistantSettings();
  if (!settings) return httpErr(appError("provider_unreachable", "Ask Envoi is not available. Pick a shop from the list instead."));

  const result = await runAssistantTurn(settings, parsed.data.turns);
  logSteps(result.kind, result.steps);
  if (result.kind === "failed") {
    return httpErr(appError("provider_unreachable", "Ask Envoi could not answer. No review was created. Pick a shop from the list instead.", { retryable: true }));
  }
  const reply = result.kind === "stopped" ? STOPPED[result.reason] : result.text;
  const link = result.kind === "link" ? { url: result.link.url, expiresAt: result.link.expiresAt } : null;
  return httpOk({ reply, steps: result.steps, link });
}

// One server log line per client call, from the same trace entries the buyer sees as steps.
function logSteps(kind: string, steps: AssistantStep[]): void {
  for (const step of steps) {
    log("info", "assistant_step", { operation: step.operation, status: step.status, outletId: step.outletId, itemIds: step.itemIds.join(","), expiresAt: step.expiresAt, ms: step.ms });
  }
  log("info", "assistant_turn", { kind, steps: steps.length });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
