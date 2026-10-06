# Status: Envoi

Updated: 2026-10-06 (Asia/Singapore).

- Gate 1 - Product: in progress; consolidated proposal, **unapproved**, awaiting explicit user approval.
- Gate 2 - Architecture: pending.
- Gate 3 - Program Design: pending.
- Gate 4 - Slice plan: pending.

## Slices

No implementation slices are approved or started. Candidate slices in `roadmap.md` are discussion material, not the Gate 4 build contract. No application, payment integration or sponsor integration exists.

## Consolidated Gate 1 decisions proposed for approval

- Visitors who already have PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, authorization, menu and connected accepted destinations.
- PayPal first; PYUSD only after independent feasibility proof. One order uses one rail. Changed items, amount, recipient, currency or rail require fresh approval. No custody or buyer private keys; PYUSD does not imply SGD settlement.
- Both SGQR and a separate menu image are in proposed onboarding. SGQR supplies supported identifiers actually present, no menu and no ownership proof. AI by Zapier drafts names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry is the fallback. Unknown prices stay blank.
- APIMatic PayPal Context Plugin and account-supported clients/documentation, Render application/worker hosting, and Zapier menu import are proposed integrations. AG Grid stays optional. This supersedes manual-only menus and optional Zapier.
- Pending/uncertain payments are never paid; reconcile before retrying or changing rails. Merchant acknowledgment is separate from payment confirmation.
- Proposed target: 4 of 5 first-time buyers complete an eligible sandbox purchase within 3 minutes without coaching, with the external payment record matching the approved purchase. Untested.

## Evidence boundary and unresolved blockers

- Primary sponsor/menu documentation checked in `research.md`; account access, credits, tiers and sponsor prize eligibility remain unverified. Zapier's sponsor page emphasizes MCP; the proposed AI-by-Zapier workflow's recognition is not established. A trial is not sufficient access through judging.
- AI image delivery needs a fetchable direct image link. Temporary private storage/signed access is a candidate, not a tested integration. Supabase signed URLs survive Auth key revocation; early source removal/cache denial needs proof or a different serving approach. Access window, formats/size limits, validation, timeout/retry and cleanup contracts remain later-gate decisions. Source removal does not establish deletion from provider history/caches.
- No authentic SGQR/menu extraction, Zapier workflow, payment transaction, merchant ownership trial or user test has been demonstrated.
- Live deployment separately requires provider eligibility, legal assessment, merchant enrollment and operational checks. No-custody alone does not establish a legal exemption.

## Notes for a fresh session

- Preserve `../PAYPAL_PLAN.md` as the original brief. Its conflicting claims are superseded by `01-product.md` and explicitly corrected in `research.md`, not treated as demonstrated evidence.
- Original SHA256 before and after consolidation: `A99321F0563ACC545F34BE664F71EC25E14836C2A9B94B27EDDBA3A891F3152F`.
- Applicable ancestor instructions were read. The requested RTK command wrapper was unavailable on PATH; ordinary PowerShell/Python commands were used.
- This workspace is not a Git repository and contains planning artifacts only. All current mockup sources are plain `.html`; no `.tsx` visualization was created.
- The Next.js/TypeScript, Node backend/worker, Supabase Postgres/Auth and Render stack in `stack-recommendation.md` remains provisional. Zapier is included for menu drafting. No Gate 2-4 documents or application implementation were created.
- Actual sandbox/devnet execution is test evidence, not live money. Toolkit capture does not authorize the buyer; external approval is required. Never require unattended buyer approval as a kill condition.
- All decisions needed for review are saved here. `handoff.md` describes the approval boundary. Do not reopen consolidation merely because a fresh session starts; first read the user's next instruction and the first unapproved gate.
- Submission cutoff: 2026-11-13 04:00 SGT; see the checked official rules in `research.md`. Account/service availability must cover judging.

## Verification of planning artifacts

Fresh consolidation checks, 2026-10-06:

- Six HTML pages: local navigation targets, one main/primary heading, unique IDs, label targets and explicit no-payment notices checked. Three inline scripts passed Node syntax checks. No external scripts or extraction/payment network calls are present.
- Browser verified unreadable prices stay blank; failed/malformed/processing fixtures cannot be confirmed; manual entry is available; availability is supplied by the merchant; removing an unreadable item allows review of the remainder.
- Browser verified shop/menu edits invalidate their respective local confirmation, adding an incomplete item invalidates menu confirmation, and publication stays disabled because authorization/destinations remain unverified.
- Review handoff remains mockup-only. Receipt previews for pending, confirmed, uncertain, canceled and failed keep an explicit lack of execution evidence and separate acknowledgment.
- All six pages checked at 390px and 1280px widths: no horizontal overflow observed. Onboarding desktop and mobile menu layout visually inspected. This is not a full accessibility audit or usability result.
- Existing `mockups/review-preview.jpg` predates consolidation and is historical only; use current HTML for review. No new screenshot file was created.
- Loopback-only preview: `http://127.0.0.1:8793/index.html`. The temporary Python static server may need restarting in a later session. This serves planning HTML, not an application deployment.
- Original brief byte hash remains unchanged. No application builds, provider transactions, real image imports or user tests were run.

## Stop point

Present the consolidated artifacts, concise changes and blockers; ask **"Approve Gate 1, or what should change?"** Then stop. Consolidation authorization is not Gate 1 approval, Gate 2 authorization or application implementation permission.
