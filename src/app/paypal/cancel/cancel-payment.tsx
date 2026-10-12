"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/browser/session";

// Runs once after the buyer canceled at PayPal: closes the unpaid purchase, then shows its receipt.
export function CancelPayment({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const receipt = `/receipt/${encodeURIComponent(purchaseId)}`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void postJson(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/cancel`).then((result) => {
      if (result.ok) router.replace(receipt);
      else setError(result.error?.message ?? "The purchase could not be closed.");
    });
  }, [purchaseId, receipt, router]);

  if (!error) return <p className="muted" role="status">Closing the purchase…</p>;
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
