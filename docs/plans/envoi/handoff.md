# Envoi: approved Gate 2 handoff and stop boundary

Updated 2026-10-07. Gate 1 was **reopened on 2026-10-07** to add a buyer-side scan entry point, then **explicitly APPROVED by the user on 2026-10-07** for product scope and journeys. Gate 2 architecture proposal is **APPROVED by the user 2026-10-07** in `02-architecture.md`; Gates 3-4 are pending and Gate 3 is not authorized. Approval establishes no runtime/account proof and does not establish that the preceding review's findings were fixed. No app, sponsor integration or payment integration exists. The user requires **free hosting services only**. The architecture branch is `codex/gate-2-architecture`; the current request authorizes its planning commit, fast-forward integration into `main`, push of `main` and remote verification, then STOP. Retain the architecture branch.

Workspace: `C:\Users\jayd0\OneDrive - Temasek Polytechnic\Documents 1\Envoi`.
Skill: `C:\Users\jayd0\.agents\skills\software-factory\SKILL.md`.

Read applicable AGENTS.md and all documents under `docs/plans/envoi/` before resuming. Keep replies concise and visualizations/mockups as `.html`. Preserve the body of `docs/plans/PAYPAL_PLAN.md` unchanged; it carries a supersession banner added 2026-10-07, and both the pre-banner and post-banner SHA256 values are recorded in `00-status.md`.

## Current review artifacts

- `01-product.md`: approved Gate 1 product scope with buyer/merchant journeys, rules, sponsor roles, both buyer entry points (text and scan) and an untested usability target.
- `mockups/index.html`: entry to five product screens. `merchant-onboarding.html` shows both uploads, editable drafts, manual/failure states and confirmation/publication blockers. `buyer.html` shows the text entry point and the scan entry point including an unenrolled-sticker result.
- `research.md`: primary-source sponsor/menu limitations, corrections to the original brief, prior-art findings from shipped SGQR payment products, and unresolved proof requirements.
- `02-architecture.md`: approved Gate 2 proposal with alternatives, component ownership, routes, data/query outlines, core flows, external configuration names and unresolved proofs. Architecture authority for planning; approval does not resolve the preceding review findings.
- `stack-recommendation.md`: supporting mirror of the approved Gate 2 proposal; `02-architecture.md` remains authoritative.
- `roadmap.md`: discussion candidates including the separate Zapier menu-import slice. Not Gate 4 approval.
- `00-status.md`: current approvals, evidence boundary and fresh mockup checks. The older JPG preview is historical; current HTML is authoritative for review.

## Product scope to preserve

Visitors with PayPal or a compatible wallet buy in person from enrolled Singapore merchants. Merchants confirm outlet, menu, authority and connected destinations. Buyers use text or scan/paste, review the exact basket/costs, externally approve and receive an honest status; merchant acknowledgment is separate.

Buyers have two entry points, added 2026-10-07: a text request, or scanning/pasting the shop's SGQR sticker to pin that exact outlet with no location information required. A scan identifies a shop only — it is not payment authority, not a payment destination, and it cannot enroll a shop. An unenrolled sticker yields no purchase and offers text search instead. The sticker carries no wallet address, so it routes neither rail. Where one business identifier covers several outlets, each outlet records what distinguishes it so a scan resolves one location.

PayPal first; PYUSD only after independent proof. One rail per order. Changed items, amount, recipient, currency or rail require fresh approval. Pending/uncertain is not paid; reconcile before retrying. No custody or buyer private keys. PYUSD does not imply automatic SGD settlement.

Merchants upload both SGQR and a separate menu image. SGQR contains no menu and proves no ownership; decode only supported identifiers present and allow correction. AI by Zapier drafts menu names/SGD prices; merchants correct, supply availability/missing details and explicitly confirm before publication. Manual entry on failure; no guessed prices or auto-publication. This supersedes manual-only menus and optional Zapier.

Propose APIMatic PayPal Context Plugin and clients/documentation where access supports them; Render application hosting; Zapier AI menu drafting. Recovery execution is a Gate 2 architecture choice, not a requirement for a paid Render worker. AG Grid optional. Access, prizes, extraction and payment execution remain unproven. Temporary image access/removal, database history and upstream retention are distinct. Live launch needs separate provider, legal, merchant enrollment and operations checks.

Proposed target remains 4 of 5 first-time buyers completing an eligible test-environment purchase (PayPal sandbox or wallet devnet) within 3 minutes without coaching, with an external payment record matching the approved purchase. Record each tester's entry point, text or scan. It has not been tested.

## Next authorized action

The user authorized recording Gate 2 approval, committing only architecture planning and its existing mirrors/approval/handoff updates, `git merge --ff-only` into `main`, pushing `main` to `origin` and verifying the remote commit with `git ls-remote`. STOP after that verification. If fast-forward integration is impossible, report the blocker without rewriting history. Preserve the original brief and unrelated changes. Git publication means commits only; no visibility change, provisioning, installation or deployment is authorized. No Gate 3/4 or application implementation is authorized.

Approved proposal: Next.js on Render Free, Neon Free PostgreSQL, Better Auth in the app and finite hourly GitHub Actions maintenance over durable purchase/import state. No Supabase, paid Render worker/disk or continuous queue poller. Actions quota/zero-spend controls, free account access and cold-start performance need proof; no repository visibility change is authorized. Include cold-start time in the three-minute metric. Free hosting does not establish AI/Zapier entitlements.

PayPal retains the distinct authorized sandbox seller, external buyer approval, exact immutable purchase and provider verification. APIMatic context is development tooling; text/scan share published catalogue rules. Separate menu images use capped private database bytes behind the revocable Envoi proxy. The proposed fetch/result deadline is five minutes; normal closure deletes the row transactionally, while idle/crash cleanup is best effort hourly. There is no five-minute source-deletion guarantee or hard physical-retention limit; database restore history and upstream copies need consent. Stale maintenance/overdue sources block imports. These controls are untested; preview stays local.

PYUSD remains disabled; mint, wallet, conversion and recovery choices require proof and a Gate 2 amendment before dependent wallet contracts/slices. Provider access, sponsor entitlements, image fetch/removal and actual payment/scan evidence remain unknown. A failure changing the selected architecture reopens Gate 2; changed product behavior reopens Gate 1. Review the exact failure boundaries in `02-architecture.md` rather than treating this summary as a contract.

A fresh session can continue from these files; no material decision exists only in chat.

## Gate 3 handoff: inactive until separate user authorization

Independently cross-check the approved architecture and the preceding review findings before drafting `03-program-design.md`. Do not assume the previous agent's conclusions are correct. Resolve or explicitly disposition every item in [the unresolved review record](00-status.md#unresolved-review-findings): free-capacity budgets/polling/complete Actions overhead/shared quotas/zero-spend controls; cleanup when storage exhaustion blocks DELETE; logical checkout identity across duplicates/replacement reviews; image capability versus merchant-session/membership; anonymous deletion/linking, durable receipt ownership and payment retention; code-level versus credential-enforced maintenance PayPal authority; unsupported prior-art/SGQR claims and inconsistent timing definitions. All remain unresolved at this handoff.

Specify the file map, types/signatures without implementation bodies, call stacks, state transitions, authorization, retry/expiry/version races and meaningful failure tests. Include crash boundaries around every external call, genuine webhook verification, menu confirmation/publication and delayed maintenance. Actual account access and integration proofs belong to later authorized slices. PYUSD remains disabled. Any correction changing an approved architecture decision must reopen Gate 2 for approval before dependent work.

Only after separate authorization and completion of Gate 3 preparation, finish with exactly: `Approve Gate 3, or what should change?` Do not advance to Gate 4 or implementation. This saved instruction is not authorization to start Gate 3 now.
