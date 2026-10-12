import { startPayPal } from "@/domain/payments/attempts";
import { webEnv } from "@/env";
import { paypalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// The owning buyer continues from the current review: one attempt, one exact sandbox order, and
// the approval link. Repeated clicks get the same attempt and link.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const { id } = await params;
  const result = await startPayPal({ db: webDb(), paypal: paypalWriteClient(), now: systemNow, appBaseUrl: webEnv().APP_BASE_URL }, principal, id);
  if ("code" in result) return httpErr(result);
  return httpOk(result);
}
