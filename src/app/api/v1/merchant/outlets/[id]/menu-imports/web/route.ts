import { runWebImport } from "@/domain/imports/request";
import { isPendingSelfSignup } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr } from "@/lib/http/respond";
import { assertSameOrigin } from "@/lib/http/origin";

// Web menu import (S24): the photo route's session, membership and same-origin checks, then one
// Kernel read of the merchant's own menu page and one text draft, inside this request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  // S43: a self-created shop reaches no import until its enrollment is approved.
  if (await isPendingSelfSignup(webDb(), principal.outletId)) return httpErr(appError("not_found", "Menu import opens once an Envoi admin approves your shop."));
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  return runWebImport(webDb(), request, principal);
}
