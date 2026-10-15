import { listOutletOrders } from "@/domain/purchases/orders";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// The member's outlet orders, newest first, each with its payment state derived on read and its
// acknowledgment as a separate field. Merchant polling reads this route within the S3 bounds.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const orders = await listOutletOrders(webDb(), principal.outletId, new Date());
  if (!orders) return httpErr(appError("not_found", "Shop not found."));
  return httpOk(orders);
}
