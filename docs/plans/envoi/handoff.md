# Envoi: handoff after Gate 1 approval

Updated 2026-10-07. Consolidation is complete and Gate 1 was **reopened on 2026-10-07** to add a buyer-side scan entry point, then **explicitly APPROVED by the user on 2026-10-07** for product scope and journeys. Gates 2-4 are pending. No app, sponsor integration or payment integration exists. The current request is to read the latest Gate 1 changes, record approval, and commit/push to `main`.

Workspace: `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`.
Skill: `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md`.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve the body of `docs/plans/PAYPAL_PLAN.md` unchanged; it carries a supersession banner added 2026-10-07, and both the pre-banner and post-banner SHA256 values are recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: approved Gate 1 product scope with buyer/merchant journeys, rules, sponsor roles, both buyer entry points (text and scan) and an untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers. `buyer.html` shows the text entry point and the scan entry point including an unenrolled-sticker result.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief, prior-art findings from shipped SGQR payment products, and unresolved proof requirements.
- `stack-recommendation.md`: provisional Next.js/TypeScript, Node backend/worker, Supabase Postgres/Auth, Render, APIMatic and Zapier recommendation. Not Gate 2 approval.
- `roadmap.md`: discussion candidates including the separate Zapier menu-import slice. Not Gate 4 approval.
- `00-status.md`: current approvals, evidence boundary and fresh mockup checks. The older JPG preview is historical; current HTML is authoritative for review.

## Product scope to preserve

Visitors with PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, menu, authority and connected destinations. Buyers use text or scan/paste, review the exact basket/costs, externally approve and receive an honest status; merchant acknowledgment is separate.

Buyers have two entry points, added 2026-10-07: a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only — it is not payment authority, not a payment destination, and it cannot enroll a shop. An unenrolled sticker yields no purchase and offers text search instead. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it so a scan resolves one location.

PayPal first; PYUSD only after independent proof. One rail per order. Changed items, amount, recipient, currency or rail require fresh approval. Pending/uncertain is not paid; reconcile before retrying. No custody or buyer private keys. PYUSD does not imply automatic SGD settlement.

Merchants upload both SGQR and a separate menu image. SGQR contains no menu and proves no ownership; decode only supported identifiers present and allow correction. AI by Zapier drafts menu names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry on failure; no guessed prices or auto-publication. This supersedes manual-only menus and optional Zapier.

Propose APIMatic PayPal Context Plugin and clients/documentation where access supports them; Render application/worker hosting; Zapier AI menu drafting. AG Grid optional. Access, prizes, extraction and payment execution remain unproven. Temporary image access/removal and upstream retention are distinct. Live launch needs separate provider, legal, merchant enrollment and operations checks.

Proposed target remains 4 of 5 first-time buyers completing an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with an external payment record matching the approved purchase. Record each tester's entry point, text or scan. It has not been tested.

## Next authorized action

The user's explicit "I approve gate 1" is recorded in `00-status.md` and `01-product.md`. Complete the requested commit and push to `main`, verify the remote result, then stop. Gate 2 architecture is the next pending gate for subsequent work; the current request does not include it. Product approval and mockup verification do not establish working integrations or authorize application implementation.

A fresh session can continue from these files; no material decision exists only in chat.
