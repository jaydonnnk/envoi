import { draftJson } from "@/domain/menu/serialize";
import { createMerchantOutlet, listMerchantOutlets } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { outletBody } from "./input";

export const dynamic = "force-dynamic";

// The signed-in merchant's outlets and whether an approved membership lets it create another.
export async function GET(request: Request): Promise<Response> {
  const principal = await requireMerchantMembership(getAuth(), webDb(), request.headers);
  if (!isMerchantAccount(principal)) return httpErr(principal);
  return httpOk(await listMerchantOutlets(webDb(), principal.userId));
}

// Creates an unpublished outlet with an empty menu draft, using up one approved membership, and
// returns both.
export async function POST(request: Request): Promise<Response> {
  const principal = await requireMerchantMembership(getAuth(), webDb(), request.headers);
  if (!isMerchantAccount(principal)) return httpErr(principal);

  const parsed = outletBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Give the shop a name and an area."));

  const created = await createMerchantOutlet(webDb(), { ...parsed.data, userId: principal.userId, now: new Date() });
  if (isAppError(created)) return httpErr(created);
  return httpOk({ outlet: created.outlet, draft: draftJson(created.draft) }, { status: 201 });
}
