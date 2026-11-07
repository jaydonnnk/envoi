import { webEnv } from "@/env";
import { isDemoSellerOutlet, sendFullRefund } from "@/domain/payments/refunds";
import { demoSellerWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A full refund from the signed-in member's own tap on Confirm (S45, Gate 2 "Flow: refund"). The
// model cannot call this route: the copilot only proposes, and the browser calls this with the
// order id when the member confirms. Membership comes first, then the demo seller check, so a
// refund is sent only for the labeled demo shop, on the demo seller's own write client. The
// amount is the verified capture's full gross from Envoi's record; the request carries no body.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; orderId: string }> }): Promise<Response> {
  const now = new Date();
  const { id, orderId } = await params;
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const env = webEnv();
  const client = demoSellerWriteClient(env);
  const off = appError("not_found", "Refunds are not available for this shop.");
  if (!client || !env.PAYPAL_DEMO_SELLER_MERCHANT_ID || !(await isDemoSellerOutlet(webDb(), principal.outletId, env.PAYPAL_DEMO_SELLER_MERCHANT_ID))) return httpErr(off);

  const refund = await sendFullRefund(webDb(), client, { outletId: principal.outletId, orderId, actorUserId: principal.userId, now });
  if (isAppError(refund)) return httpErr(refund);
  return httpOk({ refund });
}
