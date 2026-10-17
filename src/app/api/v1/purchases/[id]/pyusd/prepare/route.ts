import { preparePyusdPayment } from "@/domain/pyusd/attempts";
import { requirePyusdEnabled } from "@/domain/pyusd/identity";
import { prepareBody } from "@/domain/pyusd/input";
import { webEnv } from "@/env";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

// Prepares the owning buyer's PYUSD review for the chosen wallet (S16): saves and locks the attempt,
// then returns the unsigned transfer once. A purchase that already has an attempt answers
// wallet_attempt_locked with its state, never the bytes again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  const disabled = requirePyusdEnabled(webEnv());
  if (disabled) return httpErr(disabled);

  const parsed = prepareBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Choose a Solana devnet wallet first."));
  const { id } = await params;
  const preparation = await preparePyusdPayment({ db: webDb(), rpc: webSolanaClient(), now: systemNow }, principal, id, parsed.data.walletAddress);
  switch (preparation.kind) {
    case "refused":
      return httpErr(preparation.error);
    case "locked":
      return httpErr(
        appError("wallet_attempt_locked", "This PYUSD payment was already prepared. We are checking it; do not pay again.", {
          details: { attemptId: preparation.attemptId, state: preparation.state },
        }),
      );
    case "prepared":
      return httpOk({ attemptId: preparation.attemptId, transactionBase64: preparation.transactionBase64, chain: preparation.chain }, { status: 201 });
  }
}
