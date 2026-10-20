"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

// Changing the payment method needs a fresh review (product rule): this asks the server to price the
// same basket on the other rail and opens that new review. The browser sends item ids and
// quantities only.
export function SwitchRail({ outletId, lines, rail, label }: { outletId: string; lines: { menuItemId: string; quantity: number }[]; rail: "paypal" | "pyusd"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRestoreFocus(busy);

  async function open() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ purchaseId: string }>("/api/v1/purchases", { outletId, rail, lines }).catch(() => null);
    if (result?.ok && result.data) {
      router.push(`/review/${encodeURIComponent(result.data.purchaseId)}`);
      return;
    }
    setError(result?.error?.message ?? "A new review could not be created. Nothing was charged; try again.");
    setBusy(false);
  }

  return (
    <>
      <button className="button secondary small" type="button" onClick={open} disabled={busy}>
        {busy ? "Reviewing…" : label}
      </button>
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
    </>
  );
}
