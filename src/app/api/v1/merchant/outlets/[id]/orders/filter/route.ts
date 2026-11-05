import { z } from "zod";
import { parseOrderFilter, singaporeDate } from "@/domain/purchases/order-filter";
import { orderFilterModel } from "@/integrations/ai/openai";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { admit, ORDER_FILTER_LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One sentence fits in far less; a slow or oversized body is refused unread.
const MAX_BODY_BYTES = 2_048;
const BODY_READ_MS = 5_000;

const body = z.object({ text: z.string().trim().min(1).max(300) }).strict();

// Ask your orders (S35): a member's sentence in, a validated filter out. Membership comes first and
// the limiter runs before any model call. This route reads no order, writes no order and stores no
// sentence; the browser applies the filter to rows it already holds.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const now = new Date();
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const invalid = appError("validation_failed", "Send one sentence of at most 300 characters.");
  const read = await readCountedBody(request.body, MAX_BODY_BYTES, BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = body.safeParse(parseJson(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const unavailable = appError("provider_unreachable", "Envoi could not read that sentence. No filter changed. You can still sort and filter the table.", { retryable: true });
  const model = orderFilterModel();
  if (!model) return httpErr(unavailable);

  const admission = await admit(webDb(), "merchant_order_filter", principal.outletId, ORDER_FILTER_LIMITS, now);
  if (admission.kind === "rate_limited") {
    return httpErr(appError("rate_limited", "Too many questions for now. No filter changed. You can still sort and filter the table.", { retryable: true, details: { window: admission.window } }));
  }

  const filter = await parseOrderFilter(parsed.data.text, singaporeDate(now), model);
  if (!filter) return httpErr(unavailable);
  return httpOk({ filter });
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
