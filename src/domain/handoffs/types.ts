import type { PurchaseLine } from "@/domain/purchases/checkout-key";
import type { AppError } from "@/lib/errors";

// Gate 3 "Suggestions and handoffs". An agent proposes an outlet and item ids with quantities; a
// buyer redeems the link once into a fresh server-priced review. No amount ever travels with it.

// What an agent may propose. Gate 3 types the input as SuggestionRequest & { lines?: PurchaseLine[] };
// S13 takes the outlet and lines because redemption must price a basket and Gate 2 stores only the
// suggested ids, so free text would be neither stored, shown nor used.
export type PurchaseRequestInput = { outletId: string; lines: PurchaseLine[] };

export type HandoffCreation = { handoffToken: string; url: string; expiresAt: Date };

export type PurchaseRequestCreation = ({ kind: "created" } & HandoffCreation) | { kind: "refused"; error: AppError };

// Gate 3's four outcomes, plus "refused" when the basket no longer prices (a changed menu, an
// unavailable item) or the buyer's same basket is still being paid; nothing is bound then.
export type HandoffRedemption =
  | { kind: "redeemed"; purchaseId: string }
  | { kind: "expired" }
  | { kind: "already_redeemed" }
  | { kind: "invalid" }
  | { kind: "refused"; error: AppError };

// What the approval page may show before redemption: public registry names and quantities only.
export type HandoffPreview =
  | {
      kind: "open";
      outlet: { id: string; name: string; area: string; isDemoFixture: boolean };
      lines: { name: string; quantity: number }[];
      expiresAt: Date;
    }
  | { kind: "expired" }
  | { kind: "already_redeemed" }
  | { kind: "invalid" };
