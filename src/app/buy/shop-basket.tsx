"use client";

import { useSyncExternalStore } from "react";
import { BasketForm, type BasketItem } from "./basket-form";
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
}: {
  outletId: string;
  currency: Currency;
  items: BasketItem[];
  preselected: { id: string; quantity: number }[];
  rail: Rail;
  autoReview: boolean;
}) {
  const proposal = useSyncExternalStore(subscribeBasketProposal, () => basketProposalFor(outletId), noBasketProposal);

  return (
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
    />
  );
}
