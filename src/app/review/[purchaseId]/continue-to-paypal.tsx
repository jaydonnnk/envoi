"use client";

import { useState } from "react";
import { postJson } from "@/lib/browser/session";

// Asks the server to create the exact sandbox order, then sends the buyer to PayPal's sandbox
// approval page. The browser never chooses the amount, payee or link host.
// A review the shop's republication or connection change closed sends the buyer back to review the
// basket at the current prices; any other refusal points at the receipt.
export function ContinueToPayPal({ purchaseId, outletId }: { purchaseId: string; outletId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reviewAgain: boolean } | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ approvalUrl: string }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/paypal/start`);
    if (result.ok && result.data) {
      window.location.assign(result.data.approvalUrl);
      return;
    }
    setError({ message: result.error?.message ?? "PayPal could not be opened. Nothing was charged; try again.", reviewAgain: result.error?.code === "review_invalidated" });
    setBusy(false);
  }

  return (
    <>
      <button className="button full" type="button" onClick={start} disabled={busy || error?.reviewAgain === true}>
        {busy ? "Opening PayPal…" : "Continue to PayPal"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error.message}{" "}
          {error.reviewAgain ? (
            <a href={`/buy?outlet=${encodeURIComponent(outletId)}`}>Review the basket again</a>
          ) : (
            <a href={`/receipt/${encodeURIComponent(purchaseId)}`}>See the receipt</a>
          )}
        </p>
      )}
    </>
  );
}
