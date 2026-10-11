# Envoi: proposed hackathon and production stack

Supporting mirror, updated 2026-10-11.
Gate 1 is re-approved; Gate 2's direct-vision/PYUSD amendment in `02-architecture.md` was re-approved on 2026-10-11.
`03-program-design.md` and unapproved `04-slices.md` are unchanged in this revision; affected old import/wallet content is superseded pending their gates.
Unaffected 2026-10-07 decisions, eight review dispositions and version pins stand, including OpenAI and `@ai-sdk/openai`.
No approval establishes runtime/account proof or authorizes installation or implementation; the user separately authorized committing and pushing these planning documents on 2026-10-11.
Production remains outside the free-hosting scope.

## Recommendation

**Unchanged approved core:** Next.js/TypeScript on Render Free, Neon Free PostgreSQL, in-app Better Auth and finite quota-gated GitHub Actions maintenance, direct PayPal Orders v2 and shared HTTP/MCP rules.
**[hypothesis] Amendment:** direct OpenAI menu vision on a browser-shrunk photo using request memory only and a bytes-free attempt; proposed separate `AI_MENU_MODEL`, no image proxy/storage/callback or import maintenance dependency.
Include independently gated PYUSD devnet with reviewed constants, merchant-set rate, Wallet Standard broadcast and finalized/complete-history recovery.
PYUSD remains disabled until proofs, after PayPal/S13 and first cut; S13 moves after S4 in the later Gate 4 revision.

| Layer | Hackathon choice | Production choice / reason |
| --- | --- | --- |
| Buyer and merchant UI | Next.js App Router, React, TypeScript; Tailwind and a small accessible component set. | Same stack. Thin UI around purchases and receipts, not a separate admin platform. HTML files remain the planning mockups. |
| Server | Next.js Node route handlers, shared TypeScript domain rules and Zod validation; finite Node maintenance from the same codebase. | Separate always-on recovery would need a new budget/topology decision. Extract another API only if a demonstrated transport/runtime constraint warrants it. |
| AI | Unchanged AI SDK/OpenAI provider/pin and `AI_MODEL` text budget (30 seconds/three read tools); proposed separate `AI_MENU_MODEL` for tool-free menu vision, explicit `store: false` and at most 60 seconds within the 90-second request. | Separate pre-registered task evaluations, account sharing/spend/retention confirmation and availability through 16 Dec. No capture/signing/publication or authoritative pricing tools. |
| Data and login | Neon Free PostgreSQL; Better Auth with Drizzle adapter and anonymous plugin inside Next.js. Permanent pre-provisioned merchant accounts plus approved memberships; secure database sessions survive Render sleep. No public merchant signup or mail/reset service assumed. | Separate environments, least-privileged web/maintenance roles and isolated migration role. All private access is server-authorized; no browser database/Data API. Verify regions, adapter configuration and pooled/direct connection compatibility. [Better Auth](https://better-auth.com/docs/introduction), [anonymous plugin](https://better-auth.com/docs/plugins/anonymous), [Neon pooling](https://neon.com/docs/connect/connection-pooling). |
| Money and rates | Integer SGD cents and PYUSD atomic units; shop sets positive atomic units/S$1, with date/version and 30-day re-confirmation. Amount is ceil(cents x atomicPerSgd / 100). No FX service. | Persist exact basis/amount/recipient/rail; expired/changed rate invalidates unexecuted PYUSD reviews, never released attempts. No market-rate or automatic SGD settlement claim. |
| PayPal | Direct server-side Orders v2 sandbox adapter with a distinct authorized allowlisted seller/payee, stable create/capture request IDs and provider re-reads. Buyer approves through PayPal Checkout. Toolkit is not the selected runtime dependency. | Live multiparty/platform enrollment and seller permissions require separate approval. APIMatic context supports development; generated clients must fit the same verification contract. [Orders specification](https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/checkout_orders_v2.json), [platform access](https://developer.paypal.com/platforms/get-started). |
| PYUSD | Proposed devnet identity/mint/program/6-decimal code constants; only `SOLANA_RPC_URL`/`PYUSD_ENABLED` config. Verified pre-existing merchant Token-2022 ATA and single-use SIWS/Ed25519 proof; `TransferChecked` only with zero fee horizon. Gate 3 selects compatible package pins later. | Wallet Standard sign-and-send; Envoi never signs/submits. Persist/lock before release using a `confirmed` blockhash; verify the finalized transfer's meaning, balance delta and mandatory reference, allowlisting only Phantom-added ComputeBudget and Lighthouse assertion instructions. Wallet blockhash/transfer preservation, chain honoring, the phone Browse-link proof and complete-history expiry release remain blockers. Mainnet needs separate gates. |
| SGQR decode: merchant upload and buyer scan | Unchanged browser decoder and validated supported-identifier resolution, merchant correction/operator mapping and camera/paste/text fallbacks. | Identity only, no menu/ownership/payment route. Keep the QR image out of menu vision; unsupported content is not guessed. |
| Separate menu-image import | Browser shrinks the photo to one JPEG of at most 2,048 pixels/side and 2 MiB; direct OpenAI image/schema request with in-memory re-validation/metadata strip/re-encode; bytes-free audit/admission record, no source row/URL. Merchant corrects/confirms before publication; manual fallback. | Actual no-disk/no-database/no-log-image proofs with injected SDK-error/base64 needle, bounded spend/RAM/latency and Chinese/rotated/small-text samples. Retention disclosure is not a zero-retention guarantee. |
| API / MCP | Versioned public HTTP registry reads, OpenAPI; scoped supported-client MCP tokens and stateless Streamable HTTP JSON responses; short-lived human handoff to a fresh buyer review. `@modelcontextprotocol/sdk` is pinned in `03-program-design.md`; transport interoperability with Next 16 is **[unknown]** (residual risk R10). | Shared domain checks, rate limits, Origin/Host validation and supported-client tests. No toolkit transport dependency in the selected PayPal runtime. [Transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [official SDK](https://github.com/modelcontextprotocol/typescript-sdk). |
| Durable recovery | Payment due fields/recoverable leases and finite quota-gated maintenance; bounded provider reads and existing review/session tasks. Synchronous imports compute expiry on read and do not need maintenance. | No image expiry/sweep, initial create/capture, wallet submit/rebroadcast or re-analysis. Incomplete RPC history and uncertain payments stay locked; schedules are best effort, not deadlines. |
| API tooling / developer portal | APIMatic Context Plugin for PayPal integration; proposed TS/Python clients from the actual registry OpenAPI definition, subject to account access. | Same if generated-client smoke tests remain useful. Portal/SDK generation is a distributability feature, not evidence of a working purchase. The sponsor's Basic offer does not establish access to every own-API portal feature; confirm the relevant tier. [Sponsor details](https://paypalaihackathon.devpost.com/details/apimatic). |
| Quality and operations | Candidate Vitest/Playwright checks, sandbox evidence, redacted logs, maintenance heartbeat, overdue work and operator records. Include idle cold starts in the three-minute metric. `03-program-design.md` now names the tests and pairs each guard with the mutation that proves it. | No Sentry/outbound notification service initially. A demo operator inspects failures and provider usage; live support/recovery targets require separate decisions. |

## Hosting including production

**[hypothesis] Hackathon:** one Render Free Node web service, existing Neon Free database and quota-gated finite GitHub Actions maintenance.
Neon `aws-us-east-2` is already accepted subject to the Slice 1 R12 latency measurement; it is not an open region-selection task.
In-app auth pins `public` and never queries unused `neon_auth` (R11).
Render is not provisioned; quotas/performance and OpenAI usable credits remain unknown, with no paid hosting fallback.

**[vendor claim] Limits:** Render Free sleeps after 15 minutes idle, may take about a minute to wake, has shared monthly instance hours and an ephemeral filesystem. Render Free Postgres expires after 30 days; there is no free Render worker/disk. Neon documents 1 GB/project Postgres storage, 100 CU-hours/project/month and 5 GB transfer/project/month, with five-minute scale-to-zero. Its quota-limited Free plan describes no 30-day expiry; account access/usage are still unverified. Capacity exhaustion can suspend reads or block cleanup writes. [Render Free](https://render.com/docs/free), [Neon plans](https://neon.com/docs/introduction/plans).

**[unknown] Scheduled execution:** remaining private minutes, shared CI usage and real duration still need account/runtime proof.
Preserve the approved every-six-hours-before-quota-confirmation cadence, moving to hourly only after quota confirmation or authorized publication, with the two-minute run bound.
Schedules are best effort; no new workflow, visibility, deployment or Git publication authority exists.
No image/payment artifacts or caches are uploaded by maintenance.

**Production pilot:** outside the current request. Define availability, recovery, storage/retention, mail/support and capacity needs before proposing a paid budget or revised topology. Free tiers/sandbox behavior do not establish production readiness.

Persist an attempt and due state before each payment request. No fire-and-forget work after an HTTP response. Webhooks/callbacks trigger verification, not automatic paid status. Only a server-verified capture or finalized semantically verified transfer can confirm payment; acknowledgment stays separate.

## Menu workflow boundary proposed in the Gate 2 amendment

Merchant membership and versioned consent -> bytes-free attempt/spend reservation -> bounded request-memory image decode/normalization -> one foreground OpenAI vision call with `store: false` -> strict validation and base-revision/edit-preserving draft transaction -> merchant correction/confirmation/publication.
No source row/image URL/callback/capability, import status/cancel route, image clock/task or maintenance-heartbeat dependency remains.
`GET menu-draft` reloads the latest outcome after a lost response; expiry is computed on read and late work cannot commit.

**[hypothesis] Budgets:** 90-second total request, at most 60-second model call with 5-second commit reserve, 30-second upload read; one in-flight/outlet and one globally; 10/outlet and 50/global admitted attempts per UTC day, plus a separately authorized daily spend ceiling.
The browser shrinks and re-encodes one JPEG of at most 2 MiB and 2,048 pixels/side, matching the evaluated high-detail target; the server accepts only that, bounds the whole body at 2.5 MiB and re-encodes it.
Route handler counts actual bytes; exclude upload from proxy body cloning and disk spooling.
These caps are unmeasured on Render's advertised 512 MB/0.1 CPU and do not establish a dollar cost or safe decoded-memory bound.

Draft bounds stay 100 rows/120 characters per name or portion/128 KiB serialized result, nullable unknown prices, no auto-publication, preservation of edits and revision/confirmation checks.
Only the current browser tab keeps its selected image, not persistent browser storage.
Logger allowlists non-content error metadata and drops SDK request/response/url/nested bodies; Gate 3 must test actual serialized logs with a planted image needle and no-disk probes.

Short consent says the photo goes to OpenAI, Envoi does not store it, OpenAI may keep it up to 30 days for abuse monitoring or longer for legal/harm reasons, and it is not used for training without opt-in.
Its details, part of the same consent version, cover the unpublished exact `store: false` effect, abuse-log removal only under Zero Data Retention and the CSAM manual-review exception.
User must confirm no data-sharing opt-in and accept the disclosure before real photos.
Separate text/vision model evaluation requires availability past judging; Chinese/rotated/small-price accuracy and Render latency/RAM remain falsifiers.
Timeout says Envoi stopped waiting, did not store the photo or apply late results, preserved edits and offers a clearer photo/manual entry; lost-connection copy instead asks to reload before retry.

R2 narrows to general Neon exhaustion that still blocks payment-state writes; R6 expands to RAM/CPU; image-churn R7 is superseded by admission/spend-sizing R7a.
Wallet display/chain and blockhash/transfer preservation, the phone Browse-link path, user faucet access and public RPC shared-IP/history completeness remain unknown.
Full consent, limits, wallet rules and evidence: [architecture](02-architecture.md), [source supplement](research.md#gate-2-source-supplement-2026-10-10).
Gate 3 now revises the affected contracts; this mirror is not implementation authority.
APIMatic/prize access remains account-conditional and unproven.

## Why this over the alternatives

- Next.js + Fastify adds another server boundary before a purchase works. The approved Gate 2 proposal selects one app first; a demonstrated MCP transport constraint would justify revising that decision.
- FastAPI + Python adds a second language across browser wallets, PayPal tooling and public clients. Use it only if an existing team capability makes that trade worthwhile; none is established here.
- OpenAI Agents SDK is an alternative; the approved Gate 2 proposal selects Vercel AI SDK only. This product needs constrained suggestions and deterministic rules, not multiple orchestration layers to calculate payment amounts.
- Render can host both app and database, but its free database expiry and paid-worker requirement fail the current constraint. Neon Free supplies persistent database capacity while the app stays on Render; free access and recovery still need proof. Supabase is unnecessary and currently unavailable to the user. Alternate hosting would require a Gate 2 revision.

## Production decisions technology cannot settle

1. **Provider eligibility:** prove the platform can receive live partner approval and Singapore sellers can use the chosen onboarding path. Sandbox access is not a promise of live approval.
2. **Regulatory treatment:** no custody alone does not determine exemption. Obtain qualified review of the actual service, including token-transfer facilitation. [MAS expanded scope](https://www.mas.gov.sg/regulation/notifications/expanded-scope-of-the-payment-services-act-2019).
3. **Merchant economics:** validate whether the merchant accepts the fee schedule, USD asset exposure, off-ramping burden and support/refund obligations. A cheap network fee is not a cheap complete purchase.
4. **Buyer approval:** a review button starts PayPal or wallet approval; it cannot silently manufacture buyer consent.
5. **Launch evidence:** actual recipient verification, duplicate handling, uncertain-result recovery, restore drill and named support ownership must pass before a live pilot.

These are launch blockers, not reasons to stop a sandbox hackathon plan. Keep mainnet and live credentials disabled until the relevant production gates are approved.
