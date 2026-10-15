import { importJson, latestImport } from "@/domain/imports/lifecycle";
import { getMenuDraft, saveMenuDraft } from "@/domain/menu/draft";
import { draftJson } from "@/domain/menu/serialize";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { draftBody } from "../../input";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// The member's current menu draft with its version and completeness, and since S11 the outcome of
// its latest photo import, derived on read in a read-only transaction: an abandoned import reads as
// expired and nothing is written. Buyers never read it.
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const now = new Date();
  const read = await webDb().transaction(
    async (tx) => ({ draft: await getMenuDraft(tx, principal.outletId), latest: await latestImport(tx, principal.outletId, now) }),
    { accessMode: "read only" },
  );
  if (!read.draft) return httpErr(appError("not_found", "This shop has no menu draft."));
  return httpOk({ ...draftJson(read.draft), latestImport: read.latest ? importJson(read.latest) : null });
}

// Replaces the draft's items when the write names the current revision and version; otherwise
// revision_conflict and nothing changes. Any confirmation of the draft is invalidated.
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);

  const parsed = draftBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return httpErr(appError("validation_failed", "Each item needs a name of up to 120 characters, a price in whole cents above zero or blank, and an availability."));
  }

  const saved = await saveMenuDraft(webDb(), {
    outletId: principal.outletId,
    revisionId: parsed.data.revisionId,
    baseVersion: parsed.data.version,
    items: parsed.data.items,
    actorUserId: principal.userId,
    now: new Date(),
  });
  if (isAppError(saved)) return httpErr(saved);
  return httpOk(draftJson(saved));
}
