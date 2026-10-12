"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";

export type BasketItem = { id: string; name: string; unitSgdCents: number | null; available: boolean | null };

const MAX_QUANTITY = 20;

function sgd(cents: number): string {
  return `S$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// The browser sends item ids and quantities only. The server prices them from the published menu
// on the next page; the subtotal here is a preview of the same menu prices.
export function BasketForm({ outletId, items }: { outletId: string; items: BasketItem[] }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((item) => (quantities[item.id] ?? 0) > 0);
  const subtotal = chosen.reduce((sum, item) => sum + (item.unitSgdCents ?? 0) * (quantities[item.id] ?? 0), 0);

  function change(id: string, delta: number) {
    setQuantities((current) => ({ ...current, [id]: Math.min(MAX_QUANTITY, Math.max(0, (current[id] ?? 0) + delta)) }));
  }

  async function review() {
    setBusy(true);
    setError(null);
    try {
      await ensureBuyerSession();
      const result = await postJson<{ purchaseId: string }>("/api/v1/purchases", {
        outletId,
        rail: "paypal",
        lines: chosen.map((item) => ({ menuItemId: item.id, quantity: quantities[item.id] })),
      });
      if (!result.ok || !result.data) throw new Error(result.error?.message ?? "The review could not be created. Try again.");
      router.push(`/review/${encodeURIComponent(result.data.purchaseId)}`);
    } catch (err) {
      setError(err instanceof Error && err.message !== "session" ? err.message : "The review could not be created. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      {items.map((item) => {
        const quantity = quantities[item.id] ?? 0;
        const buyable = item.unitSgdCents !== null && item.available !== false;
        return (
          <div className="row item-row" key={item.id}>
            <span>
              {item.name}
              <small>{item.unitSgdCents === null ? "Price not set, cannot be bought yet" : item.available === false ? "Not available" : `${sgd(item.unitSgdCents)} each`}</small>
            </span>
            <span className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
              <button type="button" className="step" onClick={() => change(item.id, -1)} disabled={!buyable || quantity === 0 || busy} aria-label={`One fewer ${item.name}`}>
                −
              </button>
              <output className="qty" aria-live="polite">
                {quantity}
              </output>
              <button type="button" className="step" onClick={() => change(item.id, 1)} disabled={!buyable || quantity >= MAX_QUANTITY || busy} aria-label={`One more ${item.name}`}>
                +
              </button>
            </span>
          </div>
        );
      })}
      <div className="row total-row">
        <strong>Subtotal</strong>
        <span className="total money">{sgd(subtotal)}</span>
      </div>
      <button className="button full" type="button" onClick={review} disabled={busy || chosen.length === 0}>
        {busy ? "Preparing review…" : "Review"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
