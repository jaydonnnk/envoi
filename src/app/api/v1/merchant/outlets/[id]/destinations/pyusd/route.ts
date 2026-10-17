import { verifyWalletProof, WALLET_PROOF_COPY } from "@/domain/pyusd/challenge";
import { requirePyusdEnabled } from "@/domain/pyusd/identity";
import { signatureBytes, walletProofBody } from "@/domain/pyusd/input";
import { describeOutlet } from "@/domain/outlets/merchant";
import { webEnv } from "@/env";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Verifies a signed wallet challenge and records the outlet's PYUSD destination (S16). The body names
// only the challenge and the signature: the wallet comes from the saved challenge and the receiving
// account is derived. Records key control only; creates no membership and no enrollment.
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  const disabled = requirePyusdEnabled(webEnv());
  if (disabled) return httpErr(disabled);

  const parsed = walletProofBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Send the challenge id and the wallet's signature."));
  const proof = await verifyWalletProof(webDb(), webSolanaClient(), principal, { challengeId: parsed.data.challengeId, signature: signatureBytes(parsed.data.signature)! }, new Date());
  if (!proof.ok) {
    if (proof.reason === "rail_unavailable") return httpErr(appError("pyusd_unavailable", "PYUSD is unavailable right now. Nothing was recorded.", { details: { reason: proof.identity ?? "rpc_unavailable" } }));
    return httpErr(appError("wallet_proof_rejected", WALLET_PROOF_COPY[proof.reason], { details: { reason: proof.reason } }));
  }
  return httpOk({ outlet: await describeOutlet(webDb(), principal.outletId) });
}
