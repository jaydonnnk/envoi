"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";
import { landingReview, requestReview, reviewNavigation, type Rail, type ReviewLine } from "./landing";

export type BasketItem = { id: string; name: string; unitSgdCents: number | null; available: boolean | null };

const MAX_QUANTITY = 20;

function sgd(cents: number): string {
  return `S$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// The browser sends item ids and quantities only. The server prices them from the published menu
// on the next page; the subtotal here is a preview of the same menu prices.
export function BasketForm({
  outletId,
  items,
  preselected = [],
  rail = "paypal",
  autoReview = false,
}: {
  outletId: string;
  items: BasketItem[];
  preselected?: { id: string; quantity: number }[];
  rail?: "paypal" | "pyusd";
  // Set when the Phantom Browse link named the PYUSD rail: the pre-filled basket is reviewed on PYUSD on landing.
  autoReview?: boolean;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      preselected.flatMap((line) => {
        const item = items.find((candidate) => candidate.id === line.id);
        return item && item.unitSgdCents !== null && item.available !== false ? [[item.id, line.quantity]] : [];
      }),
    ),
  );
  // The basket the Phantom Browse link asks to review on landing, fixed at the first render.
  const [landing] = useState(() =>
    landingReview(
      autoReview,
      items.flatMap((item) => (quantities[item.id] ?? 0) > 0 ? [{ menuItemId: item.id, quantity: quantities[item.id] ?? 0 }] : []),
    ),
  );
  const [busy, setBusy] = useState(landing !== null);
  const [error, setError] = useState<string | null>(null);

  const chosen = items.filter((item) => (quantities[item.id] ?? 0) > 0);
  const subtotal = chosen.reduce((sum, item) => sum + (item.unitSgdCents ?? 0) * (quantities[item.id] ?? 0), 0);

  function change(id: string, delta: number) {
    setQuantities((current) => ({ ...current, [id]: Math.min(MAX_QUANTITY, Math.max(0, (current[id] ?? 0) + delta)) }));
  }

  async function submit(lines: ReviewLine[], reviewRail: Rail, landing: boolean) {
    try {
      await ensureBuyerSession();
      const refused = await requestReview((body) => postJson<{ purchaseId: string }>("/api/v1/purchases", body), reviewNavigation(router, landing), outletId, reviewRail, lines);
      if (refused !== null) throw new Error(refused);
    } catch (err) {
      setError(err instanceof Error && err.message !== "session" ? err.message : "The review could not be created. Try again.");
      setBusy(false);
    }
  }

  function review() {
    setBusy(true);
    setError(null);
    void submit(chosen.map((item) => ({ menuItemId: item.id, quantity: quantities[item.id] ?? 0 })), rail, false);
  }

  // One landing review per page load, even when React runs the effect twice in development.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || landing === null) return;
    landed.current = true;
    void submit(landing.lines, landing.rail, true);
    // Runs once on mount, for the basket the link pre-filled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
