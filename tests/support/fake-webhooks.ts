import { createHash, createHmac, randomBytes } from "node:crypto";
import { PAYPAL_SANDBOX_API_BASE } from "@/integrations/paypal/client";
import { TEST_BASE_URL } from "./session";

// FIXTURE: PayPal's webhook delivery and its verify-webhook-signature postback, faked at fetch.
// A fixture key signs the exact event bytes with the transmission id, time and webhook id; the fake
// postback answers SUCCESS only for that signature and this test app's webhook id. Nothing here
// talks to PayPal, and no real PayPal signature scheme is reproduced.

export const FIXTURE_WEBHOOK_ID = "FIXTURE-WEBHOOK-ID";
const FIXTURE_KEY = "fixture-webhook-signing-key";

const sign = (transmissionId: string, time: string, webhookId: string, rawEvent: string) =>
  createHmac("sha256", FIXTURE_KEY).update(`${transmissionId}|${time}|${webhookId}|${createHash("sha256").update(rawEvent).digest("hex")}`).digest("base64");

export type FixtureEvent = { id: string; event_type: string; resource_type: string; resource: Record<string, unknown> };

export function orderEvent(type: string, orderId: string, id = `FIXTURE-WH-${randomBytes(4).toString("hex")}`): FixtureEvent {
  return { id, event_type: type, resource_type: "checkout-order", resource: { id: orderId, status: type === "CHECKOUT.ORDER.APPROVED" ? "APPROVED" : "COMPLETED" } };
}

export function captureEvent(type: string, orderId: string, captureId: string, id = `FIXTURE-WH-${randomBytes(4).toString("hex")}`): FixtureEvent {
  const status = type.split(".").at(-1) ?? "COMPLETED";
  return {
    id,
    event_type: type,
    resource_type: "capture",
    resource: { id: captureId, status, amount: { currency_code: "SGD", value: "999.00" }, supplementary_data: { related_ids: { order_id: orderId } } },
  };
}

// A delivery as PayPal would POST it. `forge` replaces the body after signing.
export function delivery(event: FixtureEvent, options: { forge?: (raw: string) => string; webhookId?: string } = {}): Request {
  const raw = JSON.stringify(event);
  const transmissionId = randomBytes(8).toString("hex");
  const time = new Date().toISOString();
  const signature = sign(transmissionId, time, options.webhookId ?? FIXTURE_WEBHOOK_ID, raw);
  return new Request(`${TEST_BASE_URL}/api/v1/integrations/paypal/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/FIXTURE-CERT",
      "paypal-transmission-id": transmissionId,
      "paypal-transmission-sig": signature,
      "paypal-transmission-time": time,
    },
    body: options.forge ? options.forge(raw) : raw,
  });
}

export type VerificationCall = { webhookId: string; status: "SUCCESS" | "FAILURE" };

// Installs the fake postback on globalThis.fetch. Every other request fails loudly.
export function fakeVerificationFetch(calls: VerificationCall[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${PAYPAL_SANDBOX_API_BASE}/v1/oauth2/token`) return Response.json({ access_token: "FIXTURE-TOKEN", expires_in: 3600 });
    if (url === `${PAYPAL_SANDBOX_API_BASE}/v1/notifications/verify-webhook-signature`) {
      const body = String(init?.body ?? "");
      // The event must arrive byte for byte; cut it out of the raw postback body.
      const marker = '"webhook_event":';
      const rawEvent = body.slice(body.indexOf(marker) + marker.length, -1);
      const fields = JSON.parse(body) as Record<string, string>;
      const expected = sign(fields.transmission_id!, fields.transmission_time!, fields.webhook_id!, rawEvent);
      const status = fields.transmission_sig === expected && fields.webhook_id === FIXTURE_WEBHOOK_ID ? "SUCCESS" : "FAILURE";
      calls.push({ webhookId: fields.webhook_id!, status });
      return Response.json({ verification_status: status });
    }
    throw new Error(`unexpected fetch in a webhook test: ${url}`);
  }) as typeof fetch;
}
