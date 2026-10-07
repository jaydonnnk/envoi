# Envoi: Gates 1-3 approved, Gate 4 boundary

Updated 2026-10-07. Gate 1 was **reopened on 2026-10-07** to add a buyer-side scan entry point, then **explicitly APPROVED by the user on 2026-10-07** for product scope and journeys. Gate 2 architecture proposal is **APPROVED by the user 2026-10-07** in `02-architecture.md`; its commit, fast-forward into `main`, push and `git ls-remote` verification are complete at `69ad8a5`. Gate 3 program design is **APPROVED by the user 2026-10-07** in `03-program-design.md`, with the planning commit and push to `main` separately authorized in the same instruction. **Gate 4 is pending and unauthorized.** No app, sponsor integration or payment integration exists, but a Neon Free database **has** been provisioned by a concurrent session; its two conflicts with the planning documents were both resolved by user decision on 2026-10-07. The user requires **free hosting services only**.

Workspace: `C:\Users\jayd0\OneDrive\Desktop\envoi`. An earlier revision of this file recorded `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`; that path is stale and is corrected here. No decision depended on it.
Skill: `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md`.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve the body of `docs/plans/PAYPAL_PLAN.md` unchanged; it carries a supersession banner added 2026-10-07, and both the pre-banner and post-banner SHA256 values are recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: approved Gate 1 product scope with buyer/merchant journeys, rules, sponsor roles, both buyer entry points (text and scan) and an untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers. `buyer.html` shows the text entry point and the scan entry point including an unenrolled-sticker result.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief, prior-art findings from shipped SGQR payment products, the 2026-10-07 Gate 3 source cross-check, and unresolved proof requirements.
- `02-architecture.md`: approved Gate 2 proposal with alternatives, component ownership, routes, data/query outlines, core flows, external configuration names and unresolved proofs. Architecture authority; approval did not resolve the preceding review findings.
- `03-program-design.md`: **unapproved Gate 3 draft.** File map, types and signatures without bodies, ten named clocks, purchase/attempt/import state machines, the authorization matrix, call stacks, race contracts, capacity budgets, named failure tests with mutation proofs, registry-read version pins, the disposition of all eight review findings and ten least-confident decisions.
- `stack-recommendation.md`: supporting mirror of the approved Gate 2 proposal plus the Gate 3 version pins; `02-architecture.md` and `03-program-design.md` remain authoritative in their own gates.
- `roadmap.md`: discussion candidates including the separate Zapier menu-import slice. Not Gate 4 approval.
- `00-status.md`: current approvals, the Gate 3 cross-check results, the findings disposition table, evidence boundary and fresh checks. The older JPG preview is historical; current HTML is authoritative for review.

## Product scope to preserve

Visitors with PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, menu, authority and connected destinations. Buyers use text or scan/paste, review the exact basket/costs, externally approve and receive an honest status; merchant acknowledgment is separate.

Buyers have two entry points, added 2026-10-07: a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only — it is not payment authority, not a payment destination, and it cannot enroll a shop. An unenrolled sticker yields no purchase and offers text search instead. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it so a scan resolves one location.

PayPal first; PYUSD only after independent proof. One rail per order. Changed items, amount, recipient, currency or rail require fresh approval. Pending/uncertain is not paid; reconcile before retrying. No custody or buyer private keys. PYUSD does not imply automatic SGD settlement.

Merchants upload both SGQR and a separate menu image. SGQR contains no menu and proves no ownership; decode only supported identifiers present and allow correction. AI by Zapier drafts menu names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry on failure; no guessed prices or auto-publication. This supersedes manual-only menus and optional Zapier.

Propose APIMatic PayPal Context Plugin and clients/documentation where access supports them; Render application hosting; Zapier AI menu drafting. Recovery execution is a Gate 2 architecture choice, not a requirement for a paid Render worker. AG Grid optional. Access, prizes, extraction and payment execution remain unproven. Temporary image access/removal, database history and upstream retention are distinct. Live launch needs separate provider, legal, merchant enrollment and operations checks.

Proposed target remains 4 of 5 first-time buyers completing an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with an external payment record matching the approved purchase. Record each tester's entry point, text or scan. It has not been tested.

## Next authorized action

Gate 3 preparation is complete and approved. The user approved Gate 3 on 2026-10-07 and authorized committing the Gate 3 planning documents and pushing `main`. That Git work is complete: commit `ac13444` on branch `codex/gate-3-program-design`, fast-forwarded into `main` from `69ad8a5`, pushed to `origin`, and verified with `git ls-remote` returning the identical SHA `ac13444656396abb4215f7fb5c900060c7d6087d`. The branch is retained.

**The next action is nothing, until the user asks for Gate 4.** Do not create `04-slices.md`, do not write application code, and do not treat Gate 3 approval as implementation approval. **Not authorized:** installing an application package, provisioning any further account or resource, running `neon neon-auth disable`, creating a workflow, deploying the application, changing repository visibility, or writing application code. The R11 flag flip and redeploy were executed on 2026-10-07 and are complete; they did not disable the service.

**Two provisioned-state questions were resolved by the user on 2026-10-07.**

- **R11, decided: in-app Better Auth wins. Hazard disproven, not a blocker.** `neon.ts` set `auth: true` (Neon Managed Better Auth) while approved Gate 2 says Better Auth is a library in our app, not a hosted service. The user chose in-app auth, so **Gate 2 is not reopened**. The user then authorized flipping the flag, redeploying, and a read-only schema inspection. `neon.ts` is now `auth: false`. `neon deploy` reported `No changes`, and the field demonstrably does not control the branch service: `neon neon-auth status` still shows Auth enabled on `production` (`better_auth`, created `2026-10-07T11:59:53Z`). The inspection settled the question that mattered: **all nine Neon Auth tables sit in a dedicated `neon_auth` schema and `public` is empty**, so there is no collision with our Better Auth tables. The service stays enabled but inert; `neon neon-auth disable` was **not** run and is NOT authorized. **Containment rules:** never build against `neon_auth`, and pin Better Auth's Drizzle adapter to `public` explicitly.
- **R12, decided: accept `aws-us-east-2`, conditional on measurement.** The project is not in Singapore, so trans-Pacific round trips land inside the approved three-minute buyer metric on top of the Render cold start. The acceptance holds only while a named Slice 1 test measures a real Singapore cold first visit; if the metric fails because of region latency, relocation is revisited rather than explained away. Relocation is a provisioning action and is not authorized.

Do not edit, stage, move or delete the concurrent session's files: `neon.ts`, `.neon`, `.env.local`, `package.json`, `package-lock.json`, `node_modules/`, `.gitignore`. `.gitignore` already covers `.env*` and `.neon`, and `git status` confirms neither is staged. No secret value was copied into any planning document.

The preceding Gate 2 Git authorization is complete and must not be repeated: `main` was fast-forwarded to `69ad8a5`, pushed and verified with `git ls-remote`.

Approved proposal: Next.js on Render Free, Neon Free PostgreSQL, Better Auth in the app and finite hourly GitHub Actions maintenance over durable purchase/import state. No Supabase, paid Render worker/disk or continuous queue poller. Actions quota/zero-spend controls, free account access and cold-start performance need proof; no repository visibility change is authorized. Include cold-start time in the three-minute metric. Free hosting does not establish AI/Zapier entitlements.

PayPal retains the distinct authorized sandbox seller, external buyer approval, exact immutable purchase and provider verification. APIMatic context is development tooling; text/scan share published catalogue rules. Separate menu images use capped private database bytes behind the revocable Envoi proxy. The proposed fetch/result deadline is five minutes; normal closure deletes the row transactionally, while idle/crash cleanup is best effort hourly. There is no five-minute source-deletion guarantee or hard physical-retention limit; database restore history and upstream copies need consent. Stale maintenance/overdue sources block imports. These controls are untested; preview stays local.

**Gate 3 correction to the paragraph above:** the transactional delete on normal closure is retained as the design, but it is no longer treated as a capacity control. **[verified]** Neon Free fails inserts, updates and deletes once the storage limit is reached, and its 6-hour history window keeps written bytes counted after a logical delete. Access denial is therefore a read-only computation from `accepted_at`, and capacity is bounded at admission. See `03-program-design.md` and the Gate 3 cross-check section of `research.md`.

PYUSD remains disabled; mint, wallet, conversion and recovery choices require proof and a Gate 2 amendment before dependent wallet contracts/slices. Provider access, sponsor entitlements, image fetch/removal and actual payment/scan evidence remain unknown. A failure changing the selected architecture reopens Gate 2; changed product behavior reopens Gate 1. Review the exact failure boundaries in `02-architecture.md` and the contracts in `03-program-design.md` rather than treating this summary as a contract.

A fresh session can continue from these files; no material decision exists only in chat.

## Gate 3 preparation: executed and approved 2026-10-07

The saved instructions for this gate were followed. The architecture and the preceding review findings were cross-checked against primary sources without assuming the previous agent's conclusions were correct, and that cross-check corrected three Gate 2 assumptions: Neon blocks cleanup writes at the storage limit, Better Auth deletes the anonymous user on link by default, and PayPal documents no fixed idempotency window while warning against concurrent same-key requests. All eight items in [the review record](00-status.md#unresolved-review-findings) are dispositioned in `03-program-design.md`, with three named residual risks (storage-exhaustion recovery, code-level maintenance authority, best-effort scheduling) recorded rather than smoothed over.

The draft specifies the file map, types and signatures without bodies, call stacks, three state machines, the authorization matrix, race contracts, capacity budgets, named failure tests each paired with the mutation that proves it, and ten registry-read version pins. Crash boundaries exist around every external call, webhook verification is signature-based with dedupe, and menu confirmation and publication recheck their preconditions inside a transaction. Account access and integration proofs stay in later authorized slices. PYUSD remains disabled.

## Gate 4 handoff: inactive until an explicit user request

Do not start Gate 4 on the strength of this file. It needs an explicit user request, even though Gate 3 is approved.

Select the visible slices and their acceptance evidence into `04-slices.md`, one runnable capability per slice, with Slice 1 as the tracer bullet. Carry these Gate 3 obligations into the slice plan rather than restating them as prose:

- Slice 1 must include the version-pin boot check and must fail loudly if `better-auth`, `drizzle-orm` or `drizzle-kit` do not work against the pinned Next and TypeScript majors.
- Slice 1 must include the R12 region latency measurement. The R11 flag flip is already done, and the collision hazard was disproven by inspection, so auth work may proceed; but Better Auth's Drizzle adapter must be pinned explicitly to the `public` schema and nothing may touch the `neon_auth` schema. A session bug is a receipt-ownership bug.
- The Actions maintenance workflow must not be created until the cadence decision is recorded and either the remaining private quota is confirmed or the repository is public.
- Real merchant images stay blocked until the fetch, denial and removal probes pass, and the storage-exhaustion path has a tested operator runbook or an explicit acceptance of residual risk R2.
- The PayPal sandbox happy path must already enforce recipient and amount binding plus the lease-serialized capture; recovery work later is not an excuse for an unsafe early slice.
- Every guard claimed in the test plan needs its own mutation proof. A fault caught by two tests proves neither covers its own branch.

Finish with exactly: `Approve Gate 4, or what should change?` Do not begin implementation. This saved instruction is not authorization to start Gate 4 now.
