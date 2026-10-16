import { submitOutletIdentifier, updateMerchantOutlet } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";
import { identifierBody, outletUpdateBody } from "../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Edits the name and area of the member's unpublished outlet, and sets or clears its confirmation.
// S9: a body naming an identifier instead submits a pending identifier mapping.
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const body: unknown = await request.json().catch(() => null);
  if (typeof body === "object" && body !== null && "identifier" in body) {
    const submission = identifierBody.safeParse(body);
    if (!submission.success) return httpErr(appError("validation_failed", "Give the identifier, its scheme and what distinguishes this outlet."));
    const submitted = await submitOutletIdentifier(webDb(), { ...submission.data.identifier, outletId: principal.outletId, userId: principal.userId, now: new Date() });
    // Outcome only: the payload and the identifier never reach the log.
    log("info", "identifier_submission", { outletId: principal.outletId, outcome: isAppError(submitted) ? String(submitted.details?.reason ?? submitted.code) : "pending" });
    if (isAppError(submitted)) return httpErr(submitted);
    return httpOk({ outlet: submitted });
  }

  const parsed = outletUpdateBody.safeParse(body);
  if (!parsed.success) return httpErr(appError("validation_failed", "Give the shop a name and an area."));

  const updated = await updateMerchantOutlet(webDb(), { ...parsed.data, outletId: principal.outletId, userId: principal.userId, now: new Date() });
  if (isAppError(updated)) return httpErr(updated);
  return httpOk({ outlet: updated });
}
