import { reconcileAttempt } from "@/domain/payments/attempts";
import { webEnv } from "@/env";
import { paypalConfigFromEnv, type PayPalConfig } from "@/integrations/paypal/client";
import { paypalReadClient } from "@/integrations/paypal/orders-read";
import { recordPayPalEvent, verifyPayPalWebhookEvent } from "@/integrations/paypal/verify";
import { webDb } from "@/lib/db/web";
import { log } from "@/lib/log";
import { systemNow } from "@/lib/time";

export const dynamic = "force-dynamic";

let config: PayPalConfig | undefined;

const answer = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// PayPal webhook inbox (Gate 3 call stack): verify against this app's webhook id, deduplicate,
// then make a provider read due and perform it through the read-only client. Event content alone
// never marks anything paid, and this route never captures. A forged or unverifiable delivery
// changes nothing; PayPal retries a delivery that gets no 2xx.
export async function POST(request: Request): Promise<Response> {
  config ??= paypalConfigFromEnv(webEnv());
  const verification = await verifyPayPalWebhookEvent(config, request);
  if (!verification.verified) {
    log("warn", "paypal_webhook_rejected", { reason: verification.reason });
    return answer(verification.reason === "verification_unreachable" ? 503 : 400);
  }

  const db = webDb();
  const recorded = await recordPayPalEvent(db, verification, systemNow());
  log("info", "paypal_webhook_verified", {
    eventId: verification.eventId,
    eventType: verification.eventType,
    duplicate: recorded.duplicate,
    disposition: recorded.duplicate ? null : recorded.disposition,
  });
  if (recorded.duplicate || recorded.disposition !== "read_due" || !recorded.attemptId) return answer(200);

  const check = await reconcileAttempt({ db, read: paypalReadClient(), replay: null, now: systemNow, actor: "paypal_webhook" }, recorded.attemptId);
  log("info", "paypal_webhook_read", { eventId: verification.eventId, check });
  return answer(200);
}
