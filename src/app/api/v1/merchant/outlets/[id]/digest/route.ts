import { z } from "zod";
import { composeDigest, DIGEST_LANGUAGES, type DigestAnswer, hasApprovedEnrollment, offeredPlaceholders } from "@/domain/purchases/digest";
import { singaporeDate } from "@/domain/purchases/order-filter";
import { salesSummary } from "@/domain/purchases/sales-summary";
import { DIGEST_PROMPT_VERSION, digestModel } from "@/integrations/ai/digest";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";
import { admit, DIGEST_LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256;
const BODY_READ_MS = 5_000;
const DAY_MS = 86_400_000;
// Singapore keeps UTC+8 all year.
const SINGAPORE_OFFSET_MS = 8 * 3_600_000;

const body = z.object({ language: z.enum(DIGEST_LANGUAGES) }).strict();

const midnight = (date: string) => new Date(Date.parse(`${date}T00:00:00.000Z`) - SINGAPORE_OFFSET_MS);

// The weekly summary (S47, Gate 3 S47 amendment call stack): membership, the approved enrollment, the
// body, the model's configuration, the limiter, then the server's totals over the same seven Singapore
// dates as the desk's tiles. An empty week makes no model call. Otherwise one tool-free call writes a
// template from placeholder names only, and code fills it per currency. A refused template shows
// nothing. Nothing is stored.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const now = new Date();
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  if (!(await hasApprovedEnrollment(webDb(), principal.outletId))) return httpErr(appError("not_found", "There is no weekly summary for this shop."));

  const invalid = appError("validation_failed", "Choose English, 中文, Melayu or தமிழ்.");
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const unavailable = appError("provider_unreachable", "Envoi could not write this week's summary. The totals above are unchanged.", { retryable: true });
  const model = digestModel();
  if (!model) return httpErr(unavailable);

  const admission = await admit(webDb(), "merchant_digest", principal.outletId, DIGEST_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many summaries for now. The totals above are unchanged.", { retryable: true, details: { window: admission.window } }));
  }

  const to = singaporeDate(now);
  const from = singaporeDate(new Date(now.getTime() - 6 * DAY_MS));
  const summaries = await salesSummary(webDb(), principal.outletId, midnight(from), new Date(midnight(to).getTime() + DAY_MS));
  if (summaries.length === 0) return httpOk<DigestAnswer>({ from, to, digest: { kind: "empty" } });

  const placeholders = offeredPlaceholders(summaries);
  const template = await model({ language: parsed.data.language, placeholders });
  if (template === null) return httpErr(unavailable);

  const digest = composeDigest(summaries, template);
  if (digest.kind === "refused") {
    log("warn", "digest_refused", { reason: digest.reason, promptVersion: DIGEST_PROMPT_VERSION, language: parsed.data.language });
    return httpOk<DigestAnswer>({ from, to, digest: { kind: "refused" } });
  }
  return httpOk<DigestAnswer>({ from, to, digest });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
