import { recordSignatureHint } from "@/domain/pyusd/attempts";
import { submittedBody } from "@/domain/pyusd/input";
import { getOwnPurchase } from "@/domain/purchases/review";
import { purchaseJson } from "@/domain/purchases/serialize";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError, isAppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// Records the signature the wallet returned as a hint for the owning buyer's attempt (S16). A hint
// changes no purchase state by itself: only a finalized read that passes verification binds it.
// Never subject to PYUSD_ENABLED, so a prepared attempt still converges with the rail switched off.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);

  const parsed = submittedBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Send the attempt id and the transaction signature."));
  const { id } = await params;
  const db = webDb();
  const result = await recordSignatureHint({ db, rpc: webSolanaClient(), now: systemNow }, principal, id, parsed.data);
  if (isAppError(result)) return httpErr(result);
  const after = await getOwnPurchase(db, principal, id, systemNow());
  if (!after) return httpErr(appError("not_found", "Purchase not found."));
  return httpOk({ recorded: result.recorded, check: result.check, purchase: purchaseJson(after) });
}
