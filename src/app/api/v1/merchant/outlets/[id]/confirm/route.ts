import { confirmMenuDraft } from "@/domain/menu/confirm";
import { draftJson } from "@/domain/menu/serialize";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { confirmBody } from "../../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Confirms exactly the named, complete version of the member's menu draft. Confirmation does not
// publish anything; buyers still cannot see the shop.
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const parsed = confirmBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Name the menu revision and version you reviewed."));

  const confirmed = await confirmMenuDraft(webDb(), {
    outletId: principal.outletId,
    revisionId: parsed.data.revisionId,
    version: parsed.data.version,
    actorUserId: principal.userId,
    now: new Date(),
  });
  if (isAppError(confirmed)) return httpErr(confirmed);
  return httpOk(draftJson(confirmed));
}
