import { z } from "zod";
import { MAX_AREA_LENGTH, MAX_TEXT_LENGTH, suggestFromText } from "@/domain/suggestions/suggest";
import { suggestionModel } from "@/integrations/ai/openai";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { admit, SUGGESTION_LIMITS } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const body = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  area: z.string().trim().min(1).max(MAX_AREA_LENGTH).optional(),
});

// Buyer text to registered suggestions. The limiter admits the request before any model call
// (D9); a refused request makes none. A suggestion is never a price or a payment.
export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", `Describe what you want in ${MAX_TEXT_LENGTH} characters or fewer.`));

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
