import { getBase64Decoder } from "@solana/kit";
import { issueWalletChallenge } from "@/domain/pyusd/challenge";
import { requirePyusdEnabled } from "@/domain/pyusd/identity";
import { walletChallengeBody } from "@/domain/pyusd/input";
import { webEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Issues a five-minute, single-use wallet challenge for the member's outlet (S16). Its domain and URI
// come from APP_BASE_URL, never the Host header; at most 10 per outlet in an hour.
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  const disabled = requirePyusdEnabled(webEnv());
  if (disabled) return httpErr(disabled);

  const parsed = walletChallengeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return httpErr(appError("validation_failed", "Connect a Solana devnet wallet first."));
  const issued = await issueWalletChallenge(webDb(), principal, parsed.data.walletAddress, webEnv().APP_BASE_URL, new Date());
  if ("error" in issued) return httpErr(issued.error);
  return httpOk(
    {
      challengeId: issued.challengeId,
      message: new TextDecoder().decode(issued.message),
      messageBase64: getBase64Decoder().decode(issued.message),
      expiresAt: issued.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
