import { webEnv } from "@/env";
import { paypalWriteClient } from "@/integrations/paypal/orders";
import { redact } from "@/lib/log";

// Configuration is checked at boot rather than on the first request, so a missing value or a
// PayPal host outside the sandbox allowlist stops the process: the deploy fails and the previous
// version keeps serving, instead of a live server that answers every request with an error.
export function checkBootConfiguration(): void {
  try {
    webEnv();
    paypalWriteClient();
  } catch (err) {
    console.error("boot configuration refused:", redact(err instanceof Error ? err.message : "unknown error"));
    process.exit(1);
  }
}
