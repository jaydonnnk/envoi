# Status: Envoi

Updated: 2026-10-07 (Asia/Singapore).

- Gate 1 - Product: **APPROVED 2026-10-07** by the user after reopening it to add a buyer-side scan entry point. Approval covers product scope and buyer/merchant journeys, including text and scan/paste entry points.
- Gate 2 - Architecture: **APPROVED 2026-10-07** by the user. Approval accepts the architecture proposal in `02-architecture.md`, not runtime/account proof. The preceding review's findings remain unresolved; approval does not establish that they were fixed.
- Gate 3 - Program Design: pending.
- Gate 4 - Slice plan: pending.

## Slices

No implementation slices are approved or started. Candidate slices in `roadmap.md` are discussion material, not the Gate 4 build contract. No application, payment integration or sponsor integration exists.

## Approved Gate 1 decisions

- Visitors who already have PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, authorization, menu and connected accepted destinations.
- PayPal first; PYUSD only after independent feasibility proof. One order uses one rail. Changed items, amount, recipient, currency or rail require fresh approval. No custody or buyer private keys; PYUSD does not imply SGD settlement.
- Both SGQR and a separate menu image are in proposed onboarding. SGQR supplies supported identifiers actually present, no menu and no ownership proof. AI by Zapier drafts names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry is the fallback. Unknown prices stay blank.
- **Added 2026-10-07:** buyers have two entry points. Either a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only. It is not payment authority, not a payment destination, and it cannot enroll a shop; an unenrolled sticker yields no purchase. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it.
- APIMatic PayPal Context Plugin and account-supported clients/documentation, Render application hosting, and Zapier menu import are proposed integrations. Recovery hosting is a Gate 2 choice; the earlier Render-worker wording was provisional, not a requirement for a paid service. AG Grid stays optional. This supersedes manual-only menus and optional Zapier.
- Pending/uncertain payments are never paid; reconcile before retrying or changing rails. Merchant acknowledgment is separate from payment confirmation.
- Proposed target: 4 of 5 first-time buyers complete an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with the external payment record matching the approved purchase. Record each tester's entry point, text or scan. Untested.

## Evidence boundary and unresolved blockers

- Primary sponsor/menu documentation checked in `research.md`; account access, credits, tiers and sponsor prize eligibility remain unverified. Zapier's sponsor page emphasizes MCP; the proposed AI-by-Zapier workflow's recognition is not established. A trial is not sufficient access through judging.
- Free hosting only is explicit user authority. Supabase free-database quota is unavailable per the user. Render Free Postgres expires after 30 days and a Render worker has no free tier. The revised draft selects Render Free web + Neon Free Postgres + in-app Better Auth + finite GitHub Actions maintenance. Account quotas, zero-spend controls and execution through judging remain unverified.
- AI image delivery needs a fetchable direct image link. The revised draft uses bounded private PostgreSQL image rows behind an Envoi proxy. The proposed 5-minute processing/access deadline is checked on every fetch/result; normal closure deletes the row transactionally. Crash/idle removal uses best-effort hourly maintenance, with no five-minute deletion guarantee or hard physical-retention limit. Stale maintenance/overdue source rows block new imports. Database restore history and upstream copies remain distinct; fetch/denial/removal and informed consent are untested.
- No authentic SGQR/menu extraction, Zapier workflow, payment transaction, merchant ownership trial or user test has been demonstrated. No buyer-side scan has been demonstrated.
- Prior-art review of shipped SGQR payment products, 2026-10-07 (`research.md`), supports three decisions: the sticker is an identity key and not a payment route on either rail; shipped products require ownership documents plus human review rather than auto-publishing from a photo; and the stablecoin-to-SGD off-ramp remains unsolved non-custodially, which reinforces the separate merchant-economics test. A "99% of payers use PayNow" figure appearing in prior art is an unverified third-party market claim and must not enter public submission materials without a primary source.
- Live deployment separately requires provider eligibility, legal assessment, merchant enrollment and operational checks. No-custody alone does not establish a legal exemption.

## Notes for a fresh session

- Gate 1 was reopened on 2026-10-07 to add buyer-side scan, then explicitly approved by the user: "I approve gate 1." The scope change is recorded in `01-product.md` and mirrored in `handoff.md` and `roadmap.md`. The user then requested Gate 2, reported unavailable Supabase free databases and answered "Free services only" to the hosting constraint. Gate 2 was separately approved on 2026-10-07. The current request authorizes recording approval, committing only architecture planning and its existing mirrors/handoff, fast-forwarding into `main`, pushing `main` and verifying the remote commit, then stopping. It does not authorize Gate 3.
- Preserve `../PAYPAL_PLAN.md` as the original brief. Its conflicting claims are superseded by `01-product.md` and explicitly corrected in `research.md`, not treated as demonstrated evidence.
- Original SHA256 before and after consolidation: `A99321F0563ACC545F34BE664F71EC25E14836C2A9B94B27EDDBA3A891F3152F`. On 2026-10-07 a three-line supersession banner was added at the top of `PAYPAL_PLAN.md` and nothing below it changed; SHA256 after the banner is `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1`. The pre-banner bytes remain in git at the Initial commit, so the audit trail is intact in both forms.
- Applicable ancestor instructions were read. The requested RTK command wrapper remains unavailable on PATH on 2026-10-07; ordinary PowerShell commands were used.
- This workspace is a Git repository with origin `https://github.com/jaydonnnk/envoi.git`, and contains planning artifacts only. Gate 2 work started from a clean `main` on branch `codex/gate-2-architecture`. Retain that branch after the authorized `git merge --ff-only`; stop if fast-forward integration is impossible. Git publication means pushing planning commits only, with no repository visibility change or deployment. All current mockup sources are plain `.html`; no `.tsx` visualization was created.
- `02-architecture.md` is the approved architecture proposal: one Next.js/TypeScript app on Render Free, Neon Free PostgreSQL, Better Auth in the app and finite hourly GitHub Actions maintenance; no Supabase, paid Render worker/disk or continuous queue poller. A direct PayPal Orders v2 sandbox adapter and Zapier draft-only menu import retain their proposed authority boundaries. `stack-recommendation.md` mirrors it. No Gate 3/4 document, provisioning or application implementation exists; no runtime/account proof or review-fix evidence is established by approval.
- Actual sandbox/devnet execution is test evidence, not live money. Toolkit capture does not authorize the buyer; external approval is required. Never require unattended buyer approval as a kill condition.
- All decisions needed for review are saved here. `handoff.md` describes the approval boundary. Do not reopen consolidation merely because a fresh session starts; first read the user's next instruction and the first unapproved gate.
- Submission cutoff: 2026-11-13 04:00 SGT; see the checked official rules in `research.md`. Account/service availability must cover judging.

## Verification of planning artifacts

Fresh consolidation checks, 2026-10-06. **2026-10-07 re-check after the scan amendment:** `buyer.html` and `index.html` were re-verified in a browser — no duplicate element IDs, no orphaned label targets, one primary heading each, no external scripts or network calls; no horizontal overflow at 390px (mobile breakpoint) or 1280px; the new scan card presents an enrolled result and a not-enrolled result, both labeled fixtures, plus the rule that a scan identifies a shop only. The checks below still apply unchanged to the four pages that were not amended.

- **2026-10-07 Gate 1 approval check (historical):** all six HTML pages passed static checks for local links, unique IDs, label targets and one main/primary heading; all three inline scripts passed Node syntax checks. `index.html` and `buyer.html` passed browser checks at 390px and 1280px after the approval wording update. Approval and test-environment metric mirrors agreed; Gates 2-4 were pending at that check. Both brief hashes were recomputed and its preserved body compared byte-for-byte with the Initial commit. These are planning-artifact checks, not integration or usability evidence.
- Six HTML pages: local navigation targets, one main/primary heading, unique IDs, label targets and explicit no-payment notices checked. Three inline scripts passed Node syntax checks. No external scripts or extraction/payment network calls are present.
- Browser verified unreadable prices stay blank; failed/malformed/processing fixtures cannot be confirmed; manual entry is available; availability is supplied by the merchant; removing an unreadable item allows review of the remainder.
- Browser verified shop/menu edits invalidate their respective local confirmation, adding an incomplete item invalidates menu confirmation, and publication stays disabled because authorization/destinations remain unverified.
- Review handoff remains mockup-only. Receipt previews for pending, confirmed, uncertain, canceled and failed keep an explicit lack of execution evidence and separate acknowledgment.
- All six pages checked at 390px and 1280px widths: no horizontal overflow observed. Onboarding desktop and mobile menu layout visually inspected. This is not a full accessibility audit or usability result.
- Existing `mockups/review-preview.jpg` predates consolidation and is historical only; use current HTML for review. No new screenshot file was created.
- Loopback-only preview: `http://127.0.0.1:8793/index.html`. The temporary Python static server may need restarting in a later session. This serves planning HTML, not an application deployment.
- The original brief's body remains byte-identical to the Initial commit; only the dated supersession banner changes the whole-file hash recorded above. No application builds, provider transactions, real image imports or user tests were run.

## Stop point

Gate 2 approval is recorded. Complete the authorized planning commit, fast-forward integration into `main`, push to `origin` and remote verification with `git ls-remote`, then STOP. Retain `codex/gate-2-architecture`. Gate 3 requires a separate user decision; do not draft it or begin application work. Approval accepts the proposal and leaves the preceding review's findings unresolved.

## Approved Gate 2 proposal and limits

- Free hosting only: Render Free app, Neon Free PostgreSQL, in-app Better Auth and finite hourly GitHub Actions maintenance. Durable purchase/import state is in the database; scheduling is best effort. Verify private Actions quota/zero-spend controls. The separate Git request authorizes planning commits only, with no visibility change, workflow creation or deployment. No paid worker, Supabase or Redis. MCP and HTTP share rules.
- Better Auth anonymous buyer sessions; non-anonymous merchant login plus operator-approved membership. Sessions survive app sleep/redeploy. No public merchant signup or email/reset service assumed; private records are never public registry data.
- Direct Orders v2 runtime adapter: distinct authorized sandbox seller/payee, human PayPal approval, immutable server-priced purchase, persisted create/capture operation keys and reconciliation before replacement payment.
- Separate menu image: capped private database bytes behind an Envoi proxy, proposed 5-minute processing/access deadline; completion/failure/cancel deletes the source row atomically. Idle/crash cleanup is best effort hourly, with no five-minute deletion or physical-erasure guarantee. Upload/output limits, provider history and consent remain untested. Preview stays local.
- Render sleep/cold starts and Neon/GitHub quotas may break availability; include an idle first visit in the three-minute metric. Free hosting does not establish free AI/Zapier access. No paid fallback or assumed sponsor credits.
- Scan is identity lookup only; shared identifiers require outlet clarification. AI suggests registered items and cannot publish, capture or sign.
- PYUSD stays disabled; mint, wallet, conversion and recovery choices require proof and a Gate 2 amendment before dependent wallet contracts/slices. APIMatic context is development tooling; own-API generation remains account-conditional.

### Gate 2 preparation checklist

- [x] Read applicable instructions, original brief, every existing gate-folder document and relevant mockup behavior; verify Gate 1 approval and clean starting worktree.
- [x] Recheck primary architecture/provider documentation; label public capabilities separately from account access/runtime evidence.
- [x] Save architecture alternatives, component ownership, routes, data/query outlines, flows, external configuration names and falsifiers.
- [x] Mirror the approved proposal, current request and gate state in the product status text, architecture, handoff, roadmap, stack and research.
- [x] Complete fresh documentary consistency/link/diff checks and record results.
- [x] Explicit user approval of Gate 2, 2026-10-07. Architecture proposal only; runtime/account proof and the preceding review findings remain unresolved.

### Unresolved review findings

**[verified] Carry-forward record:** the user requires the preceding review's findings to remain open. This approval update records them without resolving or independently validating them. A separately authorized Gate 3 must cross-check the approved architecture and review conclusions, then resolve or explicitly disposition:

- Free-capacity budgets, bounded polling, complete Actions job overhead, shared quotas and zero-spend controls.
- Cleanup/recovery when database storage exhaustion blocks DELETE.
- Logical checkout identity across duplicate requests and replacement reviews.
- Image capability access versus merchant-session/membership requirements.
- Anonymous deletion/linking, durable receipt ownership and payment-record retention.
- Maintenance's code-level versus credential-enforced PayPal authority.
- Unsupported prior-art/SGQR claims.
- Inconsistent timing definitions.

Actual account access and integration proofs belong to later authorized slices. PYUSD remains disabled. A correction changing an approved architecture decision must reopen Gate 2 for approval before dependent work. See `handoff.md` for the inactive Gate 3 preparation instructions.

### Approval history

- 2026-10-07: user explicitly approved reopened Gate 1 ("I approve gate 1"). Product/journeys only, including text and scan/paste; no architecture, implementation or external-service authorization.
- 2026-10-07: user requested beginning Gate 2. At that point architecture preparation was authorized; Gate 2 approval had not been given.
- 2026-10-07: user reported Supabase free-database quota unavailable and explicitly required "Free services only" for hosting. Revised the then-unapproved Gate 2 topology and mirrors. Clarified the provisional Render integration label to application hosting; product behavior and Gate 1 approval were unchanged. That request did not authorize provisioning, paid services or Git publication.
- 2026-10-07: user explicitly approved Gate 2 and separately authorized the architecture planning commit, fast-forward integration into `main`, push of `main` and remote verification, retaining the architecture branch. Approval accepts the proposal, not runtime/account proof, and does not establish that the preceding review's findings were fixed. STOP after Git verification; Gate 3 is not authorized. No implementation, provisioning, installations, deployment or repository visibility change is authorized.

### Initial Gate 2 documentary verification, 2026-10-07 (historical, before free-hosting revision)

- A one-off Python check inspected all seven gate-folder Markdown documents and three local Markdown links/anchors: targets/anchors exist, required architecture sections exist, gate state and mirrors agree, and Gates 3/4 remain pending with no documents created.
- Compared `01-product.md` below its status paragraph with `git show HEAD:docs/plans/envoi/01-product.md`: approved product content unchanged. Recomputed the original brief's recorded SHA256: unchanged.
- `git diff --check` and the new untracked architecture file's whitespace check passed. Final diff inspection found only architecture preparation and its six existing documentary mirrors; no mockup, application, dependency, credential, deployment or transaction work occurred.
- At that check the branch was `codex/gate-2-architecture` and changes were uncommitted. These checks establish documentary consistency only, not working integrations or earned usability results.

### Free-hosting revision verification, 2026-10-07 (historical, before Gate 2 approval)

- Fresh Python documentary checks passed: seven Markdown documents, three local links/anchors, required architecture sections, current free-hosting mirrors and gate states. Historical research remains explicitly superseded. The first checker incorrectly scanned a historical five-minute deletion target as current; its scope was corrected to the marked current research section and the complete documentary check passed.
- `01-product.md` differs from `HEAD` only in the Gate 2 status paragraph and the provisional Render hosting label. Product behavior is unchanged. `mockups/index.html` differs only in that same hosting label; the other five mockups are unchanged. Static checks passed across all six HTML pages for local links, IDs/labels, one main/primary heading and no external scripts. No new browser-layout or integration claim is made.
- At that check the original brief's SHA256 remained `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1`. No Gate 3/4 or application files existed. The branch was `codex/gate-2-architecture` and changes were uncommitted.
- Whitespace/diff checks cover the tracked mirrors and the new untracked architecture file. This is documentary verification only. Free account access, quotas/zero-spend controls, scheduled maintenance, idle cold starts, real image handling, model/Zapier entitlements and payments remain untested. No service, workflow, package, credential or transaction was created.

### Gate 2 approval documentary verification, 2026-10-07

- Fresh one-off Python documentary checks passed for all seven Markdown documents, six local links/anchors, approval checklist/history and eight unresolved review items. Gates 3-4 remain pending and their documents are absent. An injected stale gate state was rejected by the gate-state check.
- Compared the architecture proposal body with the untracked draft at this request's start: only Git-authorization wording changed inside that body. Architecture decisions and unresolved contradictions were not repaired by this approval update. No new primary-source, runtime/account or usability proof is claimed.
- `git diff --check` passed; the untracked `02-architecture.md` was read fully and its whitespace checked separately. The commit scope is seven gate-folder Markdown files plus the existing `mockups/index.html` hosting-label mirror. No application, workflow, dependency, credential, provisioning or deployment file was added.
- Original brief SHA256 remains `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1`; `AGENTS.md` and all mockup/image bytes are unchanged from the start of this request. The existing index-label edit belongs to the preceding architecture preparation. Documentary checks do not resolve the preceding review findings.
