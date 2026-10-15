import { runMenuImport } from "@/domain/imports/request";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { httpErr } from "@/lib/http/respond";
import { assertSameOrigin } from "@/lib/http/origin";

// Menu photo import (S11): a Node route handler that no proxy matcher covers, so the upload body is
// never cloned or buffered before the membership guard, the origin check and admission run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  return runMenuImport(webDb(), request, principal);
}
