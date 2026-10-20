"use client";

import { useState } from "react";
import { postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

// Asks the server to create the exact sandbox order, then sends the buyer to PayPal's sandbox
// approval page. The browser never chooses the amount, payee or link host.
// A review the shop's republication or connection change closed turns this card into the closed
// card a reload shows, sending the buyer back to review the basket at the current prices; any other
// refusal points at the receipt.
export function ContinueToPayPal({ purchaseId, outletId, validUntil }: { purchaseId: string; outletId: string; validUntil: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reviewAgain: boolean } | null>(null);
  useRestoreFocus(busy);
  const receiptHref = `/receipt/${encodeURIComponent(purchaseId)}`;
  const reviewAgainHref = `/buy?outlet=${encodeURIComponent(outletId)}`;

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

  if (error?.reviewAgain) {
    return (
      <section className="card warning" aria-labelledby="closed-heading">
        <h2 id="closed-heading">Payment cannot start here</h2>
        <p role="alert">{error.message}</p>
        <div className="actions">
          <a className="button" href={receiptHref}>
            See the receipt
          </a>
          <a className="button secondary" href={reviewAgainHref}>
            Review the basket again
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="pay-heading">
      <h2 id="pay-heading">Approve in PayPal</h2>
      <p className="muted">This review is valid until {validUntil} Singapore time. You approve the exact amount in PayPal&apos;s sandbox; Envoi charges nothing before that.</p>
      <button className="button full" type="button" onClick={start} disabled={busy}>
        {busy ? "Opening PayPal…" : "Continue to PayPal"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error.message} <a href={receiptHref}>See the receipt</a>
        </p>
      )}
    </section>
  );
}
