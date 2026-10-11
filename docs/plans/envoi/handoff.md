# Envoi: revised Gate 2 awaiting approval, Gates 3 and 4 waiting

Updated 2026-10-11.
Gate 1 was re-approved on 2026-10-10; do not redo it.
`02-architecture.md` is revised for direct vision import and PYUSD only, revised again after a 2026-10-11 review, and awaits Gate 2 re-approval.
Gate 3 revision waits for that approval; `03-program-design.md` and the unapproved `04-slices.md` remain unchanged in this Gate 2 work.
All unaffected 2026-10-07 approvals stand, including Render Free/Neon Free/in-app Better Auth/GitHub Actions, PayPal recovery, identity-only scan, MCP, R11 and R12.
No app or payment integration exists; the already-provisioned Neon database is recorded in status.
On 2026-10-11 the user authorized committing this work and pushing it to `main`; that is not Gate 2 approval.

Workspace: `/Users/jayd0/Desktop/envoi` on macOS (arm64) since 2026-10-10; Gates 1-3 ran at `C:\Users\jayd0\OneDrive\Desktop\envoi` on Windows. An earlier revision of this file recorded `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`; that path is stale and is corrected here. No decision depended on it.
Skill: `/Users/jayd0/.claude/skills/software-factory/SKILL.md` on macOS; `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md` on Windows.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve the body of `docs/plans/PAYPAL_PLAN.md` unchanged; it carries a supersession banner added 2026-10-07, and both the pre-banner and post-banner SHA256 values are recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: approved Gate 1 product scope with buyer/merchant journeys, rules, sponsor roles, both buyer entry points (text and scan) and an untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers. `buyer.html` shows the text entry point and the scan entry point including an unenrolled-sticker result.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief, prior-art findings from shipped SGQR payment products, the 2026-10-07 Gate 3 source cross-check, and unresolved proof requirements.
- `02-architecture.md`: revised Gate 2 amendment awaiting re-approval; complete direct-vision and PYUSD boundaries, with unaffected approved decisions preserved.
- `03-program-design.md`: 2026-10-07 approved contracts, reopened only for affected import/PYUSD work and not revised yet. Old source/capability/maintenance contracts are superseded pending that revision; provider pin and unaffected contracts stand.
- `stack-recommendation.md`: mirror of the revised architecture and unaffected Gate 3 pins; not approval authority.
- `04-slices.md`: **unapproved Gate 4 draft.** Fifteen slices in build order, the assignment of all 54 Gate 3 tests plus 20 named additions, Gate 3 deltas D1-D7, access checks, per-slice authorizations, schedule and cut order, and least confident decisions.
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

**Next action: review the revised Gate 2 amendment and ask exactly `Approve Gate 2, or what should change?`, then wait.**
The four reopening questions were already answered; do not ask them again or revise Gate 1.
Only after Gate 2 approval may affected Gate 3 contracts be revised and put to the user; Gate 4 follows its re-approval.
No application code, install, account provisioning, wallet/faucet, spending, workflow, deployment or visibility change is authorized; the 2026-10-11 commit/push authorization covered these planning documents only.
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
- **Cut order after all 2026-10-10 answers:** PYUSD first, scan next, account-conditional S14 after scan. Gate 4 applies it only after re-approvals; S14 still drops for unavailable own-API access.
- **PYUSD is included, not merely being reconsidered.** Its remaining proof blockers are below; no test transfer is claimed.
- **Answers to the four questions, 2026-10-10.** OpenAI stays as the AI provider because the user has credits, so the approved Gate 2 provider and the `@ai-sdk/openai` pin do not change. A direct vision call inside the upload request replaces Zapier, so no image bytes are stored and no image URL exists. PYUSD is included, built after the PayPal journey and S13, and first in the cut order; the merchant sets the PYUSD rate it accepts. S13 moves to right after S4.
- **Gate 1 revised and RE-APPROVED 2026-10-10** ("I approve gate one") in `01-product.md` and three mockups (`index.html`, `merchant-onboarding.html`, `review.html`).
- **Branch names use `<project>/`.** The user changed `AGENTS.md` so slices use `envoi/slice-<N>-<slug>` and gate work uses `envoi/...`. The current branch is `envoi/gate-4-slice-plan`.

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

- This Mac has only `git`. Node 24 LTS and a local PostgreSQL must be installed by the user before S1.
- `.env.local` with the Neon credentials did not come over from Windows.
- The repository is private; the rules require it public with a license at submission (S15).
- APIMatic own-API generation likely needs more than the participant offer of one month of Basic; the PayPal Context Plugin in S2 is the safe APIMatic use.
- Gate 1/mockups were already revised and re-approved; do not edit them during Gate 2.

### Order of work

1. Read `AGENTS.md`, the software-factory skill and every document in this folder.
2. Questions 1-4 are answered and Gate 1 is re-approved; preserve both.
3. The Gate 2 amendment and mirrors are revised; verify the recorded checks before claiming completion.
4. Ask `Approve Gate 2, or what should change?` and wait; no Gate 3 edits before approval.
5. After Gate 2 approval, revise `03-program-design.md`: import types and call stack, authorization matrix, named clocks, maintenance tasks, test plan with mutations, version pins, residual risks and wallet contracts if chosen. Ask `Approve Gate 3, or what should change?`.
6. After Gate 3 re-approval, revise `04-slices.md`: merge S11/S12, remove Zapier access, reassign tests, add PYUSD after S13/first cut and move S13 immediately after S4. Ask `Approve Gate 4, or what should change?`.
7. Mirror every change in `00-status.md`, this file, `roadmap.md`, `stack-recommendation.md` and `research.md`, and run documentary checks proven able to fail.

On 2026-10-11 the user authorized committing this work on `envoi/gate-4-slice-plan` in `/Users/jayd0/Desktop/envoi`, fast-forwarding `main` and pushing it.

## Gate 2 handover, 2026-10-10

Gate 1 was re-approved on 2026-10-10.
The Gate 2 revision is now saved in `02-architecture.md` and its five mirrors; ask exactly `Approve Gate 2, or what should change?`, then wait.
It changes only direct vision import and PYUSD; unaffected decisions stand.
A 2026-10-11 review changed five points, listed in the architecture header and folded into the bullets below.
That revision edited only `02-architecture.md` and its five mirrors; AGENTS.md, product, mockups, Gate 3 and Gate 4 were not edited.
On 2026-10-11 the user authorized committing this work and pushing it to `main`; no Gate 2 re-approval has been recorded.

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

Only after explicit approval, revise affected `03-program-design.md` contracts/clocks/tasks/tests and wallet pins, including separate mutation plans for image-bearing logs, each admission guard, rate rounding/age/version, mint/chain/blockhash checks, each instruction-allowlist rule and complete-history release.
Do not change the OpenAI provider pin.
Then revise `04-slices.md`: merge S11/S12, remove Zapier access, move S13 right after S4 and add PYUSD after S13, first in the cut order.
Mirrors of the proposed amendment already exist; record approval separately in status/history/checklist/mirrors only when the user gives it.

## Gate 3 preparation: executed and approved 2026-10-07 (historical)

The saved instructions for this gate were followed. The architecture and the preceding review findings were cross-checked against primary sources without assuming the previous agent's conclusions were correct, and that cross-check corrected three Gate 2 assumptions: Neon blocks cleanup writes at the storage limit, Better Auth deletes the anonymous user on link by default, and PayPal documents no fixed idempotency window while warning against concurrent same-key requests. All eight items in [the review record](00-status.md#unresolved-review-findings) are dispositioned in `03-program-design.md`, with three named residual risks (storage-exhaustion recovery, code-level maintenance authority, best-effort scheduling) recorded rather than smoothed over.

The draft specifies the file map, types and signatures without bodies, call stacks, three state machines, the authorization matrix, race contracts, capacity budgets, named failure tests each paired with the mutation that proves it, and ten registry-read version pins. Crash boundaries exist around every external call, webhook verification is signature-based with dedupe, and menu confirmation and publication recheck their preconditions inside a transaction. Account access and integration proofs stay in later authorized slices. PYUSD remains disabled.

## Gate 4 handoff: executed as a draft 2026-10-10 (affected image obligations superseded)

The user requested Gate 4 on 2026-10-10, and these saved instructions were followed. Every obligation below is carried into a named slice in `04-slices.md`, which awaits approval.

Select the visible slices and their acceptance evidence into `04-slices.md`, one runnable capability per slice, with Slice 1 as the tracer bullet. Carry these Gate 3 obligations into the slice plan rather than restating them as prose:

- Slice 1 must include the version-pin boot check and must fail loudly if `better-auth`, `drizzle-orm` or `drizzle-kit` do not work against the pinned Next and TypeScript majors.
- Slice 1 must include the R12 region latency measurement. The R11 flag flip is already done, and the collision hazard was disproven by inspection, so auth work may proceed; but Better Auth's Drizzle adapter must be pinned explicitly to the `public` schema and nothing may touch the `neon_auth` schema. A session bug is a receipt-ownership bug.
- The Actions maintenance workflow must not be created until the cadence decision is recorded and either the remaining private quota is confirmed or the repository is public.
- Real merchant images now require account/consent and actual request-memory/no-disk/no-log/no-database-image proofs, not superseded capability fetch/removal probes. General Neon exhaustion remains R2 for payment-state writes.
- The PayPal sandbox happy path must already enforce recipient and amount binding plus the lease-serialized capture; recovery work later is not an excuse for an unsafe early slice.
- Every guard claimed in the test plan needs its own mutation proof. A fault caught by two tests proves neither covers its own branch.

Finish with exactly: `Approve Gate 4, or what should change?` Do not begin implementation.
