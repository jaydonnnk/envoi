import type { PayPalOrder } from "@/domain/purchases/reconcile";
import { webEnv } from "@/env";
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
};

export type CreatedOrder = PayPalOrder;
export type CapturedOrder = PayPalOrder;

export type PayPalWriteClient = {
  createOrder(input: CreateOrderInput, requestId: string): Promise<ProviderResult<CreatedOrder>>;
  readOrder(orderId: string): Promise<ProviderResult<PayPalOrder>>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderResult<CapturedOrder>>;
};

// Every amount of one order is in the purchase's currency.
const amount = (currency: Currency, minor: number) => ({ currency_code: currency, value: toDecimalString(money(currency, minor)) });

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
        amount: { ...amount(input.currency, input.totalMinor), breakdown: { item_total: amount(input.currency, input.totalMinor) } },
        items: input.lines.map((line) => ({ name: line.name, quantity: String(line.quantity), unit_amount: amount(input.currency, line.unitMinor) })),
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
  };
}

let cached: PayPalWriteClient | undefined;

export function paypalWriteClient(): PayPalWriteClient {
  cached ??= createPayPalWriteClient(paypalConfigFromEnv(webEnv()));
  return cached;
}
