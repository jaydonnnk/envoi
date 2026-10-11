# Status: Envoi

Updated: 2026-10-10 (Asia/Singapore).

- Gate 1 - Product: **RE-APPROVED 2026-10-10** by the user ("I approve gate one") after being reopened and revised the same day to remove Zapier, which the user rejected as paid, and to record the PYUSD decisions; see the [reopening record](#reopening-2026-10-10-zapier-removed). Previously **APPROVED 2026-10-07** by the user after reopening it to add a buyer-side scan entry point. Approval covers product scope and buyer/merchant journeys, including text and scan/paste entry points.
- Gate 2 - Architecture: **REOPENED 2026-10-10, in progress; revised proposal awaiting re-approval** in `02-architecture.md`, only for direct vision import and PYUSD. OpenAI/provider pin and all unaffected 2026-10-07 decisions stand. No runtime/account proof or new Git authority is established.
- Gate 3 - Program Design: **REOPENED 2026-10-10, in progress; revision waits for Gate 2 re-approval** only for affected import and PYUSD contracts/tests. `03-program-design.md` is unchanged in this Gate 2 revision; its 2026-10-07 approval and eight finding dispositions still govern unaffected decisions. The OpenAI provider pin does not change, and the completed R11 action/R12 region decision are not reopened.
- Gate 4 - Slice plan: **in progress, unapproved draft.** [`04-slices.md`](04-slices.md) stays unchanged until Gates 2 and 3 are re-approved. No slice is authorized or started. Required later changes: merge S11/S12, remove Zapier checks, move S13 immediately after S4, add PYUSD after S13 and first in the cut order; scan and account-conditional S14 follow it.

### Reopening 2026-10-10: Zapier removed

- **Zapier is removed.** The user reopened Gates 1-3 on 2026-10-10; Gate 1 was then revised and re-approved that day.
- **Unaffected decisions stand.** Only direct vision import and PYUSD-dependent decisions change; do not redo hosting, auth, PayPal recovery, scan, MCP, R11 or R12.
- **Replacement selected:** direct OpenAI vision inside the upload request, no stored image bytes or image URL. Remove source rows, image/result capabilities, old image clocks/tasks and import heartbeat dependency when the relevant gate is revised. Keep a proposed bytes-free audit/admission attempt.
- **AI-provider question resolved:** OpenAI stays because the user has credits. No provider or `@ai-sdk/openai` pin change; account balance/access/sharing and authorized evaluation spend remain unknown.
- **Cut order corrected by the later PYUSD decision:** PYUSD first, scan next, account-conditional S14 after scan. The unchanged Gate 4 draft still carries its older order and must not be treated as current authority.
- **PYUSD included:** merchant-set rate, 30-day re-confirmation and upward atomic rounding are re-approved Gate 1 decisions. This Gate 2 amendment pins devnet identity, wallet boundaries, destination/rate data and recovery; tests/slices wait for the later gates.
- **Handoff.** The user asked for a copy-paste prompt so another agent can continue. All of this work is uncommitted on `envoi/gate-4-slice-plan` in the macOS checkout and exists nowhere else.
- **[verified]** The sponsor-rule facts behind these decisions are in [`research.md`](research.md#sponsor-rules-re-check-2026-10-10).
- **Questions 1-4 answered 2026-10-10.** The AI-provider and PYUSD evidence presented with them is in [`research.md`](research.md#ai-provider-and-pyusd-re-check-2026-10-10). The answers:
  1. **AI provider: OpenAI stays.** The user said "We can use openai i have quite a bit of credits". The approved Gate 2 provider and the Gate 3 `@ai-sdk/openai` pin do not change.
  2. **Zapier replacement: direct vision call.** The menu photo goes to the model inside the upload request; Envoi stores no image bytes and exposes no image URL. S11 and S12 merge.
  3. **PYUSD: include, cut first.** A Gate 2 amendment pins the verified devnet mint, the buyer wallet, a merchant-set SGD rate and the public devnet RPC; Gate 3 adds wallet contracts; Gate 4 adds two slices after S13, first in the cut order.
  4. **S13 moves to right after S4.**
- **Gate 1 revised and re-approved 2026-10-10.** `01-product.md` replaces Zapier with model drafting while the merchant waits, records PYUSD as built after PayPal and cut first, and adds the merchant-set PYUSD rate with a 30-day re-confirmation. `mockups/index.html`, `mockups/merchant-onboarding.html` and `mockups/review.html` carry the same changes.

## Slices

Draft build order from `04-slices.md`, pending Gate 4 approval.
No slice is authorized or started, and each one starts only on an explicit "start Slice N".
No application, payment integration or sponsor integration exists.
The candidate list in `roadmap.md` remains discussion material and is superseded as a build order by `04-slices.md` once that is approved.

- [ ] S1 - Tracer bullet on Render Free: labeled demo shop from Neon to an explicitly unpaid stub receipt; boot check, auth schema pin, R12 latency measurement.
- [ ] S2 - PayPal sandbox happy path with recipient and amount binding and lease-serialized capture.
- [ ] S3 - PayPal recovery: lost responses, webhooks, reconcile, "checking payment".
- [ ] S4 - Text entry with AI suggestions and the pre-registered model evaluation.
- [ ] S5 - Maintenance runner, manual runs, operator health view.
- [ ] S6 - Merchant sign-in and manual menu draft.
- [ ] S7 - Merchant destination and publication, with stale-review invalidation.
- [ ] S8 - Merchant orders and separate acknowledgment.
- [ ] S9 - Merchant SGQR decode and identifier mapping.
- [ ] S10 - Buyer scan or paste.
- [ ] S11 - Menu image intake and capability boundary. **Superseded 2026-10-10** by the Zapier removal; to be redefined after the reopened gates.
- [ ] S12 - Zapier AI menu draft. **Superseded 2026-10-10**; Zapier is removed.
- [ ] S13 - Agent handoff over MCP.
- [ ] S14 - APIMatic client and docs, account-conditional; second in the cut order since 2026-10-10.
- [ ] S15 - Judged release.

## Gate 3 cross-check results, 2026-10-07

Primary sources were re-read independently before drafting, as `handoff.md` required. Four results correct a Gate 2 assumption; details and citations are in [`research.md`](research.md#gate-3-cross-check-2026-10-07).

- **[verified]** Neon Free fails inserts, updates **and deletes** at the 1 GB storage limit, and its 6-hour history window retains written bytes after a logical delete. Gate 2's transactional delete-on-close is therefore not a reliable capacity control. Access denial must be a read-only computation and capacity must be bounded at admission.
- **[verified]** Better Auth's anonymous plugin deletes the anonymous user by default when an account is linked. Gate 2's session-survival claim was true but incomplete; without `disableDeleteAnonymousUser: true` a link event would orphan every buyer receipt.
- **[verified]** PayPal documents no fixed idempotency window and warns that simultaneous identical keys may fail the second request. Gate 2's "documented per-operation idempotency window" is corrected: same-key replay is the recovery, and capture must be serialized behind a lease.
- **[verified]** GitHub Free includes 2,000 Actions minutes monthly, public standard runners are free, and usage is blocked once the quota is exhausted when no payment method is on file. The zero-spend control is structural, not assumed.
- **[unknown]** PayPal Orders v2 scope granularity could not be verified from a reachable primary source, so maintenance's read-only boundary stays code-level and build-graph-enforced rather than credential-enforced. This is residual risk R3.

## Provisioned state and a blocking discrepancy, 2026-10-07

The claim in these documents that nothing was provisioned is now **stale**. A concurrent session, at the user's direction and while Gate 3 preparation ran, provisioned Neon and left its files untracked in this shared worktree. Details are in [`03-program-design.md`](03-program-design.md#provisioned-state-discovered-during-this-gate). No secret value was read into any planning document, and `git status` confirms `.env.local` and `.neon` are matched by `.gitignore` and are not staged. **Update:** the user then instructed that the remaining working tree be committed, so `.gitignore`, `neon.ts`, `package.json` and `package-lock.json` are now tracked in commit `f8caf7d`. `.env.local`, `.neon` and `node_modules/` remain ignored and are in no commit.

- **[verified]** Neon project `holy-boat-19447545` (Envoi), org `org-wispy-flower-08821549`, branch `production` (`br-fancy-sea-b4xb78sw`), region **`aws-us-east-2`**. `neon deploy` applied cleanly; Postgres and Neon Auth were already enabled on the branch. Render is **not** provisioned.
- **[verified]** `neon.ts` declared `auth: true`, which is Neon Managed Better Auth. Approved Gate 2 states Better Auth is *"a library in our app, not another hosted service"*. **Resolved by user decision on 2026-10-07: in-app Better Auth stands (Option A), and Gate 2 is not reopened.**
- **[verified] R11 hazard disproven by inspection, 2026-10-07.** The user authorized a read-only schema inspection before any service was disabled. A read-only session (`default_transaction_read_only=on`, confirmed by `transaction_read_only = on`) listed the branch's schemas, tables and roles. **Every Neon Auth table lives in a dedicated `neon_auth` schema**, and the `public` schema contains **zero** tables. Nine tables exist, all in `neon_auth`: `account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`. Non-system roles are `cloud_admin`, `neon_auth`, `neon_service`, `neon_superuser`, `neondb_owner`. **Consequence: there is no table-name collision with the in-app Better Auth tables this design puts in `public`**, so the hazard that motivated disabling the service does not exist. R11 is downgraded from a blocking contradiction to a cosmetic and containment matter, and **option 2 applies: nothing is disabled.**
- **[verified] The `auth` policy field does not control the branch service.** `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, while `neon neon-auth status` shows the Auth service still enabled (`better_auth`, branch `production`, created `2026-10-07T11:59:53Z`). The field's actual meaning is **[unknown]**; what is established is that it is not the on/off switch for the branch-level service.
- **Containment rules that follow.** Nobody may build against `neon_auth`; it is an unused parallel auth system on the same database. Better Auth's Drizzle adapter must be pinned explicitly to the `public` schema so no unqualified `user`/`session`/`account`/`verification` name can resolve into `neon_auth` through a search path. The inspection does not establish whether the enabled service costs anything on the Free plan.
- **[verified]** Region `aws-us-east-2` resolves Gate 2's "Singapore co-location is unverified" as *not* Singapore. **Accepted by the user on 2026-10-07, conditional on measurement.** Trans-Pacific round trips land inside the approved three-minute buyer metric on top of the Render cold start, so a named Slice 1 test measures a real Singapore cold first visit and relocation is revisited only if that metric fails because of region latency. Recreating the project remains a provisioning action that this gate does not authorize.
- **[verified]** Installed packages are `@neon/config` 1.8.4 and `@neon/env` 1.5.1 only, with `package-lock.json` and `node_modules/`. No application, framework or test dependency is installed. The Gate 2 "Fit" statement that no application manifests exist is superseded by this fact.
- The Gate 3 version pins are additive to that `package.json`. The provisioning files were created by the concurrent session; Gate 3 preparation did not stage, move or edit them, and the later user instruction committed them unchanged apart from the already-authorized `neon.ts` edit, in commit `f8caf7d`.

## Approved Gate 1 decisions

- Visitors who already have PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, authorization, menu and connected accepted destinations.
- PayPal first; PYUSD only after independent feasibility proof. **Revised and re-approved 2026-10-10:** PYUSD is in the hackathon plan, built after PayPal and cut first, and the merchant sets the PYUSD rate it accepts (shown with its date, re-confirmed every 30 days, rounded up to the smallest unit). One order uses one rail. Changed items, amount, recipient, currency or rail require fresh approval. No custody or buyer private keys; PYUSD does not imply SGD settlement.
- Both SGQR and a separate menu image are in proposed onboarding. SGQR supplies supported identifiers actually present, no menu and no ownership proof. ~~AI by Zapier drafts names/SGD prices~~ **Revised and re-approved 2026-10-10:** an AI model drafts names/SGD prices while the merchant waits, and Envoi does not keep the photo once the draft returns. Merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry is the fallback. Unknown prices stay blank.
- **Added 2026-10-07:** buyers have two entry points. Either a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only. It is not payment authority, not a payment destination, and it cannot enroll a shop; an unenrolled sticker yields no purchase. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it.
- APIMatic PayPal Context Plugin and account-supported clients/documentation, Render application hosting, and Zapier menu import are proposed integrations. **Revised and re-approved 2026-10-10:** Zapier is removed because it is paid; sponsor tools are optional and there is no Zapier prize. Recovery hosting is a Gate 2 choice; the earlier Render-worker wording was provisional, not a requirement for a paid service. AG Grid stays optional. This supersedes manual-only menus and optional Zapier.
- Pending/uncertain payments are never paid; reconcile before retrying or changing rails. Merchant acknowledgment is separate from payment confirmation.
- Proposed target: 4 of 5 first-time buyers complete an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with the external payment record matching the approved purchase. Record each tester's entry point, text or scan. Untested.

## Evidence boundary and unresolved blockers

- **[verified]** Source findings and newly re-read documentation are in [`research.md`](research.md#gate-2-source-supplement-2026-10-10). Zapier workflow/trial access is no longer a dependency; actual hosting, OpenAI credits/model access, APIMatic tiers and prize eligibility remain **[unknown]**.
- Free hosting only stands: Render Free web, existing Neon Free project and in-app Better Auth plus finite quota-gated maintenance. Remaining Neon storage/compute/transfer and actual hosting/Actions access through judging remain unknown; Render is not provisioned. R11's flag change, redeploy and read-only inspection are complete: `neon.ts` is `auth: false`, the managed service remains enabled but unused/isolated, and the in-app adapter must pin `public` and never query `neon_auth`. R12 accepts `aws-us-east-2` subject to the Slice 1 measurement; neither decision is reopened.
- **[hypothesis]** The revised import uses request memory only, 90-second total/60-second model budgets, explicit `store: false`, a bytes-free attempt and no import maintenance dependency. No image URL, source row or capability remains in the Gate 2 proposal; stale Gate 3/4 source contracts are explicitly superseded pending their revisions.
- **[unknown]** OpenAI data-sharing setting/foreground retention, Chinese-text accuracy, selected vision model through 16 Dec, Render latency and `sharp` RAM on 512 MB. Real photos remain gated on consent/account confirmation and actual no-disk/no-log/no-database-image probes.
- **[verified, prior-session observation]** Read-only devnet mint/genesis/extension findings are attributed in research, not repeated in this run. **[unknown]** Phantom mint display, devnet chain honoring, message/blockhash mutation, phone/session path, user faucet access and shared-IP/history completeness. No wallet, faucet or payment was used.
- No authentic menu extraction, payment, merchant ownership trial, buyer-side scan or user test has been demonstrated.
- Prior-art review of shipped SGQR payment products, 2026-10-07 (`research.md`), supports three decisions: the sticker is an identity key and not a payment route on either rail; shipped products require ownership documents plus human review rather than auto-publishing from a photo; and the stablecoin-to-SGD off-ramp remains unsolved non-custodially, which reinforces the separate merchant-economics test. A "99% of payers use PayNow" figure appearing in prior art is an unverified third-party market claim and must not enter public submission materials without a primary source.
- Live deployment separately requires provider eligibility, legal assessment, merchant enrollment and operational checks. No-custody alone does not establish a legal exemption.

## Notes for a fresh session

- **Current request, Gate 2-only revision, 2026-10-10:** the user authorized architecture and five mirrors on the existing dirty branch, with backup first and no AGENTS.md/product/mockup/Gate 3/Gate 4 edits. Those edits are saved; next is Gate 2 re-approval, not renewed Gate 1 work or later-gate drafting. No commit/push or external action is authorized; earlier current-request paragraphs below are historical run context.
- **Current request, 2026-10-10:** the user said "U can start the gate 4 planning for envoi". That authorized Gate 4 preparation and drafting `04-slices.md` on branch `envoi/gate-4-slice-plan`, created from `main` at `dc1e23c`, following the Gate 3 precedent. It did **not** authorize Gate 4 approval, a commit, a push, starting any slice, package or tool installation, provisioning, workflow creation, deployment or a repository visibility change.
- **[verified] Workspace moved, 2026-10-10.** The repository is now checked out on macOS (arm64) at `/Users/jayd0/Desktop/envoi`; the Windows path below is historical. Only `git` is installed: Node.js, npm, PostgreSQL, Docker, Homebrew, the GitHub CLI and the Neon CLI are absent. The ignored `.env.local`, `.neon` and `node_modules/` did not travel with the clone, so no database credential exists on this machine. The checkout uses LF line endings and the brief hashes directly to the recorded `6058798E...F3B220A1`. The GitHub repository is private: the unauthenticated GitHub API returns 404 while authenticated `git ls-remote` succeeds.
- The software-factory skill on this machine is `/Users/jayd0/.claude/skills/software-factory/SKILL.md`; the `C:/Users/jayd0/.agents/...` paths in `AGENTS.md` are the Windows locations.

- Gate 1 was reopened on 2026-10-07 to add buyer-side scan, then explicitly approved by the user: "I approve gate 1." The scope change is recorded in `01-product.md` and mirrored in `handoff.md` and `roadmap.md`. The user then requested Gate 2, reported unavailable Supabase free databases and answered "Free services only" to the hosting constraint. Gate 2 was separately approved on 2026-10-07, and its authorized commit, fast-forward, push and remote verification are complete: `main` is at `69ad8a5` and `git ls-remote` confirmed the same SHA on `origin/main`.
- **Current request, 2026-10-07:** the user approved Gate 3 and said "commit and push to main". That authorized recording Gate 3 approval, committing the Gate 3 planning documents and their mirrors, fast-forwarding `main`, pushing and verifying the remote commit with `git ls-remote`. **Completed:** commit `ac13444` on `codex/gate-3-program-design`, fast-forwarded into `main` from `69ad8a5`, pushed to `origin`, and verified with `git ls-remote` returning the identical SHA `ac13444656396abb4215f7fb5c900060c7d6087d`. It did **not** authorize Gate 4, implementation, package installation, provisioning, the R11 follow-up action, workflow creation, deployment or a repository visibility change.
- `codex/gate-2-architecture` no longer exists in this clone; only `main` and `remotes/origin/main` are present. Its work is integrated at `69ad8a5`. Nothing was lost, and no branch was deleted by this request.
- `handoff.md` recorded a stale workspace path (`OneDrive - Temasek Polytechnic\Documents 1\Envoi`). The repository is at `C:\Users\jayd0\OneDrive\Desktop\envoi`; the path is corrected in this request. No other decision changed.
- Preserve `../PAYPAL_PLAN.md` as the original brief. Its conflicting claims are superseded by `01-product.md` and explicitly corrected in `research.md`, not treated as demonstrated evidence.
- Original SHA256 before and after consolidation: `A99321F0563ACC545F34BE664F71EC25E14836C2A9B94B27EDDBA3A891F3152F`. On 2026-10-07 a three-line supersession banner was added at the top of `PAYPAL_PLAN.md` and nothing below it changed; SHA256 after the banner is `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1`. The pre-banner bytes remain in git at the Initial commit, so the audit trail is intact in both forms.
- Applicable ancestor instructions were read. The requested RTK command wrapper remains unavailable on PATH on 2026-10-07; ordinary PowerShell commands were used.
- This workspace is a Git repository with origin `https://github.com/jaydonnnk/envoi.git`, and contains planning artifacts only. Gate 2 work ran on `codex/gate-2-architecture`, was fast-forwarded into `main` as `69ad8a5`, pushed and verified with `git ls-remote`; that branch is no longer present in this clone. Gate 3 preparation runs on `codex/gate-3-program-design` from the same `main` tip. Git publication means pushing planning commits only, with no repository visibility change or deployment. All current mockup sources are plain `.html`; no `.tsx` visualization was created.
- `02-architecture.md` is the revised Gate 2 proposal awaiting re-approval for direct OpenAI vision and PYUSD only. Its unchanged core is Render Free, Neon Free, in-app Better Auth, GitHub Actions maintenance, direct PayPal Orders v2, identity-only scan and MCP handoff. `stack-recommendation.md` mirrors the amendment; Gate 3 and Gate 4 files are unchanged and their affected import/wallet content is not current implementation authority. No application or runtime/account proof exists.
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

**Historical Git record, 2026-10-07:** the Gate 3 planning authorization completed at `ac13444`, fast-forwarded/pushed to `main` and verified remotely.
It supplies no commit/push authority for this uncommitted revision on `envoi/gate-4-slice-plan`.

**STOP here: the Gate 2 amendment is revised and awaiting approval.**
Gate 1 is already re-approved; ask exactly `Approve Gate 2, or what should change?` and wait.
Only after that approval revise affected Gate 3 contracts, then obtain Gate 3 re-approval before revising Gate 4.
No slice starts without its explicit authorization and Gate 4 approval.
Do not install, provision, use a wallet/faucet, spend, create workflows, deploy, change visibility, stage, commit or push.
The tracked provisioning files remain untouched; ignored credentials/config/generated artifacts must never be staged.

**The one authorized exception:** the user authorized the R11 follow-up on 2026-10-07, scoped to changing `neon.ts` from `auth: true` to `auth: false`, redeploying that configuration, and then a read-only schema inspection. **All three are complete.** The file is `auth: false` with a short explaining comment. `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, and `Utilized services: Postgres`. The inspection (`default_transaction_read_only=on`, verified in-session) found every Neon Auth table in its own `neon_auth` schema with `public` empty, which **disproves the collision hazard**. Managed auth stays enabled but inert; nothing was disabled. `neon neon-auth disable` was **not** run and is not authorized. `neon.ts` was later committed unchanged, at `auth: false`, in commit `f8caf7d`, so the working tree and the committed record now agree.

## Approved Gate 2 proposal and limits

The core below remains approved from 2026-10-07; the two amendment bullets are **proposed, awaiting re-approval**, not new approval records.

- Free hosting only: Render Free app, Neon Free PostgreSQL, in-app Better Auth and finite GitHub Actions maintenance. Durable payment state is in the database; scheduling remains best effort with the Gate 3 quota-gated cadence. No paid worker, Supabase or Redis; MCP/HTTP share rules. Existing Git authorizations do not apply to this revision.
- Better Auth anonymous buyer sessions; non-anonymous merchant login plus operator-approved membership. Sessions survive app sleep/redeploy. No public merchant signup or email/reset service assumed; private records are never public registry data.
- Direct Orders v2 runtime adapter: distinct authorized sandbox seller/payee, human PayPal approval, immutable server-priced purchase, persisted create/capture operation keys and reconciliation before replacement payment.
- **Import amendment proposal:** synchronous route-handler vision, request memory only, versioned OpenAI consent and explicit `store: false`; bytes-free attempt, 90-second request/60-second model budgets, one global in-flight, 10/outlet and 50/global daily attempts plus recorded spend ceiling. Keep strict 100-row/120-character/128-KiB draft bounds, edits/base revisions and manual fallback. Drop old image routes/rows/principals/clocks/tasks and status/cancel routes; reload the authenticated draft for lost-response recovery. Proposed `AI_MENU_MODEL` adds separate vision evaluation without provider/pin change.
- Render sleep/cold starts and Neon/GitHub quotas may break availability; include an idle first visit in the three-minute metric. OpenAI credits are user-reported, not account-verified; no paid hosting fallback or assumed sponsor credits.
- Scan is identity lookup only; shared identifiers require outlet clarification. AI suggests registered items and cannot publish, capture or sign.
- **PYUSD amendment proposal:** reviewed devnet genesis/mint/Token-2022/decimals constants, only RPC/enable configuration, verified pre-existing merchant ATA and SIWS/Ed25519 challenge, dated integer merchant rate and ceil rounding. Persist/lock an exact transaction with mandatory reference before Wallet Standard sign-and-send; verify finalized message, transfer, zero fee and per-transaction balance delta. Release an unknown attempt only after saved-height expiry plus complete attributable history, with proven wallet blockhash preservation; incomplete history stays uncertain. Phone fresh-review handoff is a candidate, not resolved authority. PayPal remains isolated and PYUSD remains disabled until proofs pass.
- APIMatic context remains development tooling; own-API generation remains account-conditional. R11 containment and R12 conditional region acceptance stand; no application, wallet/faucet, spend, install, provisioning, workflow, deployment, visibility, commit or push is authorized.

### Gate 2 preparation checklist, 2026-10-07 (historical)

- [x] Read applicable instructions, original brief, every existing gate-folder document and relevant mockup behavior; verify Gate 1 approval and clean starting worktree.
- [x] Recheck primary architecture/provider documentation; label public capabilities separately from account access/runtime evidence.
- [x] Save architecture alternatives, component ownership, routes, data/query outlines, flows, external configuration names and falsifiers.
- [x] Mirror the approved proposal, current request and gate state in the product status text, architecture, handoff, roadmap, stack and research.
- [x] Complete fresh documentary consistency/link/diff checks and record results.
- [x] Explicit user approval of Gate 2, 2026-10-07. Architecture proposal only; runtime/account proof and the preceding review findings remain unresolved.

### Gate 2 amendment checklist, 2026-10-10

- [x] Read all required context and back up AGENTS.md/docs before editing; preserve the existing dirty checkout.
- [x] Revise only direct-vision/PYUSD architecture and the five named mirrors; Gate 1, mockups, Gate 3 and Gate 4 are protected.
- [x] Record supplied source findings with links/provenance and re-read newly relied-on documentation; no wallet, faucet or fresh RPC transaction.
- [x] Fresh fail-capable documentary checks, protected-byte comparison and final diff inspection, recorded below.
- [ ] Explicit user re-approval of Gate 2: `Approve Gate 2, or what should change?`.

### Gate 3 preparation checklist

- [x] Verify the Gate 2 approval record, confirm a clean `main` matching `origin/main`, and create `codex/gate-3-program-design`.
- [x] Read every document in the gate folder plus `AGENTS.md` and the software-factory skill; treat the previous agent's conclusions as claims to re-test, not facts.
- [x] Independently re-check the primary sources behind the eight unresolved findings; record **[verified]**, **[vendor claim]** and **[unknown]** results in `research.md`.
- [x] Resolve or explicitly disposition all eight findings, naming residual risks instead of smoothing them over.
- [x] Draft `03-program-design.md`: file map, types and signatures without bodies, call stacks, state transitions, authorization matrix, race contracts, capacity budgets, named failure tests with mutation proofs, version pins and least confident decisions.
- [x] Correct the stale workspace path in `handoff.md` and mirror the Gate 3 state in `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `01-product.md`.
- [x] Discover and record the concurrent Neon provisioning, verify no secret is staged, and flag the managed-auth contradiction as R11 without silently editing `neon.ts`.
- [x] Fresh documentary consistency, link and diff checks; record results below.
- [x] User decision on R11 (in-app versus managed auth) and R12 (database region). Decided 2026-10-07: **in-app Better Auth** (Option A, Gate 2 not reopened) and **accept `aws-us-east-2`** subject to a Slice 1 latency measurement.
- [x] Apply the R11 follow-up. **Authorized by the user on 2026-10-07** ("flip the auth flag now and run deploy"), executed. `neon.ts` is now `auth: false`, but `neon deploy` reported `No changes` and the field demonstrably does not control the branch-level Auth service. A read-only schema inspection then **disproved the collision hazard**: Neon Auth keeps all nine of its tables in a dedicated `neon_auth` schema and `public` is empty. Managed auth therefore remains enabled but inert and isolated, nothing needed disabling, and the containment rules (never build against `neon_auth`; pin Better Auth to `public`) are recorded above. `neon neon-auth disable` was **not** run and remains unauthorized.
- [x] Explicit user approval of Gate 3, 2026-10-07, with the commit and push to `main` separately authorized in the same instruction. Approval covers the program-design contracts only; R11's follow-up action, Gate 4, implementation, provisioning and deployment remain unauthorized.

### Gate 4 preparation checklist

- [x] Verify Gates 1-3 approval records, confirm a clean `main` matching `origin/main` at `dc1e23c` with `git ls-remote`, and create `envoi/gate-4-slice-plan`.
- [x] Read `AGENTS.md`, the software-factory skill and every document in the gate folder, including all 843 lines of `03-program-design.md`.
- [x] Record the macOS workspace facts: missing toolchain, absent ignored credentials, private repository, current Node LTS and LF line endings.
- [x] Draft `04-slices.md`: fifteen slices in build order with visible results, dependencies, Gate 3 test assignment, named additions with mutations, evidence, falsifiers and per-slice authorizations; Gate 3 deltas D1-D7; access checks; schedule, cut order and exclusions; least confident decisions.
- [x] Carry every Gate 3 handoff obligation into a named slice: the S1 boot check and R12 measurement, the `public` schema pin, the gated maintenance workflow, the S11 real-image exit decision with R2, binding and lease-serialized capture in S2, and one mutation per guard.
- [x] Mirror the Gate 4 draft state in `handoff.md`, `roadmap.md`, `01-product.md`, `stack-recommendation.md` and `research.md`.
- [x] Fresh documentary checks; results recorded below.
- [ ] Explicit user approval of Gate 4.

### Unresolved review findings

**[verified] Carry-forward record:** the user required the preceding review's findings to remain open through Gate 2, which recorded them without resolving or independently validating them. Gate 3 cross-checked the approved architecture and the review conclusions against primary sources and dispositioned every item in [`03-program-design.md`](03-program-design.md#disposition-of-the-eight-unresolved-review-findings). **Gate 3 approval on 2026-10-07 closes the eight findings as dispositioned. The residual risks they leave behind stay open and are named in the same table.** Where the disposition is a design contract, the contract is approved but not built or tested.

| Finding | Gate 3 disposition | Residual risk |
| --- | --- | --- |
| Free-capacity budgets, bounded polling, complete Actions job overhead, shared quotas and zero-spend controls | Resolved by the capacity-budget table: a monthly figure per shared quota, every-6-hours cadence until quota is confirmed or the repository is public, and a bounded polling contract | R8 polling versus the Render hour budget is unmeasured |
| Cleanup/recovery when database storage exhaustion blocks `DELETE` | Historical image controls are superseded by request-memory import in the proposed amendment; the original finding stays dispositioned | R2 narrows to generic database exhaustion, still blocking payment-state writes; no proven in-app recovery |
| Logical checkout identity across duplicate requests and replacement reviews | Resolved by `CheckoutKey`, a unique partial index and terminal-state-only replacement | none |
| Image capability access versus merchant-session/membership requirements | Historical two-principal resolution is superseded by removal of both capabilities; upload/draft reads remain membership-scoped | Image-bearing error/log retention must be tested instead |
| Anonymous deletion/linking, durable receipt ownership and payment-record retention | Resolved by `disableDeleteAnonymousUser: true`, `onLinkAccount` creating no membership, and a stated retention rule; **[verified]** the default would delete the receipt owner | none |
| Maintenance's code-level versus credential-enforced PayPal authority | Partly resolved: a `PayPalReadClient` type plus a build-graph test. Credential enforcement is **[unknown]** because Orders v2 scope strings were not reachable from a primary source | R3 the boundary is code-level, not a security boundary against a modified runner |
| Unsupported prior-art/SGQR claims | Resolved by relabeling in `research.md`: the agent-surface gap is now a **[hypothesis]** from a named one-repository bounded search, and the parser surfaces unrecognized tags instead of guessing | none |
| Inconsistent timing definitions | Original clocks remain approved for unaffected paths; Gate 3 must remove image clocks and add request/model/rate/wallet clocks from the amendment | R4 scheduled payment recovery stays best effort, not a deadline; no image sweep remains |

Actual account access and integration proofs belong to later authorized slices.
PYUSD is included in planning but disabled until independent proofs; this amendment is not re-approved yet.
R6 now includes decoder RAM/CPU; image-churn R7 is superseded by proposed admission/spend-sizing R7a.
All unaffected risk dispositions stand; Gate 3 revises affected contracts only after Gate 2 re-approval.

### Approval history

- 2026-10-07: user explicitly approved reopened Gate 1 ("I approve gate 1"). Product/journeys only, including text and scan/paste; no architecture, implementation or external-service authorization.
- 2026-10-07: user requested beginning Gate 2. At that point architecture preparation was authorized; Gate 2 approval had not been given.
- 2026-10-07: user reported Supabase free-database quota unavailable and explicitly required "Free services only" for hosting. Revised the then-unapproved Gate 2 topology and mirrors. Clarified the provisional Render integration label to application hosting; product behavior and Gate 1 approval were unchanged. That request did not authorize provisioning, paid services or Git publication.
- 2026-10-07: user explicitly approved Gate 2 and separately authorized the architecture planning commit, fast-forward integration into `main`, push of `main` and remote verification, retaining the architecture branch. Approval accepts the proposal, not runtime/account proof, and does not establish that the preceding review's findings were fixed. STOP after Git verification; Gate 3 is not authorized. No implementation, provisioning, installations, deployment or repository visibility change is authorized. That Git work is complete at `69ad8a5`.
- 2026-10-07: user said "Start Gate 3 planning". This authorized Gate 3 preparation, the independent source cross-check and drafting `03-program-design.md` on branch `codex/gate-3-program-design`. It did **not** authorize Gate 3 approval, a commit, a push, Gate 4, application implementation, package installation, provisioning, workflow creation, deployment or a repository visibility change.
- 2026-10-07: the user resolved the two provisioned-state questions this gate surfaced. **R11: in-app Better Auth** (Option A), so Gate 2 was not reopened and its approved auth decision stands; the file change and redeploy are a separate provisioning action. **R12: accept `aws-us-east-2`**, conditional on a named Slice 1 latency measurement.
- 2026-10-07: user explicitly approved Gate 3 ("gate 3 is approved") and in the same instruction authorized the planning commit and a push to `main`. Approval accepts the contracts in `03-program-design.md` and its disposition of the eight Gate 2 review findings. It establishes no runtime, account, integration or usability evidence, and it does not authorize implementation, Gate 4, the R11 follow-up action, provisioning, workflow creation, deployment or a repository visibility change. The eight findings are formally closed as dispositioned by an approved gate; their residual risks (R2, R3, R4, R6, R7, R8, R10, R11, R12) remain open where they are named as such.
- 2026-10-10: user said "U can start the gate 4 planning for envoi". This authorized Gate 4 preparation and drafting `04-slices.md` on branch `envoi/gate-4-slice-plan`. It did **not** authorize Gate 4 approval, a commit, a push, starting any slice, installing packages or tools, provisioning, workflow creation, deployment or a repository visibility change.
- 2026-10-10: user changed the branch convention in `AGENTS.md` from `codex/` to `<project>/slice-<N>-<slug>`, with a sub-slice branch slug naming its fixture or feature, and `<project>/` for gate branches. The unpushed Gate 4 branch was renamed to `envoi/gate-4-slice-plan` and the planned slice branches in `04-slices.md` now use `envoi/slice-`. Pushed historical branches such as `codex/gate-3-program-design` keep their names.
- 2026-10-10: user removed Zapier because it is paid and reopened Gates 1, 2 and 3; moved APIMatic (S14) down the cut order; asked why PYUSD was left out and for its blockers to be carried into a copy-paste handoff prompt for another agent. No gate was re-approved, and nothing was committed, pushed, installed or provisioned.
- 2026-10-10: user answered the four reopening questions: OpenAI stays as the AI provider ("We can use openai i have quite a bit of credits"), a direct vision call replaces Zapier, PYUSD is included and cut first, and S13 moves to right after S4. Gate 1 was revised and put to the user for re-approval. No gate was re-approved, and nothing was committed, pushed, installed or provisioned.
- 2026-10-10: user explicitly re-approved Gate 1 ("Yep. I approve gate one.") and asked for a handover prompt so another agent can start Gate 2. Product scope only; no architecture, implementation, commit, push, installation or provisioning is authorized by it.
- 2026-10-10: user authorized this Gate 2-only revision on `envoi/gate-4-slice-plan`, with backup first and no AGENTS.md edit. `02-architecture.md` and its five mirrors are revised for direct OpenAI vision and PYUSD; source findings are recorded. This is preparation, not Gate 2 re-approval; Gate 3/4 and protected product/mockup files remain untouched. No commit, push, runtime, account, spending or external-service action is authorized.

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

### Gate 3 preparation documentary verification, 2026-10-07

Checks were run with a one-off Node script in the OS temp directory, not a repository file. All eight gate documents were scanned.

- **Links and anchors:** 20 local links, 15 of them anchored, all resolve to existing files and headings. Gate-state mirrors agree across all eight documents, including the new `03-program-design.md`, and no document claims Gate 3 approval. The required question `Approve Gate 3, or what should change?` is recorded in both `00-status.md` and `handoff.md`. All eight review findings are dispositioned in both `00-status.md` and `03-program-design.md`; residual risks R1-R12 are defined, with R11 and R12 mirrored.
- **Secrets:** the scanner's injected self-test detected all four planted needles on the actual serialized surface (a Postgres connection string, a `DATABASE_URL` assignment, a `client_secret` value and a bare `neondb_` password). No secret-shaped value exists in any gate document. `git check-ignore -v` confirms `.env.local` matches `.gitignore:2`, `.neon` matches `.gitignore:3` and `node_modules` matches `.gitignore:4`; none is staged or listed as untracked. The concurrent session's files (`neon.ts`, `package.json`, `package-lock.json`, `.gitignore`) were read but not edited, staged, moved or deleted.
- **Writing rules:** zero em dashes in new writing, scanning all 833 lines of the new document and all 127 added lines of the diff. Four em dashes remain in pre-existing approved text in `00-status.md`, `01-product.md` and `handoff.md`; they were deliberately left untouched because the house rule governs new writing and rewriting approved prose for punctuation would widen the diff without changing a decision.
- **Diff scope:** `git diff --check` is clean. The diff is exactly seven gate documents, 127 insertions and 43 deletions, plus the new untracked `03-program-design.md`. `git diff --name-only` for `AGENTS.md`, `docs/plans/PAYPAL_PLAN.md` and `docs/plans/envoi/mockups` returns zero files, so all are byte-identical to `HEAD`. No `src/`, `app/`, `tests/`, `frontend/`, `backend/` or `.github/` directory exists; no application, workflow or dependency file was created by this gate.
- **Brief integrity, and a correction to how the hash must be read:** the recorded SHA256 `6058798EA477F0C4A0A8EFE7A24E076E88890D60582091C9B2D9F112F3B220A1` reproduces **exactly** on the LF-normalized bytes and on the git blob at `HEAD`. The working-tree file hashes to `8EF0AC9DA506E21495DD0CBE1E68559EA270E49E80E2106776557E91A1C49D4C` only because `core.autocrlf=true` checks it out with CRLF endings. The recorded value therefore refers to LF-normalized bytes; a future check that hashes the working tree directly will see a false mismatch. The body below the four-line banner was compared with the Initial commit and is byte-identical.
- **Checker defect record:** the first run reported 18 failures, and every one was a defect in the checker, not in the documents. Root cause: all gate documents are CRLF, so the heading pattern `^#{1,6}\s+(.*)$` never matched a line ending in `\r`, every anchor set came back empty and all 15 anchored links were reported missing. Two further heuristics over-matched: an approval-claim pattern fired on the negated and conditional phrases `unapproved Gate 3 draft`, `until Gate 3 is approved` and a sentence about the *approved Gate 2* proposal that also mentioned Gate 3; and the stale-workspace-path pattern fired on the two sentences that exist precisely to record that correction. The line-ending bug was fixed by normalizing `\r\n` on read, and the two heuristics were replaced with narrower assertions plus a positive check that the required approval question is present. The second run passed all checks. No failure evidence was discarded and no check was weakened to reach green: the passing run asserts strictly more than the first, since it adds the required-question and self-test-needle-count checks.
- **What this verification does not establish:** no runtime, account, integration, payment, image, SGQR-decode or usability evidence. At the time of these checks nothing had been installed, provisioned, deployed or committed; the planning commit came later under a separate authorization. Gate 3 preparation itself created no application code, and Gate 4 does not exist.

### R11 platform verification, 2026-10-07 (after Gate 3 approval)

Three read-only or narrowly scoped commands were run under a separate user authorization, and they changed the R11 conclusion:

- `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, and `Utilized services: Postgres`. This was misleading on its own: it means the policy matched, not that the service was off.
- `neon neon-auth status` reported the branch-level Auth service **still enabled**: provider `better_auth`, branch `production` (`br-fancy-sea-b4xb78sw`), database `neondb`, created `2026-10-07T11:59:53Z`, with a live auth base URL and JWKS URL. Therefore the `auth` field in `neon.ts` is **not** the on/off switch for that service.
- A schema inspection settled the hazard. `neon psql production` has no read-only endpoint on this plan, so read-only was enforced at session level instead with `PGOPTIONS="-c default_transaction_read_only=on"`, which the session confirmed by returning `transaction_read_only = on`. Result: schemas are `information_schema`, `neon_auth`, `pg_catalog`, `pg_toast`, `public`. All nine tables are in `neon_auth` (`account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`) and **`public` has none**. Roles are `cloud_admin`, `neon_auth`, `neon_service`, `neon_superuser`, `neondb_owner`.

**Conclusion:** the collision hazard R11 was escalated for does not exist, so nothing needed disabling and `neon neon-auth disable` was not run. The unsafe command in this sequence was never the read-only inspection; it was the risk of asserting a remediation had worked when the deploy output only said the policy matched. No credential, connection string or token was printed, read into a document or committed.

### Gate 4 preparation documentary verification, 2026-10-10

Checks ran with a one-off Python script in the session scratchpad, not a repository file, over all nine gate-folder documents on branch `envoi/gate-4-slice-plan`.

- **Links and anchors:** 27 local links, 18 of them anchored, all resolve to existing files and headings.
- **Gate state:** no document claims Gate 4 approval or still calls Gate 4 merely pending, and `00-status.md` and `handoff.md` both carry the exact question `Approve Gate 4, or what should change?`. All fifteen slices have a section in `04-slices.md` and an unchecked line in this file.
- **Test assignment:** the script parsed all 54 named tests from the Gate 3 test plan and found each assigned exactly once across the slice sections, with no unknown or duplicated name, plus 20 additions whose names do not collide with Gate 3's.
- **Writing and secrets:** zero em dashes in `04-slices.md` and in the added diff lines (57 before this record was appended, 70 after; the rerun after appending passed every check). The secret scanner's injected self-test detected all six planted needles (a Postgres URL with a password, a `DATABASE_URL` assignment, a `client_secret` value, a Neon `npg_` password, an OpenAI-style key and a Zapier catch-hook URL), and no secret-shaped value exists in the new file or the added lines.
- **The checks can fail:** on a scratch copy, four injected faults were each reported: one Gate 3 test removed from its slice, a planted em dash, a planted connection string and a broken anchor.
- **Diff scope:** `git diff --check` is clean, and the untracked `04-slices.md` has no whitespace errors and LF endings. The tracked diff is six gate documents, 70 insertions and 21 deletions including this record, plus the new `04-slices.md`. `AGENTS.md`, `PAYPAL_PLAN.md`, the mockups, `02-architecture.md`, `03-program-design.md`, `neon.ts`, `package.json`, `package-lock.json` and `.gitignore` are byte-identical to `HEAD`. The brief still hashes to `6058798E...`. Nothing was staged, committed, installed or provisioned.
- **Corrected while mirroring:** two stale lines still called `03-program-design.md` an "unapproved Gate 3 draft", one in `handoff.md` and one in this file's fresh-session notes. Both now state the approved status; no decision changed.
- **What this does not establish:** no runtime, account, integration, payment, image, scan or usability evidence. The slice plan is a proposal awaiting approval.
- **Rerun after the reopening edits, 2026-10-10:** 44 local links, 35 of them anchored, all resolve; all 54 Gate 3 tests are still assigned exactly once; zero em dashes in the 168 added diff lines; `git diff --check` is clean. The reopening is recorded in `00-status.md`, `handoff.md`, `04-slices.md`, the three gate documents, `roadmap.md`, `stack-recommendation.md` and `research.md`. No gate document's Zapier content was rewritten; that revision belongs to the reopened gates.

### Gate 1 revision documentary verification, 2026-10-10

Checks ran with a one-off Python script in the session scratchpad, not a repository file.

- **Links and anchors:** 48 local links, 39 of them anchored, all resolve. All 54 Gate 3 tests are still assigned exactly once in `04-slices.md`, which this step did not change.
- **Writing and secrets:** zero em dashes in the added diff lines and the untracked `04-slices.md`, counting the named, decimal and hexadecimal HTML entity forms. The secret scanner's self-test detected all ten planted needles (a Postgres URL with a password, a `DATABASE_URL` assignment, a `client_secret`, a Neon `npg_` password, OpenAI, Google and Groq key shapes, a Zapier catch-hook URL, a PEM private-key header and a 64-byte Solana secret-key array), and no secret-shaped value exists in the changed surface.
- **The checks can fail:** on scratch copies, a broken anchor, a removed Gate 3 test assignment, a missing Gate 1 approval question, a planted em dash, a planted entity em dash in a mockup and a planted connection string were each reported.
- **Mockups in a browser:** all six pages were loaded from a loopback-only server (`http://127.0.0.1:8793/`) at 360px, 390px and 1280px with no horizontal overflow and no console errors. The revised drafting states and consent text were exercised. Two defects introduced by this revision were fixed: the "Not enabled" chip wrapped onto two lines, and the disabled PYUSD rate field looked enabled. Four older wraps at 390px were fixed at the same time ("Demo fixture", "Not acknowledged", "No execution evidence", "Not quoted") with one `white-space: nowrap` rule per page. Static checks found no duplicate ids, no missing label targets, one `h1` and one `main` per page, no external scripts and no broken local links.
- **Diff scope:** `git diff --check` is clean. This step changed `01-product.md`, `00-status.md`, `handoff.md`, `research.md`, `roadmap.md`, `stack-recommendation.md` and six mockups (three for content, four for the wrap fix, one in both sets). `AGENTS.md`, `02-architecture.md`, `03-program-design.md` and `04-slices.md` are unchanged from the start of this session. Nothing was staged, committed, installed or provisioned.
- **What this does not establish:** no runtime, account, model, wallet, faucet or usability evidence.

### Gate 2 amendment documentary verification, 2026-10-10

- **[verified] Backup/scope:** before editing, copied AGENTS.md and all docs to `/private/var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/opencode/envoi-gate2-20261010/backup/` and saved SHA256 values.
  Compared current bytes with that backup: only `02-architecture.md`, `00-status.md`, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md` changed in this run.
  AGENTS.md, Gate 1, all mockups/JPG, Gate 3, untracked Gate 4 and original brief match their starting bytes, preserving all earlier uncommitted work.
- **[verified] Documentary checker:** copied the supplied checker to the same scratchpad; `python3 -I /private/var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/opencode/envoi-gate2-20261010/doccheck.py docs/plans/envoi /Users/jayd0/Desktop/envoi` passed local links/anchors, all 54 unchanged Gate 3 tests assigned exactly once, Gate 2 question/pending-state guard, no new em dashes including named/numeric HTML entities, and secret checks over the added surface plus complete gate Markdown/HTML.
  Extended the scanner to eleven independently paired patterns, including 85-90-character base58 shapes, with eight public-address negative controls (six named public addresses and 32/44-character boundaries).
  This is a shape heuristic: public transaction signatures can share a secret-key shape; it is not a complete secret audit or a runtime leak test.
- **[verified] Fail-capability:** `python3 -I /private/var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/opencode/envoi-gate2-20261010/prove_doccheck.py round2` passed one pristine control and rejected 34 independent scratch faults: broken file/anchor, removed/duplicated/unknown test assignment, missing question, false re-approval, five literal/entity em-dash forms, eleven planted secret shapes and each of eleven independently disabled secret rules.
  No mutation touched real repository files; copies/transcripts and `fault-checks-round2.json` remain in scratch.
- **Checker defect, preserved:** the first independent-rule run failed because its synthetic connection-string needle also carried the separately detected Neon-password prefix.
  Disabling the connection-string rule therefore still detected that needle through another rule and proved neither independently.
  Changed only the synthetic URL password, not either detection rule, then reran all cases with separate saved paths; initial failure logs/copies and `fault-checks.json` remain.
- **[verified] Diff/writing:** `git diff --check` passed; the untracked slice draft was scanned separately by the checker and remains unchanged from backup.
  Reviewed the session-only diff saved as `session.diff` in scratch, separate from the larger pre-existing user diff.
  Current amendment mirrors agree on pending approval, direct OpenAI vision/no image storage, retained provider/pin, conditional PYUSD, unchanged core and deferred Gate 3/4 edits.
- **[verified] Evidence limits:** primary documentation re-checks and attributed prior-session read-only mint observations only.
  Two documentation URLs returned 404 and were corrected; two later Solana documentation requests timed out, then succeeded on retry.
  No Devpost bypass, API inference, new RPC transaction, wallet, faucet, install, provisioning, workflow, deployment, staging, commit or push occurred.
  These checks do not prove runtime latency/RAM/retention, merchant authority, payment safety, wallet behavior, account access or usability.
