import { z } from "zod";
import { webEnv } from "@/env";
import { requestSeller } from "@/domain/outlets/destination";
import { PAYPAL_MERCHANT_ID } from "@/domain/outlets/paypal-id";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError, unknownRouteError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { assertSameOrigin } from "@/lib/http/origin";

// S43 (Gate 3 S43 amendment decision 8): a pending shop's member submits a sandbox seller id for the
// operator's review. It creates no destination. While MERCHANT_SIGNUP_ENABLED is not true the route
// answers like a missing one.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const requestBody = z.object({ sellerMerchantId: z.string().trim().toUpperCase() });

export async function POST(request: Request, { params }: Params): Promise<Response> {
  if (webEnv().MERCHANT_SIGNUP_ENABLED !== "true") return httpErr(unknownRouteError());
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);

  const parsed = requestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !PAYPAL_MERCHANT_ID.test(parsed.data.sellerMerchantId)) {
    return httpErr(appError("validation_failed", "Enter your PayPal sandbox seller id: 13 characters, 2-9 and A-Z without I or O.", { details: { reason: "seller_id_format" } }));
  }
  const outlet = await requestSeller(webDb(), { outletId: principal.outletId, sellerMerchantId: parsed.data.sellerMerchantId, userId: principal.userId, now: new Date() });
  if (isAppError(outlet)) return httpErr(outlet);
  return httpOk({ outlet });
}
