import { acceptPayPalConnection } from "@/domain/outlets/destination";
import { describeOutlet } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { paypalConnectionBody } from "../../../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Selects the PayPal sandbox connection the operator prepared for the member's outlet. A seller id
// that is not that connection's is refused and nothing changes.
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const parsed = paypalConnectionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Choose the PayPal sandbox connection prepared for this shop."));

  const accepted = await acceptPayPalConnection(webDb(), {
    outletId: principal.outletId,
    sellerMerchantId: parsed.data.sellerMerchantId,
    userId: principal.userId,
    now: new Date(),
  });
  if (isAppError(accepted)) return httpErr(accepted);
  return httpOk({ outlet: await describeOutlet(webDb(), principal.outletId) });
}
