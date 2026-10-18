"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import { postJson } from "@/lib/browser/session";
import { startReceiptPolling, type PolledState } from "./polling";

type Check = "read" | "no_record" | "provider_unreachable" | "debounced" | "in_flight" | "no_order";
type PyusdCheck =
  | "debounced"
  | "in_flight"
  | "nothing_to_read"
  | "rpc_unavailable"
  | "identity_changed"
  | "not_found"
  | "confirmed"
  | "not_ours"
  | "failed_landing"
  | "uncertain"
  | "scan_incomplete"
  | "scan_complete"
  | "held_no_match"
  | "closed_unpaid";

export const PYUSD_CHECK_MESSAGE: Record<PyusdCheck, string> = {
  debounced: "Envoi read Solana devnet less than 30 seconds ago. This receipt shows that answer; try again shortly.",
  nothing_to_read: "Envoi has no transaction signature to check yet. Do not pay again; this stays locked until the payment is decided.",
  rpc_unavailable: "Solana devnet did not answer, so nothing changed. Do not pay again; try Check status in a moment.",
  identity_changed: "Envoi's Solana connection no longer matches devnet, so nothing changed. It is flagged for the operator.",
  not_found: "Devnet has no finalized transaction with that signature yet. Finalizing takes about half a minute; try again shortly.",
  confirmed: "Envoi verified the finalized devnet transfer. The status above is up to date.",
  not_ours: "That signature is not this purchase's transfer, so nothing changed.",
  failed_landing: "That transaction failed on devnet and moved no tokens, so nothing changed.",
  uncertain: "The devnet transaction did not match this purchase exactly, so it is not shown as paid. It is flagged for the operator.",
  in_flight: "Envoi is already checking this payment on Solana devnet. Try again in a moment.",
  scan_incomplete: "Envoi is checking every devnet transaction that could carry this payment. Do not pay again; this takes a few checks.",
  scan_complete: "Envoi finished checking devnet for this payment. The status above is up to date.",
  held_no_match: PYUSD_PROOFS.automaticUnpaidRelease
    ? "Envoi found no matching devnet transfer. Its next check closes this purchase as unpaid; do not pay again."
    : "Envoi found no matching devnet transfer, but it does not close a payment as unpaid on its own. It is flagged for the operator; do not pay again.",
  closed_unpaid: "Envoi checked every devnet transaction that could carry this payment and found none, so it is closed unpaid.",
};

const CHECK_MESSAGE: Record<Check, string> = {
  read: "PayPal answered just now. The status above is up to date.",
  no_record: "PayPal has no usable record of this order, so the payment stays unconfirmed. Do not pay again; it is flagged for the operator.",
  provider_unreachable: "PayPal did not answer, so nothing changed. Do not pay again; try Check status in a moment.",
  debounced: "Envoi asked PayPal less than 30 seconds ago. This receipt shows that answer; try again shortly.",
  in_flight: "PayPal is still completing this payment. Try again in a moment.",
  no_order: "PayPal never confirmed an order for this purchase, so there is nothing to check yet.",
};

type PurchaseEnvelope = { state?: unknown; payment?: { attemptState?: unknown } | null; pyusd?: { attemptState?: unknown; windowScanComplete?: unknown } | null };

function polledOf(purchase: PurchaseEnvelope | undefined): PolledState | null {
  const state = purchase?.state;
  const attemptState = purchase?.payment?.attemptState ?? purchase?.pyusd?.attemptState ?? null;
  if (typeof state !== "string") return null;
  const polled: PolledState = { state, attemptState: typeof attemptState === "string" ? attemptState : null };
  // A PYUSD purchase with no attempt released nothing, so it has no window to scan.
  if (purchase?.pyusd) polled.settled = polled.attemptState === null || purchase.pyusd.windowScanComplete === true;
  return polled;
}

// A PayPal poll reads stored state. A PYUSD poll asks the shared reconcile route, which reads devnet
// at most once per T_PROVIDER_READ_DEBOUNCE per attempt and otherwise answers from stored state.
async function fetchState(purchaseId: string, rail: "paypal" | "pyusd"): Promise<PolledState | null> {
  try {
    if (rail === "pyusd") {
      const result = await postJson<{ purchase: PurchaseEnvelope }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/reconcile`);
      return result.ok ? polledOf(result.data?.purchase) : null;
    }
    const response = await fetch(`/api/v1/purchases/${encodeURIComponent(purchaseId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const envelope = (await response.json()) as { data?: PurchaseEnvelope };
    return polledOf(envelope.data);
  } catch {
    return null;
  }
}

// Keeps a non-terminal receipt current by re-reading stored state, and offers "Check status",
// which asks the server for one bounded provider read.
export function LiveStatus({
  purchaseId,
  rail,
  state,
  attemptState,
  settled,
  canCheck,
}: {
  purchaseId: string;
  rail: "paypal" | "pyusd";
  state: string;
  attemptState: string | null;
  settled?: boolean;
  canCheck: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(
    () =>
      startReceiptPolling(
        settled === undefined ? { state, attemptState } : { state, attemptState, settled },
        {
          fetchState: () => fetchState(purchaseId, rail),
          onChange: () => router.refresh(),
          schedule: (run, ms) => window.setTimeout(run, ms),
          cancel: (handle) => window.clearTimeout(handle as number),
          now: () => Date.now(),
        },
      ),
    [purchaseId, rail, state, attemptState, settled, router],
  );

  if (!canCheck) return null;

  async function check() {
    setBusy(true);
    setMessage(null);
    const result = await postJson<{ check: string }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/reconcile`);
    setBusy(false);
    if (result.ok && result.data) {
      const text = rail === "pyusd" ? PYUSD_CHECK_MESSAGE[result.data.check as PyusdCheck] : CHECK_MESSAGE[result.data.check as Check];
      setMessage({ text: text ?? "Checked. The status above is up to date.", error: false });
      router.refresh();
    } else {
      setMessage({ text: result.error?.message ?? (rail === "pyusd" ? "Envoi could not reach Solana devnet. Nothing changed; try again." : "Envoi could not reach PayPal. Nothing changed; try again."), error: true });
    }
  }

  return (
    <div className="actions">
      <button className="button" type="button" onClick={check} disabled={busy}>
        {busy ? (rail === "pyusd" ? "Checking Solana devnet…" : "Checking with PayPal…") : "Check status"}
      </button>
      {message && (
        <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
