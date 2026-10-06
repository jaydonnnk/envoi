# Status: Envoi

Updated: 2026-10-07 (Asia/Singapore).

- Gate 1 - Product: **APPROVED 2026-10-07** by the user after reopening it to add a buyer-side scan entry point. Approval covers product scope and buyer/merchant journeys, including text and scan/paste entry points.
- Gate 2 - Architecture: pending.
- Gate 3 - Program Design: pending.
- Gate 4 - Slice plan: pending.

## Slices

No implementation slices are approved or started. Candidate slices in `roadmap.md` are discussion material, not the Gate 4 build contract. No application, payment integration or sponsor integration exists.

## Approved Gate 1 decisions

- Visitors who already have PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, authorization, menu and connected accepted destinations.
- PayPal first; PYUSD only after independent feasibility proof. One order uses one rail. Changed items, amount, recipient, currency or rail require fresh approval. No custody or buyer private keys; PYUSD does not imply SGD settlement.
- Both SGQR and a separate menu image are in proposed onboarding. SGQR supplies supported identifiers actually present, no menu and no ownership proof. AI by Zapier drafts names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry is the fallback. Unknown prices stay blank.
- **Added 2026-10-07:** buyers have two entry points. Either a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only. It is not payment authority, not a payment destination, and it cannot enroll a shop; an unenrolled sticker yields no purchase. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it.
- APIMatic PayPal Context Plugin and account-supported clients/documentation, Render application/worker hosting, and Zapier menu import are proposed integrations. AG Grid stays optional. This supersedes manual-only menus and optional Zapier.
- Pending/uncertain payments are never paid; reconcile before retrying or changing rails. Merchant acknowledgment is separate from payment confirmation.
- Proposed target: 4 of 5 first-time buyers complete an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with the external payment record matching the approved purchase. Record each tester's entry point, text or scan. Untested.

## Evidence boundary and unresolved blockers

- Primary sponsor/menu documentation checked in `research.md`; account access, credits, tiers and sponsor prize eligibility remain unverified. Zapier's sponsor page emphasizes MCP; the proposed AI-by-Zapier workflow's recognition is not established. A trial is not sufficient access through judging.
- AI image delivery needs a fetchable direct image link. Temporary private storage/signed access is a candidate, not a tested integration. Supabase signed URLs survive Auth key revocation; early source removal/cache denial needs proof or a different serving approach. Access window, formats/size limits, validation, timeout/retry and cleanup contracts remain later-gate decisions. Source removal does not establish deletion from provider history/caches.
- No authentic SGQR/menu extraction, Zapier workflow, payment transaction, merchant ownership trial or user test has been demonstrated. No buyer-side scan has been demonstrated.
- Prior-art review of shipped SGQR payment products, 2026-10-07 (`research.md`), supports three decisions: the sticker is an identity key and not a payment route on either rail; shipped products require ownership documents plus human review rather than auto-publishing from a photo; and the stablecoin-to-SGD off-ramp remains unsolved non-custodially, which reinforces the separate merchant-economics test. A "99% of payers use PayNow" figure appearing in prior art is an unverified third-party market claim and must not enter public submission materials without a primary source.
- Live deployment separately requires provider eligibility, legal assessment, merchant enrollment and operational checks. No-custody alone does not establish a legal exemption.

## Notes for a fresh session

- Gate 1 was reopened on 2026-10-07 to add buyer-side scan, then explicitly approved by the user: "I approve gate 1." The scope change is recorded in `01-product.md` and mirrored in `handoff.md` and `roadmap.md`. The current request is to read the changes, record approval, and commit/push to `main`; Gates 2-4 remain pending.
- Preserve `../PAYPAL_PLAN.md` as the original brief. Its conflicting claims are superseded by `01-product.md` and explicitly corrected in `research.md`, not treated as demonstrated evidence.
- Original SHA256 before and after consolidation: `A99321F0563ACC545F34BE664F71EC25E14836C2A9B94B27EDDBA3A891F3152F`. On 2026-10-07 a three-line supersession banner was added at the top of `PAYPAL_PLAN.md` and nothing below it changed; SHA256 after the banner is `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1`. The pre-banner bytes remain in git at the Initial commit, so the audit trail is intact in both forms.
- Applicable ancestor instructions were read. The requested RTK command wrapper was unavailable on PATH; ordinary PowerShell/Python commands were used.
- This workspace is a Git repository on `main`, with origin `https://github.com/jaydonnnk/envoi.git`, and contains planning artifacts only. All current mockup sources are plain `.html`; no `.tsx` visualization was created.
- The Next.js/TypeScript, Node backend/worker, Supabase Postgres/Auth and Render stack in `stack-recommendation.md` remains provisional. Zapier is included for menu drafting. No Gate 2-4 documents or application implementation were created.
- Actual sandbox/devnet execution is test evidence, not live money. Toolkit capture does not authorize the buyer; external approval is required. Never require unattended buyer approval as a kill condition.
- All decisions needed for review are saved here. `handoff.md` describes the approval boundary. Do not reopen consolidation merely because a fresh session starts; first read the user's next instruction and the first unapproved gate.
- Submission cutoff: 2026-11-13 04:00 SGT; see the checked official rules in `research.md`. Account/service availability must cover judging.

## Verification of planning artifacts

Fresh consolidation checks, 2026-10-06. **2026-10-07 re-check after the scan amendment:** `buyer.html` and `index.html` were re-verified in a browser — no duplicate element IDs, no orphaned label targets, one primary heading each, no external scripts or network calls; no horizontal overflow at 390px (mobile breakpoint) or 1280px; the new scan card presents an enrolled result and a not-enrolled result, both labeled fixtures, plus the rule that a scan identifies a shop only. The checks below still apply unchanged to the four pages that were not amended.

- **2026-10-07 approval check:** all six HTML pages passed static checks for local links, unique IDs, label targets and one main/primary heading; all three inline scripts passed Node syntax checks. `index.html` and `buyer.html` passed browser checks at 390px and 1280px after the approval wording update. Approval and test-environment metric mirrors agree; Gates 2-4 remain pending. Both brief hashes were recomputed and its preserved body compared byte-for-byte with the Initial commit. These are planning-artifact checks, not integration or usability evidence.
- Six HTML pages: local navigation targets, one main/primary heading, unique IDs, label targets and explicit no-payment notices checked. Three inline scripts passed Node syntax checks. No external scripts or extraction/payment network calls are present.
- Browser verified unreadable prices stay blank; failed/malformed/processing fixtures cannot be confirmed; manual entry is available; availability is supplied by the merchant; removing an unreadable item allows review of the remainder.
- Browser verified shop/menu edits invalidate their respective local confirmation, adding an incomplete item invalidates menu confirmation, and publication stays disabled because authorization/destinations remain unverified.
- Review handoff remains mockup-only. Receipt previews for pending, confirmed, uncertain, canceled and failed keep an explicit lack of execution evidence and separate acknowledgment.
- All six pages checked at 390px and 1280px widths: no horizontal overflow observed. Onboarding desktop and mobile menu layout visually inspected. This is not a full accessibility audit or usability result.
- Existing `mockups/review-preview.jpg` predates consolidation and is historical only; use current HTML for review. No new screenshot file was created.
- Loopback-only preview: `http://127.0.0.1:8793/index.html`. The temporary Python static server may need restarting in a later session. This serves planning HTML, not an application deployment.
- The original brief's body remains byte-identical to the Initial commit; only the dated supersession banner changes the whole-file hash recorded above. No application builds, provider transactions, real image imports or user tests were run.

## Stop point

Gate 1 approval is recorded. Complete the user's requested commit and push to `main`, verify the remote result, then stop. Gate 2 is the next pending gate; no Gate 2-4 document or application implementation is part of this request.
