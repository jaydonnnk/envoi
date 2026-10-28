# Product: Envoi

**Reopened 2026-10-25 for the continuation slices S19-S22 and RE-APPROVED by the user the same day** ("I approve Gate 1.").
The user asked on 2026-10-25: "Draft the combined Gate 1, 2 and 3 reopening for S19-S22, including the one-box mockup."
It follows an external review of 2026-10-24 and the [continuation plan](continuation-plan.md); everything not marked below stays as re-approved on 2026-10-24.
Approval accepts these product changes as a proposal; it approves no architecture, contract, slice, build, model call, upload or deploy.
Three changes, each marked *Added 2026-10-25* where it lands:
- **One sentence, one box.** The buyer types what they want and where in one box; the separate area field goes. Envoi may fill the basket with the items and quantities it understood, ask which item when two fit, and say when an item is unavailable. The buyer still reviews the server price and approves the payment. Screen: [`mockups/buyer-one-box.html`](mockups/buyer-one-box.html).
- **Envoi's own reference agent.** Envoi publishes a small external agent that a person runs in a terminal; it reads shops and menus through the generated API client and hands the buyer the same one-time link as any other agent. It never pays.
- **Menu photo import may return through one more measured round.** The setup page keeps saying photo import is not available until a pre-registered round passes and the user approves the import screen in a later Gate 1 change.

**Reopened 2026-10-15 for one change, revised and RE-APPROVED by the user on 2026-10-16** ("I approve Gate 1.").
After three pre-registered vision evaluations found no model accurate enough (see [`00-status.md`](00-status.md#s11-vision-evaluation-round-3-results-2026-10-15)), the user decided on 2026-10-15: "Option A: ship S11 with imports closed and manual entry only, and reopen Gate 1 to move AI menu drafting to good-to-have after the slices."
- **Menu photo drafting is deferred.** In the hackathon build the merchant enters the menu by hand; no AI model drafts a menu from a photo, and Envoi makes no AI-drafting claim.
  Menu photo import moves to a "good to have" list after all slices, together with sharpening the import and language additions; it returns only after an evaluation passes and the user approves real merchant photos.
- Everything else stays as re-approved on 2026-10-10.

**Reopened 2026-10-10, revised and RE-APPROVED by the user the same day** ("I approve gate one").
The user removed Zapier because it is paid and reopened Gates 1, 2 and 3.
This revision changes only what the user decided on 2026-10-10:

- **Menu drafting without Zapier.** An AI model reads the separate menu photo and drafts item names and SGD prices while the merchant waits. Envoi does not keep the photo once the draft returns. Manual entry stays the fallback. *Deferred on 2026-10-15; see the top of this file.*
- **PYUSD is in the hackathon plan.** It is built after the PayPal journey, is the first capability cut if time runs short, and stays visibly unavailable until its own test passes. The PayPal journey never depends on it.
- **The merchant sets the PYUSD rate.** A shop that accepts PYUSD states how much PYUSD it accepts per S$1. Buyers see that rate and the date it was set as the shop's rate, not a market quote. A rate not re-confirmed for 30 days makes PYUSD unavailable at that shop until the merchant confirms one again.

Everything else below stays as approved on 2026-10-07 and is not redone.
See [`00-status.md`](00-status.md#reopening-2026-10-10-zapier-removed) and [`handoff.md`](handoff.md#reopening-2026-10-10-zapier-removed-pyusd-reconsidered).

Gate 1 consolidated proposal, 2026-10-06; **reopened 2026-10-07** to add a buyer-side scan entry point after a prior-art review of Quay, recorded in `research.md`. **APPROVED by the user 2026-10-07** for product scope and journeys only, including both buyer entry points. Hackathon first, then a separately approved production launch. Gate 2 architecture proposal is **APPROVED 2026-10-07** in `02-architecture.md`. Gate 3 program design is **APPROVED 2026-10-07** in `03-program-design.md`; the Gate 4 slice plan is an unapproved draft in `04-slices.md` (2026-10-10). These approvals establish no runtime/account proof; the eight Gate 2 review findings are closed as dispositioned by Gate 3, with their named residual risks still open. This status update does not change the approved product decisions.

## Problem

Buyer: "I am visiting Singapore. I want to buy something from this shop, but I do not have a payment method it accepts. I need to know whether I can pay, what I am approving, and whether the payment actually reached the shop."

Merchant: "I want visitors to find my shop and pay using a method I have chosen to accept, without sending the money through another company's account."

These are hypotheses, not interview findings. The initial audience is a visitor who already has PayPal or a compatible wallet, purchasing in person from an explicitly enrolled merchant. Envoi does not make an arbitrary SGQR sticker payable through PayPal.

## Success metric

**Proposed target: 4 of 5 first-time buyers complete an eligible test-environment purchase within 3 minutes, without coaching, with the external payment record matching their approved purchase.** "Test environment" means PayPal sandbox or wallet devnet, whichever rail the tester selects. Measure from submitting the request until the confirmed receipt appears, including external approval. Check outlet/recipient, items, quantities, amount, currency and selected rail against the approved purchase and external payment record. Declare account preparation before testing.

Record which entry point each tester chose, text or scan. A camera permission prompt is a plausible failure that the text path does not have, so the two entry points must not be scored as one undifferentiated result.

This is a small prototype usability target, not a conversion claim or a market-validation result. Baseline and observed results do not yet exist. Record failures and help requests; do not exclude them after the test.

Before making a production impact claim, separately test merchant willingness to accept the fees and settlement asset. Low network cost alone is not evidence that a shop wants PYUSD.

## Announcement - the blog post before the feature

Envoi helps visitors buy in person from participating Singapore shops using PayPal or a supported wallet they already have. Merchants upload their SGQR sticker, correct the drafted shop details, enter their menu, and confirm their outlet, menu and accepted payment destinations before publication. Buyers either describe what they want or point their camera at the shop's SGQR sticker to identify that exact outlet, then review the exact basket, recipient and known or unknown costs. They approve through PayPal or their wallet before payment goes directly to the shop's connected destination. Envoi reports payment honestly and shows the merchant's acknowledgment separately.

## Scope choices

| Approach | Benefit | Cost or limitation |
| --- | --- | --- |
| **Recommended: PayPal first, then proven PYUSD** | Establish the required payment journey early; preserve the two-rail differentiator without depending on it for every milestone. | PYUSD is unavailable until its independent test succeeds; demonstrations of both methods require separate orders. Since 2026-10-10 PYUSD is planned for the hackathon, built after PayPal and cut first. |
| Two rails from the beginning | Compare both methods earlier. | Two approval journeys, pricing currencies, and failure paths compete with proving the basic purchase. |
| Production launch first | Test real merchant economics and customer demand sooner. | Seller enrollment, provider eligibility, legal assessment, and operations become prerequisites; the hackathon schedule is not a credible launch commitment. |

The recommended prototype includes:

- A merchant uploads **an SGQR image** and **enters the menu**. Supported identifiers actually present in SGQR become a draft for review/correction; it contains no menu and proves no ownership. The merchant enters item names, SGD prices, availability and missing details, and explicitly confirms before publication. Drafting the menu from a photo is deferred to after the slices (decided 2026-10-15).
- Only an authorized demo merchant with connected test destinations can become discoverable. A photo or a well-formed business identifier does not prove ownership.
- A buyer uses text to find registered shops and items. Ambiguous requests ask for clarification. Missing location asks for an area; "nearest" needs usable location information.
  *Added 2026-10-25:* the text is one box holding both the request and the place. When the shop is known (named in the sentence, scanned, or the shop's page is open), Envoi may fill the basket with published, available items and the quantities the buyer asked for; when two items fit one phrase it asks which; when an item is unavailable it says so and adds nothing. A filled basket is a proposal: nothing is reviewed or paid until the buyer taps Review.
- A buyer may instead **scan or paste the shop's SGQR sticker** to identify that exact outlet. A scan needs no location information and no "nearest" judgement, which removes the weakest step in the text path. It resolves only a shop already enrolled; an unenrolled sticker says so plainly and offers text search. A scan identifies the shop and nothing else.
- The buyer reviews exact items, quantities, registered SGD price, shop/outlet, recipient, payment currency and selected rail. Cost estimates distinguish payer cost from merchant fees and mark missing information.
- The buyer confirms in the payment provider or wallet. Envoi does not promise one physical tap across external approvals.
- A confirmed receipt names the test environment and actual external reference. The merchant sees the corresponding payment and can acknowledge the order.
- Another agent can discover the same participating merchant and open the same human approval journey. "Any agent" is limited to clients that implement the supported interface; it does not mean autonomous spending.
  *Added 2026-10-25:* Envoi's own reference agent is one such client: a person runs it in a terminal, it reads shops and menus through the generated API client, asks which item when two fit, says when an item or shop is unavailable, and returns a one-time link. It has no payment authority and cannot read a receipt.

## Product rules

1. One order, one selected payment method. Showing both methods means two independent purchases, not charging the same basket twice.
2. The assistant proposes. The buyer approves an exact purchase. Changed items, quantities, amount, recipient, currency or rail require fresh review and approval through the selected provider or wallet.
3. No custody or buyer private keys. Envoi never stores a buyer's wallet private key or asks the assistant to sign a transfer.
4. A merchant's PYUSD receipt is PYUSD in its wallet, not automatic SGD settlement. Any SGD equivalent is labeled with its conversion basis and age. The PYUSD amount for an SGD price uses the rate the merchant accepted, shown with the date it was set; it is the shop's rate, not a market quote. The amount is rounded up to the smallest PYUSD unit, so the shop never receives less than its own rate implies. A rate not re-confirmed for 30 days makes PYUSD unavailable at that shop; PayPal is unaffected.
5. Missing costs are shown as unknown. Do not claim zero FX, a universal cheapest option, or guaranteed savings.
6. A pending, canceled, failed, or uncertain payment cannot appear as paid. An uncertain payment must be checked before trying again or changing methods.
7. Payment confirmation does not mean the shop has accepted the order, prepared food, or guaranteed a refund. The customer is at the shop; fulfillment remains with the merchant.
8. Registered menus and merchant messages may inform suggestions but cannot change the buyer's approved payment.
9. Seeded shops are labeled demo fixtures. Use fictional merchant branding until a real merchant grants permission.
10. A photo draft cannot publish itself. Unreadable prices stay blank until supplied by the merchant. Menu edits invalidate the prior menu confirmation.
11. A scanned sticker identifies a shop. It is not payment authority, not proof of enrollment and not a payment destination. Recipient and rail come only from the merchant's connected destination, and a sticker carries no wallet address, so it routes neither rail. An unenrolled sticker produces no purchase and cannot enroll a shop by itself.

## Proposed sponsor support

- **APIMatic:** PayPal Context Plugin; generated API clients/documentation where account access supports them.
- **Render:** application hosting; recovery execution is selected at Gate 2 subject to free-service access.

Zapier was removed on 2026-10-10 because it is paid. Sponsor tools are optional under the official rules, and there is no Zapier prize.
These are proposed integrations, not completed integrations. Access and technical limits remain in the supporting research and provisional stack. Sponsor prize eligibility is unverified. AG Grid remains optional.

## Buyer journey

1. Identify the shop one of two ways: enter "Find kaya toast and kopi near my area" and provide an area if location is unavailable, **or** scan/paste the sticker at the counter to resolve that exact outlet with no location needed.
   *Added 2026-10-25:* the request and the place share one box, for example "Two Kopi C at Test Shop"; a request without a shop or area is asked "Which area, or which shop?". When the shop is known, the basket may arrive filled with the asked-for items and quantities.
2. Review the matching registered outlet and its offered items. Resolve any ambiguity before continuing.
3. Review the basket, registered price, supported methods, and known/unknown costs.
4. Choose one method and continue to its external approval. Canceling keeps the purchase unpaid.
5. Return to a pending or confirmed receipt. A confirmed receipt includes the actual payment reference; an unknown result offers a status check.
6. Show the receipt to the merchant. Order acknowledgment is a separate status.

## Merchant journey

**The sticker and the menu are separate:** SGQR contains payment information, not a menu. Do not infer prices from a business identifier, shop name or unrelated online listing.

1. Upload the SGQR sticker. Review supported identifiers actually present, correct them, or enter details manually. A UEN may be absent; different outlets may share one. The image does not prove ownership.
2. Confirm the outlet and authority to represent it. Connect destinations you control. Where one business identifier covers several outlets, record what distinguishes this outlet, so a buyer's scan resolves one location rather than a whole chain. For the hackathon, use disclosed, pre-provisioned and allowlisted test accounts. To accept PYUSD, prove you control the receiving wallet by signing a message in it (Envoi never asks for a private key), and state the PYUSD you accept per S$1; re-confirm that rate at least every 30 days.
3. **Enter the menu**: item names, SGD prices, portions, availability and missing details. Menu photo import is not available in this release, and the setup page says so.
4. Review every entry. A missing price stays blank, never zero, and blocks confirmation until you supply it.
5. Explicitly confirm the complete menu and shop details. Drafts remain invisible to buyers. Publication requires merchant authorization, complete confirmed entries and at least one connected accepted destination; it does not require enabling PYUSD.
6. View payment status and acknowledge an order separately. Later menu edits require confirmation again and fresh buyer approval for affected purchases.

No complete-onboarding speed claim is established. Neither SGQR extraction nor authorization/connection checks have been demonstrated.

## Failure states to review

- Unreadable sticker or no usable business identifier: manual entry, with no invented extracted value.
- Menu photo import requested: say it is not available in this release and keep manual entry; never imply a photo was read.
- Unreadable price, missing availability or ambiguous currency: leave the entry incomplete until the merchant supplies and confirms it.
- Menu edited after confirmation, unverified merchant authorization or disconnected destination: keep publication blocked.
- No enrolled shop, multiple matching outlets, unavailable item, or missing location: explain what information is needed; do not guess.
- Scanned sticker is not an enrolled shop: say plainly that it is not on Envoi, do not imply it is payable through Envoi, and offer text search or the merchant enrollment path. Never auto-enroll from a scan.
- Scanned identifier matches several enrolled outlets: ask which outlet; do not infer proximity from a shared identifier.
- Camera access denied, unreadable scan, or the code is not a payment sticker: offer paste and then text search; do not guess an outlet.
- Payment method not supported or missing conversion quote: keep it unavailable rather than fabricate a comparison.
- PYUSD test not yet passed, no wallet connected, or the shop's PYUSD rate not re-confirmed for 30 days: PYUSD shows as unavailable with the reason; PayPal stays available.
- Changed price/destination or expired review: show the change and request fresh approval.
- Buyer cancels approval: unpaid; no receipt of success.
- Provider/chain result uncertain: checking payment; no blind retry or immediate switch to the other method.
- Merchant not yet acknowledging an already confirmed payment: preserve "paid" and show acknowledgment separately.

## Cuts and non-goals

No PayNow execution, delivery, inventory reservations, custody, pooled payments, escrow, unattended purchases, auto-SGD conversion, or guaranteed refunds. Scanning does not make an arbitrary SGQR sticker payable and does not enroll a shop; it only finds one that is already enrolled. Voice, a negotiation conversation, AG Grid, and broad catalogue ingestion are optional. A small merchant view is sufficient.

Menu-image import with AI drafting is deferred, decided by the user on 2026-10-15 after three pre-registered evaluations: it is on the "good to have" list after the slices, together with sharpening the import and language additions. Manual entry is the hackathon path, and no AI-drafting claim is made. Live deployment requires separate provider, legal, merchant enrollment and operational checks.
*Added 2026-10-25:* one more pre-registered round may run, with a merchant rotate and crop step before upload, all earlier hard photos kept and fresh unseen photos added. It passes only if it meets the earlier accuracy threshold and correcting the draft is faster than typing the same menu. Until then, and until the user approves the import screen, manual entry stays the only path and no AI-drafting claim is made.
*Added 2026-10-28:* that round ran on 2026-10-28 and failed on wrong filled prices, so one further pre-registered round may run, with a corrected scorer, a way for the model to mark a price it cannot read with certainty, and more than one call per photo so the spread between calls is measured. It runs on photos the round 4 diagnosis has already read, so it can show whether those corrections work and it cannot establish accuracy on menus the model has not seen. It passes only if it meets the threshold written down before it runs and correcting the draft is faster than typing the same menu. A pass opens nothing: manual entry stays the only path, no AI-drafting claim is made, and the import screen still needs its own Gate 1 and Gate 3 change before any merchant can use it.

Negotiation may be added only after the payment paths work: a merchant chooses explicit discount rules, the buyer sees the authorized discount, and changing the resulting price triggers a fresh review. A simpler rule-based offer is acceptable; two talking agents are not a requirement.

## Screens

Each `.html` file in `mockups/` is a plain, throwaway product mockup. The directory is the location convention required by software-factory, not an implementation design. `mockups/review-preview.jpg` is a superseded historical image and not a current screen; review the HTML.

- `mockups/landing.html`: the first page at the site's root address, added 2026-10-21: one headline, "PayPal or PYUSD. Straight to the shop.", a "Find a shop" button to the buyer screen and an "I run a shop" button to merchant setup, three steps (find, check, pay) and links to the source code and the evidence; it shows no shop, so it carries the test-environment badge and "Test money only. No real money moves." without the demo fixture wording, and it has no navigation bar.
- `mockups/merchant-onboarding.html`: the SGQR upload, manual menu entry with photo import shown as not available, confirmation and publication blockers, and the PYUSD wallet and rate the merchant accepts.
- `mockups/buyer.html`: both buyer entry points — a text request with location clarification, and a scan/paste path with an unenrolled-sticker result — plus the registered outlet and merchant-confirmed published menu.
- `mockups/review.html`: single-method selection, exact basket, known/unknown costs, external approval handoff, and the PYUSD option priced at the shop's own dated rate.
- `mockups/receipt.html`: pending/confirmed/failed/canceled/uncertain layouts, honest reference placeholder, separate merchant acknowledgment.
- `mockups/merchant-orders.html`: payment visibility, acknowledgment and menu-maintenance link.
- `mockups/merchant-shop-qr.html`: added 2026-10-24 (approved 2026-10-24): the merchant setup sticker area with an Envoi shop QR that opens the shop's buy page; it is not a payment code and not the merchant's SGQR, which Envoi never stores.
- `mockups/merchant-orders-delete.html`: added 2026-10-24 (approved 2026-10-24): Delete on every merchant order; a deleted order is archived as a record, never erased, and an order still being checked returns if it becomes paid.
- `mockups/buyer-one-box.html`: added 2026-10-25 (approved 2026-10-25): one box for the request and the place, with four example answers (basket filled with quantities, "Which iced tea?", an unavailable item, and "Which area, or which shop?"); the sample iced teas are not on Test Shop's live menu.
- `mockups/index.html`: review navigation for the five screens above it; not a product screen. The landing page is opened directly.

No mockup uploads an image, extracts data, publishes a shop or performs a payment. Sample prices and local interactions are fixture demonstrations, not market or integration evidence.

## Gate 1 acceptance

- Buyer and merchant journeys are understandable in the mockups.
- Both buyer entry points are explicit, and a scan cannot be mistaken for payment authority, for a payment destination, or for enrolling a shop.
- The SGQR upload, manual menu entry, merchant correction/confirmation and publication blockers are explicit.
- Menu photo import is visibly not available in this release, and no AI drafting is claimed.
- The PYUSD rate is visibly the shop's own dated rate, and an expired rate or an unproven PYUSD test leaves PayPal working.
- Scope, audience, cuts, and the proposed measurement are accepted.
- External approval, single-method payment, honest cost uncertainty, and order acknowledgment are explicit.
- Seeded merchants and test transactions cannot be mistaken for live adoption or live money.
- *Added 2026-10-25:* a basket filled from one sentence is visibly a proposal the buyer can change, holds only published available items, and is never reviewed or paid without the buyer's tap.

**Gate 1 approved 2026-10-07, reopened 2026-10-10, revised and re-approved 2026-10-10, reopened again on 2026-10-15 to defer menu photo drafting, revised and re-approved on 2026-10-16, and reopened and re-approved on 2026-10-21 to add the landing page, and on 2026-10-24 to add the merchant shop QR and order archive. Gates 2 and 3, approved 2026-10-07, were also reopened for the Zapier removal and re-approved on 2026-10-11; Gate 3 was reopened again on 2026-10-12 for one PayPal kill-switch check and for the TypeScript pin found by the S1 boot check, and re-approved both times the same day.** The slice plan in `04-slices.md` was revised and approved on 2026-10-12 and amended on 2026-10-14 for one S6 receipt sentence; S1, the tracer bullet, was done on 2026-10-12, S2, the PayPal sandbox happy path, and S3, PayPal recovery, on 2026-10-13, S4, text entry with AI suggestions, on 2026-10-14, S13, agent handoff over MCP, also on 2026-10-14, S6, merchant sign-in and manual menu draft, also on 2026-10-14, with its review fixes the same day, S5, the maintenance runner with manual runs and the operator health view, also on 2026-10-14, S7, merchant destination and publication, also on 2026-10-14, and S8, merchant orders and separate acknowledgment, on 2026-10-15, with its review fixes the same day; S11, menu photo import, was done on 2026-10-16 and ships with imports closed after no vision model met its threshold; no later slice has started. The status text near the top of this file, including the "(2026-10-10)" draft date and the 2026-10-07 approvals, is dated history; this line is the current status. Current source corrections are in `research.md`; `stack-recommendation.md` mirrors the approved architecture proposal and the Gate 3 pins. These approvals do not establish runtime/account or usability evidence. The eight Gate 2 review findings are closed as dispositioned by Gate 3; the residual risks that disposition names remain open.
