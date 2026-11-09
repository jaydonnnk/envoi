import { draftJson } from "@/domain/menu/serialize";
import { createMerchantOutlet, createPendingOutlet, listMerchantOutlets, type CreatedOutlet, type OutletInput } from "@/domain/outlets/merchant";
import { merchantSignupOpen } from "@/env";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, isSignupAccount, requireMerchantMembership, requireSignupAccount } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError, type AppError } from "@/lib/errors";
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
// returns both. S43: while public signup is open, a permanent account with no membership
// row creates its one pending shop instead (Gate 3 S43 amendment decision 7).
export async function POST(request: Request): Promise<Response> {
  const member = await requireMerchantMembership(getAuth(), webDb(), request.headers);
  let create: (input: OutletInput & { userId: string; now: Date }) => Promise<CreatedOutlet | AppError> = (input) => createMerchantOutlet(webDb(), input);
  let userId: string;
  if (isMerchantAccount(member)) {
    userId = member.userId;
  } else {
    if (member.code !== "forbidden_membership" || !merchantSignupOpen()) return httpErr(member);
    const stranger = await requireSignupAccount(getAuth(), request.headers);
    if (!isSignupAccount(stranger)) return httpErr(stranger);
    userId = stranger.userId;
    create = (input) => createPendingOutlet(webDb(), input);
  }

  const parsed = outletBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Give the shop a name and an area."));

  const created = await create({ ...parsed.data, userId, now: new Date() });
  if (isAppError(created)) return httpErr(created);
  // The same shape GET menu-draft answers: a new shop has had no photo import.
  return httpOk({ outlet: created.outlet, draft: { ...draftJson(created.draft), latestImport: null } }, { status: 201 });
}
