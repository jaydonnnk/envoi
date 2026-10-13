"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/browser/session";
import { startReceiptPolling, type PolledState } from "./polling";

type Check = "read" | "provider_unreachable" | "debounced" | "in_flight" | "no_order";

const CHECK_MESSAGE: Record<Check, string> = {
  read: "PayPal answered just now. This receipt shows its record.",
  provider_unreachable: "PayPal did not answer, so nothing changed. Do not pay again; try Check status in a moment.",
  debounced: "Envoi asked PayPal less than 30 seconds ago. This receipt shows that answer; try again shortly.",
  in_flight: "PayPal is still completing this payment. Try again in a moment.",
  no_order: "PayPal never confirmed an order for this purchase, so there is nothing to check yet.",
};

async function fetchState(purchaseId: string): Promise<PolledState | null> {
  try {
    const response = await fetch(`/api/v1/purchases/${encodeURIComponent(purchaseId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: { state?: unknown; payment?: { attemptState?: unknown } | null } };
    const state = envelope.data?.state;
    const attemptState = envelope.data?.payment?.attemptState ?? null;
    return typeof state === "string" ? { state, attemptState: typeof attemptState === "string" ? attemptState : null } : null;
  } catch {
    return null;
  }
}

// Keeps a non-terminal receipt current by re-reading stored state, and offers "Check status",
// which asks the server for one bounded provider read.
export function LiveStatus({ purchaseId, state, attemptState, canCheck }: { purchaseId: string; state: string; attemptState: string | null; canCheck: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(
    () =>
      startReceiptPolling(
        { state, attemptState },
        {
          fetchState: () => fetchState(purchaseId),
          onChange: () => router.refresh(),
          schedule: (run, ms) => window.setTimeout(run, ms),
          cancel: (handle) => window.clearTimeout(handle as number),
          now: () => Date.now(),
        },
      ),
    [purchaseId, state, attemptState, router],
  );

  if (!canCheck) return null;

  async function check() {
    setBusy(true);
    setMessage(null);
    const result = await postJson<{ check: Check }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/reconcile`);
    setBusy(false);
    if (result.ok && result.data) {
      setMessage({ text: CHECK_MESSAGE[result.data.check], error: false });
      router.refresh();
    } else {
      setMessage({ text: result.error?.message ?? "Envoi could not reach PayPal. Nothing changed; try again.", error: true });
    }
  }

  return (
    <div className="actions">
      <button className="button" type="button" onClick={check} disabled={busy}>
        {busy ? "Checking with PayPal…" : "Check status"}
      </button>
      {message && (
        <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
