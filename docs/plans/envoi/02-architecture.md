# Architecture: Envoi

**Reopened and revised 2026-10-10, revised again after review on 2026-10-11, and RE-APPROVED by the user on 2026-10-11** ("gate 2 approved").
This amendment replaces Zapier with a direct OpenAI vision request and includes the independently gated PYUSD devnet rail.
The 2026-10-11 review changed five points: the browser shrinks the menu photo before upload, PYUSD verification checks the transfer's meaning and allowlists the instructions Phantom documents adding, preparation uses a `confirmed` blockhash, the phone path is a plain Phantom Browse link, and the consent text is short with details on request.
**Reopened again on 2026-10-11 for two PYUSD double-payment fixes found in the Gate 3 review, and RE-APPROVED the same day:** the user approved the fixes in advance ("reopen gate 2 and approve the fixes i approve it already").
Preparation now releases the unsigned bytes exactly once and never stores them, because a wallet may add different instructions each time it signs ([step 4](#preparation-wallet-broadcast-and-verification)).
The post-expiry history scan now runs for every released attempt, including a confirmed one, so a second transfer carrying the same reference is recorded and shown instead of going unnoticed ([recovery](#lost-response-recovery-and-rpc)).
**Reopened 2026-10-15 for one change, approved by the user in advance:** menu photos are English only for this hackathon, so the evaluation and the falsifier samples no longer require Chinese text, and on a line printed in English and another script only the English name is drafted ([consent and evaluation](#request-memory-menu-boundary)).
**Reopened 2026-10-18 for one change and RE-APPROVED by the user the same day** ("Yea sure i approve the gates then make the relevant changes and push to main thnaks"): the Phantom Browse link also names the PYUSD rail, and the page it opens in Phantom's browser creates the fresh PYUSD review itself, so the buyer confirms one review there instead of a shop page, a PayPal review and a switch ([phone path](#phone-path-and-independent-access-gate)).
Everything else approved on 2026-10-07 stands, including hosting, in-app auth, PayPal recovery, identity-only scan and MCP handoff.
Gate 1 was re-approved on 2026-10-10; Gate 3 may now revise affected contracts, and Gate 4 waits for Gate 3 re-approval, which the user gave on 2026-10-11.
See [`00-status.md`](00-status.md#reopening-2026-10-10-zapier-removed) and [`handoff.md`](handoff.md#gate-2-handover-2026-10-10).

Product authority: [approved Gate 1](01-product.md).
The 2026-10-07 Gate 2 approval accepted a proposal, not runtime/account proof or Git authority for this revision.
The eight earlier review findings were dispositioned by Gate 3 on 2026-10-07, with residual risks retained.
[`03-program-design.md`](03-program-design.md) remains unchanged in this amendment and is superseded only for import and PYUSD-dependent contracts pending Gate 3 revision.
Its independent source corrections still bind: PayPal has no fixed documented idempotency window, capture is lease-serialized, and Neon storage exhaustion blocks inserts, updates and deletes.
This document contains no application implementation or approved slices.

**Provisioned-state note, 2026-10-07.** The live Neon project has **Neon Auth enabled** on branch `production`, which this proposal does not use. A read-only inspection established that it is isolated: all nine of its tables live in a dedicated `neon_auth` schema and `public` contains zero tables. **Two constraints therefore bind this architecture's Better Auth implementation:** never build against or query `neon_auth`, and pin the Drizzle adapter explicitly to `public` so that no unqualified `user`, `session`, `account` or `verification` name can resolve into the other schema through a search path. The unused service was left enabled; removing it is a provisioning decision with its own authorization.

## Read this first

Envoi keeps the shop catalogue and purchase record. PayPal or the buyer's wallet handles payment approval. Recovery state survives in PostgreSQL; a finite maintenance job checks unfinished work even when the app is asleep.

- **[verified] User constraint:** free hosting services only; the user cannot create another free Supabase database. This replaces the earlier Supabase/Render-worker draft without changing approved product behavior.
- **[hypothesis]** One Next.js/TypeScript app on Render Free, Neon Free PostgreSQL, Better Auth inside the app and a finite Node maintenance runner scheduled with GitHub Actions. No Supabase, paid Render worker or separate API service.
- **[hypothesis]** PayPal sandbox Orders v2 through a direct server adapter, with a distinct, authorized sandbox seller. No default payment to Envoi's own account.
- **[hypothesis]** Text and SGQR lookup reach the same published catalogue. AI suggests items; stored prices and connected destinations determine the purchase.
- **[hypothesis]** A consented menu image is shrunk in the browser, then goes directly to OpenAI inside the upload request, with `store: false`, no Envoi image storage or image URL, and a merchant-confirmed draft only.
- **[hypothesis]** PYUSD uses the pinned devnet mint, a verified merchant wallet and its dated rate, Phantom Wallet Standard signing/broadcast, and finalized server verification of the transfer's meaning rather than its exact bytes.
- **[unknown]** Seller permissions, model accuracy/latency, OpenAI account data-sharing, wallet behavior, phone access, faucet access and RPC reliability are unproven.
  PYUSD stays visibly disabled until its independent proofs pass; PayPal does not depend on it.

All proposed limits below are **[hypothesis] design choices**, not measured performance or provider guarantees. All routes/tables are proposed, not existing code.

## Fit

**[verified]** The 2026-10-10 checkout contains planning Markdown, six standalone HTML mockups, a historical JPG and tracked Neon provisioning files (`neon.ts`, `package.json`, `package-lock.json`, `.gitignore`).
The manifest holds only `@neon/config` and `@neon/env`; no application, migrations or tests exist.
Evidence: repository inventory and [status](00-status.md).
Preserve the approved mockups and superseded original brief.

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| **Render Free app + Neon Free database + scheduled maintenance** | UI, HTTP API and MCP share rules; persistent records survive a sleeping app. | **Recommended free-hosting draft.** Cold starts, quotas, scheduled-job access and delayed recovery need proof. |
| Render Free app + Render Free Postgres | One hosting vendor for app and database. | Database expires after 30 days; insufficient for submission through judging. Render has no free background-worker service. |
| Render app/worker + Supabase | Managed database/auth/storage plus continuous recovery. | Supabase quota unavailable to the user; the Render worker violates free-only hosting. Superseded. |
| Next.js plus a separate Fastify API and worker | Independent API transport and scaling. | Another deployment/authentication boundary before one purchase works. Reconsider only if a measured transport constraint demands it. |
| Next.js plus a Python backend | Viable with an established Python team. | Adds a language boundary for browser wallets and shared contracts; no existing Python implementation or team constraint is established. |

**[hypothesis] Selected topology:** Next.js App Router in the Node runtime, TypeScript domain modules, Zod validation, Drizzle migrations/queries and Vercel AI SDK for suggestions and direct vision drafting.
Render Free hosts the app; Neon Free holds domain data, Better Auth sessions and bytes-free import metadata only.
Better Auth is a library in our app, not another hosted service.
A finite Node runner from the same codebase reconciles payment attempts and performs existing non-image maintenance through GitHub Actions.
Imports are synchronous and have no maintenance-heartbeat dependency, queue, sweep or automatic re-analysis.
No Redis, `pg-boss` or always-running queue poller initially.
Gate 3 revises only affected contracts; the approved OpenAI provider and `@ai-sdk/openai` pin do not change.

**[vendor claim]** Next.js supports Node deployment. Render Free sleeps after 15 minutes idle, may take about a minute to wake, offers 750 shared instance hours/month and has an ephemeral filesystem. Its free database expires after 30 days and background workers have no free instance type. These are documented limits, not observed Envoi performance. No persistent images, sessions or jobs on Render's filesystem. [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying), [Render Free](https://render.com/docs/free).

**[vendor claim]** The retained source record describes Neon Free as 1 GB Postgres/project, 100 CU-hours/project/month, 5 GB public transfer/month and five-minute scale-to-zero, without Render's 30-day database expiry.
Compute/transfer exhaustion suspends compute; the approved Gate 3 cross-check established that storage exhaustion blocks inserts, updates and deletes.
The provisioned project is `aws-us-east-2`, accepted by the user subject to R12 measurement, not an unselected Singapore region.
Use small compute, bounded connections and no idle polling; remaining account quota is unknown.
[Neon plans](https://neon.com/docs/introduction/plans), [recorded update](https://neon.com/blog/neon-free-plan-1-gb-per-project).

**[hypothesis] Free maintenance, unchanged approved cadence:** bounded Node job at minute 17, every six hours before quota confirmation and hourly only after that confirmation or public-repository authorization, with the approved two-minute timeout/overlap controls.
Connect directly to the database, never pre-warm Render; no image/payment artifacts or caches are uploaded.
Private runs need remaining included quota/zero-spend proof, shared with CI; repository visibility and workflow creation remain unauthorized.
A manual operator run is not unattended scheduler proof.
**[vendor claim]** GitHub schedules can be delayed/dropped, require the default branch and may be disabled after 60 inactive public-repository days.
Recovery/review/session maintenance is best effort, not a deadline or image cleanup promise.
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [included usage](https://docs.github.com/en/billing/reference/product-usage-included), [schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

**[unknown] Free access and performance:** verify account quotas, no paid hosting fallback/overage, scheduled execution and cold-start buyer journeys before a judged release.
Include cold-start time in the approved three-minute usability measurement; do not silently pre-warm it.
The provisioned Neon region `aws-us-east-2` remains accepted subject to the Slice 1 latency measurement (R12).
OpenAI stays by user decision because they have credits, but usable credit balance, model access and data-sharing settings remain unverified.
Credits do not authorize evaluation spend or establish availability through judging.

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Browser | Camera/local QR decode, local menu preview and pre-upload photo shrink, user choices, provider/wallet handoff. | Trusted prices, destination verification, credentials or a paid-state decision. |
| Catalogue / enrollment | Outlet identity, memberships, approved identifier mappings, menu versions, destination connections. | Auto-enrollment from a scan or AI-based proof of ownership. |
| Purchase domain | Immutable review, actor binding, amount calculation, execution lock, payment status and separate acknowledgment. | Arbitrary amounts/payees supplied by an agent, browser or model. |
| AI suggestion adapter | Interpret text and propose registered outlet/item IDs or a clarification. | Capture, signing, publication, SQL execution or authoritative price calculation. |
| PayPal adapter | Exact sandbox create/read/capture and verification under enrolled seller permissions. | Changing an approved purchase or substituting Envoi's account. |
| Import adapter | Request-memory re-validation/normalization of the browser-shrunk JPEG, one budgeted vision call, validated draft merge and bytes-free attempt metadata. | Stored image bytes/URLs, image-bearing logs, payment credentials, destination changes or publication. |
| PYUSD adapter | Devnet reads, unsigned transaction construction, finalized semantic verification and expiry recovery. | Buyer/server signing keys, broadcast, custody or a mainnet fallback. |
| Maintenance runner | Bounded provider reads, reconciliation of existing PayPal/PYUSD attempts and existing review/session maintenance with operator-visible failures. | Initial capture, transaction submission, replacement payment, image tasks or keeping the app/database continuously awake. |

## Endpoints

Proposed application API prefix: `/api/v1`. Body fields, response/error types and OpenAPI details belong to Gate 3. All private reads and writes verify the caller and object ownership server-side. Browser mutations use same-origin/CSRF protection; agent tokens have separate scopes.

| Verb + route | Purpose / authority |
| --- | --- |
| `GET/POST /api/auth/[...all]` (outside `/api/v1`) | Better Auth session routes; secure cookie sessions, anonymous buyers and pre-provisioned merchant sign-in. Library-managed routes do not grant outlet membership. |
| `GET /outlets`, `GET /outlets/{id}/menu` | Public, paginated reads of enrolled, published fixture outlets and their confirmed menu/capabilities. No credentials, personal proxies or raw payout configuration. |
| `POST /outlets/resolve-sgqr` | Validate a bounded QR payload and return zero, one or several published outlet matches. Never create an enrollment or payment. |
| `POST /buyer/suggestions` | Buyer session: bounded text/area request; registered suggestions or clarification. Never a transfer tool. |
| `POST /purchases` | Buyer session: selected outlet/item IDs and quantities become a server-priced, expiring review. Client prices/payees are not accepted. |
| `GET /purchases/{id}` | Owning buyer session or the authorized merchant: relevant purchase, payment evidence and separate acknowledgment. |
| `POST /purchases/{id}/paypal/start` | Owning buyer explicitly continues from the current review; persist an attempt and create one exact sandbox order. |
| `POST /purchases/{id}/paypal/complete` | Owning buyer requests completion after external approval; server re-reads and checks the bound PayPal order before capture. |
| `POST /purchases/{id}/cancel`, `POST /purchases/{id}/reconcile` | Close an unexecuted purchase, or request a bounded status check. A cancellation racing with dispatched capture remains pending/uncertain until checked. |
| `POST /merchant/outlets`, `PATCH /merchant/outlets/{id}` | Permanent merchant login plus allowlisted membership: create/edit an unpublished outlet draft. Changes invalidate relevant confirmation. |
| `PUT /merchant/outlets/{id}/destinations/paypal` | Select an operator-prepared sandbox seller connection assigned to this merchant; verify provider permissions/capability. Arbitrary pasted merchant IDs cannot connect. |
| `POST /merchant/outlets/{id}/menu-imports` | Membership and versioned consent; bounded synchronous image-to-draft request, returning its outcome with no image bytes. |
| `GET/PUT /merchant/outlets/{id}/menu-draft` | Membership: reload draft plus latest import outcome, or manual corrections with revision conflict checks. No import status-poll/cancel route. |
| `POST /merchant/outlets/{id}/destinations/pyusd/challenge`, `PUT /merchant/outlets/{id}/destinations/pyusd` | Membership: issue a single-use wallet challenge; verify signed key control and the pre-existing merchant Token-2022 associated token account. Operator enrollment is still required. |
| `PUT /merchant/outlets/{id}/pyusd-rate` | Membership: append/re-confirm the shop's positive integer atomic-units-per-SGD rate; invalidate unexecuted PYUSD reviews. |
| `POST /purchases/{id}/pyusd/prepare` | Owning buyer explicitly continues; recheck review/rate/destination, persist and lock the attempt before releasing one unsigned devnet transaction, exactly once; a repeat call returns the attempt's status, never the bytes (reopened 2026-10-11). |
| `POST /purchases/{id}/pyusd/submitted` | Owning buyer posts the wallet's returned signature as a hint only; finalized server verification decides payment. Shared `reconcile` route handles both rails. |
| `POST /merchant/outlets/{id}/confirm`, `POST /merchant/outlets/{id}/publish` | Confirm exact current revisions; publish only with enrollment, confirmed complete menu and an active accepted test destination. |
| `GET /merchant/outlets/{id}/orders`, `POST /merchant/orders/{id}/acknowledge` | Membership-scoped list; acknowledge only a verified payment, independently of payment status. |
| `POST /merchant/orders/{id}/archive` (added 2026-10-24) | Membership: hide one order from the merchant's list as an archived record; never erases, never changes payment, receipt or acknowledgment. See the [amendment](#shop-qr-and-order-archive-amendment-2026-10-24). |
| `POST /purchase-requests`, `POST /purchase-requests/redeem` | Scoped external-agent token creates a suggestion/human handoff; buyer session redeems a short-lived token into a new review. Neither authorizes payment. |
| `POST /integrations/paypal/webhook` | Verify the event against the configured sandbox app, deduplicate and persist a due provider read. Event content alone cannot mark paid. |
| `GET /health` | Minimal web readiness; private/operator view checks maintenance heartbeat, overdue work and capacity without exposing secrets. |

UI routes: `/buy`, `/review/{purchaseId}`, `/receipt/{purchaseId}`, `/merchant/setup`, `/merchant/orders`, `/approve/{handoffToken}`, and PayPal return/cancel pages. Return/cancel pages show/check persisted state; a GET or URL parameter cannot execute capture. Approval pages contain no third-party analytics and use a no-referrer policy.

Separate `/mcp` endpoint: Streamable HTTP `POST`; stateless JSON responses, `GET` and `DELETE` return method-not-allowed unless a later approved transport needs them. Validate Origin/Host, transport version and bounded input. A scoped supported-client token permits `search_outlets`, `get_menu` and `create_purchase_request`; no capture, arbitrary transfer, menu-write or unrestricted receipt tools. Public registry reads remain available through HTTP. **[vendor claim]** MCP specifies Origin validation and transport security requirements; actual Next.js/SDK/client interoperability is **[unknown]**. [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

Wallet routes are proposed in this amendment, not implemented or enabled.
Gate 3 supplies their exact contracts in its revision.

## Data

**[hypothesis]** One PostgreSQL database is authoritative. Store SGD in integer cents, token quantities in integer atomic units and conversion ratios with decimal-safe arithmetic. No floating-point payment calculations. Use transactional version checks and unique constraints; a queue message is a trigger to inspect state, not authority to repeat an external effect.

| Proposed records | Stored outline | Queries / constraints |
| --- | --- | --- |
| `merchant_memberships`, `enrollments` | Auth user, outlet role, operator approval, demo label and evidence references. | Authorize every merchant action by user + outlet; only operators can approve enrollment. No credentials or ownership documents in the public view. |
| `outlets`, `outlet_identifiers` | Legal-entity reference if present, distinct outlet ID/address, optional confirmed coordinates, supported scheme/identifier mapping, publication and version. | Search published name/area/menu; identifier lookup can return several outlets. A business ID is not globally unique per outlet. No inferred distance without usable coordinates. |
| `payment_destinations` | Outlet, rail, environment, verified seller/wallet ID, secret-reference name, ownership/permission status and version. | Resolve an accepted active destination server-side; changes invalidate affected reviews. Secret values live in managed service configuration, never these rows. |
| `menu_revisions`, `menu_items` | Draft revision, item IDs/name/portion, nullable SGD cents, merchant-supplied availability and confirmed revision. | Only published confirmed revisions are buyer-readable. Corrections invalidate confirmation; missing prices cannot become zero. Publishing switches a pointer atomically. |
| `menu_imports` | Actor/outlet, base revision, consent version/time, model/config version, start/finish, outcome, result fingerprint, counts, reserved spend and latency. No image, image hash, URL or capability token. | Transactional one-in-flight/outlet and global/daily admission caps; compute expiry on read. Late work must still match its attempt/deadline/base revision before merging. No cleanup task. |
| `wallet_challenges`, `pyusd_rates` | Merchant/outlet/wallet, exact challenge bytes, purpose/domain/cluster, nonce hash, issue/expiry/consumption; append-only integer rate, version and confirmation time. | Single-use challenge, membership-bound verification; compute 30-day rate expiry on read. Retain rate history for receipts, not external FX quotes. |
| `purchases` | Owning buyer, entry point, immutable basket, menu/destination versions, rail/amount/currency, cost basis, review expiry and acknowledgment; PYUSD rate version/time, atomic amount and selected buyer wallet. | Buyer/merchant-scoped reads; lock before execution. Rate/destination changes invalidate only unexecuted reviews. Never mutate a released wallet attempt or transfer ownership between sessions. |
| `payment_attempts`, `provider_events` | Existing PayPal identities/evidence; PYUSD prepared-message fingerprint, fee payer/source/destination, blockhash, last-valid block height, preparation slot, reference, submitted-signature hint, scan cursor/completeness and finalized evidence; since the 2026-10-11 reopening, extra transfers found by the window scan. | One active attempt/purchase; unique external reference and finalized signature binding. Persist before release; recovery needs complete evidence, not a timeout. No unsigned or signed transaction bytes and no key storage. |
| `purchase_requests` | Agent token identity, suggested IDs, token hash, expiry and redeemed buyer/purchase binding. | One redemption; no payment authority or private receipt access for the creating agent. |
| Better Auth tables | Library-owned users, accounts and durable sessions; anonymous-user marker. | Auth migrations are distinct from domain membership. Guest users cannot acquire merchant rights by linking/registering an account. |
| `audit_events`, `maintenance_runs` and due fields on attempts | Actor/object IDs, transition/reason, evidence pointer; next-check time, lease/expiry, retry count and last successful maintenance time. | Business transition and due work persist in one transaction. Exclude raw prompts/images/base64/data URLs, QR payloads, bearer tokens and privileged provider/error bodies. Import metadata is not image storage. |

Authentication: Better Auth inside Next.js with its PostgreSQL/Drizzle adapter and anonymous plugin; permanent email/password accounts for allowlisted demo merchants, anonymous sessions for buyers. Use secure, HttpOnly cookies, a stable server secret and database sessions that survive Render sleep/redeploy. Disable public merchant signup; pre-provision authorized test accounts out of band with no committed/default passwords. Email verification/recovery needs a separate mail decision and is not claimed here. Require a non-anonymous user plus an operator-approved membership on every merchant action. Clearing the buyer session can lose receipt access; disclose prepared test sessions and do not expose receipts by a guessable ID. **[vendor claim]** Better Auth documents these library integrations; their combined configuration remains untested. [Introduction](https://better-auth.com/docs/introduction), [anonymous plugin](https://better-auth.com/docs/plugins/anonymous), [email/password](https://better-auth.com/docs/authentication/email-password), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Next.js integration](https://better-auth.com/docs/integrations/next).

Browser domain reads/writes go through Envoi routes; no browser database credentials or direct Data API.
Separate least-privileged web, maintenance and migration roles.
Membership/object checks remain mandatory on menu upload, draft reload and wallet enrollment.
There are no image/result capability principals.
Use TLS-verified connections; a small pooled connection for web requests and direct connections for migrations or session-dependent maintenance.
Do not rely on session-level state through transaction pooling.
**[vendor claim]** Neon documents pooled/direct differences; adapter and lease compatibility must be proved.
[Connection pooling](https://neon.com/docs/connect/connection-pooling).

Editing a published menu creates an unpublished revision; buyers continue to see the last confirmed revision until replacement publication. Replaced prices/availability or destination changes invalidate affected unexecuted reviews. Already captured payments retain their original evidence; a menu edit cannot erase a payment.

## Flow

### Merchant enrollment and menu

1. Permanent merchant login -> allowlisted membership -> unpublished outlet. Operator records demo authority and assigned test destination; format checks and possession of SGQR are insufficient.
2. Browser decodes SGQR locally -> server validates supported fields/checksum -> merchant reviews/corrects -> operator-approved mapping.
   Do not send the QR image to the model; discard raw payload and never log it.
   Unsupported/personal proxies do not become published business identifiers.
3. Merchant selects a separate menu image and accepts the versioned OpenAI disclosure -> the browser decodes, orients and shrinks a JPEG copy, keeping the original only in this tab -> membership/origin/admission checks -> bytes-free attempt and spend reservation -> bounded in-memory read, `sharp` re-validation, metadata stripping and re-encode.
4. Within this request, make one foreground vision call with explicit `store: false`, strict structured output, an AbortSignal and no tools or automatic retries.
   There is no stored image, image URL, callback or work scheduled after the response.
5. Validate the result -> transaction rechecks attempt/deadline/membership/base revision -> preserve merchant edits, invalidate menu confirmation, merge into an unpublished draft and close the attempt atomically.
   A changed or confirmed draft is not overwritten; report the conflict rather than repairing it silently.
6. Merchant supplies missing prices/portions/availability, confirms the complete revision and publishes through the unchanged enrollment/confirmation/destination transaction.
   Model output cannot publish.

**[vendor claim]** AI SDK defaults to the Responses API with `store` true and strict JSON schema true; optional schema properties are unsupported, so missing values are explicit nullable fields.
**[unknown]** Image input plus this schema on the selected account/model is untested.
[Provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai).

### Request-memory menu boundary

All numbers here are **[hypothesis] proposed safety/UX budgets**, not benchmarks or earned capacity.
The bytes-free `menu_imports` row is retained for audit, one-in-flight enforcement, spend admission, lost-response recovery and latency evidence.
It never becomes a background image job.

| Proposed policy | Choice / failure behavior |
| --- | --- |
| Upload | The browser decodes the selected photo, applies its orientation, shrinks it without enlarging to at most 2,048 pixels/side and re-encodes one JPEG of at most 2 MiB. A photo the browser cannot decode or fit under that limit stops before upload and offers another photo or manual entry. The server accepts only one actual JPEG within the same 2 MiB and 2,048-pixel limits, bounds the whole multipart request at 2.5 MiB, validates decoded content and rejects malformed content. No URL input, disk spool, file upload API, database bytes, CDN or framework optimizer. |
| Transport | Node route handler, not a Server Action. Exclude this route from proxy/middleware body cloning; origin/auth checks live in the handler. Count streamed bytes even without a truthful Content-Length, and bound upload reading to 30 seconds. |
| Normalization | The 2,048-pixel/2 MiB target follows the evaluated model's high-detail effective limit; shrinking can lose small text, and the sample evaluation must challenge that choice. Raising the limit after evaluation is a recorded Gate 2 change because it moves R6. The server decodes the bounded JPEG once, auto-orients, strips metadata and re-encodes without enlarging, with one decoder at a time. The pixel limit bounds a decoded frame at about 4.2 megapixels, roughly 17 MB as RGBA by arithmetic; actual `sharp` memory remains unmeasured. |
| Time | `T_MENU_REQUEST`: 90 seconds from admission to completion, including upload/decode/model/commit. `T_MENU_MODEL`: at most 60 seconds and no longer than remaining request time minus a 5-second commit reserve. Abort on budget/client disconnect where observable; reject any late result. Abort is not proof OpenAI stopped processing or billing. |
| Admission/spend | One in-flight import/outlet and one globally, checked before image buffering; 10 admitted attempts/outlet and 50 globally per UTC day. Failed/aborted attempts count. Reserve worst-case input/output spend against an operator-approved daily credit ceiling; fail closed until ceiling and model price/token bounds are recorded. These caps do not establish a dollar cost or safe RAM use. |
| Crash/lost response | Derive abandoned/expired outcome on read at the request deadline; no expiry task or heartbeat dependency. Reload `GET menu-draft` before retry: a committed result stays visible, a still-live attempt blocks another. Atomic close/merge and attempt identity prevent a late response from overwriting edits. A disconnect is not proof that nothing committed. |
| Draft result | At most 100 rows, 120 characters/name or portion and 128 KiB serialized result. Strict required-but-nullable fields; positive decimal-safe SGD prices only. Unreadable/ambiguous prices stay blank, not zero; duplicate variants need resolution, availability stays merchant supplied. |
| Logging | Allowlist error name/code/status and bounded non-content metadata only. Drop AI SDK `url`, `requestBodyValues`, `responseHeaders`, `responseBody`, arbitrary message/data/cause and nested content; never log the whole error. No prompt/image/base64/data URL in logs, traces, responses, artifacts or audit. |
| Preview/retry | Only the current browser tab keeps its selected image for side-by-side review. Reload may require selecting it again. No localStorage/IndexedDB image persistence, server copy or automatic re-analysis; a fresh merchant action and consent start another attempt. |

**[vendor claim]** Render Free has 0.1 CPU/512 MB and documents HTTP responses up to 100 minutes, not a 90-second mobile/intermediary guarantee.
Next Server Actions default to 1 MB; proxy body cloning defaults to a 10 MB buffer, not an upload rejection policy.
AI SDK API errors can contain the image-bearing request body.
**[unknown]** Vision latency, `sharp` memory for a 2,048-pixel JPEG on 512 MB, browser decode/shrink of large or HEIC phone photos and account-specific request retention.
Sources and qualifications: [Gate 2 source supplement](research.md#gate-2-source-supplement-2026-10-10).

Timeout copy proposed for the future implemented UI:
> Drafting took too long, so Envoi stopped waiting and did not apply a late result.
> Envoi did not store your photo; OpenAI's retention rules still apply.
> Your existing edits are unchanged.
> Try a clearer or closer photo, or enter the menu manually.

For a lost connection, use different copy: "The connection was lost. Reload the draft to check whether it finished before trying again."

Versioned consent copy, proposed for approval here, not a mockup edit.
The short text is always shown; the details sit behind a "Details" control and belong to the same consent version.
> Your menu photo is sent to OpenAI to draft item names and SGD prices while you wait.
> Envoi does not store it; only this browser tab keeps a copy, for side-by-side review.
> OpenAI may keep it for up to 30 days for abuse monitoring, or longer where the law or harm prevention requires, and does not train on it unless the account owner opts in.
> Upload only a menu, with no people or personal information.

Details:
> Envoi sends the photo with OpenAI's `store: false` setting, which asks OpenAI not to keep the request for later use; OpenAI does not publish exactly what it changes for this kind of request.
> That setting is separate from the abuse-monitoring copy, which OpenAI removes only for approved Zero Data Retention accounts.
> OpenAI keeps an image its systems flag as possible child sexual abuse material for manual review, even when other retention is off.
> These are OpenAI's published terms; Envoi has not verified OpenAI's actual deletion.

Before real merchant photos, the user must confirm their OpenAI organization/project has not opted in to data sharing and accept this disclosure.
Prove on the actual upload/error surfaces that no image is written to disk, database, logs or artifact storage, including an injected base64 needle that the leak scanner detects.
Begin with explicitly consented English menu test photos, including rotated text, small prices, blur and non-SGD ambiguity; on a line printed in English and another script, only the English name is drafted (English only since 2026-10-15).
No zero-retention, physical-erasure or extraction-accuracy claim is established by `store: false`.
Use a separate proposed `AI_MENU_MODEL` name so vision and text evaluations can choose different models without changing provider or dependency pin.
The 2026-10-11 re-approval includes that added name; neither model is chosen by this document.
Both evaluations must select image/schema-capable models where needed, with documented availability past 16 Dec 2026 and actual account access.

### Buyer lookup and exact review

1. Text -> AI proposes registered candidates/clarification; server looks up published items. Missing area/location blocks a nearest claim. Use name/area and ordinary SQL search initially; no vector database or external map service.
2. Alternatively camera/paste -> shared validated SGQR parser -> supported identifier lookup in the published registry. Zero matches means not enrolled/no purchase; several means ask which outlet. A scan supplies no recipient or payment authority. Camera denial/unreadable/unsupported content offers paste, then text search. Authentic supported identifiers and parser coverage remain **[unknown]**; generic EMV format is not a complete SGQR scheme specification. [EMVCo overview](https://www.emvco.com/knowledge-hub/the-what-why-and-how-of-emv-qr-codes/).
3. Buyer confirms outlet/items -> server computes SGD price from the confirmed menu -> stores immutable review and a 5-minute expiry, bound to buyer, item quantities, outlet, menu/destination versions, exact amount/currency and one rail.
4. Render stored review, not AI prose, as the payment summary. Costs carry fee payer/source/time/basis; unknown funding/FX/merchant fees stay unknown and cannot support a cheapest ranking.

Buyer AI calls use Vercel AI SDK with one configured OpenAI provider model; exact model follows account access and a small task evaluation at Gate 3. Initial request budget: 30 seconds and at most three read-only tool calls; failure offers manual selection. Merchant text/model output is untrusted data. No model tool receives PayPal capture or wallet-signing authority. **[vendor claim]** AI SDK supports structured output/tools and the selected provider family; this is not evidence of suggestion accuracy. [AI SDK](https://ai-sdk.dev/docs/introduction).

### PayPal payment and recovery

**[hypothesis] Choose the direct Orders v2 adapter as the runtime path now.** APIMatic PayPal context assists development; optional generated clients must satisfy the same adapter contract. Do not depend on Agent Toolkit field coverage for seller/payee checks. This preserves meaningful PayPal + AI without claiming toolkit execution.

Sandbox setup: Envoi's sandbox platform/API caller, a **distinct allowlisted sandbox seller** with confirmed permissions, and a separate sandbox buyer. Prepare enrollment out of band and disclose it; the merchant UI selects only its assigned connection. No arbitrary merchant-ID connection, custody, platform fee or fallback payee. **[vendor claim]** PayPal documents sandbox platform testing before live partner approval and seller-authentication headers for multiparty checkout. Account access remains **[unknown]**. [Platform access](https://developer.paypal.com/platforms/get-started/), [multiparty integration](https://developer.paypal.com/platforms/checkout/standard/integrate).

1. Buyer continues from current review -> transaction validates owner/version/expiry/destination and persists one execution attempt, operation keys and next reconciliation time. Repeated clicks return the same attempt.
2. Server -> `POST /v2/checkout/orders`: `CAPTURE` intent, one purchase unit, explicit seller/payee, exact SGD items/total, purchase correlation and no shipping. Use configured sandbox OAuth, seller assertion/partner headers where required and a persisted create `PayPal-Request-Id`. No amounts or destinations from the client.
3. Buyer follows the returned PayPal approval link. The human approves at PayPal; Envoi review, agent claims or URL query values cannot substitute.
4. Owning session returns -> completion POST -> server `GET /v2/checkout/orders/{id}`. Verify the locally bound order, approved status, seller/payee, amount/currency and basket/correlation. Recheck execution eligibility and review versions/expiry. A changed/expired purchase closes capture eligibility and requests fresh review; do not PATCH a buyer-approved order to new terms.
5. Persist capture-dispatched state before `POST /v2/checkout/orders/{id}/capture`, with a distinct stable capture request ID. Capture exactly this order; no second toolkit `pay_order` call.
6. Server read verifies a completed capture, order/capture association, intended seller, exact gross amount/currency and stored basket/correlation. Only then record paid and actual capture ID. If evidence is incomplete or mismatched, quarantine as uncertain and alert the operator.
7. Webhooks pass configured-app signature verification, inbox deduplication and a server read of the same known order. Unknown orders are quarantined; replay/out-of-order callbacks cannot downgrade confirmed state or manufacture a purchase.
8. A lost response/restart leaves persisted reconciliation state.
   Receipt/status checks and the scheduled runner read outstanding known orders; missing external identity stays uncertain for operator investigation.
   Existing Gate 3 recovery rules stand: only an authorized lease holder replays the same eligible operation with identical payload/key; no fixed documented retention window is assumed.
   Maintenance never creates/captures orders, and no replacement payment is allowed while an external effect is possible.
   Repeated scheduling is not an exactly-once payment guarantee.

**[vendor claim]** Orders specifies create/read/capture and payee fields. **[verified 2026-10-07, correcting the earlier label]** Idempotency has **no fixed documented retention window**: *"To determine whether your API supports it and for information about how long the server stores the ID, see the reference for your API."* A repeated key makes PayPal *"return the latest status of the previous request that used that same header"*, and for simultaneous identical keys *"PayPal processes the first request and might fail the second request."* Consequence: same-key replay is the correct lost-response recovery, and capture must be serialized behind a lease rather than merely behind a stored request id. PayPal also documents webhook verification. **[unknown]** A complete Envoi sandbox execution under those permissions. [Orders API specification](https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/checkout_orders_v2.json), [idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/).

Payment lifecycle outline: awaiting approval -> executing -> pending/uncertain -> confirmed, or a verified failed/canceled outcome. Expiry is not proof that an already dispatched payment failed. Cancellation can close an attempt only when no capture has been dispatched, or after provider reconciliation establishes its outcome. No new attempt or rail switch while an external effect is possible; terminal release rules and races belong in Gate 3. Reconciliation does not perform an initial capture solely because it discovers an approved order after the buyer abandoned the journey.

Merchant view polls its authorized orders; buyer receipt polls stored verification status. Merchant acknowledgment is its own field, enabled only after verified payment. Neither polling nor acknowledgment moves money. A future refund/dispute must preserve the original capture evidence with a separate status, not rewrite it as never paid.

### PYUSD devnet amendment, 2026-10-10

**[verified] User decision:** include PYUSD after PayPal and S13, first in the cut order.
S13 moves immediately after S4; Gate 4 will revise the build order only after Gates 2 and 3 are re-approved.
This amendment selects the boundaries below, not wallet execution, funding or enablement.
`PYUSD_ENABLED` defaults false and gates the adapter; PayPal imports no Solana modules and stays usable when that flag is false or RPC fails.

#### Identity, destination and rate

- **[verified]** Paxos names devnet mint `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM` and says test tokens have no value.
  The prior-session read-only RPC observation at slot 509797350/epoch 1180 returned Token-2022 owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, 6 decimals and devnet genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
  Evidence and mint authorities are recorded in [research](research.md#gate-2-source-supplement-2026-10-10); this run did not repeat a chain read.
- **[hypothesis]** Pin cluster `solana:devnet`, genesis hash, mint, Token-2022 program and decimals as reviewed code constants, not `SOLANA_CLUSTER`/`PYUSD_MINT` environment knobs.
  Keep only `SOLANA_RPC_URL` and `PYUSD_ENABLED` for this rail.
  Enabling refuses the PYUSD adapter unless genesis, owner and decimals match; failure disables only PYUSD, not PayPal or the app.
  Recheck before preparation; never follow a live/mainnet fallback or arbitrary browser-supplied RPC.
- **[hypothesis]** Merchant receiving account is the Token-2022 associated token account derived from the verified wallet and pinned mint.
  It must already exist, have the correct owner/mint/program and be unfrozen before activation.
  For the smallest hackathon path, prepare it out of band by a merchant-controlled setup or a faucet deposit that creates it, then verify it server-side.
  Neither buyer transfers nor maintenance create accounts; an Envoi-assisted setup transaction would require a recorded amendment, not a hidden buyer charge.
- **[hypothesis]** Merchant membership requests a 5-minute, single-use SIWS-format challenge, bound to Envoi domain, explicit destination-enrollment purpose, outlet, cluster, wallet, nonce, issuedAt and expiry.
  Server verifies the exact saved UTF-8 bytes with Ed25519 and consumes the nonce in the destination transaction.
  Signature proves key control only; it never creates membership or substitutes for operator enrollment approval.
  No buyer key or server signing key is collected.
- **[verified] Gate 1 decision; [hypothesis] arithmetic contract:** store a positive integer `atomicPerSgd`, confirmed timestamp and immutable rate version.
  PYUSD atomic amount = `ceil(sgdCents * atomicPerSgd / 100)`, using bounded integer arithmetic.
  Buyer sees the shop's PYUSD-per-S$1 rate, date, exact rounded amount and unknown funding/off-ramp costs; no market-rate claim or external FX service.
  Compute 30-day expiry on read; changing/re-confirming or expiring a rate invalidates unexecuted PYUSD reviews, never an already released attempt.

#### Preparation, wallet broadcast and verification

1. Owning buyer explicitly continues from a current PYUSD review with the selected wallet.
   Recheck membership-approved destination, menu, rate/version/age, amount, source account/balance and devnet identity; no amount/payee from browser/model input.
2. Read mint extensions and both older/newer TransferFeeConfig schedules with their epochs.
   Use Token-2022 `TransferChecked` only when every fee that can apply in the current/next epoch is zero, including maximum fee zero, and the blockhash validity cannot cross a scheduled non-zero fee activation.
   A new non-null transfer hook or unsupported/changed extension disables new preparations pending review, rather than adding unknown instructions.
   **[vendor claim]** `SetTransferFee` activates two epochs later; this supports the bounded fee check, not a promise that a devnet reset or arbitrary epoch timing cannot change behavior.
3. Fetch a fresh blockhash at `confirmed` commitment and persist the attempt before releasing unsigned bytes: prepared-message fingerprint (since the 2026-10-11 reopening, never the bytes themselves), blockhash, lastValidBlockHeight, preparation slot, source/destination, buyer fee payer, amount, rate version and a unique opaque memo reference.
   **[vendor claim]** Solana's guide recommends `confirmed` for RPC requests and says a `finalized` blockhash cuts about 13 seconds from the signing window; a blockhash from a dropped fork never becomes recent on the finalized chain, so such a transaction can only expire unexecuted.
   **[hypothesis]** Release still compares finalized block height with the saved `lastValidBlockHeight`, so this choice gives the buyer more approval time without loosening release.
   The memo is mandatory for lost-signature attribution, not an optional identifier inferred from equal amounts.
   Envoi's prepared transaction contains exactly one `TransferChecked` and that memo, with no compute-budget instructions, leaving priority fees to the wallet as Phantom recommends; no account creation, authority/delegate changes, arbitrary programs, extra transfers or durable nonce.
4. Lock the logical checkout and purchase from this release point, even if the response is lost or the wallet later reports rejection.
   **Revised when Gate 2 was reopened on 2026-10-11:** the server releases the unsigned bytes exactly once, in the response that follows the commit, and stores only their fingerprint, so no later request can receive them again.
   A repeated preparation, reload or second tab gets the attempt's status, never the bytes, a refreshed blockhash or a second transaction; expiry moves to reconciliation, not re-preparation.
   **[hypothesis]** Releasing the same bytes twice is not safe: Phantom chooses its priority-fee and Lighthouse assertion instructions when it signs, so two signings of one prepared message can be two different transactions, both valid until the blockhash expires.
   Browser passes those exact bytes/account to Wallet Standard `solana:signAndSendTransaction` with chain `solana:devnet`, once per release.
   After a wallet error, a rejection or a lost response the browser shows "checking payment" and never asks the wallet again, so a failed first try costs the buyer the wait until expiry and a complete scan before a fresh review.
   Phantom obtains human approval, may add its own compute-budget and Lighthouse assertion instructions, signs and broadcasts; Envoi has no signed-transaction-before-broadcast validation opportunity and never submits/rebroadcasts.
   Raw signature bytes returned by the wallet are encoded and posted as a hint, not a paid-state command.
5. Server fetches the transaction at `finalized` on the verified devnet RPC.
   Re-read cluster/mint/extensions and retain fee schedules with their epochs; establish the fee applicable to the execution epoch from preparation evidence and transaction metadata, not a guessed current fee.
   Verify the payment's meaning, not the exact bytes: require successful execution, the saved blockhash, the buyer as the only signer and fee payer, exactly one `TransferChecked` with the pinned program/mint/decimals, source owner, destination ATA and exact atomic amount, exactly one memo carrying the reference, and zero withheld transfer fee.
   Every other outer instruction must be a ComputeBudget instruction or a Lighthouse assertion from the pinned program `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`.
   Inner instructions, if any, may come only from the pinned Token-2022, Memo, ComputeBudget and Lighthouse programs, and none may move tokens or lamports, create or close accounts, or change an authority or delegate.
   Use transaction metadata's destination pre/post token balance delta, not a later live-account balance; it must equal the exact amount.
   Require complete metadata; anything outside these rules leaves the attempt uncertain.
   Bind a finalized signature to at most one attempt; missing/mismatched evidence remains uncertain and operator-visible, never paid.
6. Confirmed receipt says "Transferred and finalized on Solana devnet" with actual signature, recipient and amount.
   It never says tokens are "kept", permanently owned, live money or SGD settlement.
   Merchant acknowledgment remains separate.

**[vendor claim]** Phantom recommends signing and sending; sign-only methods are not supported through its Wallet Standard implementation.
The Standard's chain input is required and its output is signature bytes.
**[vendor claim]** Phantom also documents that a submitted transaction may be augmented with Lighthouse assertion instructions, so the landed transaction differs from the submitted one.
It adds priority-fee instructions to a transaction that has no signatures and no compute-budget instructions.
Lighthouse's own repository gives its program ID for devnet and mainnet as `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`; Gate 3 rechecks that account on devnet.
An exact-bytes match would therefore mark ordinary Phantom payments uncertain, so step 5 verifies meaning and allowlists only those two instruction kinds.
**[unknown]** Whether Phantom honors `solana:devnet`, displays this devnet mint, applies these additions on devnet and in the extension, or changes the blockhash or Envoi's own instructions.
Solana's confirmation guide actually recommends wallets replace stale blockhashes before signing.
Therefore **proof that Phantom keeps the prepared blockhash, transfer and memo is an enablement condition**, not an assumption.
If Phantom refreshes the blockhash, expiry-based release below is unsafe; stop this rail and reopen the architecture rather than loosening matching.
If it adds an instruction outside the allowlist, those payments stay uncertain; widening the allowlist is a recorded Gate 2 amendment, not a code change.
Post-broadcast validation can withhold Envoi confirmation but cannot undo a wallet's wrong transfer.
[Phantom signing](https://docs.phantom.com/solana/sending-a-transaction), [Phantom Lighthouse](https://docs.phantom.com/developer-powertools/lighthouse), [Phantom priority fees](https://docs.phantom.com/developer-powertools/solana-priority-fees), [Lighthouse program](https://github.com/Jac0xb/lighthouse), [Standard feature](https://raw.githubusercontent.com/anza-xyz/wallet-standard/master/packages/core/features/src/signAndSendTransaction.ts), [confirmation](https://solana.com/developers/guides/advanced/confirmation).

#### Lost-response recovery and RPC

An unknown signature/submission stays locked.
No replacement transaction, new blockhash, new review or rail switch is requested while the released transaction can still land.
Even a wallet error/rejection after release is not sufficient server evidence of non-broadcast.
Maintenance and the existing bounded reconcile route perform read-only RPC calls; neither submits a transaction.

After finalized block height exceeds the saved `lastValidBlockHeight`, paginate merchant ATA signatures at finalized over the full preparation-to-expiry window, then retrieve candidate transactions and apply the same step 5 verification.
A matching transfer confirms the original attempt; only a complete, healthy scan proving no matching successful execution can expire it unpaid and permit a fresh review.
Persist scan cursors/coverage across finite runs; 429, lag, null transaction, unavailable history, reset, page cap or incomplete window leaves it uncertain.
An empty response alone is not an absence proof.
Window coverage and wallet blockhash-preservation proofs are required before automatic unpaid release is enabled.
[Signature history](https://solana.com/docs/rpc/http/getsignaturesforaddress).

**Revised when Gate 2 was reopened on 2026-10-11: the window scan also runs for an attempt that is already confirmed or mismatched.**
Any transaction built from the released message carries the saved blockhash, which enablement already requires the wallet to keep, so it can only land inside that window, and a complete scan sees every landing of every signing.
Any successful transaction in the window that carries the attempt's reference, other than the one bound as the payment, is recorded as an extra transfer with its destination balance delta from the transaction metadata.
An extra transfer never changes the paid state or the bound evidence, and it is never a second payment.
It is shown to the buyer, the merchant and the operator as detected, and any refund is arranged outside Envoi, which holds no keys and moves no tokens.
A transfer carrying the reference that was built after expiry from a new blockhash is not Envoi's released transaction and is not watched.

**[hypothesis]** Shared server limiter across web/runner: at most 20 RPC calls/10 seconds globally, 10/10 seconds per method, 2 concurrent requests, bounded response bytes and retry backoff with jitter on 429.
Debounce user-triggered provider reads with existing `T_PROVIDER_READ_DEBOUNCE` (30 seconds); persist due work rather than busy-polling.
These proposed budgets are below the published per-IP limits but do not reserve any capacity against other Render tenants.
Actual shared-outbound-IP throttling is **[unknown]**.
A keyed RPC provider needs a recorded provider/budget decision, not a silent URL substitution.

The observed mint has a freeze authority and permanent delegate; frozen accounts safely fail transfer, and the delegate can later move tokens from the recipient.
Its hook authority can activate a hook later.
**[vendor claim]** Phantom displays a permanent-delegate warning, which may consume time inside the three-minute metric.
Recheck extensions/accounts before each new attempt; retain original finalized transfer evidence if a later delegate movement occurs.

#### Phone path and independent access gate

**[vendor claim]** Phantom Browse opens an Envoi URL in its wallet browser and has no cluster parameter.
The separate Connect deeplink documents `cluster=devnet` but defaults to mainnet-beta; it is not the selected Wallet Standard transport.
**[hypothesis]** Treat the wallet browser as a separate cookie/session container, never as the owner of a purchase created in Safari/Chrome.

**[hypothesis] Selected phone path:** on a phone browser with no injected wallet, a PYUSD review shows an "Open in Phantom" link instead of a pay button.
The link uses the documented Browse URL, `https://phantom.com/ul/browse/<url>?ref=<ref>`, and the encoded Envoi URL carries only the public outlet ID, the selected public item IDs and quantities, and the rail name `pyusd`.
Inside Phantom's browser the buyer gets a new anonymous session; the page asks for a fresh PYUSD review of that basket through the ordinary review request, the server re-reads the published menu and prices it, and the buyer confirms it there, by paying, before any PYUSD preparation.
If the server refuses that review, the page stays on the shop with the basket filled in and says why.
The link is a suggestion, not a review, token or authority: it carries no session, purchase ID, price, payee or personal data, needs no new route and may be reused, because each use only creates a fresh unexecuted review.
The original browser's PYUSD review is never prepared and simply expires, so no released attempt exists outside the wallet browser.
Never copy session cookies, transfer purchase ownership or expose the old receipt.
The approved external-agent MCP handoff stays unchanged, and no encrypted deeplink session/key layer or native app is added.
**[unknown]** Whether Browse preserves the URL's query on target phones, whether the wallet browser keeps its session through approval, and the complete phone-at-counter path.

Enablement needs the user's account/faucet proof, merchant ATA/key-control proof, wallet display/chain and blockhash/transfer/memo preservation proof, the phone Browse-link proof, exact finalized transfer and lost-response recovery under the actual RPC.
Failure keeps PYUSD visibly unavailable and PayPal working; a cut follows the approved first-cut rule and is recorded, never disguised as success.

### Another agent

Scoped supported client -> published registry/menu -> `create_purchase_request` -> unclaimed human URL, expiring after 10 minutes. Buyer opens it, establishes their own session and explicitly redeems it once -> server recalculates a fresh review -> same PayPal/wallet approval journey. Creating agent gets no payment authority, private receipt token or privileged readback. Expired/used handoffs require a new request; prevent link leakage with no-referrer/no analytics and log redaction.

### Shop QR and order archive amendment, 2026-10-24

Gate 1 was re-approved on 2026-10-24 for two merchant screens; this section is the architecture for both.

**Shop QR.**
1. The merchant setup page draws a QR code in the merchant's browser for the outlet's public buy link, `APP_BASE_URL` + `/buy?outlet=<outletId>`, only while the outlet is published.
2. It encodes a link, never a payment payload: no PayNow, EMVCo or wallet data, so no bank app can pay with it.
3. No new route, table, column or stored image; download and copy happen in the browser.
4. The sticker payload rule is unchanged: Envoi still never stores the merchant's SGQR photo or payload.

**Order archive.**
1. `purchases` gains `merchant_archived_at` and `merchant_archived_by_user_id`, both nullable; the web role may set them once and never clear them.
2. `POST /merchant/orders/{id}/archive` checks the session's membership of the order's outlet, sets the pair once (a repeat changes nothing) and writes an audit row in the same transaction.
3. It never changes the purchase state, payment attempts, acknowledgment, the buyer's receipt or maintenance; maintenance still reconciles an archived uncertain order.
4. The merchant's order list leaves out archived orders and returns their count, except an order that became paid after it was archived, which is listed again as Paid, so a payment is never hidden.
5. The merchant cannot restore an order. The operator CLI gains `unarchive-order <purchaseId>`, which clears the pair with an audit row.
6. The operator CLI gains `export-archived-orders [outletId]`, read-only, which writes one JSON receipt per archived order into `archive/orders/` in the working copy, a path Git ignores.
   Each receipt holds the order's ids, outlet, lines, SGD amounts, rail, state, provider references, acknowledgment and archive time; no buyer account details, secrets, tokens or QR payloads.
7. The server on Render never writes files; the export runs only on the operator's machine with migration credentials.

**Risks.** A merchant may archive an order they later need: the record stays in the database and the operator can restore it. Exported receipts on the operator's disk are outside Envoi's control; the folder stays out of Git so they never reach the public repository.

### Continuation amendment, 2026-10-25

Drafted for the Gate 1 reopening of 2026-10-25, re-approved that day, and the [continuation plan](continuation-plan.md); re-approved by the user on 2026-10-25 ("I approve Gate 2.").
Approval accepts this amendment as a proposal; it establishes no runtime, model, agent or photo evidence and authorizes no Gate 3 or 4 change, build, install, upload, model call or deploy.

**One-box ordering (S21).**
1. `POST /buyer/suggestions` keeps its route, limiter and budget, and takes one text field; the separate area field becomes optional and the screen stops sending it.
   An optional `outletId` is accepted when the buyer is already on a shop's page or came from a scan; it is a public id and grants nothing.
2. The model may propose item ids with quantities for one outlet, or a choice between item ids, still through the three read-only tools, which still return no price.
3. The server turns that into a basket proposal only from published, priced, available items of a published outlet in scope, with each quantity between 1 and 20; anything else becomes a clarification, an unavailable answer or no match.
4. The proposal is shown, not stored: no review, purchase or hold exists until the buyer taps Review, which sends the ordinary `POST /purchases` with the ids and quantities and gets the ordinary server price.
5. The browser carries the proposal in memory from the response to the shop page; it is never put in a URL.
6. A model failure or budget refusal keeps manual selection, as now. No new provider, model name, table or environment name.

**Reference buyer agent (S20).**
1. A new external component, `clients/buyer-agent/`, run by a person on their own machine; it is not deployed and the hosted app never imports it.
2. It holds an agent token issued with the existing operator command, and an OpenAI key of its own, read from that machine's environment; neither is stored, logged or traced.
3. Its model sees three tools, each a call of the generated client: list shops, read a menu, create a purchase request.
   It refuses any item id the menu it last read did not return, before calling the client.
4. It writes a trace of each client call (operation, status, returned ids, timings) for evidence, without tokens, keys or prompts beyond the buyer's sentence.
5. Envoi sees it as any other agent token holder: the same `POST /purchase-requests` limits, single redemption, fresh server price and human PayPal or wallet approval. No new agent authority.
6. Provider stays OpenAI, pinned as Gate 2 already pins it, through the existing `ai` and `@ai-sdk/openai` pins.

**Generated client covers the agent route (S19).**
The OpenAPI document gains `POST /purchase-requests` with the agent bearer scheme, so the generated client covers the whole agent path; the route itself does not change.
APIMatic stays development tooling: the document is uploaded to generate the client, and nothing calls APIMatic at runtime.

**Menu photo round 4 (S22).**
1. Before the existing browser shrink, the merchant may rotate the photo in quarter turns and crop it to the menu; only the rotated, cropped and shrunk JPEG leaves the browser, under the unchanged upload bounds.
2. The draft rule is unchanged: an unreadable or ambiguous price stays blank, never zero.
3. The round reuses the S11 consent, admission, spend, leak and request-memory boundaries unchanged, and `MENU_IMPORTS_ENABLED` stays false whatever the round shows, until the import screen is approved in Gate 1.

**Not changed.** Hosting, the rule that Render is never pre-warmed, auth, PayPal, PYUSD, scan, MCP, data, roles and every other route.

**Risks.**
- **R5 extends:** sentence-to-basket accuracy, quantity accuracy and the reference agent's tool choices are unmeasured until their pre-registered evaluations.
- **New, R19:** a filled basket can be wrong in a way the buyer does not notice; the review shows every line and quantity before payment, and the falsifier is a usability failure where a tester pays for a basket they did not mean.
  *Added 2026-10-29:* the five-tester study that would have exercised this falsifier is not run, by the user's decision, so **R19 stays open and unfalsified**; the review screen's line-by-line display is the only mitigation on record, and no claim is made that a buyer notices a wrong basket.
- **New, R20:** the reference agent runs outside Envoi's control on a person's machine; its spend and key are that person's, and Envoi's guards do not depend on it behaving.

### Web menu import amendment, 2026-10-29

Drafted 2026-10-29 for the Gate 1 reopening of the same day; **APPROVED 2026-10-29** ("Approve all four").
Approval would accept this amendment as a proposal; it establishes no Kernel, AG Grid, model or page evidence and authorizes no Gate 3 or 4 change, sign-up, install, Kernel session, model call or deploy.

**Web menu import (S24).**
1. The merchant sends one https link and the ownership tick to a new route beside the photo route; the import runs inside the request, as a photo import does, and returns the outcome.
2. The URL is checked before anything is admitted: `https` only, port 443, no user or password part, a host name rather than an IP literal, no `localhost` or single-label host, at most 2,048 characters. Kernel's browser runs in Kernel's cloud, not inside Render, so it cannot reach Envoi's own network [hypothesis, from Kernel's documentation].
3. Admission reuses the S11 table, caps, spend ceiling, membership recheck and request-memory boundary unchanged; a web import counts toward the same per-outlet and global daily caps as a photo import, so the existing caps bound both Kernel sessions and model spend.
4. One Kernel session per import: headless, no stealth mode, no proxy, no saved profile or login, no CAPTCHA solving, one navigation to the given URL with no link following, a 20-second bound, then the visible text of the page, capped at 64 KB, and the session is deleted on every path.
5. If the text holds no SGD-like price, the import closes as a picture menu with no model call.
6. Otherwise one text model call with no tools and no retries, `store: false`, through the existing AI SDK pins, to the model named by a new `AI_WEB_MENU_MODEL` that the evaluation chooses, returns the same item shape as a photo draft. The page text is untrusted input and is sent only as data.
7. Envoi then keeps a drafted price only if the same digits are printed on the page, and keeps an item only if its name is on the page; everything else goes blank or out. The result merges through the existing `commitImport` into the unpublished draft as import suggestions; confirmation and publication are unchanged.
8. Page text and the full URL are held in request memory only: neither is written to the database, a log or a trace. The import row records the source kind and the host.
9. A new switch, `WEB_IMPORTS_ENABLED`, default false and separate from `MENU_IMPORTS_ENABLED`, turns the route and the setup-page link on only after the pre-registered evaluation passes and the user approves it.
10. The draft is reviewed in an AG Grid Community table that replaces the item list of the existing menu editor, for typed and imported drafts alike; the editor's save, blank-price and confirmation rules stay on the server.

**Not changed.** Photo import stays closed, hosting, auth, PayPal, PYUSD, scan, MCP, roles and every buyer route. No crawl, search or scheduled re-read of a merchant's page.

**Risks.**
- **New, R22:** a page can print a price that is not the shop's current price, or the model can pair a printed price with the wrong printed item. The verbatim rule stops invented digits, not wrong pairings; the merchant's table review and confirmation are the only guard against pairing errors, and the evaluation measures them.
- **New, R23:** Kernel is a new external dependency whose free allowance, rate limits, pricing and availability through judging are **[unknown]** until the user's account exists. Losing it closes web import only; manual entry is unaffected.
- **New, R24:** the page is untrusted text that may try to steer the model. The call has no tools, the output is a closed schema, the verbatim rule bounds prices, and nothing publishes without the merchant; a page can still add a wrongly paired item to the draft.
- **R6 does not grow:** no image is decoded on Render for a web import.
- R21 was the withdrawn round 5 draft's risk, preserved in [`photo-import-gap-analysis.md`](photo-import-gap-analysis.md), and stays unused so the two are never confused.

## External

Names below are **proposed configuration names only**, never values. No credentials were read or provisioned. Database/auth/provider secrets remain server-side.

| Integration | Role / proposed environment names | Access boundary |
| --- | --- | --- |
| Render Free | Web only; `APP_BASE_URL`, `ENVOI_ENVIRONMENT`, `PAYMENTS_ENABLED`, `MENU_IMPORTS_ENABLED`, `LOG_LEVEL`. | Sandbox-only; reject live/mainnet configuration. No paid worker/disk or assumed credits. Verify a free plan and prevent billable overages; suspend rather than upgrade. |
| Neon Free | PostgreSQL/domain/auth and bytes-free import/rate/attempt records; `DATABASE_URL`, `MAINTENANCE_DATABASE_URL`, `MIGRATION_DATABASE_URL`. | TLS and least-privileged roles; no image bytes or browser credentials/Data API. R11 `public` pin and R12 region acceptance stand. Verify quota and no paid fallback. |
| Better Auth | Login/guest sessions inside app; `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. | Stable secret, trusted app origin and secure cookies; database sessions. Allowlisted merchant test accounts only; no mail/reset service assumed. |
| GitHub Actions | Finite scheduled Node maintenance; `MAINTENANCE_DATABASE_URL`, sandbox provider secrets and enabled-rail RPC config needed for reads only. | Redacted logs, no migration credentials/image artifacts. Preserve quota-gated cadence and zero-spend controls. No new Git, visibility, workflow or deployment authority exists in this revision. |
| PayPal | Orders/capture/read + webhook; `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PARTNER_ATTRIBUTION_ID`, `PAYPAL_WEBHOOK_ID`. | Allowlisted sandbox host is code/environment-controlled; no arbitrary base URL input, platform fees or default recipient. Per-outlet seller IDs are verified data, not secrets granting permission. |
| OpenAI through AI SDK | Text suggestions and direct menu vision; `OPENAI_API_KEY`, `AI_MODEL`, proposed `AI_MENU_MODEL`. | Server-side key; explicit `store: false` for menu calls, no persistent image upload, tools or retries. Separate task evaluations, bounded spend and retention consent; model/account proof through judging outstanding. Provider and dependency pin unchanged. |
| Kernel (added and approved 2026-10-29) | One cloud browser session per web menu import; `KERNEL_API_KEY`, `WEB_IMPORTS_ENABLED`, `AI_WEB_MENU_MODEL`. | Server-side key; headless, no stealth, proxy, profile or CAPTCHA solving; one navigation, session deleted on every path. Account, allowance and pricing unverified. |
| AG Grid Community (added and approved 2026-10-29) | Browser table for the menu draft; no environment name. | Client-side display and editing only; the server keeps every menu rule. Licence terms read before install. |
| Supported MCP clients | Hash-stored scoped demo tokens configured out of band. | Registry/proposal tools only. No token value in repository/testing instructions; no production OAuth promise. |
| APIMatic | PayPal Context Plugin; own-API clients/docs if actual tier supports them. | Development tooling, not payment authority. No runtime dependency or credential assumed. Entitlements and prize qualification unverified. [Sponsor offer](https://paypalaihackathon.devpost.com/details/apimatic). |
| Solana devnet / Phantom | Proposed independently gated PYUSD rail; `SOLANA_RPC_URL`, `PYUSD_ENABLED`. | Pinned public devnet identity/mint constants; merchant-set rate, no FX service. Wallet Standard signs/broadcasts; Envoi builds unsigned bytes and performs reads only. No private-key env name, account access or enablement claimed. |

Operator monitoring: redacted logs, maintenance heartbeat, overdue payment/manual-review records, total Neon quota/headroom, import latency/outcomes/credit reservations, decoder memory and RPC throttle/scan coverage.
There are no source-row reports or image cleanup jobs; import admission does not depend on the maintenance heartbeat.
Persist business changes and payment due timestamps atomically; finite jobs claim bounded work with recoverable leases.
Gate 3 specifies races, retry limits and role permissions; slices must prove them.
No daemon, indefinite DB polling, Redis, Sentry or outbound notification service initially.
A named demo operator inspects failures and usage; uncertain payments remain blocked.
Live support/backup targets and paid production services need separate decisions.

Residual-risk changes, limited to this amendment:
- **R2 narrows, does not close:** no image churn/cleanup risk remains, but generic Neon storage exhaustion still blocks purchase, payment evidence, auth and audit writes; there is no proven in-app recovery.
- **R6 grows, less than first proposed:** `sharp` build/binary compatibility plus decode memory/CPU on 512 MB/0.1 CPU remain unmeasured; the browser shrink bounds server input at 2,048 pixels/side but is not a measurement, and browser decode of large phone photos joins the risk.
- **R7 image-churn budget closes as superseded:** no source/history byte admission remains; replacement **R7a** is mis-sized daily/in-flight/spend admission, not a demonstrated credit or RAM bound.
- **R5 extends:** separate text/vision evaluation, small-price accuracy on English menus, request latency and model availability through judging remain open.
- **PYUSD residuals:** wallet mutation/chain behavior, phone-session continuity, faucet access, mutable mint authorities, RPC shared limits/history completeness and post-broadcast inability to prevent a wrong transfer remain open.
All other approved residual-risk dispositions, R11 containment and R12 acceptance remain unchanged.

## Falsifiers and approval limits

| Open risk | Required later evidence / stop condition |
| --- | --- |
| Distinct seller cannot receive an exact sandbox capture | Actual buyer-approved capture plus provider read matching seller/amount/currency/basket. Stop payment work if permissions/payee coverage fail; revise Gate 2 rather than pay Envoi and call it merchant settlement. |
| Image retained by Envoi or leaked through SDK errors | Actual request/error/disk/database/log/artifact probes with an injected image/base64 needle; metadata stripping, disconnect, abort, restart and late-result rejection. Stop real-image imports on any leak; `store: false` does not prove upstream erasure. |
| Vision latency, memory or accuracy fails | Measure on Render Free with cap-sized and consented English rotated/small-text/blur/non-SGD samples, shrunk by real phone browsers, and concurrent payment traffic; report every result against pre-registered thresholds. Lower caps or revise architecture if needed; manual fallback is not a successful AI import. |
| Scan identifies the wrong outlet | Authentic approved mappings, unsupported payload rejection and shared-identifier clarification. No uniqueness or automatic accuracy claim from fixtures. Text/manual fallbacks remain visible. |
| Runtime recovery cannot identify an uncertain charge | Inject lost responses/restarts/duplicate events; converge on the same provider capture or keep blocked/uncertain. No new-charge retry to make the demo finish. |
| Free recovery or hosting cannot last through judging | Verify Render/Neon/GitHub quotas and zero-spend controls, a finite scheduled run, idle/crash recovery and delayed-job behavior. No reliance on credits, paid fallback or Render's 30-day database. Stop deployment if free capacity is unavailable; amend Gate 2 before changing the topology. [Official rules](https://paypalaihackathon.devpost.com/rules). |
| Cold start breaks the approved buyer journey | Test a genuinely idle first visit and include wake-up time in the three-minute measurement. A warmed rehearsal cannot establish that result; amend hosting if required. |
| OpenAI model/access or consent fails | User confirms no data-sharing opt-in and an authorized spend ceiling; select available models with schema/image support as needed and no shutdown before judging ends. Do not use deprecated nano prices as a through-judging model choice. No free-inference or zero-retention assumption. |
| Wallet ignores devnet, changes the blockhash or Envoi's transfer/memo, adds non-allowlisted instructions or cannot display PYUSD | Keep PYUSD disabled until actual wallet proofs pass; a landed transaction outside the step 5 rule stays uncertain. No sign-only fallback, mainnet switch or claim of pre-broadcast enforcement. Reopen Gate 2 if the chosen wallet invalidates expiry safety. |
| Phone cannot safely reach wallet from its own session | Prove on target phones that the Browse link opens the Envoi URL with its outlet/item IDs, that the wallet browser keeps its own session through approval, and that the fresh review and PYUSD journey complete there. Keep phone PYUSD unavailable until proven; never transfer purchase ownership or reuse a released checkout. |
| RPC cannot establish finalized outcome or complete absence | Lost wallet response, 429, null/pruned history, page limits, reset and delayed maintenance must preserve the lock. A complete attributable finalized record or complete post-expiry scan is required; time passing alone cannot permit another payment. |
| One release lands two transfers (added 2026-10-11) | Inject a repeated preparation, a second wallet call from one page, two landings of one release and a second landing after confirmation. The bytes must never leave twice, the paid state must stay bound to one transfer, and every extra transfer in the window must be recorded and shown. Keep PYUSD disabled if a landing in the window can go unrecorded. |
| Mint fees/hooks/accounts or merchant rate become ineligible | Test current/next epoch schedules, extension changes, frozen/wrong ATA, expired/replaced rate and exact rounding. Disable new PYUSD attempts on mismatch; preserve released-attempt evidence and PayPal usability. |

Gate 2 re-approval accepts only this direct-vision and PYUSD amendment with its proof conditions, proposed `AI_MENU_MODEL` name and pinned code-constant configuration, including the 2026-10-11 review changes.
The user's data-sharing setting, dollar ceiling, actual models and phone proofs are not inferred from approval.
It establishes no runtime/account success and does not approve Gate 3/4, application code, wallet/faucet use, spending, installation, provisioning, workflows, deployment or visibility change.
On 2026-10-11 the user separately authorized committing this proposal, publishing its branch and merging it into `main`; Git publication is not gate approval.
The second 2026-10-11 re-approval accepts only the release-once and extra-transfer fixes, approved in advance in the message that reopened Gate 2; the same message authorized publishing the Gate 3 work, merging it into `main` and pushing.
Changed product behavior reopens Gate 1; an architecture change reopens Gate 2 before dependent work.

The eight earlier findings stay dispositioned with named residual risks in [status](00-status.md#unresolved-review-findings), not reopened wholesale.
With Gate 2 re-approved, revise only affected Gate 3 files/contracts/clocks/tasks/tests and wallet pins, proving each new guard with its own mutation plan.
Then revise Gate 4, preserving the user-decided S13 placement and PYUSD first-cut rule.
`01-product.md`, the mockups, `03-program-design.md` and `04-slices.md` are not edited in this gate.

**Gate 2 re-approved by the user on 2026-10-11 ("gate 2 approved").**
**Reopened again and re-approved on 2026-10-11 for the release-once and extra-transfer fixes** ("reopen gate 2 and approve the fixes i approve it already").
Next is the Gate 3 revision described in the [Gate 3 handover](handoff.md#gate-3-handover-2026-10-11).
**Reopened 2026-10-24 for the [shop QR and order archive amendment](#shop-qr-and-order-archive-amendment-2026-10-24); re-approved by the user on 2026-10-24 ("I approve Gate 2.").**
**Reopened 2026-10-25 for the [continuation amendment](#continuation-amendment-2026-10-25); re-approved by the user on 2026-10-25 ("I approve Gate 2.").**
**Reopened 2026-10-29 for the [web menu import amendment](#web-menu-import-amendment-2026-10-29) and re-approved the same day ("Approve all four").**
