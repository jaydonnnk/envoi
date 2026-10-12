import { getOwnPurchase } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const { id } = await params;
  const purchase = await getOwnPurchase(webDb(), principal, id);
  // Another session's purchase answers exactly like a missing one.
  if (!purchase) return httpErr(appError("not_found", "Purchase not found."));
  return httpOk({ ...purchase, paymentAttempted: false });
}
