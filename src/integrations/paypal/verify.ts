import { eq } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { paymentAttempts, providerEvents, type PROVIDER_EVENT_DISPOSITIONS } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { createPayPalHttp, type PayPalConfig, type PayPalHttp } from "./client";

// Webhook signature verification and event dedupe (Gate 3, Files). A delivery counts only after
// PayPal's verify-webhook-signature postback confirms it against this app's webhook id, with the
// event passed byte for byte as it arrived. Event content never decides a payment: a verified
// event can only make a provider read due.

export const MAX_WEBHOOK_BYTES = 64 * 1024;

export type WebhookRejection = "body_too_large" | "malformed_event" | "missing_headers" | "signature_rejected" | "verification_unreachable";

export type VerifiedPayPalEvent = { verified: true; eventId: string; eventType: string; resourceType: string; knownOrderId: string | null };

export type WebhookVerification = VerifiedPayPalEvent | { verified: false; reason: WebhookRejection };

const IDENTIFIER = /^[A-Za-z0-9._-]{1,128}$/;
const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

// Counts the body as it streams instead of trusting Content-Length. Null once it passes the bound.
async function readBoundedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Order events carry the order id; capture events carry it in their related ids.
function orderIdOf(event: Json): string | null {
  const resource = isObject(event.resource) ? event.resource : null;
  if (!resource) return null;
  let candidate: unknown = null;
  if (event.resource_type === "checkout-order") candidate = resource.id;
  if (event.resource_type === "capture") {
    const supplementary = isObject(resource.supplementary_data) ? resource.supplementary_data : null;
    const related = supplementary && isObject(supplementary.related_ids) ? supplementary.related_ids : null;
    candidate = related?.order_id ?? null;
  }
  return typeof candidate === "string" && ORDER_ID.test(candidate) ? candidate : null;
}

const httpByConfig = new WeakMap<PayPalConfig, PayPalHttp>();

function httpFor(cfg: PayPalConfig): PayPalHttp {
  let http = httpByConfig.get(cfg);
  if (!http) {
    http = createPayPalHttp(cfg);
    httpByConfig.set(cfg, http);
  }
  return http;
}

export async function verifyPayPalWebhookEvent(cfg: PayPalConfig, req: Request): Promise<WebhookVerification> {
  const raw = await readBoundedText(req, MAX_WEBHOOK_BYTES);
  if (raw === null) return { verified: false, reason: "body_too_large" };

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return { verified: false, reason: "malformed_event" };
  }
  if (!isObject(event)) return { verified: false, reason: "malformed_event" };
  const { id: eventId, event_type: eventType, resource_type: resourceType } = event;
  if (typeof eventId !== "string" || typeof eventType !== "string" || typeof resourceType !== "string") return { verified: false, reason: "malformed_event" };
  if (!IDENTIFIER.test(eventId) || !IDENTIFIER.test(eventType) || !IDENTIFIER.test(resourceType)) return { verified: false, reason: "malformed_event" };

  const header = (name: string) => req.headers.get(name);
  const transmission = {
    auth_algo: header("paypal-auth-algo"),
    cert_url: header("paypal-cert-url"),
    transmission_id: header("paypal-transmission-id"),
    transmission_sig: header("paypal-transmission-sig"),
    transmission_time: header("paypal-transmission-time"),
  };
  if (Object.values(transmission).some((value) => !value)) return { verified: false, reason: "missing_headers" };
  // A client configured without a webhook registration, as maintenance's is, verifies nothing.
  if (cfg.webhookId === null) return { verified: false, reason: "verification_unreachable" };

  // The event goes back to PayPal exactly as it arrived; re-serializing it could change the bytes
  // the signature covers.
  const fields = Object.entries({ ...transmission, webhook_id: cfg.webhookId }).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  const body = `{${fields.join(",")},"webhook_event":${raw}}`;
  const result = await httpFor(cfg).send({ method: "POST", path: "/v1/notifications/verify-webhook-signature", rawBody: body });
  if (result.kind !== "ok") {
    // A 4xx means PayPal refused to verify this delivery; anything else is "not now".
    const refused = result.kind === "http_error" && result.status >= 400 && result.status < 500 && result.status !== 429;
    return { verified: false, reason: refused ? "signature_rejected" : "verification_unreachable" };
  }
  if (!isObject(result.value) || result.value.verification_status !== "SUCCESS") return { verified: false, reason: "signature_rejected" };

  return { verified: true, eventId, eventType, resourceType, knownOrderId: orderIdOf(event) };
}

export type EventDisposition = (typeof PROVIDER_EVENT_DISPOSITIONS)[number];

export type RecordedEvent = { duplicate: true } | { duplicate: false; disposition: EventDisposition; attemptId: string | null };

// The inbox write. A second delivery of one event id inserts nothing and changes nothing. An event
// for an order Envoi never created changes no purchase and leaves an operator-visible record. A
// known order only becomes due for a provider read.
export async function recordPayPalEvent(db: Db, event: VerifiedPayPalEvent, now: Date): Promise<RecordedEvent> {
  return db.transaction(async (tx): Promise<RecordedEvent> => {
    const [attempt] = event.knownOrderId
      ? await tx.select({ id: paymentAttempts.id }).from(paymentAttempts).where(eq(paymentAttempts.orderId, event.knownOrderId))
      : [];
    const disposition: EventDisposition = !event.knownOrderId ? "no_order" : attempt ? "read_due" : "quarantined_unknown_order";

    const inserted = await tx
      .insert(providerEvents)
      .values({
        id: newId("pev"),
        provider: "paypal",
        eventId: event.eventId,
        eventType: event.eventType,
        resourceType: event.resourceType,
        orderId: event.knownOrderId,
        attemptId: attempt?.id ?? null,
        disposition,
        receivedAt: now,
      })
      .onConflictDoNothing({ target: [providerEvents.provider, providerEvents.eventId] })
      .returning({ id: providerEvents.id });
    if (inserted.length === 0) return { duplicate: true };

    if (disposition === "read_due" && attempt) {
      await tx.update(paymentAttempts).set({ providerReadDueAt: now }).where(eq(paymentAttempts.id, attempt.id));
    }
    if (disposition === "quarantined_unknown_order") {
      await recordAudit(tx, {
        at: now,
        actor: "paypal_webhook",
        action: "paypal_webhook_unknown_order",
        operatorVisible: true,
        details: { eventId: event.eventId, eventType: event.eventType, orderId: event.knownOrderId },
      });
    }
    return { duplicate: false, disposition, attemptId: attempt?.id ?? null };
  });
}
