"use client";

import { useState } from "react";
import { useRestoreFocus } from "@/lib/browser/focus";
import { postJson } from "@/lib/browser/session";

// Crypto through PayPal (S38): asks the server to create the exact sandbox order, then sends the
// buyer to PayPal's page. The browser never chooses the amount, payee or link host.
export function ContinueWithCrypto({ purchaseId }: { purchaseId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRestoreFocus(busy);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ approvalUrl: string }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/paypal/start`, { funding: "crypto" });
    if (result.ok && result.data) {
      window.location.assign(result.data.approvalUrl);
      return;
    }
    setError(result.error?.message ?? "PayPal could not be opened. Nothing was charged; try again.");
    setBusy(false);
  }

  return (
    <section className="card" aria-labelledby="crypto-pay-heading">
      <h2 id="crypto-pay-heading">Pay</h2>
      <p>
        <strong>PayPal</strong> · approve in a PayPal window
      </p>
      <p>
        <strong>Crypto through PayPal</strong> · opens PayPal&apos;s page. The shop receives US dollars.
      </p>
      <p className="muted">Simulated in this test environment: no token is chosen and none moves. PYUSD on Solana is not offered for US shops.</p>
      <button className="button full" type="button" onClick={start} disabled={busy}>
        {busy ? "Opening PayPal…" : "Continue with crypto through PayPal"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error} <a href={`/receipt/${encodeURIComponent(purchaseId)}`}>See the receipt</a>
        </p>
      )}
    </section>
  );
}
