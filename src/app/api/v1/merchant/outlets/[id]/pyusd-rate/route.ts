import { describeOutlet } from "@/domain/outlets/merchant";
import { requirePyusdEnabled } from "@/domain/pyusd/identity";
import { pyusdRateBody } from "@/domain/pyusd/input";
import { parsePyusdPerSgd, setPyusdRate } from "@/domain/pyusd/rate";
import { webEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import { isOutletMember, requireOutletMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Appends or re-confirms the shop's PYUSD rate (S16): PYUSD per S$1 as a plain decimal with at most
// six places, from 0.000001 to 10. Every call is a new dated version.
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const principal = await requireOutletMembership(getAuth(), webDb(), request.headers, (await params).id);
  if (!isOutletMember(principal)) return httpErr(principal);
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);
  const disabled = requirePyusdEnabled(webEnv());
  if (disabled) return httpErr(disabled);

  const parsed = pyusdRateBody.safeParse(await request.json().catch(() => null));
  const rate = parsed.success ? parsePyusdPerSgd(parsed.data.pyusdPerSgd) : null;
  if (!rate?.ok) {
    return httpErr(
      appError("validation_failed", "Enter PYUSD per S$1 as a plain number with at most six decimal places, from 0.000001 to 10, for example 0.742115.", {
        details: { reason: rate?.reason ?? "not_plain_six_place_decimal" },
      }),
    );
  }
  await setPyusdRate(webDb(), principal, rate.atomicPerSgd, new Date());
  return httpOk({ outlet: await describeOutlet(webDb(), principal.outletId) });
}
