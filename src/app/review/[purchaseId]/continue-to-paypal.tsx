"use client";

import { useState } from "react";
import { postJson } from "@/lib/browser/session";

// Asks the server to create the exact sandbox order, then sends the buyer to PayPal's sandbox
// approval page. The browser never chooses the amount, payee or link host.
export function ContinueToPayPal({ purchaseId }: { purchaseId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ approvalUrl: string }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/paypal/start`);
    if (result.ok && result.data) {
      window.location.assign(result.data.approvalUrl);
      return;
    }
    setError(result.error?.message ?? "PayPal could not be opened. Nothing was charged; try again.");
    setBusy(false);
  }

  return (
    <>
      <button className="button full" type="button" onClick={start} disabled={busy}>
        {busy ? "Opening PayPal…" : "Continue to PayPal"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error} <a href={`/receipt/${encodeURIComponent(purchaseId)}`}>See the receipt</a>
        </p>
      )}
    </>
  );
}
