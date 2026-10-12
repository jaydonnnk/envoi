# Status: Envoi

Updated: 2026-10-12 (Asia/Singapore).

- Gate 1 - Product: **RE-APPROVED 2026-10-10** by the user ("I approve gate one") after being reopened and revised the same day to remove Zapier, which the user rejected as paid, and to record the PYUSD decisions; see the [reopening record](#reopening-2026-10-10-zapier-removed). Previously **APPROVED 2026-10-07** by the user after reopening it to add a buyer-side scan entry point. Approval covers product scope and buyer/merchant journeys, including text and scan/paste entry points.
- Gate 2 - Architecture: **RE-APPROVED 2026-10-11** by the user ("gate 2 approved") after being reopened and revised on 2026-10-10 and revised again after a 2026-10-11 review. Approval covers only the direct vision import and PYUSD amendment in `02-architecture.md`, including the five review changes; the OpenAI/provider pin and all unaffected 2026-10-07 decisions stand. It accepts a proposal, not runtime/account proof. Previously **APPROVED 2026-10-07**.
  **Reopened again and RE-APPROVED 2026-10-11** for two PYUSD double-payment fixes found in the Gate 3 review: the user approved the fixes in advance ("reopen gate 2 and approve the fixes i approve it already").
  Preparation releases the unsigned bytes exactly once and never stores them, and the post-expiry window scan runs for every released attempt and records any extra transfer; see the [record](#gate-2-reopening-for-double-payment-fixes-2026-10-11).
- Gate 3 - Program Design: **reopened 2026-10-12, in progress, revised and awaiting re-approval** for one change only: PayPal start and completion check `PAYMENTS_ENABLED` and refuse with the new error code `payments_disabled` (Gate 4 delta D10); awaiting `Approve Gate 3, or what should change?`; see the [reopening record](#gate-3-reopening-for-the-paypal-kill-switch-2026-10-12).
  Before that it was **RE-APPROVED 2026-10-11** by the user ("Yes approve commit the branch and push and merge to main"), after being reopened on 2026-10-10; the revision of the affected import and PYUSD contracts was drafted on 2026-10-11 and revised the same day after the user's review (fixes A-K) and for fixes L and M after Gate 2 was reopened.
  Approval accepts the contracts as written, including the four deviations flagged with fixes A-K, as a proposal; it establishes no runtime, account, model, wallet or usability evidence.
  Previously **APPROVED 2026-10-07**.
  It follows the [Gate 3 handover](handoff.md#gate-3-handover-2026-10-11) on branch `envoi/gate-3-vision-pyusd`; see the [revision checklist](#gate-3-revision-checklist-2026-10-11).
  The user's verdicts on six least confident calls are review decisions recorded in the [approval history](#approval-history).
  The 2026-10-07 approval and eight finding dispositions still govern unaffected decisions.
  The OpenAI provider pin does not change, and the completed R11 action/R12 region decision are not reopened.
- Gate 4 - Slice plan: **in progress, unapproved draft, revised 2026-10-12** on branch `envoi/gate-4-vision-pyusd`; awaiting `Approve Gate 4, or what should change?`.
  No slice is authorized or started.
  [`04-slices.md`](04-slices.md) now applies the reopened gates: S11 and S12 merge into S11, menu photo import with direct vision; the Zapier check is gone; S13 runs right after S4; PYUSD is added as S16, devnet purchase, and S17, recovery, after S13 and first in the cut order, with scan (S10) and account-conditional S14 following it.
  It applies the Gate 3 [test delta](03-program-design.md#test-delta-for-the-gate-4-revision): all 92 named tests and 231 cases are assigned once each, the 10 removed names nowhere, and 39 named additions, up from 20: 33 cover contracts with no named test in the slice that builds them, four are refinements of this plan and two are pin falsifiers.
  Proposed beyond the user's instructions and flagged for review: S11 moves ahead of S9 and S10, the PayPal basket lock lands in S7 with its `paypal/start` recheck, the R2 storage-exhaustion decision moves from S11 to S15, a second checkpoint on 1 Nov, a PYUSD go/no-go when S11 is done, delta D8, a static "PYUSD unavailable" option from S2, and delta D9's public-route limits.
  An independent review of the draft on 2026-10-12 found four major issues, and all four are fixed in it; see the [review fixes](#gate-4-review-fixes-2026-10-12).
  Its minor findings are fixed or dispositioned; see the [minor review fixes](#gate-4-minor-review-fixes-2026-10-12).
  The user decided delta D10 on 2026-10-12 by reopening Gate 3 for a PayPal check of `PAYMENTS_ENABLED`; S2 builds it and names its test, and S2 needs Gate 3's re-approval as well as Gate 4's approval.

### Reopening 2026-10-10: Zapier removed

- **Zapier is removed.** The user reopened Gates 1-3 on 2026-10-10; Gate 1 was then revised and re-approved that day.
- **Unaffected decisions stand.** Only direct vision import and PYUSD-dependent decisions change; do not redo hosting, auth, PayPal recovery, scan, MCP, R11 or R12.
- **Replacement selected:** direct OpenAI vision inside the upload request, no stored image bytes or image URL. Remove source rows, image/result capabilities, old image clocks/tasks and import heartbeat dependency when the relevant gate is revised. Keep a proposed bytes-free audit/admission attempt.
- **AI-provider question resolved:** OpenAI stays because the user has credits. No provider or `@ai-sdk/openai` pin change; account balance/access/sharing and authorized evaluation spend remain unknown.
- **Cut order corrected by the later PYUSD decision:** PYUSD first, scan next, account-conditional S14 after scan. The 2026-10-12 Gate 4 revision applies it as S16 and S17, then S10, then S14.
- **PYUSD included:** merchant-set rate, 30-day re-confirmation and upward atomic rounding are re-approved Gate 1 decisions. This Gate 2 amendment pins devnet identity, wallet boundaries, destination/rate data and recovery; tests/slices wait for the later gates.
- **Handoff.** The user asked for a copy-paste prompt so another agent can continue. This work was uncommitted on `envoi/gate-4-slice-plan` in the macOS checkout until the user authorized committing it and pushing it to `main` on 2026-10-11.
- **[verified]** The sponsor-rule facts behind these decisions are in [`research.md`](research.md#sponsor-rules-re-check-2026-10-10).
- **Questions 1-4 answered 2026-10-10.** The AI-provider and PYUSD evidence presented with them is in [`research.md`](research.md#ai-provider-and-pyusd-re-check-2026-10-10). The answers:
  1. **AI provider: OpenAI stays.** The user said "We can use openai i have quite a bit of credits". The approved Gate 2 provider and the Gate 3 `@ai-sdk/openai` pin do not change.
  2. **Zapier replacement: direct vision call.** The menu photo goes to the model inside the upload request; Envoi stores no image bytes and exposes no image URL. S11 and S12 merge.
  3. **PYUSD: include, cut first.** A Gate 2 amendment pins the verified devnet mint, the buyer wallet, a merchant-set SGD rate and the public devnet RPC; Gate 3 adds wallet contracts; Gate 4 adds two slices after S13, first in the cut order.
  4. **S13 moves to right after S4.**
- **Gate 1 revised and re-approved 2026-10-10.** `01-product.md` replaces Zapier with model drafting while the merchant waits, records PYUSD as built after PayPal and cut first, and adds the merchant-set PYUSD rate with a 30-day re-confirmation. `mockups/index.html`, `mockups/merchant-onboarding.html` and `mockups/review.html` carry the same changes.

### Gate 3 reopening for the PayPal kill switch, 2026-10-12

- **Finding:** the Gate 4 review's minor finding 10 noted that nothing tests PayPal's use of `PAYMENTS_ENABLED`.
  Reading Gate 3 showed the contract itself was missing: only PYUSD checked the flag, and no error code fit a PayPal refusal, so this was recorded as Gate 4 delta D10 for the user.
- **User decision, 2026-10-12:** "Add the check to paypal/start and paypal/complete, add an error code such as payments_disabled, and add a named test with its own mutation. One small Gate 3 reopening before S2."
- **Change:** `03-program-design.md` adds `payments_disabled` to `ErrorCode`, makes `assertPaymentEligible` refuse a PayPal purchase with it while the flag is false, and shows the check in the `paypal/start` and `paypal/complete` call stacks.
  Reads, reconcile, webhooks and maintenance never check the flag, so an uncertain payment still converges.
  The [reopening section](03-program-design.md#reopening-2026-10-12-paypal-payments-kill-switch) records it; no other contract changes, and Gate 3's test plan counts stay 92 named tests and 231 cases.
- **Test:** `payments kill switch refuses PayPal start and completion`, a Gate 4 named addition in S2 with its own mutation, as Gate 3 already does for the D1 operator acts.
- **Gate 1 and Gate 2 unchanged:** Gate 2 already names `PAYMENTS_ENABLED`, and no product behaviour changes.
- [x] User reopened Gate 3 for this change, 2026-10-12.
- [x] Revise `03-program-design.md` and mirror it in this file, `04-slices.md`, `handoff.md`, `roadmap.md`, `stack-recommendation.md`, `research.md` and the closing status line of `01-product.md`.
- [x] Fail-capable documentary checks, recorded in [the verification](#gate-4-revision-documentary-verification-2026-10-12).
- [ ] Explicit user re-approval of Gate 3.

### Gate 2 reopening for double-payment fixes, 2026-10-11

- **Findings:** the report on fixes A-K raised two ways one PYUSD purchase could be paid twice, left unfixed because they were Gate 2-level choices.
  Re-releasing the same unsigned bytes lets a wallet that augments each signing differently land two transfers, and a second successful transfer with the same reference after `confirmed` was not detected.
- **User decision, 2026-10-11:** "fix then then reopen gate 2 and approve the fixes i approve it already then once ure done publish gate 3, merge and push to main".
  Gate 2 was reopened for these two fixes only and is recorded as re-approved for them, because the user approved the fixes in advance.
- **Fix L, release once:** step 4 of `02-architecture.md` now releases the unsigned bytes exactly once and stores only their fingerprint; a repeat call gets the attempt's status, and the browser asks the wallet once per release.
- **Fix M, extra transfers:** the post-expiry window scan now runs for every released attempt, including a confirmed or mismatched one, and records any other successful transaction carrying the reference as an extra transfer.
  The paid state never changes; the buyer, merchant and operator see the extra transfer, and any refund is arranged outside Envoi.
- **Gate 1 unchanged:** its rule "Provider/chain result uncertain: checking payment; no blind retry or immediate switch to the other method" already covers fix L, and no refund is promised.
- **Gate 3** carries the matching contracts and tests as fixes L and M; "publish gate 3" was recorded as authority to publish this work in Git, and Gate 3 was then re-approved separately on 2026-10-11.

## Slices

Draft build order from `04-slices.md`, revised 2026-10-12, pending Gate 4 approval.
Slice IDs are stable names, so the list below is in build order rather than numeric order; S12 is retired, merged into S11.
No slice is authorized or started, and each one starts only on an explicit authorization that names its slice ID, such as "start S13"; a number in that request is the slice ID, not a build position.
No application, payment integration or sponsor integration exists.
The candidate list in `roadmap.md` remains discussion material and is superseded as a build order by `04-slices.md` once that is approved.

- [ ] S1 - Tracer bullet on Render Free: labeled demo shop from Neon to an explicitly unpaid stub receipt; boot check, auth schema pin, R12 latency measurement.
- [ ] S2 - PayPal sandbox happy path with recipient and amount binding, lease-serialized capture, abandonment derived on read and PYUSD shown as unavailable.
- [ ] S3 - PayPal recovery: lost responses, webhooks, reconcile, "checking payment".
- [ ] S4 - Text entry with AI suggestions and the pre-registered model evaluation.
- [ ] S13 - Agent handoff over MCP, moved to right after S4.
- [ ] S6 - Merchant sign-in and manual menu draft.
- [ ] S5 - Maintenance runner, manual runs, operator health view behind the operator guard; built after S6, whose sign-in it needs.
- [ ] S7 - Merchant destination and publication, with stale-review invalidation and the PayPal basket lock at review creation and inside `paypal/start`.
- [ ] S8 - Merchant orders and separate acknowledgment.
- [ ] S11 - Menu photo import with direct vision, merged from the earlier S11 and S12, with the pre-registered vision evaluation and the real-photo exit decision, followed by the PYUSD go/no-go.
- [ ] S9 - Merchant SGQR decode and identifier mapping.
- [ ] S10 - Buyer scan or paste; second in the cut order.
- [ ] S16 - PYUSD devnet purchase; first in the cut order, together with S17.
- [ ] S17 - PYUSD recovery, extra transfers and the operator mismatch and refund acts.
- [ ] S14 - APIMatic client and docs, account-conditional; third in the cut order.
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
- **[hypothesis]** The revised import shrinks the photo in the browser to one JPEG of at most 2,048 pixels/side and 2 MiB, then uses request memory only, 90-second total/60-second model budgets, explicit `store: false`, a bytes-free attempt and no import maintenance dependency.
  No image URL, source row or capability remains in the Gate 2 proposal or, since the 2026-10-11 revision, in Gate 3; the 2026-10-12 Gate 4 revision removes the stale source contracts from the slice plan.
- **[unknown]** OpenAI data-sharing setting/foreground retention, Chinese-text accuracy, selected vision model through 16 Dec, Render latency, `sharp` RAM on 512 MB and browser shrink of large phone photos. Real photos remain gated on consent/account confirmation and actual no-disk/no-log/no-database-image probes.
- **[verified, prior-session observation]** Read-only devnet mint/genesis/extension findings are attributed in research, not repeated in this run.
  **[vendor claim]** Phantom documents that it may add Lighthouse assertion and priority-fee instructions, so verification allowlists them.
  **[verified] 2026-10-11:** a read-only devnet read found the Lighthouse program and the pinned memo program executable and the genesis hash matching; see [research](research.md#gate-3-revision-reads-2026-10-11).
  **[unknown]** Phantom mint display, devnet chain honoring, blockhash/transfer preservation, the phone Browse-link path, user faucet access and shared-IP/history completeness.
  No wallet, faucet or payment was used.
- No authentic menu extraction, payment, merchant ownership trial, buyer-side scan or user test has been demonstrated.
- Prior-art review of shipped SGQR payment products, 2026-10-07 (`research.md`), supports three decisions: the sticker is an identity key and not a payment route on either rail; shipped products require ownership documents plus human review rather than auto-publishing from a photo; and the stablecoin-to-SGD off-ramp remains unsolved non-custodially, which reinforces the separate merchant-economics test. A "99% of payers use PayNow" figure appearing in prior art is an unverified third-party market claim and must not enter public submission materials without a primary source.
- Live deployment separately requires provider eligibility, legal assessment, merchant enrollment and operational checks. No-custody alone does not establish a legal exemption.

## Notes for a fresh session

- **Current request, 2026-10-12, Gate 3 reopening for D10:** the user reopened Gate 3 for a PayPal check of `PAYMENTS_ENABLED` with the error code `payments_disabled` and a named test, recorded in [the Gate 3 reopening](#gate-3-reopening-for-the-paypal-kill-switch-2026-10-12).
  Next are the user's answers to `Approve Gate 3, or what should change?` and `Approve Gate 4, or what should change?`.
  The user said they then intend to approve and to commit the working tree, merge it into `main` and push; that is stated intent, and the commit, merge and push wait for the user's instruction after the approvals.
  Nothing was committed, pushed, installed or provisioned, and Gates 3 and 4 await approval.
- **Earlier request, 2026-10-12, Gate 4 minor review fixes:** the user asked for the review's minor findings to be fixed or dispositioned.
  They are recorded in [the minor review fixes](#gate-4-minor-review-fixes-2026-10-12); delta D10 was left for the user's decision.
- **Earlier request, 2026-10-12, Gate 4 review fixes:** the user supplied an independent review of the draft and asked for its four major findings to be fixed first, with the minor ones to follow.
  The fixes are recorded in [the review fixes](#gate-4-review-fixes-2026-10-12); the checker and its fault harness are new untracked files under `checks/`.
- **Earlier request, 2026-10-12, Gate 4 revision:** the user said "Next is the Gate 4 revision of 04-slices.md: reassign the tests to slices using the delta in 03, and update the slice order and cut order. Go ahead and start".
  That authorized drafting the revision on a new branch, `envoi/gate-4-vision-pyusd`, created from `envoi/gate-3-vision-pyusd` at `74b1f64`, mirroring it and asking `Approve Gate 4, or what should change?`.
  It did **not** authorize Gate 4 approval, a commit, a push, a merge, starting any slice, installation, provisioning, an OpenAI call, a wallet, faucet or RPC call, spending, a workflow, deployment or a visibility change.
  `04-slices.md` and its mirrors in this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md`, `research.md` and the closing status line of `01-product.md` changed; `02-architecture.md`, `03-program-design.md`, the mockups and AGENTS.md did not.
- **[verified] AGENTS.md "Context transfer" section, 2026-10-12:** the user committed it themselves as `74b1f64` ("Update context for agents.md") on `envoi/gate-3-vision-pyusd`, which is pushed but not in `main`.
  This branch starts from that commit, so merging it into `main` would carry the section; the earlier rule to keep the section out of commits is overtaken by the user's own commit.
- **[verified] Toolchain, 2026-10-12:** Node.js `v24.21.0` with npm `11.19.0` is now installed under `~/.local/node`, and the GitHub CLI under `~/.local/bin`; PostgreSQL, Docker, Homebrew and the Neon CLI are still absent, and `.env.local`, `.neon` and `node_modules/` are still absent.
- **Earlier request, 2026-10-11, Gate 2 reopening and fixes L and M:** the user reopened Gate 2 for two PYUSD double-payment findings, approved the fixes in advance, and authorized publishing the Gate 3 work, merging it into `main` and pushing.
  `02-architecture.md` releases the unsigned bytes once and scans every attempt's window for extra transfers; `03-program-design.md` carries the matching contracts and 92 named tests in 231 cases; the mirrors follow.
  The user then re-approved Gate 3 ("Yes approve commit the branch and push and merge to main"); the Gate 4 revision followed on the user's request of 2026-10-12.
  At that time AGENTS.md's uncommitted "Context transfer" section was to stay out of every commit unless the user said otherwise.
- **Earlier request, 2026-10-11, Gate 3 review revision:** the user reviewed the drafted revision, gave verdicts on six least confident calls and required fixes A-K, all applied to `03-program-design.md` and mirrored here, in `handoff.md`, `roadmap.md` and `stack-recommendation.md`.
  No Gate 2 decision changed, so Gate 2 is not reopened; no external read, install, OpenAI call, wallet, faucet, RPC call, commit or push occurred.
  Fail-capable documentary checks passed in a fresh session and are recorded in the [review revision verification](#gate-3-review-revision-documentary-verification-2026-10-11).
  AGENTS.md carries an uncommitted "Context transfer" section that the revision did not write; ask the user before including it in any commit.
  Next is the user's decision on `Approve Gate 3, or what should change?`.
- **Earlier request, 2026-10-11, Gate 3 revision:** the user supplied the copy-paste Gate 3 handover prompt as the task.
  It authorized revising only the affected `03-program-design.md` contracts on a new branch `envoi/gate-3-vision-pyusd` from `main` at `9b4796b`, mirroring them in this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md`, running fail-capable documentary checks and asking `Approve Gate 3, or what should change?`.
  It did **not** authorize Gate 3 approval, editing AGENTS.md, Gate 1, the mockups, Gate 2 or Gate 4, application code, installs, provisioning, OpenAI calls, wallet, faucet, RPC transactions, spending, workflows, deployment, a visibility change, a commit or a push.
  Read-only registry, GitHub and devnet reads were used for pins and the Lighthouse recheck.
- **Earlier request, 2026-10-11, approval:** the user re-approved Gate 2 ("gate 2 approved"), authorized publishing the branch and merging it into `main`, and asked for a copy-paste Gate 3 handoff prompt.
  Next is the Gate 3 revision of affected contracts, run by the agent that receives that prompt; Gate 3 approval is not implied.
- **Earlier request, 2026-10-11:** the user asked whether Gate 2 was good, accepted the five recommended review changes, asked for OpenAI data-control steps and authorized committing and pushing to `main` once the revision checked out. The changes are in `02-architecture.md` and its five mirrors; AGENTS.md, product, mockups, Gate 3 and Gate 4 were not edited. Earlier current-request paragraphs below are historical run context.
- **Gate 2-only revision, 2026-10-10 (historical):** the user authorized architecture and five mirrors on the existing dirty branch, with backup first and no AGENTS.md/product/mockup/Gate 3/Gate 4 edits.
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
- `02-architecture.md` is the Gate 2 proposal re-approved on 2026-10-11 for direct OpenAI vision and PYUSD only.
  Its unchanged core is Render Free, Neon Free, in-app Better Auth, GitHub Actions maintenance, direct PayPal Orders v2, identity-only scan and MCP handoff.
  `stack-recommendation.md` mirrors the amendment; `03-program-design.md` carries the 2026-10-11 Gate 3 revision, re-approved on 2026-10-11, and `04-slices.md` applies it as an unapproved Gate 4 draft revised on 2026-10-12.
  No application or runtime/account proof exists.
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
It supplied no authority for later revisions. **2026-10-11:** the user authorized committing the uncommitted work and the review revision on `envoi/gate-4-slice-plan`, fast-forwarding `main` and pushing it; that authorization does not carry over to later changes. **2026-10-11, with the Gate 2 re-approval:** the user authorized publishing `envoi/gate-4-slice-plan` and merging it into `main`.
**2026-10-11, with the second Gate 2 reopening:** the user authorized publishing the Gate 3 work on `envoi/gate-3-vision-pyusd`, merging it into `main` and pushing; a record cannot contain its own commit, so Git history and the remote are the evidence.

**2026-10-11, with the Gate 3 re-approval:** the user authorized committing the branch, pushing it and merging it into `main`.

**STOP here: the Gate 4 revision of `04-slices.md` was drafted on 2026-10-12 on `envoi/gate-4-vision-pyusd` and awaits the user's answers to `Approve Gate 3, or what should change?` for the 2026-10-12 Gate 3 reopening and `Approve Gate 4, or what should change?`.**
Gate 3 was re-approved on 2026-10-11 ("Yes approve commit the branch and push and merge to main") and reopened on 2026-10-12 for the PayPal kill switch only; the revision applies its [test delta](03-program-design.md#test-delta-for-the-gate-4-revision).
The revision is uncommitted; committing, pushing or merging it needs its own authorization.
No slice starts without its explicit authorization and Gate 4 approval.
Do not install, provision, use a wallet/faucet, spend, create workflows, deploy or change visibility; further commits or pushes need their own authorization.
The tracked provisioning files remain untouched; ignored credentials/config/generated artifacts must never be staged.

**The one authorized exception:** the user authorized the R11 follow-up on 2026-10-07, scoped to changing `neon.ts` from `auth: true` to `auth: false`, redeploying that configuration, and then a read-only schema inspection. **All three are complete.** The file is `auth: false` with a short explaining comment. `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, and `Utilized services: Postgres`. The inspection (`default_transaction_read_only=on`, verified in-session) found every Neon Auth table in its own `neon_auth` schema with `public` empty, which **disproves the collision hazard**. Managed auth stays enabled but inert; nothing was disabled. `neon neon-auth disable` was **not** run and is not authorized. `neon.ts` was later committed unchanged, at `auth: false`, in commit `f8caf7d`, so the working tree and the committed record now agree.

## Approved Gate 2 proposal and limits

The core below remains approved from 2026-10-07; the two amendment bullets were **re-approved 2026-10-11**, including the five review changes, and the PYUSD bullet's two double-payment fixes were re-approved again the same day.

- Free hosting only: Render Free app, Neon Free PostgreSQL, in-app Better Auth and finite GitHub Actions maintenance. Durable payment state is in the database; scheduling remains best effort with the Gate 3 quota-gated cadence. No paid worker, Supabase or Redis; MCP/HTTP share rules. The 2026-10-11 commit/push authorization covers publication only.
- Better Auth anonymous buyer sessions; non-anonymous merchant login plus operator-approved membership. Sessions survive app sleep/redeploy. No public merchant signup or email/reset service assumed; private records are never public registry data.
- Direct Orders v2 runtime adapter: distinct authorized sandbox seller/payee, human PayPal approval, immutable server-priced purchase, persisted create/capture operation keys and reconciliation before replacement payment.
- **Import amendment, re-approved 2026-10-11:** synchronous route-handler vision on a browser-shrunk JPEG of at most 2,048 pixels/side and 2 MiB, request memory only, short versioned OpenAI consent with details on request and explicit `store: false`; bytes-free attempt, 90-second request/60-second model budgets, one global in-flight, 10/outlet and 50/global daily attempts plus recorded spend ceiling. Keep strict 100-row/120-character/128-KiB draft bounds, edits/base revisions and manual fallback. Drop old image routes/rows/principals/clocks/tasks and status/cancel routes; reload the authenticated draft for lost-response recovery. Proposed `AI_MENU_MODEL` adds separate vision evaluation without provider/pin change.
- Render sleep/cold starts and Neon/GitHub quotas may break availability; include an idle first visit in the three-minute metric. OpenAI credits are user-reported, not account-verified; no paid hosting fallback or assumed sponsor credits.
- Scan is identity lookup only; shared identifiers require outlet clarification. AI suggests registered items and cannot publish, capture or sign.
- **PYUSD amendment, re-approved 2026-10-11:** reviewed devnet genesis/mint/Token-2022/decimals constants, only RPC/enable configuration, verified pre-existing merchant ATA and SIWS/Ed25519 challenge, dated integer merchant rate and ceil rounding. Persist/lock a prepared transaction with a `confirmed` blockhash and mandatory reference before Wallet Standard sign-and-send; verify the finalized transfer's meaning (saved blockhash, sole buyer signer, one exact transfer, memo, zero fee, per-transaction balance delta), allowlisting only ComputeBudget and pinned Lighthouse assertion instructions. Release an unknown attempt only after saved-height expiry plus complete attributable history, with proven wallet blockhash preservation; incomplete history stays uncertain. Phone path: a Phantom Browse link carrying public outlet/item IDs into a fresh wallet-browser review, unproven. PayPal remains isolated and PYUSD remains disabled until proofs pass.
  Re-approved again on 2026-10-11: the unsigned bytes are released exactly once and never stored, the browser asks the wallet once per release, and the post-expiry window scan runs for every attempt and records extra transfers without changing the paid state.
- APIMatic context remains development tooling; own-API generation remains account-conditional. R11 containment and R12 conditional region acceptance stand; no application, wallet/faucet, spend, install, provisioning, workflow, deployment or visibility change is authorized by the proposal, and the 2026-10-11 commit/push was separately authorized.

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
- [x] Explicit user re-approval of Gate 2, 2026-10-11 ("gate 2 approved"). Proposal only; no runtime/account proof.

### Gate 2 review revision checklist, 2026-10-11

- [x] Review the amendment against Gate 1, the mirrors and primary sources; recommend five changes.
- [x] User accepted all five; revise only `02-architecture.md` and its five mirrors.
- [x] Fresh documentary checks and diff inspection, recorded below.
- [x] Explicit user re-approval of Gate 2, 2026-10-11.

### Gate 2 reopening checklist, 2026-10-11 (double-payment fixes)

- [x] User reopened Gate 2 for the two double-payment findings and approved the fixes in advance, 2026-10-11.
- [x] Revise `02-architecture.md`: step 4 releases the bytes once and stores only the fingerprint, the window scan covers every attempt and records extra transfers, plus the prepare endpoint, the attempt data row, the falsifiers and the approval record; Gate 1 and the mockups stay unchanged.
- [x] Mirror the reopening and re-approval in this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md`.
- [x] Fail-capable documentary checks, recorded in [the verification](#gate-2-reopening-and-fixes-l-m-documentary-verification-2026-10-11).
- [x] Explicit user re-approval of the fixes, given in advance on 2026-10-11 ("reopen gate 2 and approve the fixes i approve it already").

### Gate 3 revision checklist, 2026-10-11

- [x] Read AGENTS.md, the software-factory skill and every gate-folder document; confirm `main` equals `origin/main` and the remote at `9b4796b` with a clean tree; create `envoi/gate-3-vision-pyusd` and confirm it with `git branch --show-current`.
- [x] Remove the Zapier and stored-image contracts; add the direct-vision import and PYUSD contracts; update errors, clocks, state machines, authorization, call stacks, races, capacity, maintenance tasks, residual risks and least confident decisions.
- [x] Give every new guard its own named test and mutation; record the Gate 4 test delta without editing `04-slices.md`.
- [x] Pin new packages from dated registry reads; leave the OpenAI provider and `@ai-sdk/openai` pin unchanged; recheck the Lighthouse program on devnet read-only.
- [x] Mirror the revision in this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md`.
- [x] Fail-capable documentary checks and diff inspection, recorded in [the verification below](#gate-3-revision-documentary-verification-2026-10-11).
- [x] User review of the draft, 2026-10-11: verdicts on six least confident calls and fixes A-K requested; recorded in the approval history.
- [x] Apply fixes A-K to `03-program-design.md` without reopening Gate 2: the money-can-still-move basket lock with derived PayPal abandonment and the PYUSD mismatch operator exit, the import membership recheck, explicit mint/decimals verification, Lighthouse out of the runtime identity check, `T_MENU_MODEL`, no RPC inside transactions, pre-dispatch reservation release, later-hint verification, agreeing state machines, the stale provisioning sentence and batched tests with an exact delta mapping.
- [x] Mirror the review revision in this file, `handoff.md`, `roadmap.md` and `stack-recommendation.md`; `research.md` needs no change because no evidence changed.
- [x] Fail-capable documentary checks for the review revision, recorded in [its verification](#gate-3-review-revision-documentary-verification-2026-10-11).
- [x] Apply fixes L and M to `03-program-design.md` after the Gate 2 reopening: bytes released once and never stored, one wallet call per release, a window scan of every attempt that records extra transfers, and the regenerated test plan and delta.
- [x] Fail-capable documentary checks for fixes L and M, recorded in [their verification](#gate-2-reopening-and-fixes-l-m-documentary-verification-2026-10-11).
- [x] Explicit user approval of the Gate 3 revision, 2026-10-11 ("Yes approve commit the branch and push and merge to main").

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

### Gate 4 preparation checklist, 2026-10-10 (historical)

Superseded by the [revision checklist](#gate-4-revision-checklist-2026-10-12); its items record the 2026-10-10 draft.


- [x] Verify Gates 1-3 approval records, confirm a clean `main` matching `origin/main` at `dc1e23c` with `git ls-remote`, and create `envoi/gate-4-slice-plan`.
- [x] Read `AGENTS.md`, the software-factory skill and every document in the gate folder, including all 843 lines of `03-program-design.md`.
- [x] Record the macOS workspace facts: missing toolchain, absent ignored credentials, private repository, current Node LTS and LF line endings.
- [x] Draft `04-slices.md`: fifteen slices in build order with visible results, dependencies, Gate 3 test assignment, named additions with mutations, evidence, falsifiers and per-slice authorizations; Gate 3 deltas D1-D7; access checks; schedule, cut order and exclusions; least confident decisions.
- [x] Carry every Gate 3 handoff obligation into a named slice: the S1 boot check and R12 measurement, the `public` schema pin, the gated maintenance workflow, the S11 real-image exit decision with R2 (the 2026-10-12 revision moved the R2 decision to S15), binding and lease-serialized capture in S2, and one mutation per guard.
- [x] Mirror the Gate 4 draft state in `handoff.md`, `roadmap.md`, `01-product.md`, `stack-recommendation.md` and `research.md`.
- [x] Fresh documentary checks; results recorded below.
- [ ] Explicit user approval of Gate 4; carried into the [revision checklist](#gate-4-revision-checklist-2026-10-12).

### Gate 4 revision checklist, 2026-10-12

- [x] Read AGENTS.md, the software-factory skill and the gate-folder documents, including the whole Gate 3 test plan and test delta; confirm `main` equals `origin/main` and the remote at `5f6ab39`; create `envoi/gate-4-vision-pyusd` from `envoi/gate-3-vision-pyusd` at `74b1f64` and confirm it with `git branch --show-current`.
- [x] Re-verify the starting state on this Mac: Node 24 now installed, PostgreSQL still absent, ignored credentials absent, repository private, brief hash unchanged.
- [x] Revise `04-slices.md`: merge S11 and S12, drop the Zapier check, move S13 right after S4, add PYUSD as S16 and S17, keep slice IDs stable with an explicit build order, and propose S11 ahead of S9 and S10.
- [x] Assign all 92 named tests and 231 cases once each and the 10 removed names nowhere; place the five basket-lock and abandonment tests two in S2 and three in S16; add 19 named additions, eight with the revision, five with the major review fixes, five with the minor ones and one with the Gate 3 reopening, for 39 in all.
- [x] Revise deltas D1, D2, D3, D5 and D7 as Gate 3 handed them back, add D8, and update the access checks, cut order, checkpoints, exclusions and least confident decisions.
- [x] Mirror the revision in this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md`, `research.md` and the closing status line of `01-product.md`.
- [x] Fail-capable documentary checks and diff inspection, recorded in [the verification below](#gate-4-revision-documentary-verification-2026-10-12).
- [x] Fix the four major findings of the independent review, recorded in [the review fixes](#gate-4-review-fixes-2026-10-12), and rerun the repository checker and its fault harness.
- [x] Fix or disposition the review's minor findings, recorded in [the minor review fixes](#gate-4-minor-review-fixes-2026-10-12), and rerun the checker and its fault harness.
- [ ] Explicit user approval of Gate 4.

### Gate 4 review fixes, 2026-10-12

The user supplied an independent review of this draft that reported four major and many minor findings, and asked for the major ones to be fixed first.
Each fix changes `04-slices.md` and its mirrors only.
No Gate 1-3 decision changes, so no earlier gate reopens.

- **M1, the basket lock under a PYUSD cut:** with the `paypal/start` recheck placed in S16, a PayPal buyer could open a second review of a basket across a republish while the first start was still uncommitted, then start it later.
  A PYUSD cut would therefore have dropped part of Gate 3's `paypal/start` contract without reopening Gate 3.
  The recheck now lands in S7, with a PayPal-only barrier test whose two mutations each fail it on their own.
  The second path, an operator setup command re-run before S7, is closed in D1: `seed-demo-fixture` and `assign-paypal-destination` never change an existing outlet, each with its own test in S1 and S2.
  The review proposed refusing such changes only while a purchase is live.
  Never changing an existing outlet is stricter and has no check-then-write race with a concurrent review; the cost is that the CLI cannot correct a wrong assignment.
- **M2, S5 needed S6:** S6 is now built before S5, and S5 depends on S3 and S6.
  S5 builds `requireOperator`, which Gate 3's authorization table implies but does not declare, and a named addition proves that an anonymous buyer and a merchant without the flag are both refused, with one mutation per guard.
  The refusal is 404 `not_found` rather than the review's suggested 403, because Gate 3's error codes have no operator code and adding one would change a Gate 3 declaration.
- **M3, the double-start proof:** `claimSlot` treats a unique violation as an error, so the concurrency test now proves the row lock alone.
  A direct-insert test proves the partial unique index, as Gate 3's PYUSD attempt constraints group does.
- **M4, the checker record:** the checker and its fault harness now live in the repository under [`checks/`](checks/gate4_check.py), so the record cites evidence anyone can rerun.
  New rules cover approval phrasing variants, build order and cut order across the mirrors, curated prose counts and Gate 3 unit placement.
  The [verification record](#gate-4-revision-documentary-verification-2026-10-12) now claims only what the rules test, and states what they cannot detect.

Named additions rise from 28 to 33: one each in S1, S5 and S7, and two in S2.
The minor findings are not addressed by these fixes, except where a sentence the fixes rewrote had to stay accurate: the additions breakdown in the Test assignment section and the double-start test's two guards.

### Gate 4 minor review fixes, 2026-10-12

The user then asked for the same review's minor findings to be fixed or dispositioned.
Each fix changes `04-slices.md`, its mirrors and the checker only.
No Gate 1-3 decision changes; the one item that would change Gate 3 was left open as delta D10 for the user, who then reopened Gate 3 for it.

1. **S16 needed S17's `recovery.ts`: fixed.**
   S16 now builds `src/domain/pyusd/recovery.ts` with `decideRecoveryStep`'s hint branch, which its group `signature hints and reconcile before expiry` exercises, and S17 builds the rest of the file.
   Until S17, a `prepared` attempt past its bound stays locked, which S16's exit decision already accounts for.
2. **Incomplete "Depends on" lists: fixed.**
   The plan now says a list names every earlier slice whose builds the slice uses.
   S16 adds S4 (`src/lib/ratelimit.ts`), S5 (the runner bundle its static boundary checks read) and S11 (`assertSameOrigin`), and S11 adds S5 (the operator health view).
   A check of every other slice found one more gap: S13's `Origin` test had no named place, and now lives in `src/app/mcp/route.ts`, since `origin.ts` arrives in S11.
   New checker rule R16 now fails when a slice names a curated build token without its builder in its dependency closure.
3. **The D1 operator audit trusted a name: fixed.**
   Both PYUSD acts refuse an account without the operator flag, as Gate 3's authorization table defines the operator, and S17 gains two named additions, one per act, each with its own mutation.
4. **The S11 consent paraphrased Gate 2: fixed.**
   S11 now quotes the four approved short-consent sentences verbatim, including the three dropped qualifiers, and links the Gate 2 copy.
5. **Stale statements: fixed or dispositioned.**
   `roadmap.md` now places PayPal recovery and MCP in 12-25 Oct.
   The `00-status.md` Gate 4 preparation checklist is labeled historical and notes that R2 moved to S15.
   `handoff.md` no longer calls `envoi/gate-4-slice-plan` the current branch.
   `01-product.md` near its top still says "(2026-10-10)" for the draft, because only its closing status line may change; that line now states that the earlier status text is dated history and that it is the current status.
6. **The additions breakdown: verified and updated.**
   Counted by hand against the tables, the earlier 33 were 28 contract tests, three refinements and two falsifiers.
   With the five new additions the plan has 38: 32 contract tests, four refinements and two falsifiers, and this file's Gate 4 line now gives the same three numbers.
   The checker now matches both sentences, requires each to sum, and requires them to agree.
7. **The R2 move was not flagged: fixed.**
   The Gate 4 line above, `handoff.md` and the revision summary of `04-slices.md` now flag it, and it is least confident decision 14.
8. **D8 had no server-side test: fixed.**
   S2 gains `rail pyusd is refused before PYUSD exists`, using Gate 3's existing `pyusd_unavailable` with `rail_disabled`.
   A cut PYUSD now shows its own reason, "PYUSD is not part of this demo", instead of a pending-test reason.
9. **No early PYUSD go/no-go: fixed.**
   A **[hypothesis]** decision point follows S11, or falls on 28 Oct if S11 is not done, and a no-go cuts PYUSD then rather than on 1 Nov.
10. **Unplaced Gate 3 pieces: both fixed, the second through a Gate 3 reopening.**
    The public-route limiter of `src/lib/ratelimit.ts` is now built in S4, with **[hypothesis]** limits proposed as delta D9 and two named additions, one per window.
    PayPal enforcement of `PAYMENTS_ENABLED` is not fixed: Gate 3 checks the flag only for PYUSD, and its PayPal call stacks and error codes have no place for it, so a test would decide a Gate 3 contract.
    Delta D10 recorded the gap; the user then reopened Gate 3 for it, as recorded in [the Gate 3 reopening](#gate-3-reopening-for-the-paypal-kill-switch-2026-10-12), and S2 gains `payments kill switch refuses PayPal start and completion`.
11. **Several sentences on one line: fixed.**
    The rules, the schedule, the cut order, the exclusions and the least confident decisions in `04-slices.md` now hold one sentence per line, apart from a bold label kept with its first sentence and table rows.
12. **"start Slice N" was ambiguous: fixed.**
    Rule 1 makes every authorization name a slice ID, reads any number as the ID, and answers a request without a valid ID, or for a slice whose dependencies are not done, by asking.
    Rules 6 and 7 name the next slice by ID, and the same wording is mirrored here and in `handoff.md`.

Named additions rise from 33 to 38: two in S4, one in S2 and two in S17.
The Gate 3 reopening adds one more in S2, for 39.

### Unresolved review findings

**[verified] Carry-forward record:** the user required the preceding review's findings to remain open through Gate 2, which recorded them without resolving or independently validating them. Gate 3 cross-checked the approved architecture and the review conclusions against primary sources and dispositioned every item in [`03-program-design.md`](03-program-design.md#disposition-of-the-eight-unresolved-review-findings). **Gate 3 approval on 2026-10-07 closes the eight findings as dispositioned. The residual risks they leave behind stay open and are named in the same table.** Where the disposition is a design contract, the contract is approved but not built or tested.

| Finding | Gate 3 disposition | Residual risk |
| --- | --- | --- |
| Free-capacity budgets, bounded polling, complete Actions job overhead, shared quotas and zero-spend controls | Resolved by the capacity-budget table: a monthly figure per shared quota, every-6-hours cadence until quota is confirmed or the repository is public, and a bounded polling contract | R8 polling versus the Render hour budget is unmeasured |
| Cleanup/recovery when database storage exhaustion blocks `DELETE` | Historical image controls are superseded by request-memory import; the 2026-10-11 Gate 3 revision replaces them with one bytes-free row per import and expiry derived on read (re-approved 2026-10-11) | R2 narrows to generic database exhaustion, still blocking payment-state writes; no proven in-app recovery |
| Logical checkout identity across duplicate requests and replacement reviews | Resolved by `CheckoutKey`, a unique partial index and terminal-state-only replacement | none |
| Image capability access versus merchant-session/membership requirements | Historical two-principal resolution is superseded by removal of both capabilities, done in the 2026-10-11 Gate 3 revision (re-approved 2026-10-11); upload/draft reads remain membership-scoped | Image-bearing error/log retention is tested instead by a named leak test with an injected base64 needle |
| Anonymous deletion/linking, durable receipt ownership and payment-record retention | Resolved by `disableDeleteAnonymousUser: true`, `onLinkAccount` creating no membership, and a stated retention rule; **[verified]** the default would delete the receipt owner | none |
| Maintenance's code-level versus credential-enforced PayPal authority | Partly resolved: a `PayPalReadClient` type plus a build-graph test. Credential enforcement is **[unknown]** because Orders v2 scope strings were not reachable from a primary source | R3 the boundary is code-level, not a security boundary against a modified runner |
| Unsupported prior-art/SGQR claims | Resolved by relabeling in `research.md`: the agent-surface gap is now a **[hypothesis]** from a named one-repository bounded search, and the parser surfaces unrecognized tags instead of guessing | none |
| Inconsistent timing definitions | Original clocks remain approved for unaffected paths; the 2026-10-11 Gate 3 revision removes the image clocks and adds request, upload, model, wallet-challenge, rate-age and RPC clocks plus a block-height bound (re-approved 2026-10-11) | R4 scheduled payment recovery stays best effort, not a deadline; no image sweep remains |

Actual account access and integration proofs belong to later authorized slices.
PYUSD is included in planning but disabled until independent proofs; the amendment was re-approved on 2026-10-11.
R6 now includes decoder RAM/CPU; image-churn R7 is superseded by proposed admission/spend-sizing R7a.
All unaffected risk dispositions stand; the 2026-10-11 Gate 3 revision of the affected contracts, re-approved that day, adds PYUSD residuals R13-R18.

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
- 2026-10-11: user asked whether Gate 2 was good, then accepted the five recommended review changes ("make the changes to 1-5"), asked for the OpenAI data-control steps and authorized "once its good, commit and push to main". The changes are browser-side photo shrink, verification by transfer meaning with allowlisted wallet-added instructions, a `confirmed` blockhash, the Phantom Browse phone path and short consent with details. This is not Gate 2 re-approval and authorizes no install, provisioning, spending, wallet/faucet, workflow, deployment or visibility change.
- 2026-10-11: user explicitly re-approved Gate 2 ("gate 2 approved"). Approval accepts the direct-vision and PYUSD amendment, including the five review changes, as a proposal; it establishes no runtime, account, model, wallet or usability evidence and infers no OpenAI data-sharing setting, spend ceiling, model choice or phone proof. In the same message the user authorized publishing the branch and merging it into `main`, and asked for a copy-paste Gate 3 handoff prompt. No Gate 3 approval, application code, install, provisioning, spending, wallet/faucet, workflow, deployment or visibility change is authorized.
- 2026-10-11: user supplied the copy-paste Gate 3 handover as the task: revise only the affected Gate 3 contracts on a new branch, mirror them, run fail-capable checks and ask `Approve Gate 3, or what should change?`.
  The revision is drafted on `envoi/gate-3-vision-pyusd`.
  This is preparation, not Gate 3 approval; no commit, push, install, provisioning, OpenAI call, wallet, faucet, transaction, spending, workflow, deployment or visibility change is authorized, and the OpenAI data-sharing setting, spend ceiling, models and faucet access are not inferred.
- 2026-10-11: user reviewed the drafted Gate 3 revision and gave verdicts on six of its least confident calls, as review decisions, not Gate 3 approval:
  1. Rail-independent basket lock: keep the idea, but fix its trigger (fix A).
  2. Per-item blanks for non-SGD or duplicate menu items: agreed, keep.
  3. `PYUSD_ENABLED=false` stops only new PYUSD actions, and recovery of prepared attempts continues: agreed, keep.
  4. Non-upgradeable memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`: agreed, keep.
  5. No Lighthouse memory instructions (discriminators 0 and 1): keep as written; it is tested at PYUSD enablement under R13, not now.
  6. Test count: reduce named tests and test compute by batching (fix K), without weakening one guard, one mutation.
  In the same message the user required fixes A-K, stated that none reopens Gate 2, and authorized editing only `03-program-design.md` and its five mirrors.
  It authorized no Gate 3 approval, edit to AGENTS.md, Gate 1, the mockups, Gate 2 or Gate 4, application code, install, provisioning, OpenAI call, wallet, faucet, RPC call, spending, commit or push.
- 2026-10-11: after the report on fixes A-K, the user wrote "fix then then reopen gate 2 and approve the fixes i approve it already then once ure done publish gate 3, merge and push to main".
  This reopened Gate 2 for the two PYUSD double-payment findings and re-approved their fixes in advance: bytes released once and never stored, and a window scan of every attempt that records extra transfers.
  It authorized fixing Gate 3 to match and publishing this work by committing it, merging it into `main` and pushing.
  It is not Gate 3 approval: Gate 3 still awaits `Approve Gate 3, or what should change?`, and the four deviations flagged with fixes A-K have no recorded verdict.
  It authorized no application code, install, provisioning, OpenAI call, wallet, faucet, RPC call, spending, workflow, deployment or visibility change.
- 2026-10-11: user explicitly re-approved Gate 3 ("Yes approve commit the branch and push and merge to main").
  Approval accepts the revised `03-program-design.md` as written, with fixes A-M, the four deviations flagged with fixes A-K and the test delta, as a proposal; it establishes no runtime, account, model, wallet, phone or usability evidence.
  In the same message the user authorized committing the branch, pushing it and merging it into `main`.
  It does not authorize Gate 4 approval, application code, install, provisioning, OpenAI call, wallet, faucet, spending, workflow, deployment, visibility change or setting `PYUSD_PROOFS.automaticUnpaidRelease`.
- 2026-10-12: user said "Next is the Gate 4 revision of 04-slices.md: reassign the tests to slices using the delta in 03, and update the slice order and cut order. Go ahead and start".
  This authorized drafting the Gate 4 revision on a new branch, `envoi/gate-4-vision-pyusd`, mirroring it and asking `Approve Gate 4, or what should change?`.
  It is not Gate 4 approval, and it authorized no commit, push, merge, slice start, install, provisioning, OpenAI call, wallet, faucet, RPC call, spending, workflow, deployment or visibility change.
- 2026-10-12: the user supplied an independent review of the Gate 4 draft and said "Please go ahead and fix all the major issues first. Then once ure done, let me know then we can start on the minor ones."
  This authorized fixing the four major findings in `04-slices.md` and its mirrors; keeping the checker in the repository is the fix chosen for M4, and it stays uncommitted.
  The minor findings wait for the user.
  It is not Gate 4 approval, and it authorized no commit, push, merge, slice start, install, provisioning, OpenAI call, wallet, faucet, RPC call, spending, workflow, deployment or visibility change.
- 2026-10-12: the user supplied a task prompt to fix or disposition the review's minor findings, without redoing the four major fixes, and to finish by asking `Approve Gate 4, or what should change?`.
  This authorized editing `04-slices.md`, its mirrors, the closing status line of `01-product.md` and the two checker files.
  It required stopping to ask before changing any Gate 1-3 decision, which is why delta D10 was left open.
  It is not Gate 4 approval, and it authorized no commit, push, merge, slice start, install, provisioning, OpenAI call, wallet, faucet, RPC call, spending, workflow, deployment or visibility change.
- 2026-10-12: the user said "Add the check to paypal/start and paypal/complete, add an error code such as payments_disabled, and add a named test with its own mutation. One small Gate 3 reopening before S2. Then once ure done, let me know then i can approve and we can commit the working tree and merge to main and push to main".
  This reopened Gate 3 for that change only and authorized editing `03-program-design.md` for it, with its mirrors and the checker.
  It is not Gate 3 re-approval or Gate 4 approval, and it does not yet authorize the commit, merge or push, which the user tied to approving first.

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

### Gate 2 review revision documentary verification, 2026-10-11

- **[verified] Documentary checker:** reran the earlier checker from a scratch copy as `python3 -I <scratch>/doccheck.py docs/plans/envoi /Users/jayd0/Desktop/envoi`.
  It passed 54 local links (42 anchored), all 54 Gate 3 tests assigned exactly once, the Gate 2 question and pending-state guard, no em dashes in the added lines and the secret self-test (11 of 11 needles, 8 public-address controls).
- **[verified] Fail-capability:** on scratch copies compared with the preceding commit's documents, a pristine copy passed and each planted fault failed on its own run: an em dash, a broken anchor, a false Gate 2 re-approval, an OpenAI key shape and a removed approval question.
- **[verified] Scope:** this revision changed only `02-architecture.md`, `00-status.md`, `handoff.md`, `research.md`, `roadmap.md` and `stack-recommendation.md`.
  AGENTS.md, Gate 1, the mockups, Gate 3 and Gate 4 are byte-identical to the preceding commit, and `git diff --check` passed.
- **[verified] Sources:** Phantom's Lighthouse and priority-fee pages, the Lighthouse repository README, Solana's confirmation guide and OpenAI's data page were read in this run and are recorded as research items 13-17.
  No OpenAI API call, wallet, faucet, RPC request, install, provisioning or deployment occurred.
- **Git:** the earlier uncommitted work and this revision were committed as separate concerns under the user's 2026-10-11 authorization; a record cannot contain its own commit SHA, so Git history and the remote are the evidence.
- **What this does not establish:** no runtime, account, model, wallet, browser-shrink, phone or usability evidence.

### Gate 2 re-approval record verification, 2026-10-11

- **[verified] Documentary checker:** the scratch checker's approval rules now require the exact Gate 3 question, reject a false Gate 3 approval and require the recorded 2026-10-11 Gate 2 re-approval; it passed with all local links and anchors resolving, all 54 Gate 3 tests still assigned once, no em dashes in added lines and the secret self-test intact.
- **[verified] Fail-capability:** on scratch copies compared with the preceding commit, a pristine copy passed and each planted fault failed on its own run: a false Gate 3 approval, a removed Gate 3 question, a removed Gate 2 re-approval record, a broken Gate 3 handover anchor and an em dash.
- **[verified] Scope:** recording the approval changed status text in `00-status.md`, `01-product.md`, `02-architecture.md`, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md`, and added the Gate 3 handover to `handoff.md`; no product or architecture decision changed, and `git diff --check` passed.
- **What this does not establish:** no runtime, account, model, wallet or usability evidence, and no Gate 3 approval.

### Gate 3 revision documentary verification, 2026-10-11

Checks ran with one-off Python scripts in the session scratchpad, not repository files, against a baseline exported from `main` at `9b4796b` with `git archive`.
The checker was rewritten for this gate because the earlier scratch checker carried Gate 2 approval rules.

- **[verified] Links and anchors:** 73 local links, 60 of them anchored, all resolve.
- **[verified] Gate 4 assignment kept and delta exact:** the unchanged `04-slices.md` still assigns each of the 54 baseline Gate 3 tests exactly once.
  The revised plan has 192 unique names, exactly the 54 baseline names minus the 7 removed plus the 145 added that the [test delta](03-program-design.md#test-delta-for-the-gate-4-revision) lists, and its stated counts agree.
  Every added test has a non-empty mutation plan, and no two added tests share one.
- **[verified] Writing:** zero em dashes in the added lines of all gate Markdown and HTML, counting named, decimal and hexadecimal entity forms.
  Added prose was split to one sentence per line; table rows and code blocks are excepted.
- **[verified] Secrets:** the scanner's self-test detected 11 of 11 planted needles, each owned by exactly one rule; 12 public controls (the pinned program, mint and genesis addresses, a loader id, the Lighthouse commit id and 32- and 44-character boundaries) raised nothing; no secret-shaped value exists in the added lines or in any full gate document.
- **[verified] Gate state:** `00-status.md` and `handoff.md` carry the exact question `Approve Gate 3, or what should change?`.
  No Gate 3 approval is claimed by the Gate 3 status line, the revision checklist, the approval history, the `03-program-design.md` header or the `handoff.md` title, and the Gate 2 re-approval record is intact.
- **[verified] Scope:** `AGENTS.md`, `01-product.md`, `02-architecture.md`, `04-slices.md` and all seven mockup files are byte-identical to `main`.
  Removed contract identifiers in `03-program-design.md` appear only in lines that record their removal.
  The diff is six gate documents; `git diff --check` is clean; nothing is staged or committed.
- **[verified] Fail-capability:** on scratch copies, a pristine copy passed and 40 planted faults each failed with only their own rule reported: a missing link target, a broken anchor, a removed and a duplicated Gate 4 assignment, an unlisted new test, a removed test still present, a wrong removed count, a wrong summary, a duplicated test name, an empty and a shared mutation plan, a literal, a named-entity and a decimal-entity em dash, a planted key shape, each of the 11 secret rules disabled in turn, the question removed from either file, six false or missing approval records, a change to each of five protected files, and a live removed clock name.
- **Defects found and fixed during the run, preserved here:** the first sentence-splitting pass treated numbered-list markers such as "6." as sentence ends; its own diff showed the damage, the six files were restored from the pre-split copies, the splitter was fixed to skip the marker, and the rerun was inspected.
  A review of the new guards then found checks with two deciding call sites or no test: the PYUSD flag at preparation, the merchant account recheck at preparation, `Origin` and guard presence on the new PYUSD routes, the RPC call timeout, slot reclaim, the scan lease on the web path and the photo part's declared type.
  Each was fixed by removing the duplicate check or naming a test, which raised the added tests from 139 to 145 before the final run.
- **[verified] External reads only:** dated npm registry documents and tarballs, the Lighthouse repository at a pinned commit, and two read-only devnet RPC calls (`getGenesisHash`, `getMultipleAccounts`), all recorded in [`research.md`](research.md#gate-3-revision-reads-2026-10-11).
  No package was installed, and no OpenAI call, wallet, faucet, airdrop, transaction, provisioning, workflow, deployment, commit or push occurred.
- **What this does not establish:** no runtime, account, model, image, wallet, phone or usability evidence, and no Gate 3 approval.

### Gate 3 review revision documentary verification, 2026-10-11

Checks ran in a fresh session with one-off Python scripts in the session scratchpad, not repository files.
They compared the documents with the `git archive` export of `main` at `9b4796b` and with a copy of the gate documents taken before fixes A-K.
The checker is the previous run's checker with its approval rules unchanged and the changes listed under defects below.

- **[verified] Links and anchors:** 80 local links, 67 of them anchored, all resolve, including this section's anchor from the revision checklist.
- **[verified] Test plan and delta:** the plan has 90 named tests, which are 69 standalone tests and 21 groups, and 225 cases.
  Every case has a non-empty assertion and mutation, no case name is used twice, and every group header states its row count.
  Each of the 225 cases appears exactly once in the delta mapping, and each of the 199 previous names (54 approved, 145 drafted) appears exactly once.
  Recomputed from the mapping, the stated breakdown holds: 8 removed, 63 kept standalone, 128 grouped (119 same name, 1 renamed, 8 split into 29 rows) and 13 cases added.
  The plan and delta region equals the generator's output apart from one separator line, so it was not edited by hand.
  `04-slices.md` is byte-identical to `main`, so its 54-name assignment check is expected to fail until Gate 4 applies the delta.
- **[verified] Writing:** no em dash in any added line of the gate Markdown and HTML, counting the named, decimal and hexadecimal entity forms.
  A sentence scan of every line the review revision added found no prose line holding two sentences; table rows, headings and code blocks are excepted.
- **[verified] Secrets:** the self-test detected 11 of 11 planted needles, each owned by exactly one rule, and 12 public controls raised nothing.
  No secret-shaped value is in an added line or in any gate document.
- **[verified] Gate state:** `00-status.md` and `handoff.md` carry the exact question `Approve Gate 3, or what should change?`.
  No Gate 3 approval is claimed by the Gate 3 status line, the revision checklist, the approval history, the `03-program-design.md` header or the `handoff.md` title, and the Gate 2 re-approval record is intact.
- **[verified] Removed identifiers:** `lighthouse_not_executable`, `signatureHint` and `verify_hint_then_wait` are absent from `03-program-design.md`, and `T_MENU_MODEL_MAX` appears only in the one sentence that records the rename.
- **[verified] Fail-capability:** a pristine scratch copy passed, and each of 43 planted faults failed with only its own rule reported:
  - links: a missing link target and a broken anchor;
  - writing: a literal, a named-entity and a decimal-entity em dash;
  - secrets: a Postgres URL with a password, an OpenAI key shape, and each of the 11 secret rules disabled in turn;
  - gate state: the question removed from `00-status.md` and from `handoff.md`, `RE-APPROVED` in the Gate 3 status line, the approval box ticked, a false "approved Gate 3" history line, an approval claim in the `03-program-design.md` header and in the `handoff.md` title, and the Gate 2 re-approval record removed;
  - plan and delta: a plan case missing from the mapping, a duplicated mapping entry, a new plan row left unmapped with every count updated to match, a previous name deleted from the mapping, a wrong count in `roadmap.md`, a wrong removed count in the delta, a wrong group size, an empty mutation and one case name used in two places;
  - protected files: a change to `02-architecture.md`, `01-product.md`, `04-slices.md`, a mockup and AGENTS.md;
  - removed identifiers: `lighthouse_not_executable` reintroduced, and a live `T_MENU_MODEL_MAX` in the clock table and on the line that records the rename.
- **[verified] Whitespace:** `git diff --check` is clean on the repository.
  In a scratch Git repository it passed on a clean file and failed on a planted trailing space.
- **[verified] Scope:** the review revision changed `03-program-design.md`, this file, `handoff.md`, `roadmap.md` and `stack-recommendation.md`; `research.md` is byte-identical to the pre-review draft.
  `01-product.md`, `02-architecture.md`, `04-slices.md` and all seven mockup files are byte-identical to `main`.
  `git diff` against `main` also lists AGENTS.md, which carries an uncommitted 20-line "Context transfer" section saved after the revision's last edit and not written by it.
  This run left AGENTS.md byte-identical, and including it in any commit is the user's decision.
  Nothing is staged or committed.
- **Defects found and fixed during the run, preserved here:**
  The rename rule exempted any line that mentioned an earlier draft, so a live `T_MENU_MODEL_MAX` planted on the line that records the rename passed; the rule now exempts only that exact phrase.
  The stated delta breakdown and group sizes were not checked; both rules were added, and the breakdown is compared only when the mapping is well formed, so a mapping fault reports only its own rule.
  AGENTS.md is compared with a copy taken at the start of this run instead of `main`, because of the edit described under scope.
- **External reads:** none.
  No package was installed, and no OpenAI call, wallet, faucet, RPC call, transaction, provisioning, workflow, deployment, commit or push occurred.
- **What this does not establish:** no runtime, account, model, image, wallet, phone or usability evidence, no judgment of the design beyond these documentary rules, and no Gate 3 approval.

### Gate 2 reopening and fixes L-M documentary verification, 2026-10-11

Checks ran with the scratch checker and planted-fault harness of the review revision verification above, extended for this round.
They compared the documents with `main` at `9b4796b`, and the sentence scan compared them with the A-K commit on this branch.

- **[verified] Links and anchors:** 88 local links, 75 of them anchored, all resolve.
- **[verified] Test plan and delta:** 92 named tests, which are 71 standalone tests and 21 groups, and 231 cases, generated from the same data model as before and spliced without hand edits.
  Each of the 231 cases appears exactly once in the delta mapping, and each of the 199 previous names appears exactly once.
  Recomputed from the mapping, the stated breakdown holds: 10 removed, 63 kept standalone, 126 grouped (116 same name, 2 renamed, 8 split into 29 rows) and 21 cases added.
  The current-state lines in this file, `handoff.md` and `roadmap.md` state 92 named tests and 231 cases.
- **[verified] Gate state:** the exact question `Approve Gate 3, or what should change?` is in this file and `handoff.md`, and no Gate 3 approval is claimed where the checker looks.
  Both Gate 2 re-approval records are intact, the second in the Gate 2 status line, the approval history and `02-architecture.md`.
- **[verified] Removed identifiers:** `unsignedWireBase64`, the `existing` preparation kind and Gate 2's re-release sentence are gone.
  The old name `repeated preparation returns the same bytes` appears only as a previous name in the delta and in the line recording its rename.
- **[verified] Writing and secrets:** no em dash in any added line, and the secret self-test detected 11 of 11 needles while 12 public controls raised nothing.
  The sentence scan of every line added since the A-K commit first flagged four bold labels ending in a period; they became colon labels, and the rescan found no line holding two sentences.
- **[verified] Fail-capability:** a pristine scratch copy passed, and each of 52 planted faults failed with only its own rule reported.
  They are the faults of the review revision verification, less the change to `02-architecture.md`, which Gate 2's reopening removed from the protected files.
  Ten are new: the second Gate 2 record removed from the approval history, from the Gate 2 status line or from `02-architecture.md`; `unsignedWireBase64`, the `existing` kind, Gate 2's re-release sentence or the old test name reintroduced; a stale count in this file's Gate 4 line or in `handoff.md`; and `03-program-design.md` stating no current named-test count.
  `git diff --check` is clean on the repository, and in a scratch Git repository it failed on a planted trailing space.
- **[verified] Scope:** this round changed `02-architecture.md`, reopened by the user, plus `03-program-design.md`, this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md` and `research.md`.
  `01-product.md`, `04-slices.md` and all seven mockup files are byte-identical to `main`, and AGENTS.md is byte-identical to its state at the start of this run and stays out of every commit.
- **Checker changes in this round:** `02-architecture.md` left the protected files, the second Gate 2 record became required, and the removed re-release identifiers were added.
  Because 90 and 225 survive as historical counts in the review revision record, a listed number alone no longer proves a count is current, so each current-state line must now state the current counts.
- **Defects found and fixed during the run, preserved here:** the first harness run failed two faults.
  A stale `90 named tests` in `handoff.md` passed because the count rules matched text, so "92 named tests" was found inside "192 named tests"; the same flaw had made the earlier check that `03-program-design.md` states its named-test count vacuous.
  The rules now require a digit boundary, and a new fault that leaves 03 with only other allowed counts proves the presence check alone.
  A duplicated delta entry also failed the mirror count rule, because that rule took the added count from the damaged mapping; mirrors are now checked against the added count 03 states, which the breakdown rule ties to the mapping.
- **External reads:** none.
  No package was installed, and no OpenAI call, wallet, faucet, RPC call, transaction, provisioning, workflow or deployment occurred.
- **Git:** the user authorized committing this work, merging it into `main` and pushing; a record cannot contain its own commit, so Git history and the remote are the evidence.
- **What this does not establish:** no runtime, wallet or usability evidence, and no Gate 3 approval.
  That Phantom's additions differ between two signings is a hypothesis, and that every landing of a released transaction falls inside its window rests on the blockhash-preservation proof that enablement already requires.

### Gate 3 re-approval record verification, 2026-10-11

- **[verified] Documentary checker:** its gate rules now require the Gate 3 re-approval in the status line, the ticked checklist item, the approval history, the `03-program-design.md` header and the `handoff.md` title, and reject a Gate 4 approval claim.
  It passed with every local link and anchor resolving, 92 named tests and 231 cases mapped exactly, no em dash in added lines and the secret self-test intact.
- **[verified] Fail-capability:** on scratch copies a pristine copy passed and each of 10 planted faults failed with only its own rule: each of the five approval records removed or reverted, a false Gate 4 approval in the status line and in the history, an em dash, a wrong count and a change to `04-slices.md`.
- **[verified] Scope:** recording the approval changed only status text in the six gate documents already in this branch's diff and in `02-architecture.md`; no contract changed, `git diff --check` passed, and AGENTS.md stays out of the commit.
- **What this does not establish:** no runtime, account, model, wallet or usability evidence, and no Gate 4 approval.

### Gate 4 revision documentary verification, 2026-10-12

Rewritten after the [review fixes](#gate-4-review-fixes-2026-10-12), and updated after the [minor review fixes](#gate-4-minor-review-fixes-2026-10-12).
The first version of this record said the build order check proved "every dependency is built earlier" and cited a checker kept only in a session scratchpad; the review showed that the rule checks only listed dependencies and that nine realistic faults passed it.

- **[verified] Checker:** [`checks/gate4_check.py`](checks/gate4_check.py), SHA256 `3608b117...340ce085`, passes on this folder against `main`.
  Run it from the repository root with `python3 -I docs/plans/envoi/checks/gate4_check.py docs/plans/envoi . main`.
  Its sixteen rules check:
  - R1: every local link and anchor resolves.
  - R2 and R3: each of Gate 3's 92 named tests, 21 groups and 71 standalone tests, is assigned once with its Gate 3 case count, for 231 cases, and the Test assignment table matches the assigned lines and Gate 3's totals.
  - R4 and R5: the 38 named additions are unique, distinct from Gate 3 names, each has a mutation cell and they are counted per slice; the ten names the Gate 3 delta removed appear nowhere in the slice plan.
  - R6: the plan table, the slice sections, the assignment table and this file's checklist give one build order, and every listed dependency comes earlier.
  - R7 and R8: no em dash, literal or entity, in an added line of the gate folder's Markdown, HTML or Python; no secret shape in the added lines, any gate document or the checker sources, with a self-test whose needles are assembled at run time.
  - R9: Gate 4 is in progress, the exact question is in this file and `handoff.md`, and a sentence heuristic finds no approval word attached to Gate 4 or the slice plan unless it is negated, conditional or the question.
    While Gate 3's 2026-10-12 reopening is in the tree, this file's Gate 3 line must say it is reopened and in progress, and the exact Gate 3 question must be here and in `handoff.md`.
  - R10 to R12: `02-architecture.md` and the mockups are byte-identical to `main`, `03-program-design.md` is identical to `main` or to the reviewed reopening text pinned by SHA256 `d5f9e3c1...e4171c15`, `01-product.md` differs only in its closing status line, superseded image and Zapier tokens are absent, and every mirror names S16 and S17.
  - R13: every sentence that states a cut order agrees with the numbered cut order in `04-slices.md`, and so does each "first, second or third in the cut order" line of this file's checklist; seven such sentences exist.
  - R14: 20 curated count claims in `04-slices.md`, this file, `handoff.md`, `roadmap.md` and Gate 3 match the counts computed from Gate 3 and the plan, including the `handoff.md` build order, the 25 Oct checkpoint's slice list and the additions breakdown, whose parts must sum and must agree between `04-slices.md` and this file's Gate 4 line.
  - R15: every Gate 3 test runs in the slice its Gate 3 unit heading names; core tests keep the slice the `main` draft gave them.
  - R16: for nine curated build tokens, such as `src/lib/http/origin.ts`, `src/lib/ratelimit.ts` and `GET /health/operator`, the first slice whose **Builds.** names a token builds it, no earlier slice names it, and every later slice that names it reaches the builder through "Depends on"; eight such uses exist.
- **[verified] Fail-capability:** [`checks/gate4_prove.py`](checks/gate4_prove.py), SHA256 `cb630b44...7ffc0453`, ran 71 cases on scratch copies, and all 71 behaved as expected.
  Run it with `python3 -I docs/plans/envoi/checks/gate4_prove.py docs/plans/envoi . main <scratch dir>`.
  A pristine copy passed, and disabling each of the 11 secret patterns failed R8 alone.
  Of 59 planted faults, 56 failed exactly their own rule, the review's moved S17 recovery group failed R14 and R15, the two rules it breaks, and two pass by design as recorded limits.
  The review's nine major-finding faults are all in the harness: eight are detected, and the ninth, S6 dropped from S7's "Depends on", passes because S7 names none of R16's tokens.
  Nine faults cover the minor fixes: S11, S4 or S5 dropped from a dependency list and the limiter named before S4 each fail R16; a mismatched breakdown, an unsummed contract split or a miscounted minor-fix total fails R14; and an operator-flag addition without its mutation fails R4.
  Five faults cover the Gate 3 reopening: an edit to the reopened Gate 3 text fails R10, the Gate 3 question missing from `handoff.md` or a Gate 3 line claiming re-approval fails R9, a miscounted D10 part fails R14, and the kill-switch addition without its mutation fails R4.
  The second recorded limit is minor finding 1 itself: deleting S16's hint branch of `recovery.ts` passes, because once S16 no longer names the file, no rule knows S16's tests need it.
- **What the checker cannot detect:** an incomplete dependency list where the section does not name one of R16's tokens; a need a section does not name at all, such as S16's tests needing `decideRecoveryStep`; which additions are contract tests and which are refinements; approval claims phrased outside R9's heuristic, and any Gate 3 re-approval claim outside this file's Gate 3 line; counts outside R14's curated claims; one sentence per line; and whether any contract, test, mutation or quoted copy is correct.
  It supports only the documentary claims above.
- **Defects found during the minor fixes, preserved here:** the first draft of `handoff.md`'s summary named the PYUSD go/no-go before the cut order, which made R13 read PYUSD first in that sentence and blinded the "handoff cut order contradicts 04" fault; the sentence now names the cut order first.
  Two first-draft R16 faults were wrong, not the rule: one moved the limiter into S2's own Builds, which makes S2 its builder, and one removed only the file name while S16 still named `decideRecoveryStep`.
- **Defects found while building it, preserved here:** the first run flagged the checker's own em dash constant and its own entity pattern, which are now built from escapes and fragments.
  The approval heuristic first flagged nine legitimate sentences, such as the phrase "approved Gate 2 forbids" and a prerequisite in a "Depends on" table cell.
  It now attaches each approval word to one gate mention and skips "Depends on" cells, and the review's three approval phrasings and two new ones still fail it.
  The S16 count claim first matched nothing, because its pattern did not accept the hyphenated "Twenty-eight".
- **[verified] Scope:** `git diff --check` is clean.
  Against `HEAD`, the changed files are `03-program-design.md`, for the Gate 3 reopening only, `04-slices.md`, this file, `handoff.md`, `roadmap.md`, `stack-recommendation.md`, `research.md` and the closing status line of `01-product.md`, and the only untracked files are the two under `checks/`.
  AGENTS.md is byte-identical to `HEAD` (`74b1f64`), which differs from `main` only by your own commit of its "Context transfer" section.
  `docs/plans/PAYPAL_PLAN.md` is unchanged and still hashes to `6058798E...`.
  Nothing was staged, committed, pushed, installed or provisioned.
- **External reads:** none in the review-fix runs; the revision run made one `git ls-remote` and one unauthenticated GitHub API read confirming the repository is private.
- **What this does not establish:** no runtime, account, model, wallet or usability evidence, no measured effort behind the schedule, and no Gate 4 approval.
