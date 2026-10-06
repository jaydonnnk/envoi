# Envoi: handoff at the Gate 1 approval boundary

Updated 2026-10-06. Consolidation is complete; **Gate 1 remains unapproved**. Gates 2-4 are pending. No app, sponsor integration or payment integration exists. The current request authorizes consolidation only.

Workspace: `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`.
Skill: `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md`.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve `docs/plans/PAYPAL_PLAN.md`; its unchanged SHA256 is recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: consolidated Gate 1 product proposal with buyer/merchant journeys, rules, sponsor roles and untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` now shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief and unresolved proof requirements.
- `stack-recommendation.md`: provisional Next.js/TypeScript, Node backend/worker, Supabase Postgres/Auth, Render, APIMatic and Zapier recommendation. Not Gate 2 approval.
- `roadmap.md`: discussion candidates including the separate Zapier menu-import slice. Not Gate 4 approval.
- `00-status.md`: current approvals, evidence boundary and fresh mockup checks. The older JPG preview is historical; current HTML is authoritative for review.

## Product scope to preserve

Visitors with PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, menu, authority and connected destinations. Buyers use text, review the exact basket/costs, externally approve and receive an honest status; merchant acknowledgment is separate.

PayPal first; PYUSD only after independent proof. One rail per order. Changed items, amount, recipient, currency or rail require fresh approval. Pending/uncertain is not paid; reconcile before retrying. No custody or buyer private keys. PYUSD does not imply automatic SGD settlement.

Merchants upload both SGQR and a separate menu image. SGQR contains no menu and proves no ownership; decode only supported identifiers present and allow correction. AI by Zapier drafts menu names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry on failure; no guessed prices or auto-publication. This supersedes manual-only menus and optional Zapier.

Propose APIMatic PayPal Context Plugin and clients/documentation where access supports them; Render application/worker hosting; Zapier AI menu drafting. AG Grid optional. Access, prizes, extraction and payment execution remain unproven. Temporary image access/removal and upstream retention are distinct. Live launch needs separate provider, legal, merchant enrollment and operations checks.

Proposed target remains 4 of 5 first-time buyers completing an eligible sandbox purchase within 3 minutes without coaching, with an external payment record matching the approved purchase. It has not been tested.

## Next authorized action

Wait for the user's Gate 1 decision. If changes are requested, revise only the affected proposal and mockups, recheck them, and ask **"Approve Gate 1, or what should change?"** If explicit approval arrives, record it before separately advancing the software-factory workflow. Do not treat this handoff, source research, mockup verification or a prior consolidation request as approval.

A fresh session can continue from these files; no material decision exists only in chat.
