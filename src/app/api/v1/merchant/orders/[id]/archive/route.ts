import { archiveOrder } from "@/domain/purchases/orders";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { isAppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// Archives an order (S18): the merchant's Delete only hides it from their list. The path names no
// outlet, so the guard admits a merchant account and archiveOrder scopes the order to the account's
// live memberships: an order of any other outlet answers exactly like a missing one. The payment,
// the buyer's receipt and the acknowledgment never change.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireMerchantMembership(getAuth(), webDb(), request.headers);
  if (!isMerchantAccount(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);

  const result = await archiveOrder(webDb(), { purchaseId: (await params).id, userId: principal.userId, now: new Date() });
  if (isAppError(result)) return httpErr(result);
  return httpOk(result);
}
