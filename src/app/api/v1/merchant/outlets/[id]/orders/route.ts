import { listOutletOrders } from "@/domain/purchases/orders";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// The member's outlet orders, newest first, a page at a time: `?before=<order id>` reads the page
// older than that order. Each order carries its payment state derived on read and its acknowledgment
// as a separate field. Merchant polling reads the newest page within the S3 bounds.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const before = new URL(request.url).searchParams.get("before");
  if (before !== null && (before.length === 0 || before.length > 64)) return httpErr(appError("validation_failed", "Send the id of an order as before."));
  const orders = await listOutletOrders(webDb(), principal.outletId, new Date(), before);
  if (!orders) return httpErr(appError("not_found", "Shop not found."));
  if (isAppError(orders)) return httpErr(orders);
  return httpOk(orders);
}
