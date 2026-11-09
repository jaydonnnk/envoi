import { z } from "zod";
import { webEnv } from "@/env";
import { isPendingSelfSignup } from "@/domain/outlets/merchant";
import { isDemoSellerOutlet } from "@/domain/payments/refunds";
import { TURN_BUDGET_MS } from "@/integrations/assistant/agent";
import { demoSellerCopilot, MAX_COPILOT_TURN_CHARS, MAX_COPILOT_TURNS, runCopilotTurn, type CopilotStep } from "@/integrations/assistant/merchant-copilot";
import { MAX_TOOL_CALLS } from "@/integrations/assistant/tools";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";
import { admit, COPILOT_LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eight turns of 300 characters fit well inside 16 KiB even fully escaped; a slow or oversized body
// is refused unread.
const MAX_BODY_BYTES = 16_384;
const BODY_READ_MS = 5_000;

// Text turns only, ending with the merchant's: no tool result, proposal or amount is accepted from
// the browser, so every figure the model sees comes from this turn's own tool calls.
const body = z
  .object({
    turns: z
      .array(z.object({ role: z.enum(["merchant", "copilot"]), text: z.string().trim().min(1).max(MAX_COPILOT_TURN_CHARS) }).strict())
      .min(1)
      .max(MAX_COPILOT_TURNS)
      .refine((turns) => turns.at(-1)?.role === "merchant"),
  })
  .strict();

const STOPPED: Record<"tool_calls" | "time", string> = {
  tool_calls: `It stopped after ${MAX_TOOL_CALLS} checks without finishing. Nothing was sent. Try a narrower question.`,
  time: `It stopped after ${TURN_BUDGET_MS / 1000} seconds without finishing. Nothing was sent. Try again.`,
};

// The merchant copilot (S45, Gate 3 call stack "Copilot turn"): membership, then the demo seller
// check, then the limiter, then one turn. Only the labeled demo shop gets a turn; every other outlet,
// and every outlet while the copilot is off, answers exactly like a missing route. The route stores
// no message and holds no PayPal write client.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const now = new Date();
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const config = demoSellerCopilot(webEnv());
  const off = appError("not_found", "There is no copilot for this shop.");
  // S43: a self-created shop gets no turn until its enrollment is approved.
  if (!config || (await isPendingSelfSignup(webDb(), principal.outletId)) || !(await isDemoSellerOutlet(webDb(), principal.outletId, config.merchantId))) return httpErr(off);

  const invalid = appError("validation_failed", `Send at most ${MAX_COPILOT_TURNS} messages of ${MAX_COPILOT_TURN_CHARS} characters or fewer, ending with yours.`);
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const admission = await admit(webDb(), "merchant_copilot", principal.outletId, COPILOT_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many questions for now. Nothing was sent. Your orders table still works.", { retryable: true, details: { window: admission.window } }));
  }

  const result = await runCopilotTurn(config, principal.outletId, parsed.data.turns);
  logSteps(result.kind, result.steps);
  if (result.kind === "failed") {
    return httpErr(appError("provider_unreachable", "The copilot could not answer. Nothing was sent. Your orders table still works.", { retryable: true }));
  }
  const reply = result.kind === "stopped" ? STOPPED[result.reason] : result.text;
  const refund = result.kind === "reply" ? result.refund : null;
  return httpOk({ reply, steps: result.steps, refund });
}

// One server log line per call: the operation, PayPal's status and the time, never a result.
function logSteps(kind: string, steps: CopilotStep[]): void {
  for (const step of steps) log("info", "copilot_step", { operation: step.operation, status: step.status, ms: step.ms });
  log("info", "copilot_turn", { kind, steps: steps.length });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
