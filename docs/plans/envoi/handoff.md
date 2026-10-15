# Envoi: Gates 1-4 approved, S1, S2 and S3 done, ready for S4

Updated 2026-10-13.
Gate 1 was re-approved on 2026-10-10; do not redo it.
`02-architecture.md` was revised for direct vision import and PYUSD only, revised again after a 2026-10-11 review, and re-approved by the user on 2026-10-11 ("gate 2 approved").
It was reopened again the same day for two PYUSD double-payment fixes and re-approved for them, the user having approved the fixes in advance.
The Gate 3 revision of affected contracts was drafted on 2026-10-11 on branch `envoi/gate-3-vision-pyusd`, following the [Gate 3 handover](#gate-3-handover-2026-10-11), revised the same day after the user's review (fixes A-K) and for fixes L and M, and re-approved by the user on 2026-10-11 ("Yes approve commit the branch and push and merge to main").
On 2026-10-12 the user reopened Gate 3 for one change, a PayPal check of `PAYMENTS_ENABLED` with the error code `payments_disabled`, and re-approved it the same day.
The Gate 4 revision of `04-slices.md` was drafted on 2026-10-12 on branch `envoi/gate-4-vision-pyusd` and approved by the user on 2026-10-12 ("I approve both pls publish the branches and commit all the changes to main so that we can proceed with the first slice"); the user authorized committing it and merging it into `main`.
All unaffected 2026-10-07 approvals stand, including Render Free/Neon Free/in-app Better Auth/GitHub Actions, PayPal recovery, identity-only scan, MCP, R11 and R12.
The application runs on Render Free with the S2 PayPal sandbox payment and S3's PayPal recovery and verified webhook inbox; their evidence is in status.
On 2026-10-11 the user authorized committing this work, publishing its branch and merging it into `main`; Git publication is not gate approval.

Workspace: `/Users/jayd0/Desktop/envoi` on macOS (arm64) since 2026-10-10; Gates 1-3 ran at `C:\Users\jayd0\OneDrive\Desktop\envoi` on Windows. An earlier revision of this file recorded `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`; that path is stale and is corrected here. No decision depended on it.
Skill: `/Users/jayd0/.claude/skills/software-factory/SKILL.md` on macOS; `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md` on Windows.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve the body of `docs/plans/PAYPAL_PLAN.md` unchanged; it carries a supersession banner added 2026-10-07, and both the pre-banner and post-banner SHA256 values are recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: approved Gate 1 product scope with buyer/merchant journeys, rules, sponsor roles, both buyer entry points (text and scan) and an untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers. `buyer.html` shows the text entry point and the scan entry point including an unenrolled-sticker result.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief, prior-art findings from shipped SGQR payment products, the 2026-10-07 Gate 3 source cross-check, and unresolved proof requirements.
- `02-architecture.md`: Gate 2 amendment re-approved 2026-10-11, and re-approved again the same day for two PYUSD double-payment fixes; complete direct-vision and PYUSD boundaries, with unaffected approved decisions preserved.
- `03-program-design.md`: 2026-10-07 approved contracts plus the 2026-10-11 revision of the import and PYUSD contracts, revised after the user's review and for fixes L and M the same day, re-approved on 2026-10-11.
  Reopened 2026-10-12 for the PayPal kill switch only (Gate 4 delta D10) and re-approved the same day; see its [reopening section](03-program-design.md#reopening-2026-10-12-paypal-payments-kill-switch).
  The source row, capabilities, image clocks and image tasks are removed; provider pin and unaffected contracts stand.
  Its [test delta](03-program-design.md#test-delta-for-the-gate-4-revision) lists what Gate 4 must reassign.
- `stack-recommendation.md`: mirror of the revised architecture and unaffected Gate 3 pins; not approval authority.
- `04-slices.md`: **Gate 4 slice plan, revised and APPROVED 2026-10-12.** Sixteen slices under stable IDs in the build order S1, S2, S3, S4, S13, S6, S5, S7, S8, S11, S9, S10, S16, S17, S14, S15, with S12 merged into S11; all 92 named tests and 231 cases of the re-approved Gate 3 assigned once each, plus 39 named additions; Gate 3 deltas D1-D10; access checks; per-slice authorizations; two checkpoints and the cut order PYUSD, scan, S14, plus a go/no-go on PYUSD after S11; and least confident decisions.
  Flagged for review because the user did not ask for them, and accepted with the approval: S11 ahead of S9 and S10, the PayPal basket lock in S7 with its `paypal/start` recheck, the R2 storage-exhaustion decision moved from S11 to S15, the 1 Nov checkpoint, the PYUSD go/no-go, D8 and D9's public-route limits.
  An independent review on 2026-10-12 found four major issues, all fixed in the draft as recorded in [`00-status.md`](00-status.md#gate-4-review-fixes-2026-10-12).
  Its minor findings are fixed or dispositioned as recorded in [the minor review fixes](00-status.md#gate-4-minor-review-fixes-2026-10-12); for delta D10 the user reopened Gate 3, and S2 gains `payments kill switch refuses PayPal start and completion`.
- `roadmap.md`: updated discussion candidates and proof conditions; not a revised Gate 4 order or approval.
- `00-status.md`: current approvals, the Gate 3 cross-check results, the findings disposition table, evidence boundary and fresh checks. The older JPG preview is historical; current HTML is authoritative for review.

## Product scope to preserve

Visitors with PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, menu, authority and connected destinations. Buyers use text or scan/paste, review the exact basket/costs, externally approve and receive an honest status; merchant acknowledgment is separate.

Buyers have two entry points, added 2026-10-07: a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only — it is not payment authority, not a payment destination, and it cannot enroll a shop. An unenrolled sticker yields no purchase and offers text search instead. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it so a scan resolves one location.

PayPal first; PYUSD only after independent proof. Since 2026-10-10 (re-approved with Gate 1 on 2026-10-10) PYUSD is in the hackathon plan, built after PayPal and cut first, at a PYUSD rate the merchant sets, shows with its date and re-confirms every 30 days. One rail per order. Changed items, amount, recipient, currency or rail require fresh approval. Pending/uncertain is not paid; reconcile before retrying. No custody or buyer private keys. PYUSD does not imply automatic SGD settlement.

Merchants upload both SGQR and a separate menu image. SGQR contains no menu and proves no ownership; decode only supported identifiers present and allow correction. An AI model drafts menu names/SGD prices while the merchant waits (revised 2026-10-10 from AI by Zapier, re-approved with Gate 1 on 2026-10-10), and Envoi does not keep the photo once the draft returns; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry on failure; no guessed prices or auto-publication. This supersedes manual-only menus.

Propose APIMatic account-supported tooling and Render hosting; Zapier is removed and AG Grid remains optional.
The revised import has no Envoi image storage/history, but OpenAI retention still needs disclosure and account confirmation.
Access, prizes, extraction and payment execution remain unproven; live launch needs separate provider/legal/enrollment/operations checks.

Proposed target remains 4 of 5 first-time buyers completing an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with an external payment record matching the approved purchase. Record each tester's entry point, text or scan. It has not been tested.

## Next authorized action

**Next action: S8, only when the user authorizes S8 by its slice ID, such as "start S8", as rule 1 of `04-slices.md` says.**
The S7 review fixes (2026-10-15) redeem a handoff made before a republication by item key, fix the trigger search paths in migration 0018, stop a `paypal/start` deadlock, prove or remove each guard the review found unproven, replace the approve card in place after a stale-review refusal and record Gate 2's PayPal provider check as a deviation; 12 of 12 new mutations and 20 of 20 S7 mutations pass; migration 0018 is on Neon and the fixes are on `main`; see [`00-status.md`](00-status.md#s7-review-fixes-2026-10-15).
S7 is done (2026-10-14): Test Shop, the user's demo merchant outlet, is published on Render after its four preconditions held, and a buyer paid S$5.50 to sandbox seller `EQN6264CF9F4Y` in the PayPal sandbox; editing a published menu creates an unpublished revision, a review pinned to a replaced revision or a changed destination fails at `paypal/start` with `review_invalidated`, and the PayPal basket lock is checked at review creation and again inside `paypal/start` after locking the buyer's same-basket purchases; migration 0017 adds the S6 advisory triggers; 21 of 21 mutations pass; the deployed stale-review refusal is user-reported and not shown on Neon; see [`00-status.md`](00-status.md#s7-merchant-destination-and-publication-2026-10-14).
S5 is done (2026-10-14): two manual runs of the compiled maintenance runner on a disposable local database turned the S3 harness's uncertain capture into paid through a read-only PayPal FIXTURE, closed an expired review, purged an expired session and exited 0; the build-graph check shows the runner cannot reach the capture module; only an operator flagged with `grant-operator` sees `/operator/health`, and everyone else gets the not-found page; `envoi_maintenance` and migrations 0014 and 0015 are on Neon; 26 of 26 mutations pass; see [`00-status.md`](00-status.md#s5-maintenance-runner-manual-runs-and-operator-health-view-2026-10-14).
The runner runs locally only, by the user's choice, so the deployed view shows no heartbeat until S15 creates the scheduled workflow.
The S5 review fixes (2026-10-14) rotate maintenance claims so no due attempt starves, stop a timed-out task from taking more work, count only real checks, alert the operator at 70% storage, run the scripts through symlinks and spaces, and answer non-operators on `/operator/*` and unknown `/api/v1` paths exactly as unknown addresses; 38 of 38 S5 mutations pass; see [S5 review fixes](00-status.md#s5-review-fixes-2026-10-14).
S6 is done (2026-10-14): the user made a demo merchant with `create-merchant` and `approve-membership`, signed in on Render at `/merchant/setup` from a browser holding a buyer receipt (warned first; the purchase stays owned by its buyer session, the merchant gains nothing and that browser can no longer open the receipt), created the unpublished outlet "Test Shop", and a blank price blocked confirmation until it was filled and version 3 was confirmed; buyers cannot see the draft or reach any merchant route; its evidence and 25 of 25 mutations are in [`00-status.md`](00-status.md#s6-merchant-sign-in-and-manual-menu-draft-2026-10-14).
The S6 review fixes (2026-10-14) stop a blank setup page after a failed draft load, prove the zero-price schema and database check separately and refuse an anonymous session on every merchant action; 33 of 33 S6 mutations now pass on the fix commit, and the user confirmed the S6 receipt sentence as a Gate 4 amendment; see [S6 review fixes](00-status.md#s6-review-fixes-2026-10-14).
The deployed demo merchant account (`usr_o2tys4cx5id37b634ar3nv5dae`) and its outlet "Test Shop" (`out_vrlbnc3zylbrr6g2drovaiqkfu`, published, enrollment approved, PayPal sandbox seller `EQN6264CF9F4Y` accepted) stay in Neon for S8, which shows that merchant its orders.
S13 is done (2026-10-14): in Claude Code, an agent holding a scoped demo token searched, read the menu and created purchase requests over `/mcp` on Render; the user's phone redeemed one once into a fresh server-priced review and paid S$6.40 in the PayPal sandbox, the second opening said already used, the agent's receipt read answered 403 and an unopened link expired after `T_HANDOFF`; its evidence and 23 of 23 mutations are in [`00-status.md`](00-status.md#s13-agent-handoff-over-mcp-2026-10-14).
S4 is done (2026-10-14), with its review fixes, see [S4 review fixes](00-status.md#s4-review-fixes-2026-10-14).
The two S2 purchases that PayPal refused before the seller consented stay `uncertain` for good, by the user's choice on 2026-10-13, and keep locking their basket (1 Kopi O and 1 Kaya toast set) in the browser session that made them.
The Claude Code agent token stays live in Neon (`agt_ggembpdxft5soezukk2c6remma`, label "Claude Code"); no revoke subcommand exists.
On "start S8", create `envoi/slice-8-orders` from the current `main` tip, confirm it with `git branch --show-current`, and request S8's listed authorizations by name before acting.
Rerun the checker and its fault harness under [`checks/`](checks/gate4_check.py) after any edit to the gate folder.
Gate 3 was re-approved on 2026-10-11 with fixes A-M; its record, mirrors and fail-capable checks are in `00-status.md`.
The four reopening questions were already answered and Gates 1 and 2 are re-approved; do not ask them again or revise either gate.
No application code, install, account provisioning, wallet/faucet, spending, workflow, deployment or visibility change is authorized; the 2026-10-11 commit/push authorization covered those planning documents only, and committing, pushing or merging the Gate 4 revision needs its own authorization.
The R11 flag/redeploy/inspection are complete, not work to repeat.

**Two provisioned-state questions were resolved by the user on 2026-10-07.**

- **R11, decided: in-app Better Auth wins. Hazard disproven, not a blocker.** `neon.ts` set `auth: true` (Neon Managed Better Auth) while approved Gate 2 says Better Auth is a library in our app, not a hosted service. The user chose in-app auth, so **Gate 2 is not reopened**. The user then authorized flipping the flag, redeploying, and a read-only schema inspection. `neon.ts` is now `auth: false`. `neon deploy` reported `No changes`, and the field demonstrably does not control the branch service: `neon neon-auth status` still shows Auth enabled on `production` (`better_auth`, created `2026-10-07T11:59:53Z`). The inspection settled the question that mattered: **all nine Neon Auth tables sit in a dedicated `neon_auth` schema and `public` is empty**, so there is no collision with our Better Auth tables. The service stays enabled but inert; `neon neon-auth disable` was **not** run and is NOT authorized. **Containment rules:** never build against `neon_auth`, and pin Better Auth's Drizzle adapter to `public` explicitly.
- **R12, decided: accept `aws-us-east-2`, conditional on measurement.** The project is not in Singapore, so trans-Pacific round trips land inside the approved three-minute buyer metric on top of the Render cold start. The acceptance holds only while a named Slice 1 test measures a real Singapore cold first visit; if the metric fails because of region latency, relocation is revisited rather than explained away. Relocation is a provisioning action and is not authorized.

The provisioning files (`.gitignore`, `neon.ts`, `package.json`, `package-lock.json`) are now **tracked** as of commit `f8caf7d`, so they are ordinary working-tree files. `.env.local`, `.neon` and `node_modules/` remain ignored and must never be staged. The tracked `.gitignore` covers secrets, `node_modules/`, build output and test artifacts, including the design's `.maintenance-build/` runner output. Response fixtures and tests belong in the tree; only generated output is ignored. No secret value was copied into any planning document.

The preceding Gate 2 Git authorization is complete and must not be repeated: `main` was fast-forwarded to `69ad8a5`, pushed and verified with `git ls-remote`.

The unchanged core is Next.js/Render Free, Neon Free, in-app Better Auth, quota-gated finite maintenance and direct sandbox PayPal with a distinct seller and lease-serialized recovery.
Identity-only scan and external-agent MCP handoff retain the same catalogue/payment rules.
OpenAI stays; credits/access/sharing are not account-verified.
The proposed import is synchronous request memory, explicit `store: false`, bytes-free metadata, no image routes/rows/capabilities and no import maintenance dependency.
General Neon exhaustion remains R2 because it also blocks payment-state writes; source/history-image churn no longer exists.
PYUSD constants/rate/wallet/recovery choices are now proposed in Gate 2, not absent; operational enablement still waits on independent proofs.
Read the exact [amendment](02-architecture.md) and [source supplement](research.md#gate-2-source-supplement-2026-10-10), not stale affected Gate 3/4 contracts.

A fresh session can continue from these files; no material decision exists only in chat.

## Reopening 2026-10-10: Zapier removed, PYUSD reconsidered

### User decisions

- **Zapier is removed because it is paid.** Gate 1 is revised/re-approved; Gate 2 is revised awaiting approval; Gate 3/4 revisions wait.
- **Only direct-vision and PYUSD-dependent decisions change.** Every other approved decision stands.
- **Cut order after all 2026-10-10 answers:** PYUSD first, scan next, account-conditional S14 after scan. The 2026-10-12 Gate 4 revision applies it as S16 and S17, then S10, then S14; S14 still drops for unavailable own-API access.
- **PYUSD is included, not merely being reconsidered.** Its remaining proof blockers are below; no test transfer is claimed.
- **Answers to the four questions, 2026-10-10.** OpenAI stays as the AI provider because the user has credits, so the approved Gate 2 provider and the `@ai-sdk/openai` pin do not change. A direct vision call inside the upload request replaces Zapier, so no image bytes are stored and no image URL exists. PYUSD is included, built after the PayPal journey and S13, and first in the cut order; the merchant sets the PYUSD rate it accepts. S13 moves to right after S4.
- **Gate 1 revised and RE-APPROVED 2026-10-10** ("I approve gate one") in `01-product.md` and three mockups (`index.html`, `merchant-onboarding.html`, `review.html`).
- **Branch names use `<project>/`.** The user changed `AGENTS.md` so slices use `envoi/slice-<N>-<slug>` and gate work uses `envoi/...`. The branch then was `envoi/gate-4-slice-plan`; the 2026-10-12 Gate 4 revision runs on `envoi/gate-4-vision-pyusd`.

**[verified] 2026-10-10:** sponsor tools are optional, there is no Zapier prize, a project can win at most one sponsor prize, APIMatic's prize is $1,000 plus six months of its Business plan, and "Best Use of Agentic Commerce" is a grand prize. Sources are in [`research.md`](research.md#sponsor-rules-re-check-2026-10-10).

### Questions to ask the user before revising

**Asked and answered 2026-10-10.** OpenAI stays ("We can use openai i have quite a bit of credits"); a direct vision call replaces Zapier; PYUSD is included and cut first; S13 moves to right after S4. The evidence presented with the questions is in [`research.md`](research.md#ai-provider-and-pyusd-re-check-2026-10-10): OpenAI bills per token with no free tier on its pricing page; the Gemini free tier uses submitted content to improve Google products with possible human review; the official PYUSD devnet mint, decimals and Token-2022 program are verified from Paxos and on chain; no free FX source was found whose terms clearly allow a transaction basis, and a merchant-set rate is proposed instead.

The numbered questions below are **historical, answered**, not the next action.

1. **Paid AI.** The user chose to keep OpenAI using their credits; provider and dependency pin stay. Usable balance, spend ceiling and account data-sharing remain proof requirements.
2. **Replacement for Zapier.** Recommended: keep photo-to-draft menu import and send the image straight to a vision-capable model through the AI SDK inside the upload request. No public image URL is then needed, which removes the image capability proxy, stored image bytes, `T_IMAGE_ACCESS`, `T_SOURCE_SWEEP`, the `expire_imports` and `sweep_sources` tasks and most of R2 and R7, and merges S11 and S12. The consent notice must still say the photo goes to the model provider. Alternative: manual menu entry only.
3. **PYUSD.** Include it in this revision, with a Gate 2 amendment, Gate 3 wallet contracts and Gate 4 slices, or keep it deferred, after the user has seen the blockers below and the schedule cost.
4. **S13 timing.** Move the agent handoff over MCP earlier, given the Agentic Commerce grand prize?

### Why PYUSD was left out, and its blockers

PYUSD was never dropped from the product: approved Gate 1 says "PayPal first, then proven PYUSD".
It was left out of the slice plan because approved Gate 2 forbids dependent wallet contracts or slices until an amendment pins the choices below, so Gate 3 has no wallet types, state machine or tests to build against.

| Blocker | What must be established | Label today |
| --- | --- | --- |
| Official devnet token | Paxos names the pinned mint; prior-session read-only RPC confirms Token-2022/6 decimals/genesis and authorities. Recheck at enable/preparation, not by token name. | **[verified]** documentation/historical read; future configuration mutable |
| Test tokens | Whether PayPal's documented devnet test-token route actually funds this account's test wallet. | **[vendor claim]** route documented; access **[unknown]** |
| Buyer wallet | Phantom Wallet Standard sign-and-send; prove devnet chain honoring, mint display and preservation of the prepared blockhash, transfer and memo before expiry release. Phantom-added ComputeBudget/Lighthouse instructions are allowlisted. Phone path: a Phantom Browse link into a fresh wallet-browser review, unproven. | **[vendor claim]** interface; behavior **[unknown]** |
| Merchant wallet ownership | A signed challenge bound to purpose, outlet and cluster proving the merchant controls the receiving wallet. | Sketched in Gate 2; untested |
| SGD to PYUSD rate | Shop's integer atomic-units-per-S$1 rate, dated and re-confirmed every 30 days, rounded upward; no external FX provider. | **[verified]** Gate 1 decision; arithmetic unbuilt |
| RPC and recovery | Public devnet RPC, finalized verification of the transfer's meaning and complete post-expiry signature-window scan. Throttle/null/history gaps remain uncertain; server never submits. | **[verified]** published limits; actual shared-IP/history behavior **[unknown]** |
| Schedule | Roadmap candidates 8 and 11 add a wallet purchase slice and a wallet recovery slice before the 13 Nov 04:00 SGT cutoff. | **[hypothesis]** tight |

The user wants PYUSD, and Gate 2 now proposes its architecture with independent proof conditions.
After approval, Gate 3 adds exact contracts and fail-capable tests; Gate 4 adds two slices.
PayPal must stay usable if PYUSD fails, and a failed proof keeps the rail disabled instead of being hidden.

### Other known blockers

- This Mac had only `git` on 2026-10-10. On 2026-10-12 Node 24 LTS (`v24.21.0`) and the GitHub CLI were installed under `~/.local`; a local PostgreSQL must still be installed by the user before S1.
- `.env.local` with the Neon credentials did not come over from Windows.
- The repository is private; the rules require it public with a license at submission (S15).
- APIMatic own-API generation likely needs more than the participant offer of one month of Basic; the PayPal Context Plugin in S2 is the safe APIMatic use.
- Gate 1/mockups and Gate 2 are re-approved; do not edit them during Gate 3.

### Order of work

1. Read `AGENTS.md`, the software-factory skill and every document in this folder.
2. Questions 1-4 are answered and Gate 1 is re-approved; preserve both.
3. The Gate 2 amendment and mirrors are re-approved (2026-10-11); do not revise them.
4. Gate 2 approval is recorded; Gate 3 edits may begin on a new branch, as the Gate 3 handover says.
5. Revise `03-program-design.md`: import types and call stack, authorization matrix, named clocks, maintenance tasks, test plan with mutations, version pins, residual risks and wallet contracts if chosen.
   Ask `Approve Gate 3, or what should change?`.
   **Done 2026-10-11, revised after the user's review and for fixes L and M the same day; re-approved 2026-10-11.**
6. After Gate 3 re-approval, revise `04-slices.md`: merge S11/S12, remove Zapier access, reassign tests, add PYUSD after S13/first cut and move S13 immediately after S4. Ask `Approve Gate 4, or what should change?`.
   **Drafted 2026-10-12 on `envoi/gate-4-vision-pyusd`; awaiting approval.**
7. Mirror every change in `00-status.md`, this file, `roadmap.md`, `stack-recommendation.md` and `research.md`, and run documentary checks proven able to fail.

On 2026-10-11 the user authorized committing this work on `envoi/gate-4-slice-plan` in `/Users/jayd0/Desktop/envoi`, fast-forwarding `main` and pushing it.

## Gate 2 handover, 2026-10-10

Gate 1 was re-approved on 2026-10-10.
The Gate 2 revision is saved in `02-architecture.md` and its five mirrors and was re-approved by the user on 2026-10-11.
It changes only direct vision import and PYUSD; unaffected decisions stand.
A 2026-10-11 review changed five points, listed in the architecture header and folded into the bullets below.
That revision edited only `02-architecture.md` and its five mirrors; AGENTS.md, product, mockups, Gate 3 and Gate 4 were not edited.
On 2026-10-11 the user authorized committing this work and pushing it to `main`, then re-approved Gate 2 and authorized publishing the branch and merging it into `main`.

### Menu import without Zapier

- The merchant's menu photo goes to the approved OpenAI provider through the AI SDK inside the upload request, and the draft returns in the same response. OpenAI stays because the user has credits; the provider and the `@ai-sdk/openai` pin do not change.
- Proposed bytes-free `menu_imports` row records actor/outlet/base revision/consent/model/outcome/counts/spend/latency, with expiry on read. No source row, image URL, capability principal or image task. Drop import status/cancel routes and recover a lost response by authenticated draft reload.
- Keep upload validation, metadata stripping, draft-result bounds, blank-not-zero prices, merchant-edit preservation, confirmation invalidation and manual fallback.
- Proposed budgets: 90-second total from admission, 60-second model maximum with commit reserve; 30-second bounded upload read; one global in-flight; 10/outlet and 50/global attempts per UTC day, plus user-authorized daily spend ceiling. The browser shrinks the photo to one JPEG of at most 2,048 pixels/side and 2 MiB; the server accepts only that, with a 2.5 MiB whole body, and re-encodes it. All are hypotheses, not measured RAM/latency or dollar spend.
- Node route handler, no proxy body clone/disk spool/image persistence. Explicit `store: false`; allowlisted error metadata drops image-bearing SDK request/response fields. Actual serialized leak scanner needs an injected base64 self-test and no-disk probes.
- Architecture records distinct timeout/lost-connection copy and short consent: OpenAI receives the photo, Envoi does not store it, OpenAI may keep it up to 30 days for abuse monitoring with legal/harm exceptions, and no training without opt-in. Details cover the unpublished exact `store: false` effect, abuse-log removal only under Zero Data Retention and CSAM manual review. User must confirm no data-sharing opt-in before real photos.
- Proposed `AI_MENU_MODEL` is separate from unchanged `AI_MODEL`; model/image/schema access and availability through 16 Dec require pre-registered evaluations. Chinese/rotated/small-text accuracy is a falsifier.
- R2 narrows to generic database exhaustion, R6 expands to decode RAM/CPU (reduced by the browser shrink), image-churn R7 is superseded by admission/spend-sizing R7a. Other risks stand.

### PYUSD amendment

The proposed choices below use the [current source supplement](research.md#gate-2-source-supplement-2026-10-10), with historical RPC observations distinguished from vendor claims and unproven controls:

- Proposed constants: devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`, mint `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM`, Token-2022 program and 6 decimals. Only RPC/enable env names remain; mismatch refuses PYUSD initialization, not PayPal boot. Prior-session reads are attributed in the new source supplement.
- `TransferChecked` only with zero current/next-horizon fee schedules, correct unfrozen source/destination and no newly active hook. Merchant ATA must exist and be verified before activation; buyer creates no accounts.
- Phantom Wallet Standard `solana:signAndSendTransaction`, chain `solana:devnet`, wallet signs/broadcasts then returns signature bytes. Phantom documents that it may add Lighthouse assertion and priority-fee instructions; mint display, chain honoring, blockhash/transfer preservation and the phone Browse-link path remain unknown. There is no signed pre-broadcast validation opportunity.
- Merchant wallet ownership: exact saved 5-minute SIWS-format domain/purpose/outlet/cluster/wallet/nonce challenge, Ed25519 verification and atomic single-use consumption. It proves key control, not operator enrollment.
- Merchant-set rate (approved in Gate 1): PYUSD per S$1 with the date set, 30-day re-confirmation, atomic amount rounded up, shown as the shop's rate. No external FX source.
- Public devnet RPC with its documented limits; the Render shared-outbound-IP effect is **[unknown]**.
- Persist/lock before unsigned transaction release, with the prepared message, a `confirmed` blockhash, fee payer, lastValidBlockHeight and mandatory opaque memo reference; Envoi adds no compute-budget instructions. Verify at finality the saved blockhash, the buyer as sole signer/fee payer, exactly one transfer with program/mint/source/destination/amount, the memo, zero fee and transaction-metadata balance delta; only ComputeBudget and pinned Lighthouse assertion instructions may be added. Receipt says transferred/finalized on devnet, not kept; permanent delegate can move tokens later.
- Unknown submission remains locked until finalized height passes lastValidBlockHeight plus complete finalized signature-window scan. Missing/pruned/null/429 evidence is not absence. Exact wallet blockhash preservation must be proven before that release rule is enabled; Solana guidance permits wallet refresh, so this is a real falsifier.
- Phone path selected: an "Open in Phantom" Browse link carrying only public outlet/item IDs and quantities into a fresh wallet-browser session and server-priced review; no token, new route, cookie copy or ownership transfer. The original browser's PYUSD review is never prepared. Actual phone behavior is unproven.
- Endpoints, data and the External table for the wallet path; no buyer key and no server signing.
- PayPal must keep working if PYUSD fails, and a failed proof keeps the rail visibly disabled.

### Unchanged decisions to preserve

Render Free plus Neon Free plus in-app Better Auth plus GitHub Actions maintenance; the direct PayPal Orders v2 adapter and its recovery rules; scan as identity only; the MCP handoff; R11 containment and the R12 region acceptance.

### After Gate 2 approval

Gate 2 was re-approved on 2026-10-11 and its approval is recorded in status, history, checklists and mirrors.
The Gate 3 obligations are in the next section.

## Gate 3 handover, 2026-10-11

Gate 2 was re-approved on 2026-10-11 ("gate 2 approved"), covering the direct-vision and PYUSD amendment with its five review changes.
Gate 3 is reopened only for contracts that depend on that amendment; every other 2026-10-07 contract, pin and finding disposition stands.
The user asked for a copy-paste prompt so another agent can run the Gate 3 revision; this section is that agent's checklist.

### Gate 3 scope

- Remove the superseded Zapier and stored-image contracts from `03-program-design.md`: source rows, image/result capability principals, `ZAPIER_MENU_HOOK_URL`, `T_IMAGE_ACCESS`, `T_SOURCE_SWEEP`, `expire_imports`, `sweep_sources`, import status/cancel routes and the import heartbeat dependency.
- Add the direct-vision import contracts from `02-architecture.md`: Node route handler with a counted body, the browser shrink to one JPEG of at most 2,048 pixels/side and 2 MiB, a 2.5 MiB whole-body server limit, the bytes-free `menu_imports` row and spend reservation.
  Include admission (one in flight per outlet and globally, 10 per outlet and 50 globally per UTC day, recorded spend ceiling, fail closed), `T_MENU_REQUEST` 90 seconds and `T_MENU_MODEL` 60 seconds with a 5-second commit reserve, expiry on read and late-result rejection.
  Include the edit-preserving merge, `store: false`, the strict nullable schema, allowlisted error logging, the versioned consent with details and `AI_MENU_MODEL`.
- Add the PYUSD contracts: pinned devnet constants and the enable check, only `PYUSD_ENABLED` and `SOLANA_RPC_URL` as configuration, the SIWS destination challenge, the merchant rate with ceil arithmetic and 30-day expiry on read, and the attempt state machine.
  Include preparation with a `confirmed` blockhash and no compute-budget instructions, verification by meaning with the ComputeBudget/Lighthouse allowlist, a devnet recheck of the Lighthouse program ID, the signature-hint route, the complete-history scan with persisted cursors, the shared RPC limiter, the Phantom Browse phone link and PayPal isolation with no Solana imports.
- Update the authorization matrix, call stacks, state transitions, races, capacity budgets, named clocks, maintenance tasks, residual risks (R2, R5, R6, R7a and the PYUSD residuals) and least confident decisions to match.
- Pin any new package, such as the Solana client or Wallet Standard helpers, from dated registry reads, not memory. Do not change the OpenAI provider or the `@ai-sdk/openai` pin.
- Give every new guard its own named test and its own mutation plan, separately for image-bearing logs (with an injected base64 needle the scanner detects), each admission guard, rate rounding/age/version, mint/chain/blockhash checks, each instruction-allowlist rule, signature binding and complete-history release.
- Review Gate 3 deltas D1-D7 in `04-slices.md`; resolve those this revision touches and list the rest, without editing `04-slices.md`.

### Gate 3 boundaries

- Work on a new branch, `envoi/gate-3-vision-pyusd`, created from the current `main`.
- Do not change Gate 1 or Gate 2 decisions. If the revision shows a Gate 2 decision is wrong or incomplete, stop and reopen Gate 2 with the evidence rather than designing around it.
- Edit only `03-program-design.md` and its mirrors: `00-status.md`, this file, `roadmap.md`, `stack-recommendation.md` and `research.md`. Do not edit `AGENTS.md`, `01-product.md`, the mockups, `02-architecture.md` or `04-slices.md`.
- Contracts only: no application code, install, account provisioning, OpenAI call, wallet, faucet, RPC transaction, spending, workflow, deployment, visibility change, commit or push without explicit authorization.
- Do not infer the open user items: the OpenAI data-sharing setting (steps given 2026-10-11, answer not yet recorded), the daily spend ceiling, the text and vision models, and faucet access.

### Gate 3 revision status, 2026-10-11

- **Re-approved 2026-10-11.**
  `03-program-design.md` carries the revision on branch `envoi/gate-3-vision-pyusd`, created from `main` at `9b4796b`.
  On 2026-10-11 the user authorized publishing this work, merging it into `main` and pushing; Git publication is not gate approval; the user then re-approved Gate 3 ("Yes approve commit the branch and push and merge to main") and authorized committing, pushing and merging.
- **Scope kept.**
  The revision changed only `03-program-design.md`, `00-status.md`, this file, `roadmap.md`, `stack-recommendation.md` and `research.md`, plus `02-architecture.md` for the Gate 2 reopening below; Gate 1, the mockups and Gate 4 are untouched, and the revision did not edit AGENTS.md.
  AGENTS.md carries a separate uncommitted "Context transfer" section, saved after the revision's last edit; including it in any commit is the user's decision.
- **Fixes A-K change no Gate 2 decision; fixes L and M do, and Gate 2 was reopened and re-approved for them on 2026-10-11.**
  The Gate 2 rules made exact, those restored after the review and the two changed by the reopening are listed in the revision summary at the top of `03-program-design.md`.
- **Revised after the user's review, 2026-10-11.**
  The user's verdicts on six least confident calls are recorded in `00-status.md` as review decisions.
  Fixes A-K are applied: the basket lock holds only while money can still move, derived on read, with PayPal abandonment once `T_REVIEW` passes and an audited operator exit for a PYUSD mismatch; the import commit rechecks membership; verification checks mint and decimals explicitly; Lighthouse leaves the runtime identity check; the clock is `T_MENU_MODEL`; no RPC runs inside a transaction; a reservation counts zero only before model dispatch; later signature hints are verified within a cap; the state machines agree; and a stale provisioning sentence is corrected.
  Two additions go slightly beyond the review list and are flagged for the user: `created` and `create_unknown` PayPal attempts also lock inside `T_REVIEW`, and both execution starts recheck the lock.
- **Fixes L and M, after the Gate 2 reopening.**
  L: preparation releases the unsigned bytes exactly once and never stores them, and the browser asks the wallet once per release, because the wallet may add different instructions at each signing.
  M: after expiry, the window scan runs for every released attempt, including a confirmed one, and records any other successful transaction carrying the reference as an extra transfer that the buyer, merchant and operator see; the purchase stays paid, and any refund is arranged outside Envoi.
- **Tests:** batched into 92 named tests, 71 standalone and 21 groups, and 231 cases, from 192 named tests; 10 names are removed and 21 cases added, each with its own mutation.
  The [test delta](03-program-design.md#test-delta-for-the-gate-4-revision) maps every one of the 199 previous names, and Gate 4 must apply it.
- **Checked:** fail-capable documentary checks passed after fixes A-K and again after fixes L and M, when each of 52 planted faults failed on its own rule; see [the latest verification](00-status.md#gate-2-reopening-and-fixes-l-m-documentary-verification-2026-10-11).
- **Still open, not inferred:** the OpenAI data-sharing setting (no answer recorded), the daily spend ceiling, the text and vision models, and faucet access.

### Gate 3 checks

- The Gate 4 draft assigns each of the 54 approved Gate 3 test names exactly once. Added, renamed or removed tests will break that assignment until Gate 4 is revised; record the exact delta list for Gate 4 instead of editing `04-slices.md` or deleting the check.
- Run documentary checks for local links and anchors, em dashes in added lines, secret shapes, the exact Gate 3 approval question and the absence of a false Gate 3 approval claim, and prove each rule fails on a planted fault in a scratch copy.
  An earlier checker may still exist at `/private/var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/opencode/envoi-gate2-20261010/doccheck.py`, a temporary location; its approval rules must move from Gate 2 to Gate 3.
- Finish with exactly `Approve Gate 3, or what should change?` and wait.

## Gate 3 preparation: executed and approved 2026-10-07 (historical)

The saved instructions for this gate were followed. The architecture and the preceding review findings were cross-checked against primary sources without assuming the previous agent's conclusions were correct, and that cross-check corrected three Gate 2 assumptions: Neon blocks cleanup writes at the storage limit, Better Auth deletes the anonymous user on link by default, and PayPal documents no fixed idempotency window while warning against concurrent same-key requests. All eight items in [the review record](00-status.md#unresolved-review-findings) are dispositioned in `03-program-design.md`, with three named residual risks (storage-exhaustion recovery, code-level maintenance authority, best-effort scheduling) recorded rather than smoothed over.

The draft specifies the file map, types and signatures without bodies, call stacks, three state machines, the authorization matrix, race contracts, capacity budgets, named failure tests each paired with the mutation that proves it, and ten registry-read version pins. Crash boundaries exist around every external call, webhook verification is signature-based with dedupe, and menu confirmation and publication recheck their preconditions inside a transaction. Account access and integration proofs stay in later authorized slices. PYUSD remains disabled.

## Gate 4 handoff: executed as a draft 2026-10-10 (affected image obligations superseded)

The user requested Gate 4 on 2026-10-10, and these saved instructions were followed. Every obligation below is carried into a named slice in `04-slices.md`, which awaits approval.
The 2026-10-12 revision keeps every obligation: the real-image obligation is now S11's exit decision on the deployed leak probes, and the R2 decision moves to S15 because no image churn remains.
That move was not asked for and is flagged for review above and in `00-status.md`.

Select the visible slices and their acceptance evidence into `04-slices.md`, one runnable capability per slice, with Slice 1 as the tracer bullet. Carry these Gate 3 obligations into the slice plan rather than restating them as prose:

- Slice 1 must include the version-pin boot check and must fail loudly if `better-auth`, `drizzle-orm` or `drizzle-kit` do not work against the pinned Next and TypeScript majors.
- Slice 1 must include the R12 region latency measurement. The R11 flag flip is already done, and the collision hazard was disproven by inspection, so auth work may proceed; but Better Auth's Drizzle adapter must be pinned explicitly to the `public` schema and nothing may touch the `neon_auth` schema. A session bug is a receipt-ownership bug.
- The Actions maintenance workflow must not be created until the cadence decision is recorded and either the remaining private quota is confirmed or the repository is public.
- Real merchant images now require account/consent and actual request-memory/no-disk/no-log/no-database-image proofs, not superseded capability fetch/removal probes. General Neon exhaustion remains R2 for payment-state writes.
- The PayPal sandbox happy path must already enforce recipient and amount binding plus the lease-serialized capture; recovery work later is not an excuse for an unsafe early slice.
- Every guard claimed in the test plan needs its own mutation proof. A fault caught by two tests proves neither covers its own branch.

Finish with exactly: `Approve Gate 4, or what should change?` Do not begin implementation.
