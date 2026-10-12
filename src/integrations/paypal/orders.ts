import type { PayPalOrder } from "@/domain/purchases/reconcile";
import { webEnv } from "@/env";
import { sgdFromCents, sgdToDecimalString } from "@/lib/money";
import { createPayPalHttp, paypalConfigFromEnv, type PayPalConfig, type ProviderResult } from "./client";
import { mapOrder } from "./map";

// Orders v2 write client: create, read and capture. Every amount, payee and item comes from the
// stored purchase and its destination, never from the browser.

export type { ProviderResult } from "./client";

export type CreateOrderInput = {
  purchaseId: string;
  attemptId: string;
  correlationId: string;
  payeeMerchantId: string;
  lines: ReadonlyArray<{ name: string; quantity: number; unitSgdCents: number }>;
  totalSgdCents: number;
  returnUrl: string;
  cancelUrl: string;
};

export type CreatedOrder = PayPalOrder;
export type CapturedOrder = PayPalOrder;

export type PayPalWriteClient = {
  createOrder(input: CreateOrderInput, requestId: string): Promise<ProviderResult<CreatedOrder>>;
  readOrder(orderId: string): Promise<ProviderResult<PayPalOrder>>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderResult<CapturedOrder>>;
};

const sgd = (cents: number) => ({ currency_code: "SGD", value: sgdToDecimalString(sgdFromCents(cents)) });

export function createOrderBody(input: CreateOrderInput): unknown {
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.purchaseId,
        custom_id: input.correlationId,
        // PayPal refuses a second payment with the same invoice id for one payee.
        invoice_id: input.attemptId,
        // Always explicit: without it PayPal would pay the API caller, Envoi's own account.
        payee: { merchant_id: input.payeeMerchantId },
        amount: { ...sgd(input.totalSgdCents), breakdown: { item_total: sgd(input.totalSgdCents) } },
        items: input.lines.map((line) => ({ name: line.name, quantity: String(line.quantity), unit_amount: sgd(line.unitSgdCents) })),
      },
    ],
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

function mapped(result: ProviderResult<unknown>): ProviderResult<PayPalOrder> {
  if (result.kind !== "ok") return result;
  const order = mapOrder(result.value);
  // A 2xx we cannot read is not evidence of anything; treat it like a lost response.
  return order ? { kind: "ok", value: order } : { kind: "http_error", status: 502, retryable: true };
}

const orderPath = (orderId: string) => `/v2/checkout/orders/${encodeURIComponent(orderId)}`;

export function createPayPalWriteClient(cfg: PayPalConfig): PayPalWriteClient {
  const http = createPayPalHttp(cfg);
  return {
    async createOrder(input, requestId) {
      return mapped(await http.send({ method: "POST", path: "/v2/checkout/orders", body: createOrderBody(input), requestId }));
    },
    async readOrder(orderId) {
      return mapped(await http.send({ method: "GET", path: orderPath(orderId) }));
    },
    async captureOrder(orderId, requestId) {
      return mapped(await http.send({ method: "POST", path: `${orderPath(orderId)}/capture`, body: {}, requestId }));
    },
  };
}

let cached: PayPalWriteClient | undefined;

export function paypalWriteClient(): PayPalWriteClient {
  cached ??= createPayPalWriteClient(paypalConfigFromEnv(webEnv()));
  return cached;
}
