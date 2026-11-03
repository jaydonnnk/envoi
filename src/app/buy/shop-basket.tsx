"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";
import { BasketForm, type BasketItem, type MenuTranslation } from "./basket-form";
import type { Rail } from "./landing";
import type { Currency } from "@/lib/money";
import { basketProposalFor, noBasketProposal, subscribeBasketProposal } from "./one-box";

// The shop page's basket, holding the proposal a sentence left in memory (Gate 2 one-box ordering
// point 5). The browser hydrates against the server's snapshot of nothing, so its first paint matches
// the HTML it was sent, and the proposal appears on the next render. A reload finds nothing and the
// basket starts empty, which is the safe answer.
export function ShopBasket({
  outletId,
  currency,
  items,
  preselected,
  rail,
  autoReview,
  translationEnabled,
}: {
  outletId: string;
  currency: Currency;
  items: BasketItem[];
  preselected: { id: string; quantity: number }[];
  rail: Rail;
  autoReview: boolean;
  // Whether the server has a translation model (S29), passed from the server page.
  translationEnabled: boolean;
}) {
  const proposal = useSyncExternalStore(subscribeBasketProposal, () => basketProposalFor(outletId), noBasketProposal);
  const translation = useMenuTranslation(outletId, translationEnabled);
  const [original, setOriginal] = useState(false);

  return (
    <>
      {translation && <TranslationStatus translation={translation} original={original} toggle={() => setOriginal(!original)} />}
      <BasketForm
        key={proposal === null ? "address" : "sentence"}
        outletId={outletId}
        currency={currency}
        items={items}
        preselected={proposal === null ? preselected : proposal.lines}
        rail={rail}
        // The landing review belongs to the Phantom link's own basket, which comes from the address. A
        // basket the buyer asked for in a sentence is reviewed only when they tap Review, and remounting
        // the form must not ask for a second review.
        autoReview={autoReview && proposal === null}
        note={proposal === null ? undefined : "Nothing is reviewed or paid yet. Change the quantity or add items, then review."}
        translation={original ? null : translation}
      />
    </>
  );
}

// The menu explained and translated (S29): one request for the browser language's primary subtag.
// Any refusal or failure leaves the shop's original menu, which is always the safe answer.
function useMenuTranslation(outletId: string, enabled: boolean): MenuTranslation | null {
  const [translation, setTranslation] = useState<MenuTranslation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const language = (navigator.language.split("-")[0] ?? "").toLowerCase();
    const controller = new AbortController();
    void (async () => {
      try {
        await ensureBuyerSession();
        const answer = await postJson<{ language: string; items: { itemId: string; name: string; explanation: string | null }[] }>("/api/v1/buyer/menu-translations", { outletId, language }, controller.signal);
        if (!answer.ok || !answer.data || answer.data.items.length === 0) return;
        setTranslation({ language: answer.data.language, items: Object.fromEntries(answer.data.items.map((item) => [item.itemId, { name: item.name, explanation: item.explanation }])) });
      } catch {
        // The original menu stays.
      }
    })();
    return () => controller.abort();
  }, [outletId, enabled]);
  return translation;
}

function TranslationStatus({ translation, original, toggle }: { translation: MenuTranslation; original: boolean; toggle: () => void }) {
  const language = new Intl.DisplayNames([translation.language], { type: "language" }).of(translation.language) ?? translation.language;
  return (
    <p className="status translation-status" aria-live="polite">
      <span>
        {original ? <strong>The shop&apos;s original menu</strong> : <strong lang={translation.language}>{language}</strong>}
        {!original && " · AI translation"} ·{" "}
        <button type="button" className="link-button" onClick={toggle}>
          {original ? "Show the AI translation" : "Show the shop's original menu"}
        </button>
      </span>
      <small>If a translation cannot be made, the original name is shown alone. Nothing here changes what you pay.</small>
    </p>
  );
}
