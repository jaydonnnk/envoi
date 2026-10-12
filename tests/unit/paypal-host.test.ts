import { describe, expect, it } from "vitest";
import { PAYPAL_SANDBOX_API_BASE, isSandboxApprovalUrl, type PayPalConfig } from "@/integrations/paypal/client";
import { createPayPalWriteClient } from "@/integrations/paypal/orders";

const config: PayPalConfig = {
  apiBase: PAYPAL_SANDBOX_API_BASE,
  clientId: "fixture-client-id",
  clientSecret: "fixture-client-secret",
  partnerAttributionId: "fixture-attribution",
  timeoutMs: 1_000,
};

describe("PayPal host allowlist", () => {
  it("live PayPal host is refused at boot", () => {
    // Boot builds the write client (src/instrumentation.ts); it must refuse any non-sandbox host.
    for (const apiBase of ["https://api-m.paypal.com", "https://api.paypal.com", "http://api-m.sandbox.paypal.com", "https://api-m.sandbox.paypal.com.evil.test"]) {
      expect(() => createPayPalWriteClient({ ...config, apiBase }), apiBase).toThrow(/not an allowlisted sandbox host/);
    }
    expect(() => createPayPalWriteClient(config)).not.toThrow();
  });

  it("only sandbox approval links are handed to the buyer", () => {
    expect(isSandboxApprovalUrl("https://www.sandbox.paypal.com/checkoutnow?token=X")).toBe(true);
    expect(isSandboxApprovalUrl("https://www.paypal.com/checkoutnow?token=X")).toBe(false);
  });
});
