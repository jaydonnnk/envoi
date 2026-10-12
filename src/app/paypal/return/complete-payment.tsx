"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/browser/session";

// Runs once in the owning browser after PayPal sends it back: asks the server to verify and
// capture, then shows the receipt, whose state the server decided.
export function CompletePayment({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const receipt = `/receipt/${encodeURIComponent(purchaseId)}`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void postJson(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/paypal/complete`).then((result) => {
      if (result.ok) router.replace(receipt);
      else setError(result.error?.message ?? "The payment could not be finished.");
    });
  }, [purchaseId, receipt, router]);

  if (!error) return <p className="muted" role="status">Checking the order with PayPal…</p>;
  return (
    <>
      <p className="error" role="alert">
        {error}
      </p>
      <a className="button" href={receipt}>
        See the receipt
      </a>
    </>
  );
}
