"use client";

import { useRef, useState } from "react";
import type { PublishedOutletSummary } from "@/domain/outlets/search";
import type { Suggestion } from "@/domain/suggestions/types";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";

const MAX_TEXT = 280;
const MAX_AREA = 80;

function sgd(cents: number): string {
  return `S$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function shopHref(outletId: string, itemIds: string[] = []): string {
  const params = new URLSearchParams({ outlet: outletId });
  if (itemIds.length > 0) params.set("items", itemIds.join(","));
  return `/buy?${params.toString()}`;
}

function ShopName({ outlet }: { outlet: PublishedOutletSummary }) {
  return (
    <span>
      <strong>{outlet.name}</strong>
      <small>{outlet.area}</small>
    </span>
  );
}

// The buyer's words go to POST /api/v1/buyer/suggestions. What comes back names registered shops
// and items only; prices shown here are the shop's published menu prices, and the review page
// prices the basket again server-side. Any failure points the buyer at the manual list.
export function TextSuggest({ manualListId }: { manualListId: string }) {
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const areaRef = useRef<HTMLInputElement>(null);

  function showManual(message: string) {
    setFailure(message);
    document.getElementById(manualListId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length === 0) return;
    setBusy(true);
    setFailure(null);
    setSuggestion(null);
    try {
      await ensureBuyerSession();
      const body = area.trim() ? { text: text.trim(), area: area.trim() } : { text: text.trim() };
      const result = await postJson<{ suggestion: Suggestion }>("/api/v1/buyer/suggestions", body);
      if (!result.ok || !result.data) {
        showManual(result.error?.message ?? "Suggestions are not available right now. Pick a shop from the list instead.");
        return;
      }
      const next = result.data.suggestion;
      setSuggestion(next);
      if (next.kind === "budget_exceeded") showManual("Suggestions took too long. Pick a shop from the list instead.");
      if (next.kind === "clarification" && next.missing.includes("area")) areaRef.current?.focus();
    } catch {
      showManual("Suggestions are not available right now. Pick a shop from the list instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="request-heading">
      <h2 id="request-heading">What would you like?</h2>
      <form onSubmit={submit}>
        <label htmlFor="request">Your request</label>
        <textarea id="request" value={text} maxLength={MAX_TEXT} rows={3} placeholder="For example: kaya toast and kopi" onChange={(event) => setText(event.target.value)} />
        <label htmlFor="area">Your area</label>
        <input id="area" ref={areaRef} value={area} maxLength={MAX_AREA} placeholder="For example: Tanjong Pagar" onChange={(event) => setArea(event.target.value)} />
        <button className="button full" type="submit" disabled={busy || text.trim().length === 0}>
          {busy ? "Looking…" : "Find shops and items"}
        </button>
      </form>
      <p className="muted fine">Suggestions come from an AI model and only name shops and items registered on Envoi. Prices come from the shop&apos;s published menu, never from the model.</p>

      <div aria-live="polite">
        {suggestion?.kind === "clarification" && (
          <div className="status">
            <strong>{suggestion.missing.includes("area") ? "Where should I look?" : "Tell me a little more"}</strong>
            <small>
              {suggestion.question}
              {suggestion.missing.includes("area") && " Envoi does not know your location and cannot choose the nearest shop."}
            </small>
          </div>
        )}

        {suggestion?.kind === "items" && (
          <div className="suggestion">
            <div className="row">
              <ShopName outlet={suggestion.outlet} />
              {suggestion.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
            </div>
            {suggestion.matches.map((item) => (
              <div className="row" key={item.id}>
                <span>{item.name}</span>
                <span className="money">{sgd(item.unitSgdCents)}</span>
              </div>
            ))}
            <a
              className="button full"
              href={shopHref(
                suggestion.outletId,
                suggestion.matches.map((item) => item.id),
              )}
            >
              Choose quantities
            </a>
          </div>
        )}

        {suggestion?.kind === "outlets" && (
          <div className="stack suggestion">
            {suggestion.matches.map((outlet) => (
              <a className="card shop" key={outlet.id} href={shopHref(outlet.id)}>
                <ShopName outlet={outlet} />
                {outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
              </a>
            ))}
          </div>
        )}

        {suggestion?.kind === "no_match" && (
          <div className="status">
            <strong>No registered shop matched</strong>
            <small>No payment is proposed. Try other words, or pick a shop from the list.</small>
          </div>
        )}

        {failure && (
          <div className="status" role="alert">
            <strong>Pick a shop instead</strong>
            <small>{failure}</small>
          </div>
        )}
      </div>
    </section>
  );
}
