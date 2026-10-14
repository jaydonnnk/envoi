import { updateMerchantOutlet } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { outletBody } from "../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Edits the name and area of the member's unpublished outlet.
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const parsed = outletBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Give the shop a name and an area."));

  const updated = await updateMerchantOutlet(webDb(), { ...parsed.data, outletId: principal.outletId, userId: principal.userId, now: new Date() });
  if (isAppError(updated)) return httpErr(updated);
  return httpOk({ outlet: updated });
}
