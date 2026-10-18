import { buyerActor } from "@/domain/audit/events";
import { reconcileAttempt } from "@/domain/payments/attempts";
import { reconcilePyusdAttempt } from "@/domain/pyusd/reconcile";
import { getOwnPurchase } from "@/domain/purchases/review";
import { purchaseJson } from "@/domain/purchases/serialize";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import { paypalWriteClient } from "@/integrations/paypal/orders";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// "Check status": one bounded provider read for the owner's purchase, at most once per
// T_PROVIDER_READ_DEBOUNCE per attempt, with a same-key capture replay when a PayPal capture outcome
// is unknown, or the verification of a PYUSD attempt's readable signature hint (S16). Never subject
// to the payments kill switch: checking moves no new money.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  const { id } = await params;
  const db = webDb();
  const before = await getOwnPurchase(db, principal, id, systemNow());
  if (!before) return httpErr(appError("not_found", "Purchase not found."));
  if (before.view.state !== before.state) await applyDerivedTransitions(db, id, systemNow());

  // One shared route for both rails. A PYUSD attempt reads devnet through the shared limiter; it is
  // never subject to PYUSD_ENABLED.
  const check = !before.attempt
    ? "no_order"
    : before.attempt.rail === "pyusd"
      ? await reconcilePyusdAttempt({ db, rpc: webSolanaClient(), now: systemNow }, before.attempt.id, buyerActor(principal.userId))
      : await reconcileAttempt({ db, read: paypalWriteClient(), replay: paypalWriteClient(), now: systemNow, actor: buyerActor(principal.userId) }, before.attempt.id);
  const after = await getOwnPurchase(db, principal, id, systemNow());
  if (!after) return httpErr(appError("not_found", "Purchase not found."));
  return httpOk({ check, purchase: purchaseJson(after) });
}
