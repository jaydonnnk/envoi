import { getOwnPurchase } from "@/domain/purchases/review";
import { purchaseJson } from "@/domain/purchases/serialize";
import { applyDerivedTransitions } from "@/domain/purchases/state";
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
  const now = new Date();
  const purchase = await getOwnPurchase(webDb(), principal, id, now);
  // Another session's purchase answers exactly like a missing one.
  if (!purchase) return httpErr(appError("not_found", "Purchase not found."));
  // This read is a touch: store what the derived view already shows.
  if (purchase.view.state !== purchase.state) await applyDerivedTransitions(webDb(), id, now);
  return httpOk(purchaseJson(purchase));
}
