import { getMenuDraft } from "@/domain/menu/draft";
import { triggerTouristReady } from "@/domain/menu/prepare";
import { draftJson } from "@/domain/menu/serialize";
import { describeOutlet } from "@/domain/outlets/merchant";
import { publishOutlet } from "@/domain/outlets/publish";
import { touristReadyTrigger } from "@/integrations/render/workflow";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { confirmBody } from "../../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Publishes exactly the reviewed version of the member's confirmed menu, only while enrollment,
// outlet confirmation, menu confirmation and an accepted PayPal sandbox connection all hold.
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const parsed = confirmBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Name the menu revision and version you reviewed."));

  const published = await publishOutlet(webDb(), {
    outletId: principal.outletId,
    revisionId: parsed.data.revisionId,
    version: parsed.data.version,
    actorUserId: principal.userId,
    now: new Date(),
  });
  if (isAppError(published)) return httpErr(published);
  // S50: prepare the tourist languages. Waits only for the start request, at most 3 seconds; a
  // failure is logged and the publish answers as before.
  const trigger = touristReadyTrigger();
  if (trigger) await triggerTouristReady({ outletId: principal.outletId, revisionId: published.revisionId }, trigger);
  const draft = await getMenuDraft(webDb(), principal.outletId);
  return httpOk({ outlet: await describeOutlet(webDb(), principal.outletId), draft: draft ? draftJson(draft) : null });
}
