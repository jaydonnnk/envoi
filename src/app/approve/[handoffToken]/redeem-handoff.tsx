"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";

const OUTCOME_COPY: Record<string, string> = {
  expired: "This link has expired. Ask your assistant for a new one. Nothing was charged.",
  already_redeemed: "This link was already used. Each link opens one review, once. Nothing was charged.",
  invalid: "This link is not valid. Ask your assistant for a new one. Nothing was charged.",
};

// The buyer's own session redeems the link, once, by an explicit tap; opening the page alone
// redeems nothing. The token goes in the request body, never in another URL.
export function RedeemHandoff({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      await ensureBuyerSession();
    } catch {
      setError("Envoi could not start a session in this browser. Try again.");
      setBusy(false);
      return;
    }
    const result = await postJson<{ outcome: string; purchaseId?: string }>("/api/v1/purchase-requests/redeem", { token });
    if (result.ok && result.data?.outcome === "redeemed" && result.data.purchaseId) {
      // Replace, so Back does not return to a link that is now used.
      router.replace(`/review/${encodeURIComponent(result.data.purchaseId)}`);
      return;
    }
    setError((result.data && OUTCOME_COPY[result.data.outcome]) ?? result.error?.message ?? "The review could not be opened. Nothing was charged; try again.");
    setBusy(false);
  }

  return (
    <>
      <button className="button full" type="button" onClick={redeem} disabled={busy}>
        {busy ? "Opening the review…" : "Open the review"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
