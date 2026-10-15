import { acknowledgeOrder } from "@/domain/purchases/orders";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

// Acknowledges a paid order. The path names no outlet, so the guard admits a merchant account and
// acknowledgeOrder scopes the order to the account's live memberships: an order of any other
// outlet answers exactly like a missing one. Acknowledgment never changes the payment state.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireMerchantMembership(getAuth(), webDb(), request.headers);
  if (!isMerchantAccount(principal)) return httpErr(principal);

  const result = await acknowledgeOrder(webDb(), { purchaseId: (await params).id, userId: principal.userId, now: new Date() });
  if (isAppError(result)) return httpErr(result);
  return httpOk(result);
}
