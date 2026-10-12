import { z } from "zod";
import { createTracerReview } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// S1 tracer: the body names an outlet only. Lines, prices, payees and rails are refused, and the
// server stores its fixed fixture basket. S2 replaces this with real pricing.
const body = z.strictObject({ outletId: z.string().min(1).max(64) });

export async function POST(request: Request): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Send only an outletId."));

  const review = await createTracerReview(webDb(), principal, parsed.data.outletId, new Date());
  if ("code" in review) return httpErr(review);
  return httpOk({ purchaseId: review.purchaseId, expiresAt: review.expiresAt.toISOString() }, { status: 201 });
}
