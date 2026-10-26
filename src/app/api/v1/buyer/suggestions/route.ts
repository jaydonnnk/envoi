import { z } from "zod";
import { MAX_AREA_LENGTH, MAX_TEXT_LENGTH, suggestFromText } from "@/domain/suggestions/suggest";
import { suggestionModel } from "@/integrations/ai/openai";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { admit, SUGGESTION_LIMITS } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// The body is read counted and time-bounded before it is parsed: 280 characters of text, 80 of area
// and a 64-character outlet id fit well inside 4 KiB even fully escaped, and a slow or oversized body
// is refused unread.
const MAX_BODY_BYTES = 4_096;
const BODY_READ_MS = 5_000;

// The outletId is the shop the buyer is already looking at, or the one their scan resolved. It is a
// public id and grants nothing: it only puts that shop in scope, and only when it is published.
const body = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  area: z.string().trim().min(1).max(MAX_AREA_LENGTH).optional(),
  outletId: z.string().trim().min(1).max(64).optional(),
});

// Buyer text to registered suggestions. The limiter admits the request before any model call
// (D9); a refused request makes none. A suggestion is never a price or a payment.
export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const tooLong = appError("validation_failed", `Describe what you want in ${MAX_TEXT_LENGTH} characters or fewer.`);
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...tooLong, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(tooLong);

  const db = webDb();
  const admission = await admit(db, "buyer_suggestion", principal.userId, SUGGESTION_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many suggestion requests. Pick a shop from the list instead.", { retryable: true, details: { window: admission.window } }));
  }

  const model = suggestionModel();
  if (!model) return httpErr(appError("provider_unreachable", "Text suggestions are not available. Pick a shop from the list instead."));

  const result = await suggestFromText(db, principal, parsed.data, now, model);
  if (result.kind === "unavailable") {
    return httpErr(appError("provider_unreachable", "Suggestions are not available right now. Pick a shop from the list instead.", { retryable: true }));
  }
  return httpOk({ suggestion: result });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
