import { completePayPal } from "@/domain/payments/attempts";
import { webEnv } from "@/env";
import { paypalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// After the buyer approved at PayPal: re-read and verify the bound order, then capture it exactly
// once under a lease. Query values from the return URL are never consulted.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const { id } = await params;
  const result = await completePayPal({ db: webDb(), paypal: paypalWriteClient(), now: systemNow, appBaseUrl: webEnv().APP_BASE_URL }, principal, id);
  if ("code" in result) return httpErr(result);
  return httpOk(result, { status: result.status === "in_flight" || result.status === "awaiting_approval" ? 202 : 200 });
}
