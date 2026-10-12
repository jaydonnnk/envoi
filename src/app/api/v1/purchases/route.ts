import { z } from "zod";
import { MAX_LINES, priceBasket } from "@/domain/purchases/price";
import { createReview } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// The browser names an outlet, a rail and item ids with quantities. Any other field, such as a
// price, total or payee, is dropped here and never reaches pricing.
const body = z.object({
  outletId: z.string().min(1).max(64),
  rail: z.enum(["paypal", "pyusd"]),
  lines: z
    .array(z.object({ menuItemId: z.string().min(1).max(64), quantity: z.number().int() }))
    .min(1)
    .max(MAX_LINES),
});

export async function POST(request: Request): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Send an outletId, a rail and item lines with quantities."));

  const now = new Date();
  const db = webDb();
  const quote = await priceBasket(db, { outletId: parsed.data.outletId, lines: parsed.data.lines, rail: parsed.data.rail, now });
  if (!quote.ok) return httpErr(quote.error);

  const review = await createReview(db, principal, quote, now);
  if (review.kind === "conflict") return httpErr(review.error);
  return httpOk(
    { purchaseId: review.purchaseId, expiresAt: review.expiresAt.toISOString(), existing: review.kind === "existing_open_review" },
    { status: review.kind === "created" ? 201 : 200 },
  );
}
