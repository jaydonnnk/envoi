import { z } from "zod";
import { startPayPal } from "@/domain/payments/attempts";
import { webEnv } from "@/env";
import { paypalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

const startBody = z.object({ funding: z.enum(["paypal", "crypto"]).optional() }).strict();

// The owning buyer continues from the current review: one attempt, one exact sandbox order, and
// the approval link. Repeated clicks get the same attempt and link.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const principal = await requireBuyerSession(getAuth(), request.headers);
  if (!isPrincipal(principal)) return httpErr(principal);

  // No body is a PayPal start, as it always was.
  const parsed = startBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return httpErr(appError("validation_failed", "Choose PayPal or crypto through PayPal."));

  const { id } = await params;
  const env = webEnv();
  const result = await startPayPal({ db: webDb(), paypal: paypalWriteClient(), now: systemNow, appBaseUrl: env.APP_BASE_URL, cryptoAllowlist: env.PAYPAL_CRYPTO_ENABLED }, principal, id, {}, parsed.data.funding ?? "paypal");
  if ("code" in result) return httpErr(result);
  return httpOk(result);
}
