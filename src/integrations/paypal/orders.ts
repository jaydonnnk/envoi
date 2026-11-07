import type { PayPalFunding } from "@/domain/payments/state";
import type { PayPalOrder } from "@/domain/purchases/reconcile";
import { webEnv, type WebEnv } from "@/env";
import { money, toDecimalString, type Currency } from "@/lib/money";
import { createPayPalHttp, paypalConfigFromEnv, type PayPalConfig, type ProviderResult } from "./client";
import { mapOrderResult, orderPath } from "./map";

// Orders v2 write client: create, read and capture. Every amount, payee and item comes from the
// stored purchase and its destination, never from the browser.

export type { ProviderResult } from "./client";

export type CreateOrderInput = {
  purchaseId: string;
  attemptId: string;
  correlationId: string;
  payeeMerchantId: string;
  lines: ReadonlyArray<{ name: string; quantity: number; unitMinor: number }>;
  totalMinor: number;
  currency: Currency;
  returnUrl: string;
  cancelUrl: string;
  funding: PayPalFunding;
};

export type CreatedOrder = PayPalOrder;
export type CapturedOrder = PayPalOrder;

// PayPal's answer to a capture refund (S45): its refund id and status, nothing else.
export type ProviderRefund = { id: string; status: string };

export type PayPalWriteClient = {
  createOrder(input: CreateOrderInput, requestId: string): Promise<ProviderResult<CreatedOrder>>;
  readOrder(orderId: string): Promise<ProviderResult<PayPalOrder>>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderResult<CapturedOrder>>;
  // A full refund of one capture (S45). Called only on the client demoSellerWriteClient builds from
  // the labeled demo seller's own credentials: PayPal refused Envoi's platform token with 403
  // PERMISSION_DENIED [verified 2026-11-07]. The empty body asks for the full captured amount.
  refundCapture(captureId: string, requestId: string): Promise<ProviderResult<ProviderRefund>>;
};

// Every amount of one order is in the purchase's currency.
const amount = (currency: Currency, minor: number) => ({ currency_code: currency, value: toDecimalString(money(currency, minor)) });

export function createOrderBody(input: CreateOrderInput): unknown {
  const order = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.purchaseId,
        custom_id: input.correlationId,
        // PayPal refuses a second payment with the same invoice id for one payee.
        invoice_id: input.attemptId,
        // Always explicit: without it PayPal would pay the API caller, Envoi's own account.
        payee: { merchant_id: input.payeeMerchantId },
        amount: { ...amount(input.currency, input.totalMinor), breakdown: { item_total: amount(input.currency, input.totalMinor) } },
        items: input.lines.map((line) => ({ name: line.name, quantity: String(line.quantity), unit_amount: amount(input.currency, line.unitMinor) })),
      },
    ],
  };
  if (input.funding === "crypto") {
    return {
      ...order,
      // PayPal captures on approval, so Envoi never sends a capture for this order.
      processing_instruction: "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",
      payment_source: {
        crypto: {
          // Crypto is offered for US shops only. Buyers are anonymous, so this is a fixed label and
          // never a person's name.
          country_code: "US",
          name: { given_name: "Envoi", surname: "Fixture" },
          experience_context: { locale: "en-US", return_url: input.returnUrl, cancel_url: input.cancelUrl },
        },
      },
    };
  }
  return {
    ...order,
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Envoi sandbox",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
  };
}

export function createPayPalWriteClient(cfg: PayPalConfig): PayPalWriteClient {
  const http = createPayPalHttp(cfg);
  return {
    async createOrder(input, requestId) {
      return mapOrderResult(await http.send({ method: "POST", path: "/v2/checkout/orders", body: createOrderBody(input), requestId }));
    },
    async readOrder(orderId) {
      return mapOrderResult(await http.send({ method: "GET", path: orderPath(orderId) }));
    },
    async captureOrder(orderId, requestId) {
      return mapOrderResult(await http.send({ method: "POST", path: `${orderPath(orderId)}/capture`, body: {}, requestId }));
    },
    async refundCapture(captureId, requestId) {
      return mapRefundResult(await http.send({ method: "POST", path: `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, body: {}, requestId }));
    },
  };
}

// A 2xx without a readable refund id and status is treated like a lost response, as for an order.
function mapRefundResult(result: ProviderResult<unknown>): ProviderResult<ProviderRefund> {
  if (result.kind !== "ok") return result;
  const body = result.value as { id?: unknown; status?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.status !== "string") return { kind: "timeout", responseReceived: false };
  return { kind: "ok", value: { id: body.id, status: body.status } };
}

let cached: PayPalWriteClient | undefined;
let demoSeller: PayPalWriteClient | undefined;

// The labeled demo seller's own write client (S45), for refunds of that seller's captures only.
// Null unless both of its credentials are set. Envoi's platform credentials never send a refund.
export function demoSellerWriteClient(env: WebEnv = webEnv()): PayPalWriteClient | null {
  if (!env.PAYPAL_DEMO_SELLER_CLIENT_ID || !env.PAYPAL_DEMO_SELLER_CLIENT_SECRET) return null;
  demoSeller ??= createPayPalWriteClient({ ...paypalConfigFromEnv(env), clientId: env.PAYPAL_DEMO_SELLER_CLIENT_ID, clientSecret: env.PAYPAL_DEMO_SELLER_CLIENT_SECRET });
  return demoSeller;
}

export function paypalWriteClient(): PayPalWriteClient {
  cached ??= createPayPalWriteClient(paypalConfigFromEnv(webEnv()));
  return cached;
}
