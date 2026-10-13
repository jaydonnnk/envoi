import { webEnv } from "@/env";
import { createPayPalHttp, paypalConfigFromEnv, type PayPalConfig } from "./client";
import { mapOrderResult, orderPath } from "./map";
import type { PayPalWriteClient } from "./orders";

// Read-only Orders v2 client for recovery paths that must never move money: the webhook and, from
// S5, maintenance. It is a separate module with no create or capture method, and it imports
// only a type from orders.ts, which compiles away, so a bundle built from it carries no capture code.

export type PayPalReadClient = Pick<PayPalWriteClient, "readOrder">;

export function createPayPalReadClient(cfg: PayPalConfig): PayPalReadClient {
  const http = createPayPalHttp(cfg);
  return {
    async readOrder(orderId) {
      return mapOrderResult(await http.send({ method: "GET", path: orderPath(orderId) }));
    },
  };
}

let cached: PayPalReadClient | undefined;

export function paypalReadClient(): PayPalReadClient {
  cached ??= createPayPalReadClient(paypalConfigFromEnv(webEnv()));
  return cached;
}
