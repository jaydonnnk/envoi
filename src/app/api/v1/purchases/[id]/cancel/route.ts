import { cancelPurchase } from "@/domain/payments/attempts";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// Closes a purchase whose payment never reached capture. Not subject to the payments kill switch:
// closing never moves money.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const { id } = await params;
  const result = await cancelPurchase({ db: webDb(), now: systemNow }, principal, id);
  if ("code" in result) return httpErr(result);
  return httpOk(result);
}
