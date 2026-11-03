import { z } from "zod";
import { getOrCreateTranslation, languageName } from "@/domain/menu/translate";
import { menuTranslator } from "@/integrations/ai/openai";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { admit, TRANSLATION_LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An outlet id and a language subtag fit in far less; a slow or oversized body is refused unread
// (Gate 3 reopening 2026-10-29).
const MAX_BODY_BYTES = 1_024;
const BODY_READ_MS = 5_000;

const body = z.object({ outletId: z.string().min(1).max(64), language: z.string().refine((tag) => languageName(tag) !== null) }).strict();

// The menu explained and translated (S29): the published menu's names in the buyer's browser
// language, beside the shop's own. The limiter admits the request before any model call; a cached
// answer makes none. The answer carries item ids and text only, never a price or availability.
export async function POST(request: Request): Promise<Response> {
  const now = new Date();
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const invalid = appError("validation_failed", "Send a shop and a language such as zh.");
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const admission = await admit(webDb(), "menu_translation", principal.userId, TRANSLATION_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many translation requests. The shop's original menu is shown.", { retryable: true, details: { window: admission.window } }));
  }

  const result = await getOrCreateTranslation(webDb(), parsed.data.outletId, parsed.data.language, now, menuTranslator());
  if (result.kind === "not_found") return httpErr(appError("not_found", "That shop is not on Envoi."));
  if (result.kind === "unavailable") return httpErr(appError("provider_unreachable", "The translation is not available. The shop's original menu is shown.", { retryable: true }));
  return httpOk({ menuRevisionId: result.menuRevisionId, language: result.language, items: result.items });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
