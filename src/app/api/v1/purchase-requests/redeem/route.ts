import { HANDOFF_BODY_BYTES, HANDOFF_BODY_READ_MS, parseJsonBytes, redeemBody } from "@/domain/handoffs/input";
import { redeemPurchaseRequest } from "@/domain/handoffs/redeem";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// The buyer's own session redeems a handoff once into a fresh server-priced review. The token
// travels in the body, never in this URL. Redemption authorizes no payment: the buyer still
// approves the exact amount on the review and in PayPal.
export async function POST(request: Request): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const invalid = appError("validation_failed", "Send the link's token.");
  const read = await readCountedBody(request.body, HANDOFF_BODY_BYTES, HANDOFF_BODY_READ_MS, request.signal);
  if (!read.ok) return httpErr({ ...invalid, details: { reason: read.reason } });
  const parsed = redeemBody.safeParse(parseJsonBytes(read.bytes));
  if (!parsed.success) return httpErr(invalid);

  const outcome = await redeemPurchaseRequest(webDb(), principal, parsed.data.token, new Date());
  switch (outcome.kind) {
    case "redeemed":
      return httpOk({ outcome: "redeemed", purchaseId: outcome.purchaseId }, { status: 201 });
    case "refused":
      return httpErr(outcome.error);
    default:
      return httpOk({ outcome: outcome.kind });
  }
}
