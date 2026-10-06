# Product: Envoi

Gate 1 consolidated proposal, 2026-10-06. **Unapproved.** Approval requested for product scope and journeys only. Hackathon first, then a separately approved production launch. Gates 2-4 remain pending.

## Problem

Buyer: "I am visiting Singapore. I want to buy something from this shop, but I do not have a payment method it accepts. I need to know whether I can pay, what I am approving, and whether the payment actually reached the shop."

Merchant: "I want visitors to find my shop and pay using a method I have chosen to accept, without sending the money through another company's account."

These are hypotheses, not interview findings. The initial audience is a visitor who already has PayPal or a compatible wallet, purchasing in person from an explicitly enrolled merchant. Envoi does not make an arbitrary SGQR sticker payable through PayPal.

## Success metric

**Proposed target: 4 of 5 first-time buyers complete an eligible sandbox purchase within 3 minutes, without coaching, with the external payment record matching their approved purchase.** Measure from submitting the request until the confirmed receipt appears, including external approval. Check outlet/recipient, items, quantities, amount, currency and selected rail against the approved purchase and external payment record. Declare account preparation before testing.

This is a small prototype usability target, not a conversion claim or a market-validation result. Baseline and observed results do not yet exist. Record failures and help requests; do not exclude them after the test.

Before making a production impact claim, separately test merchant willingness to accept the fees and settlement asset. Low network cost alone is not evidence that a shop wants PYUSD.

## Announcement - the blog post before the feature

Envoi helps visitors buy in person from participating Singapore shops using PayPal or a supported wallet they already have. Merchants upload their SGQR sticker and a separate menu photo, correct the drafts, and confirm their outlet, menu and accepted payment destinations before publication. Buyers describe what they want, then review the exact basket, recipient and known or unknown costs. They approve through PayPal or their wallet before payment goes directly to the shop's connected destination. Envoi reports payment honestly and shows the merchant's acknowledgment separately.

## Scope choices

| Approach | Benefit | Cost or limitation |
| --- | --- | --- |
| **Recommended: PayPal first, then proven PYUSD** | Establish the required payment journey early; preserve the two-rail differentiator without depending on it for every milestone. | PYUSD is unavailable until its independent test succeeds; demonstrations of both methods require separate orders. |
| Two rails from the beginning | Compare both methods earlier. | Two approval journeys, pricing currencies, and failure paths compete with proving the basic purchase. |
| Production launch first | Test real merchant economics and customer demand sooner. | Seller enrollment, provider eligibility, legal assessment, and operations become prerequisites; the hackathon schedule is not a credible launch commitment. |

The recommended prototype includes:

- A merchant uploads **both an SGQR image and a separate menu image**. Supported identifiers actually present in SGQR become a draft for review/correction; it contains no menu and proves no ownership. AI by Zapier drafts item names and SGD prices from the separate menu image. The merchant corrects the draft, supplies availability and missing details, and explicitly confirms before publication. Manual entry is the fallback when extraction fails or an image is unavailable/unsupported.
- Only an authorized demo merchant with connected test destinations can become discoverable. A photo or a well-formed business identifier does not prove ownership.
- A buyer uses text to find registered shops and items. Ambiguous requests ask for clarification. Missing location asks for an area; "nearest" needs usable location information.
- The buyer reviews exact items, quantities, registered SGD price, shop/outlet, recipient, payment currency and selected rail. Cost estimates distinguish payer cost from merchant fees and mark missing information.
- The buyer confirms in the payment provider or wallet. Envoi does not promise one physical tap across external approvals.
- A confirmed receipt names the test environment and actual external reference. The merchant sees the corresponding payment and can acknowledge the order.
- Another agent can discover the same participating merchant and open the same human approval journey. "Any agent" is limited to clients that implement the supported interface; it does not mean autonomous spending.

## Product rules

1. One order, one selected payment method. Showing both methods means two independent purchases, not charging the same basket twice.
2. The assistant proposes. The buyer approves an exact purchase. Changed items, quantities, amount, recipient, currency or rail require fresh review and approval through the selected provider or wallet.
3. No custody or buyer private keys. Envoi never stores a buyer's wallet private key or asks the assistant to sign a transfer.
4. A merchant's PYUSD receipt is PYUSD in its wallet, not automatic SGD settlement. Any SGD equivalent is labeled with its conversion basis and age.
5. Missing costs are shown as unknown. Do not claim zero FX, a universal cheapest option, or guaranteed savings.
6. A pending, canceled, failed, or uncertain payment cannot appear as paid. An uncertain payment must be checked before trying again or changing methods.
7. Payment confirmation does not mean the shop has accepted the order, prepared food, or guaranteed a refund. The customer is at the shop; fulfillment remains with the merchant.
8. Registered menus and merchant messages may inform suggestions but cannot change the buyer's approved payment.
9. Seeded shops are labeled demo fixtures. Use fictional merchant branding until a real merchant grants permission.
10. A photo draft cannot publish itself. Unreadable prices stay blank until supplied by the merchant. Menu edits invalidate the prior menu confirmation.

## Proposed sponsor support

- **APIMatic:** PayPal Context Plugin; generated API clients/documentation where account access supports them.
- **Render:** application and worker hosting.
- **Zapier:** menu-import workflow using AI by Zapier image analysis and structured output.

These are proposed integrations, not completed integrations. Access and technical limits remain in the supporting research and provisional stack. Sponsor prize eligibility is unverified. AG Grid remains optional.

## Buyer journey

1. Enter "Find kaya toast and kopi near my area"; provide an area if location is unavailable.
2. Review the matching registered outlet and its offered items. Resolve any ambiguity before continuing.
3. Review the basket, registered price, supported methods, and known/unknown costs.
4. Choose one method and continue to its external approval. Canceling keeps the purchase unpaid.
5. Return to a pending or confirmed receipt. A confirmed receipt includes the actual payment reference; an unknown result offers a status check.
6. Show the receipt to the merchant. Order acknowledgment is a separate status.

## Merchant journey

**Two separate uploads:** SGQR contains payment information, not a menu. Do not infer prices from a business identifier, shop name or unrelated online listing.

1. Upload the SGQR sticker. Review supported identifiers actually present, correct them, or enter details manually. A UEN may be absent; different outlets may share one. The image does not prove ownership.
2. Confirm the outlet and authority to represent it. Connect destinations you control. For the hackathon, use disclosed, pre-provisioned and allowlisted test accounts.
3. Upload a **separate menu image**. Before real import, see that it will be shared with Zapier and its AI provider. Temporary image access and removal must be explained; provider retention may differ.
4. Review the draft beside the source image. Correct every item name and SGD price; provide availability, portions and missing details. Unreadable prices remain blank until you supply them. Re-upload or use manual entry if extraction fails.
5. Explicitly confirm the complete menu and shop details. Drafts remain invisible to buyers. Publication requires merchant authorization, complete confirmed entries and at least one connected accepted destination; it does not require enabling PYUSD.
6. View payment status and acknowledge an order separately. Later menu edits require confirmation again and fresh buyer approval for affected purchases.

No complete-onboarding speed claim is established. Neither image extraction nor authorization/connection checks have been demonstrated.

## Failure states to review

- Unreadable sticker or no usable business identifier: manual entry, with no invented extracted value.
- Menu image inaccessible, import delayed/failed or unusable output: keep the draft unpublished, preserve merchant edits, and offer re-upload or manual entry.
- Unreadable price, missing availability or ambiguous currency: leave the entry incomplete until the merchant supplies and confirms it.
- Menu edited after confirmation, unverified merchant authorization or disconnected destination: keep publication blocked.
- No enrolled shop, multiple matching outlets, unavailable item, or missing location: explain what information is needed; do not guess.
- Payment method not supported or missing conversion quote: keep it unavailable rather than fabricate a comparison.
- Changed price/destination or expired review: show the change and request fresh approval.
- Buyer cancels approval: unpaid; no receipt of success.
- Provider/chain result uncertain: checking payment; no blind retry or immediate switch to the other method.
- Merchant not yet acknowledging an already confirmed payment: preserve "paid" and show acknowledgment separately.

## Cuts and non-goals

No PayNow execution, delivery, inventory reservations, custody, pooled payments, escrow, unattended purchases, auto-SGD conversion, or guaranteed refunds. Voice, a negotiation conversation, AG Grid, and broad catalogue ingestion are optional. A small merchant view is sufficient.

Separate menu-image import is part of this proposal. Manual entry is its fallback, not a reason to silently drop Zapier. Live deployment requires separate provider, legal, merchant enrollment and operational checks.

Negotiation may be added only after the payment paths work: a merchant chooses explicit discount rules, the buyer sees the authorized discount, and changing the resulting price triggers a fresh review. A simpler rule-based offer is acceptable; two talking agents are not a requirement.

## Screens

Each file in `mockups/` is a plain HTML, throwaway product mockup. The directory is the location convention required by software-factory, not an implementation design.

- `mockups/merchant-onboarding.html`: both uploads, editable menu draft, failure/manual states, confirmation and publication blockers.
- `mockups/buyer.html`: buyer request, location clarification, registered outlet and merchant-confirmed published menu.
- `mockups/review.html`: single-method selection, exact basket, known/unknown costs, external approval handoff.
- `mockups/receipt.html`: pending/confirmed/failed/canceled/uncertain layouts, honest reference placeholder, separate merchant acknowledgment.
- `mockups/merchant-orders.html`: payment visibility, acknowledgment and menu-maintenance link.
- `mockups/index.html`: review navigation for the five screens; not a sixth product screen.

No mockup uploads an image, extracts data, publishes a shop or performs a payment. Sample prices and local interactions are fixture demonstrations, not market or integration evidence.

## Gate 1 acceptance

- Buyer and merchant journeys are understandable in the mockups.
- Both uploads, manual fallback, merchant correction/confirmation and publication blockers are explicit.
- Scope, audience, cuts, and the proposed measurement are accepted.
- External approval, single-method payment, honest cost uncertainty, and order acknowledgment are explicit.
- Seeded merchants and test transactions cannot be mistaken for live adoption or live money.

**Stop for Gate 1 approval.** Architecture, program contracts and the final slice plan require their own subsequent gates. Current source corrections are in `research.md`; the stack recommendation is provisional.
