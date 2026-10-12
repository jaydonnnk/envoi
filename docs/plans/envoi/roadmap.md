# Envoi: gate roadmap and candidate slices

Discussion candidates, updated 2026-10-12; not Gate 4 approval or a replacement build order.
Gate 1 is re-approved; Gate 2's direct-vision/PYUSD amendment was re-approved on 2026-10-11, and re-approved again the same day for two PYUSD double-payment fixes; the Gate 3 revision of affected contracts was drafted on 2026-10-11, revised after the user's review and for those fixes the same day, and re-approved on 2026-10-11, then reopened on 2026-10-12 for one PayPal kill-switch check and re-approved the same day; the Gate 4 slice plan was revised and approved on 2026-10-12, and `04-slices.md` is now the build order.
All unaffected 2026-10-07 decisions and eight review dispositions stand.
The 2026-10-12 Gate 4 revision merged S11/S12 into S11, dropped the Zapier access check, moved S13 immediately after S4, added PYUSD as S16 and S17 after S13 and first in the cut order, and applied the Gate 3 test delta recorded in `03-program-design.md` (199 previous names mapped to 92 named tests and 231 cases; 10 names removed, 21 cases added), assigning every named test once.
The candidate numbers below are not S-numbers.

The unchanged core is Render Free, Neon Free, in-app Better Auth, quota-gated finite GitHub Actions maintenance and direct sandbox Orders v2 with a distinct seller and lease-serialized recovery.
**[hypothesis] Amendment:** direct OpenAI menu vision on a browser-shrunk photo, request memory only, bytes-free attempt metadata, 90-second total/60-second model budget, no image routes/capabilities/tasks or maintenance dependency.
Proposed `AI_MENU_MODEL` separates vision evaluation without changing provider/pin.
PYUSD devnet constants, merchant rate, `confirmed`-blockhash preparation, Wallet Standard broadcast, finalized verification of the transfer's meaning and complete-history recovery are proposed, not enabled or proven.
Phone path: a Phantom Browse link carrying only public outlet/item IDs into a fresh wallet-browser session and review, still unproven.
No account, spend, installation, provisioning, workflow, deployment, visibility change or implementation is authorized here; the 2026-10-11 commit and push of planning documents was separately authorized.

## Four decisions, four approvals

| Gate | Decision in plain language | Deliverable | Evidence needed to approve |
| --- | --- | --- | --- |
| 1: Product | What can a visitor and a merchant actually do? | `01-product.md` and one plain HTML mockup per screen. | Agreed audience, journeys, scope, cuts, success measurement, test-environment labels, and external approval. |
| 2: Architecture | How will the parts connect, and where can payment authority exist? | `02-architecture.md`: routes, data, flows, boundaries, third parties and environment names. | Unchanged PayPal/hosting authority; request-memory vision/retention consent; merchant-rate devnet wallet construction/broadcast/finality/recovery with explicit proof blockers. |
| 3: Program design | What exact contracts prevent wrong payments and ambiguous state? | `03-program-design.md`: file map, types/signatures without bodies, call stacks, named tests, least confident choices. | Quotes bind buyer, outlet, recipient, items, amount/currency, rail and expiry; approvals cannot be reused. Payment recovery and menu validation, confirmation invalidation, duplicate/late results, timeout, import admission/spend and image-leak contracts are specified; PYUSD preparation, verification by meaning and complete-history recovery each have named guards. |
| 4: Vertical slices | In what order will each small user capability become runnable? | `04-slices.md` and the slice checklist in `00-status.md`. | Visible results, dependencies, named tests/mutations and proof of access, PayPal, SGQR, direct vision and wallet unknowns; revise only after Gate 3 re-approval. |

At each gate: save the document, summarize the choices, ask "Approve Gate N, or what should change?", and wait. If a later finding invalidates an earlier decision, reopen that gate. No application implementation begins before Gate 4 approval.

## Early feasibility decisions

Source research can happen during planning. Executable proof belongs to the approved slices. The original "day-1 spike" is replaced by early visible proofs with the correct buyer approval boundary.

| Proof | Passing evidence | If it fails |
| --- | --- | --- |
| PayPal purchase | Actual sandbox order, buyer approval, capture reference, amount/currency, basket/correlation and intended distinct seller/payee agree. | Diagnose sandbox seller permissions and the direct Orders adapter selected in the approved Gate 2 proposal. Do not substitute Envoi's payee; changes to selected architecture reopen Gate 2. Failure of unattended buyer authorization is expected, not a product kill. No pivot to an absent fallback plan. |
| SGQR decode, both entry points | Consented authentic photo set with decoded/confirmed values, unsupported and unreadable cases, and no invented identity. Buyer side additionally: scanning a sticker in place resolves one enrolled outlet, an unenrolled sticker resolves to no purchase, and a shared identifier covering several outlets asks which one. Original clean-sample target is 8/10; log every result. | Keep manual confirmation/entry, and keep the text entry point, which depends on neither decode accuracy nor camera permission. A low score invalidates "automatic extraction" or "60-second" claims, not necessarily the entire product. If no authentic samples exist, call the result fixture-only. |
| Direct AI menu-image draft | Consented OpenAI vision returns a strictly bounded unpublished draft; exact readable prices and blank unreadable values survive merchant correction/confirmation. Actual no-disk/no-log/no-database-image probes pass. | Challenge Chinese/rotated/small text, malformed/late output, lost responses, timeout, RAM, credit caps and edit races. Manual fallback is not an AI-import result; no zero-retention claim from `store: false`. |
| Free hosting and model access | Hosting/Actions quota and zero-spend controls, idle cold starts/delayed maintenance and OpenAI models available through 16 Dec. APIMatic remains separate/account-conditional. | No paid hosting fallback or assumed credits/access; account sharing/spend needs the user's confirmation. Topology/provider changes reopen Gate 2, not a silent workaround. |
| PYUSD transfer/recovery | Correct devnet constants/ATA/key-control proof and merchant rate; wallet honors chain and preserves the prepared blockhash, transfer and memo, adding only allowlisted ComputeBudget/Lighthouse instructions; server verifies finalized transfer/zero fee/transaction balance delta. Lost signature needs complete post-expiry history. Since 2026-10-11 the bytes leave the server once, and every attempt's window scan records any extra transfer. | No replacement while effect is possible or history incomplete. RPC, wallet mutation, phone/session or faucet failure keeps PYUSD unavailable and PayPal usable; no pre-broadcast enforcement claim. |

## Candidate hackathon slices

These are capability boundaries, not a promise of duration or final numbering. The first real payment must already enforce recipient/amount binding and basic idempotency; later recovery work does not excuse unsafe early slices.

| # | Runnable capability | What the user can see / acceptance evidence | Depends on |
| --- | --- | --- | --- |
| 1 | **Tracer bullet:** open a seeded shop, review a fixture basket, and reach an explicitly unpaid stub receipt through the Render Free app. | UI -> Node -> Neon-stored order -> UI works across sleep/restart. No payment executed; free hosting/session configuration and finite maintenance connectivity exercised where needed. | Approved Gate 4; Render Free/Neon Free and included Actions access. |
| 2 | **Single PayPal sandbox happy path:** create -> buyer checkout approval -> capture for one allowlisted seller, using APIMatic PayPal context during integration. | Actual capture and verified payee/amount/currency; cancel remains unpaid; repeat approval cannot create a second purchase. Bound purchase and basic uncertain-result reconciliation already apply. | 1; isolated sandbox credentials and plugin access. |
| 3 | Import a sticker into a merchant draft and confirm or correct its details. | Decode-first import, visible uncertainty, manual fallback, authentic sample report; personal proxies are not published as business identifiers. | 1; consented samples for an authentic accuracy claim. |
| 4 | Upload a separate menu image; direct OpenAI vision returns a draft within the request for merchant review or manual fallback. | No stored image/URL; bytes-free audit/admission, bounded latency/spend, leak probes, edit preservation, exact readable SGD prices and blank unknowns; explicit confirmation before publication. | 1; account sharing/spend/model access and consented vision samples. |
| 5 | An authorized demo merchant publishes its confirmed outlet/menu and connected accepted test destination. | Both image paths plus fallback; draft invisible until authorization, complete menu confirmation and connection checks pass. Edits invalidate confirmation. PYUSD connection is optional. | 2, 3, 4. |
| 6 | A buyer identifies a registered outlet and available items, by text request **or by scanning/pasting its SGQR sticker**. | Registered, merchant-confirmed prices; ambiguity, missing location/item asks for clarification. The scan path additionally proves an unenrolled sticker yields no purchase, a shared identifier covering several outlets asks which one, and camera denial falls back to paste then text. Model cannot invent prices or destinations. | 5. |
| 7 | Review eligible rails with sourced costs and a bound, expiring purchase. | Payer/merchant fee split; unknown FX stays unknown; changed items, amount, recipient, currency or rail require fresh approval. | 2, 6. |
| 8 | Complete a separate PYUSD devnet purchase after PayPal and MCP proof (S16 in the Gate 4 draft). | Pinned devnet mint/program/decimals, pre-existing merchant ATA and key-control proof, 30-day merchant rate/ceil amount, finalized wallet transfer verified by meaning with allowlisted wallet-added instructions. | 7, 12; user funding, wallet/phone proofs and approved Gate 2/3 contracts. |
| 9 | Merchant sees confirmed payment and acknowledges the order. | Buyer/merchant agree on payment evidence; pending is not paid; acknowledgment remains separate. | 2, 5; include 8 when available. |
| 10 | Expand PayPal recovery for lost responses/callbacks. | Duplicate/out-of-order events, reload and timeout converge on one capture. No blind recharge or cross-rail retry. | 2, 9. |
| 11 | Recover a lost wallet signature or confirmation response (S17 in the Gate 4 draft). | Persisted locked attempt, attributable finalized evidence that passes the transfer verification rule, or complete post-expiry absence; RPC gaps remain uncertain. Maintenance submits nothing. | 8, 9. |
| 12 | Compatible external MCP client discovers the shop and opens the unchanged human approval journey. | Published capabilities, single-use suggestions redeemed to a new server-priced review, no receipt readback or payment authority. In the Gate 4 draft, S13 runs right after S4. | 6, 7, 10; advertise PYUSD unavailable until its own proofs pass. |
| 13 | Developer uses an APIMatic-generated registry client/documentation where access supports it. | Client calls the running API; contract check passes; describe only demonstrated features. Raw documentation is a fallback, not proof of generated-client integration. | 12; actual generation/portal tier and terms confirmed. |
| 14 | Optional merchant offer within explicit rules. | Editable caps/time window; resulting price changes require renewed approval. Dialogue cannot authorize amounts. | Core payment/recovery slices pass. |
| 15 | Reproducible judged release with access and recorded evidence. | Import/failure evidence, actual payment references, proposed 4-of-5/3-minute usability test, mobile/keyboard checks, setup/reset, OSS license and short functioning video. Access lasts through judging. | All included slices; 13 is account-conditional and 14 optional. |

For each approved slice, execute its relevant failure probes as well as its happy path, attach actual evidence, check the status file only after verification, and ask "Continue to slice N+1, or re-steer?" Do not complete all data layers before a user can run a journey.

## Production continuation: a separate launch decision

Production is not a sandbox configuration flip. Candidate continuation after the hackathon:

| Candidate | User-visible result | Release prerequisite |
| --- | --- | --- |
| P1: Live seller enrollment | A real merchant grants provider permissions and is discoverable only after verified enrollment. | PayPal partner eligibility, approved live integration, verified business/outlet ownership, support and dispute responsibilities agreed. |
| P2: Controlled live PayPal purchase | A small authorized pilot produces a real merchant receipt and reconciles accurately. | Qualified regulatory/provider review, recipient tests, monitoring, kill switch, refunds/support process and operational recovery drill. |
| P3: Mainnet wallet purchase | An eligible payer approves an exact PYUSD transfer directly to an enrolled merchant wallet. | Separate legal/provider assessment, verified mainnet mint and destination ownership, audited signing/transaction path, merchant acceptance of PYUSD and conversion policy. This can remain disabled indefinitely. |
| P4: Operated pilot | A merchant can handle cancellations/refund requests and the team can detect/recover incidents. | Access controls, retention policy, backup/restore proof, verified provider events, reconciliation alerts, rate limits and documented incident ownership. |

Reopen Product/Architecture/Program Design for changed live capabilities before approving production slices. Operational controls needed for P2 must already be present before P2 starts; P4 expands their pilot use, not postpones them.

## Scheduling without invented effort estimates

Planning windows, not duration estimates: 6-11 Oct gates and early evidence setup; 12-25 Oct core journeys, payment proofs, PayPal recovery (S3) and the MCP handoff (S13); 26 Oct-1 Nov menu import, scan, PYUSD purchase and recovery (S16, S17) and SDK work; 2-8 Nov rehearsal and submission assets; 9-12 Nov correction buffer.
The Gate 4 draft places a **[hypothesis]** PYUSD go/no-go when S11 is done, or on 28 Oct at the latest.
Target submission before 12 Nov evening SGT; official cutoff is 13 Nov 04:00 SGT.
Gate approval delays and runtime failures can change these windows.

User-decided capability cut order: PYUSD (S16 and S17) first, scan (S10) next, account-conditional APIMatic S14 after scan.
Optional voice/negotiation/AG Grid/catalogue breadth do not become core work ahead of those decisions.
Never cut payment evidence, approval/recipient checks, menu confirmation, no-image-retention controls or uncertainty handling.
Manual fallback alone cannot support an AI-drafting claim; cutting affected product scope must be recorded/re-approved rather than hidden.
**[unknown]** Carry model availability/sharing/retention, Chinese-text accuracy, decoder RAM/latency, wallet chain/blockhash preservation/display, the phone Browse-link path, faucet and shared-IP/history limits.
R2 narrows to generic storage exhaustion; R6 expands to RAM/CPU; R7 image churn is superseded by admission/spend-sizing R7a.
Full choices and sources: [architecture](02-architecture.md), [supplement](research.md#gate-2-source-supplement-2026-10-10).
None of these candidates authorizes implementation.
