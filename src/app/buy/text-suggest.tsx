"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublishedOutletSummary } from "@/domain/outlets/search";
import type { Suggestion } from "@/domain/suggestions/types";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import { formatMoney, money } from "@/lib/money";
import { chooseHeading, chooseSummary, holdBasketProposal, shopHref, unavailableHeading, type BasketLine } from "./one-box";

const MAX_TEXT = 280;
// The server answers within T_AI_BUDGET (30 seconds) plus its own reads. A dropped connection can
// leave the request open with no answer, so the page gives up after 40 seconds and offers the list.
const CLIENT_TIMEOUT_MS = 40_000;

const price = (outlet: PublishedOutletSummary, minor: number) => formatMoney(money(outlet.currency, minor));

// The item answer keeps its own address, which names the items and starts each at quantity 1. A
// basket answer never uses it: its quantities travel in memory instead (see one-box.ts).
function itemsHref(outletId: string, itemIds: string[]): string {
  const params = new URLSearchParams({ outlet: outletId, items: itemIds.join(",") });
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

// The buyer's words, request and place together, go to POST /api/v1/buyer/suggestions. What comes
// back names registered shops and items only; prices shown here are the shop's published menu prices,
// and the review page prices the basket again server-side. A filled basket is a proposal: nothing is
// reviewed or paid until the buyer taps Review there. Any failure points the buyer at the manual list.
export function TextSuggest({ manualListId }: { manualListId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useRestoreFocus(busy);

  function showManual(message: string) {
    setFailure(message);
    document.getElementById(manualListId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The basket goes to the shop page in memory, and the address names the shop only.
  function openBasket(outletId: string, lines: BasketLine[]) {
    holdBasketProposal({ outletId, lines });
    router.push(shopHref(outletId));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length === 0) return;
    setBusy(true);
    setFailure(null);
    setSuggestion(null);
    try {
      await ensureBuyerSession();
      const result = await postJson<{ suggestion: Suggestion }>("/api/v1/buyer/suggestions", { text: text.trim() }, AbortSignal.timeout(CLIENT_TIMEOUT_MS));
      if (!result.ok || !result.data) {
        showManual(result.error?.message ?? "Suggestions are not available right now. Pick a shop from the list instead.");
        return;
      }
      const next = result.data.suggestion;
      if (next.kind === "basket") {
        openBasket(
          next.outletId,
          next.lines.map((line) => ({ id: line.item.id, quantity: line.quantity })),
        );
        return;
      }
      setSuggestion(next);
      if (next.kind === "budget_exceeded") showManual("Suggestions took too long. Pick a shop from the list instead.");
    } catch (err) {
      showManual(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Suggestions took too long. Pick a shop from the list instead."
          : "Suggestions are not available right now. Pick a shop from the list instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <form onSubmit={submit}>
        <label htmlFor="request">What would you like, and where?</label>
        <textarea
          id="request"
          value={text}
          maxLength={MAX_TEXT}
          rows={3}
          placeholder="For example: two kaya toast and kopi near Tanjong Pagar"
          onChange={(event) => setText(event.target.value)}
        />
        <button className="button full" type="submit" disabled={busy || text.trim().length === 0}>
          {busy ? "Looking…" : "Find it"}
        </button>
      </form>
      <p className="muted fine">Suggestions come from an AI model and only name shops and items registered on Envoi. Prices come from the shop&apos;s published menu, never from the model.</p>

      <div aria-live="polite">
        {suggestion?.kind === "clarification" &&
          (suggestion.missing.includes("area") ? (
            <div className="status">
              <strong>Which area, or which shop?</strong>
              <small>No area or shop was named, and location is not used. Envoi does not guess the nearest shop.</small>
            </div>
          ) : (
            <div className="status">
              <strong>Tell me a little more</strong>
              <small>{suggestion.question}</small>
            </div>
          ))}

        {suggestion?.kind === "choose" && (
          <div className="suggestion">
            <div className="status">
              <strong>{chooseHeading(suggestion.matches.map((item) => item.name))}</strong>
              <small>{chooseSummary(suggestion.matches.length, suggestion.quantity)}</small>
            </div>
            <div className="row">
              <ShopName outlet={suggestion.outlet} />
              {suggestion.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
            </div>
            <div className="actions">
              {suggestion.matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="button secondary"
                  onClick={() => openBasket(suggestion.outletId, [{ id: item.id, quantity: suggestion.quantity }])}
                >
                  {item.name} · {price(suggestion.outlet, item.unitMinor)}
                </button>
              ))}
            </div>
          </div>
        )}

        {suggestion?.kind === "unavailable_item" && (
          <div className="suggestion">
            <div className="status">
              <strong>{unavailableHeading(suggestion.items.map((item) => item.name), suggestion.outlet.name)}</strong>
              <small>The shop marked it unavailable on its published menu. Envoi does not add it to a basket.</small>
            </div>
            <a className="button secondary full" href={shopHref(suggestion.outletId)}>
              See {suggestion.outlet.name}&apos;s menu
            </a>
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
                <span className="money">{price(suggestion.outlet, item.unitMinor)}</span>
              </div>
            ))}
            <a
              className="button full"
              href={itemsHref(
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
