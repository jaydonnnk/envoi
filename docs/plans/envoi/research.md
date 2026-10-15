# Envoi: evidence and corrections

Consolidated 2026-10-06; Gate 2 source supplement added 2026-10-10.
This is documentation research plus the explicitly attributed read-only devnet observations, not an integration proof.
No sandbox capture, wallet transfer, QR/menu photo trial or user test has been run.

**[verified] Current approval record, 2026-10-12:** Gate 1 was re-approved on 2026-10-10 and Gate 2 on 2026-10-11, and again the same day for two PYUSD double-payment fixes that rest on the Phantom augmentation evidence already recorded here; Gate 3 was re-approved on 2026-10-11, and Gate 4 was revised and approved on 2026-10-12.
On 2026-10-12 Gate 3 was reopened and re-approved for one change that needs no new evidence here: PayPal start and completion check `PAYMENTS_ENABLED`.
`02-architecture.md` is the re-approved Gate 2 amendment; the Gate 3 revision was drafted on 2026-10-11, revised twice the same day and re-approved on 2026-10-11, and the Gate 4 slice plan was revised and approved on 2026-10-12.
Its source reads are in [Gate 3 revision reads](#gate-3-revision-reads-2026-10-11).
OpenAI and its dependency pin stay; no provider switch is proposed.
The 2026-10-07 approvals, cross-check and eight finding dispositions remain historical authority for unaffected decisions, not approval of this amendment.
See [Gate 3 cross-check](#gate-3-cross-check-2026-10-07) and [status](00-status.md#unresolved-review-findings).

## Material corrections to PAYPAL_PLAN.md

| Original assumption | Current evidence or uncertainty | Planning consequence |
| --- | --- | --- |
| Headless `create -> pay -> capture` with client credentials | Toolkit documents `create_order`, `get_order`, and `pay_order`; `pay_order` processes an already authorized order. Its example explicitly shares an approval link with the buyer before calling `pay_order`. It is not a separate buyer-authorization mechanism. [Toolkit](https://github.com/paypal/agent-toolkit), [official example](https://raw.githubusercontent.com/paypal/agent-toolkit/main/python/README.md). | Prove create -> buyer approval -> capture, including recipient. Do not pivot because human checkout is required. `pay_order` is the capture operation; do not capture a second time. |
| Attaching any merchant ID makes the shop payable | Live multi-merchant platform access is restricted to approved partners; sellers must enroll and grant permissions. Sandbox testing precedes live approval. [Platform requirements](https://developer.paypal.com/platforms/get-started), [seller onboarding](https://developer.paypal.com/platforms/seller-onboarding). | A sandbox success does not prove live platform eligibility. Test a distinct seller/payee, not only the application owner's account. Verify whether the toolkit can express required payee/partner headers; use an explicit Orders adapter if it cannot. |
| Every SGQR photo yields a unique UEN | ABS distinguishes individual proxies from corporate UENs and describes SGQR carrying supported payment schemes. This does not establish that every sticker exposes a UEN. [ABS](https://abs.org.sg/e-payments/pay-now), [EMVCo](https://www.emvco.com/knowledge-hub/the-what-why-and-how-of-emv-qr-codes/). | Decode and validate QR data first; use vision only to assist with visible text. Permit missing identifiers and manual confirmation. Never let OCR fabricate payload fields. Several legitimate outlets can share a corporate UEN. |
| Registry UEN format/uniqueness verifies the merchant | No owner verification follows from possession of a photograph or correct identifier syntax. This is a security inference, not a provider assertion. | Require merchant account authorization and destination ownership checks. Keep an outlet identity distinct from the legal entity. Prototype publication is restricted to authorized demo merchants. |
| "Never holds funds" means "never a payment institution" | MAS's expanded regulated activities include arranging cross-border money transmission and arranging DPT transfers. [MAS notification](https://www.mas.gov.sg/regulation/notifications/expanded-scope-of-the-payment-services-act-2019). | Remove the claimed exemption. Actual treatment depends on the complete service and applicable exclusions; obtain qualified Singapore legal/provider review before live operation. This research does not determine Envoi's licensing status. |
| PYUSD is zero FX and nearly free | SGD menu prices still need a conversion into a USD-denominated token amount. Network fees are not the full cost; funding, token-account creation, conversion, and merchant off-ramping can matter. PayPal fees depend on market and transaction. [SG merchant fees](https://www.paypal.com/sg/business/paypal-business-fees), [purchase cost distinctions](https://www.paypal.com/sg/cshelp/article/what-are-the-cross-border-fees-when-selling-internationally-help550). | Show fee payer, basis, timestamp, and unknown components. Compare eligible methods only. Do not rank a method as cheaper when the necessary totals are unknown. |
| A generic SPL transfer is sufficient | Official PayPal documentation says Solana PYUSD uses Token Extensions. Official test-token guidance exists, but the correct mint, current faucet availability, receiver ownership, and supported transfer extensions still need runtime verification. [PYUSD guide](https://developer.paypal.com/community/blog/pyusd-quick-start-guide/), [test faucet guide](https://developer.paypal.com/community/blog/testnet-pyusd/). | Pin cluster, mint, token program, decimals, and transfer behavior after the proof. A token called PYUSD is not sufficient evidence. No private key on Envoi's server. |
| Both receipts land after one approval | This would risk two transfers for one basket. It is an internal contradiction, not an external limitation. | One selected rail per order. Demonstrate the other rail using another order and approval. |
| Sandbox/devnet payments are "real payments" | They are actual executions in test environments with no demonstrated live-money settlement. | Describe them as real test transactions. Show sandbox/devnet labels and actual references. Never replace missing execution evidence with animation. |
| A merchant sees payment so the order is accepted | Payment capture does not establish availability or fulfillment. | Show payment and acknowledgment separately. Do not promise preparation, pickup readiness, inventory reservation, or refund guarantees. |
| A single additional sponsor tool is mandatory | The overview says "one"; the rules describe optional sponsor tools and limit sponsor prize wins to one. [Overview](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules). | Propose APIMatic, Render and Zapier for their distinct roles. This does not establish Envoi's prize eligibility. The sponsor list is not a promise of a prize category for every listed tool; the current prize table does not list a Zapier prize. No organizer message has been sent. |

## Hackathon dates and deliverables

The organizer lists the submission deadline as **12 November 2026, 12:00 p.m. PST**, which is **13 November 2026, 4:00 a.m. SGT**. The rules require a functioning build, public open-source repository with license, and a public YouTube demonstration under three minutes. Keep the project accessible through judging, which ends **15 December 2026, 8:00 a.m. PST / 16 December 2026, midnight SGT**. [Official rules](https://paypalaihackathon.devpost.com/rules).

Use organizer test-access instructions without exposing privileged API secrets or wallet keys. Test-only buyer logins, when needed, should be isolated and disclosed deliberately.

## Claims not established in this pass

SGQR combines payment schemes; it does not provide Envoi with an item catalogue or a standard menu lookup. The consolidated proposal requires a separate menu image, AI drafting and merchant confirmation, with manual fallback. That scope supersedes manual-only menus. AI by Zapier was the drafting route until the user removed Zapier on 2026-10-10; the revised Gate 1 sends the photo to an AI model while the merchant waits. Gate 1 product scope was approved by the user on 2026-10-07; integration proof remains outstanding. [MAS SGQR overview](https://www.mas.gov.sg/development/e-payments/sgqr), [EMVCo payment QR overview](https://www.emvco.com/knowledge-hub/the-what-why-and-how-of-emv-qr-codes/).

- Tourist demand, visitor counts, local crypto demand, willingness to pay, and merchant acceptance of stablecoin settlement. Prior art in the section below establishes that a product ships to the crypto-holding segment; that is not evidence of the segment's size, and not evidence of merchant willingness.
- The brief's current Singapore consumer PYUSD availability, exact supported market count, or full network list. The proposed wallet rail must not depend on those claims.
- "~60 seconds" for complete live merchant onboarding or "nearest" without actual location and outlet coordinates.
- The toolkit accepting all multiparty recipient and authorization parameters needed by Envoi.
- End-to-end sandbox execution under Envoi credentials, extension-compatible devnet transfer, authentic QR sample accuracy, or runtime fee quotations.
- Organizers accepting a devnet-only asset transfer as sufficient PayPal integration. Keep sandbox Orders central regardless.
- Trademark/name clearance. Use fictional shop branding in demonstration materials until permission is established.
- The archived Kaki Bill fallback. Its contents are not present in this workspace; no automatic pivot is authorized or sufficiently specified.

The original brief remains unchanged apart from a dated supersession banner added at its top on 2026-10-07; its body is preserved for traceability. Subsequent gate decisions supersede disputed assumptions explicitly, rather than preserving the brief's "verified" labels as evidence.

## Findings from shipped SGQR-based payment products

Reviewed 2026-10-07 from a public repository of a Singapore product that is live on a public blockchain network. Findings are paraphrased; they are observations of a shipped design, not endorsements, and they are not primary specification sources. Where a fact has a primary source, that source is cited instead.

**What the QR code is actually for.** In the shipped design the payer scans the sticker, the business identifier is extracted from it, and that identifier is the lookup key into a merchant registry holding the real payout destination. The QR resolves *which merchant*; it never routes the payment. This is the same split Envoi now adopts in `01-product.md` rule 11, and it independently confirms that the sticker is identity rather than a rail.

**A sticker cannot carry a token destination.** The payout address is derived from the merchant's own authenticated onboarding, not read from the QR. SGQR is an EMVCo merchant-presented-mode payload carrying payment-scheme identifiers and PayNow proxies; there is no wallet address in it and no standard field for one. [EMVCo payment QR overview](https://www.emvco.com/knowledge-hub/the-what-why-and-how-of-emv-qr-codes/), [MAS SGQR overview](https://www.mas.gov.sg/development/e-payments/sgqr). Consequence: the QR routes neither the PayPal rail nor a PYUSD rail. Adding a wallet rail does not change the sticker's role.

**No shipped product auto-publishes a merchant from a photo.** Onboarding requires a business-ownership document (registry extract or letterhead) plus a human review step before the listing goes live, with a target turnaround measured in business days. This corroborates the correction already recorded above: possession of a photograph or a syntactically valid identifier proves nothing about ownership. Envoi's authorized-demo-merchant gate is therefore the norm for this category, not excessive caution.

**Manual identifier entry is the standard fallback.** The shipped flow allows the merchant to type the business identifier when scanning fails. Envoi's manual-entry fallback matches.

**Multiple outlets can share one identifier, and this is handled explicitly.** The shipped design supports one owner claiming many identifiers and treats outlet identity as distinct from the legal entity. This supports the new requirement in the `01-product.md` merchant journey that each outlet record what distinguishes it, so a buyer scan resolves one location rather than a chain.

**How a credible cost comparison is produced.** The shipped design fetches a live price-oracle quote, applies staleness detection, and displays a pre-approval receipt stating what the payer pays, what the merchant receives, and which route was used. This is the model for Envoi's cost display and it confirms rule 5: a comparison needs a live quoted basis with a timestamp, or it must show unknown. A hardcoded difference between two rails is not a comparison.

**The stablecoin-to-SGD off-ramp is still unsolved non-custodially.** In the shipped product the SGD cash-out leg is a manual, custodial, gated demonstration, with a non-custodial alternative that pays into an exchange balance rather than a bank and is gated off by default. This is strong external evidence for `01-product.md` rule 4 and for the separate merchant-economics test at line 19: a merchant receiving a USD-denominated token has a real, unsolved problem converting it, and low network fees do not address it.

**Positioning of the category.** The shipped product states plainly that PayNow is free for Singapore merchants and that the overwhelming majority of payers use it, and it deliberately targets the crypto-holding minority plus merchants willing to serve them rather than competing for the mainstream. This matches Envoi's audience decision to serve visitors PayNow cannot reach. The specific "99% of payers" figure is a third-party market claim that this pass did **not** independently verify; do not restate it as fact or place it in public submission materials without a primary source.

**The unoccupied gap. [hypothesis], bounded search.** Every shipped design reviewed in this pass is scan-to-pay operated by a human holding a wallet. None of them exposes an agent surface: no machine-readable discovery of merchant capability, no delegated purchase, no approval journey opened by a third-party agent. **Evidence boundary:** this pass reviewed one public repository of one Singapore product on 2026-10-07. It was not a market survey, a registry sweep or a competitor census. Finding no agent surface in a bounded search does not establish that none exists, and absent public documentation does not establish that a competitor lacks a capability. Envoi's agent-initiated purchase on the PayPal rail, with the human approving externally, may therefore be presented as a deliberate design focus and as unoccupied *within the sample reviewed*. It must not be presented as a verified market gap or a uniqueness claim. Any submission wording needs either a wider named search or no superlative.

## Proposed sponsor integrations and access

**Historical 2026-10-06 recommendation, superseded for Zapier on 2026-10-10.**
Current roles are APIMatic account-conditional development tooling, Render hosting and direct OpenAI vision, not a Zapier workflow.
Public documentation does not establish account access or prize eligibility.

| Tool | Primary documentation checked | Consequence / unresolved access |
| --- | --- | --- |
| APIMatic | PayPal Context Plugin is advertised without extra APIMatic sign-in for that enabled context. The offer distinguishes one month Basic for participants using the plugin from six months Business for winning teams; Business explicitly covers own-API SDKs/portal. [Sponsor page](https://paypalaihackathon.devpost.com/details/apimatic), [Context Plugins](https://www.apimatic.io/product/context-plugins). | Propose plugin use during later PayPal implementation and generated clients/documentation only where the actual tier supports them. PayPal credentials/approval are still separate. No subscription has been claimed and the offer form's additional terms have not been verified. |
| Render | **[vendor claim]** Web services host public applications; continuous background workers do not accept inbound traffic and have no free instance type. Free apps sleep and free Postgres expires after 30 days. [Service types](https://render.com/docs/service-types), [workers](https://render.com/docs/background-workers), [Free limits](https://render.com/docs/free). | **[hypothesis]** Render Free application hosting only under the user's free-hosting constraint; scheduled maintenance runs separately. **[unknown]** Current sponsor credits/claim eligibility were not established by the sponsor-page refresh. No credits claimed or paid fallback authorized. [Sponsor page](https://paypalaihackathon.devpost.com/details/render). |
| Zapier | Sponsor resources emphasize Zapier MCP and a new-account Professional trial lasting 14 days. [Sponsor page](https://paypalaihackathon.devpost.com/details/zapier). | Proposed menu workflow uses AI by Zapier, not an assumed MCP requirement or payment automation. Confirm account/trial eligibility and a plan lasting through judging. AI-by-Zapier usage qualifying for sponsor recognition remains unverified. |
| AG Grid | Optional editing UI. [Cell editing](https://www.ag-grid.com/javascript-data-grid/cell-editing/). | No required role. Merchant correction can use ordinary accessible form controls. |

Current AI-by-Zapier pricing docs require paid access to publish; Free permits unpublished preview. Model tier/tool use changes task consumption. Choose an image-capable model, check account restrictions and budget; do not assume a trial lasts through judging or a model named in an example is available to this account. [Model-tier pricing](https://help.zapier.com/hc/en-us/articles/46425475442829-AI-by-Zapier-model-tier-pricing).

## Menu-import constraints: source facts versus proposed controls

**Documented:** AI by Zapier supports public image analysis, configurable output fields and a list of result objects. Dropbox needs a direct file link rather than a sharing-page link. Its image support is not general website/menu-URL scraping. Its knowledge sources persist until deletion. The guide does not guarantee extraction accuracy or document Envoi's image formats, size limits or temporary-link compatibility. [AI by Zapier guide](https://help.zapier.com/hc/en-us/articles/8496342944013-Use-AI-by-Zapier-to-analyze-and-return-data).

**Proposed Envoi controls, not demonstrated provider guarantees:**

These are historical candidates, not current storage or transport choices.
The 2026-10-10 Gate 2 amendment supersedes signed URLs, stored image bytes, the image proxy and all image maintenance with request-memory-only direct vision.
Draft validation/merchant confirmation rules below still apply; Zapier access, callbacks, retention and cleanup rules do not.
See [the current supplement](#gate-2-source-supplement-2026-10-10).

1. Keep SGQR decoding separate from menu analysis. Only the merchant's separate, consented menu image enters the menu workflow. Do not send buyer data, private keys, payment credentials or unnecessary QR personal identifiers.
2. Use private temporary storage and a short-lived direct image URL that Zapier/the selected provider can fetch without a browser login. Anyone holding that URL can fetch it during its lifetime. Supabase documents signed URLs for private assets, but they survive Auth key revocation until expiry; URL revocation requires support. Temporary-link compatibility with AI by Zapier and effective early source removal still need proof. Never make an entire bucket public. [Storage serving](https://supabase.com/docs/guides/storage/serving/downloads).
3. Define the access window and cleanup deadline at Gate 2. Remove the source object/access when processing completes, fails, is canceled or expires; include cleanup after crashes. Verify actual fetch denial, including storage/cache behavior; do not call logout or key rotation image cleanup. If signed-URL/source deletion cannot meet that requirement, select a revocable serving approach at Gate 2. Reject late results after cancellation/expiry. A retry needs a fresh approved import attempt/access window, not indefinite exposure of the old link.
4. Removing Envoi's file/access does **not** prove deletion from Zapier, AI subprocessors, logs or caches. Zap history has its own retention; custom retention is Enterprise-specific. Confirm account deletion controls and provider terms before accepting real merchant images. Do not store menu images as persistent AI knowledge sources by default. [Retention](https://help.zapier.com/hc/en-us/articles/8496327478413-Customize-data-retention-in-Zapier), [account-data controls](https://help.zapier.com/hc/en-us/articles/8496289406349-Export-or-delete-your-Zapier-account-data).
5. Accept results only as an unpublished draft for the authorized outlet/import attempt. Validate shape and field types, nonempty names, explicit SGD currency, decimal-safe prices and bounded row/text sizes. Empty output, malformed JSON/arrays, duplicate/ambiguous variants and unreadable prices must produce an incomplete draft or clear error, never a silently repaired published price. Unknown prices stay null/blank; do not turn them into zero. Availability is supplied by the merchant, not inferred from a photo.
6. Preserve existing merchant edits. A repeated or late result cannot overwrite a confirmed/published menu. Confirmation applies to the current complete draft; edits invalidate it. Publication additionally requires outlet authorization and connected accepted destinations.
7. Inaccessible/expired images, unsupported formats, moderation refusal, model timeout, task exhaustion or bad output lead to a visible delayed/error state and re-upload/manual entry. Gate 2 must select upload limits and supported types based on account/model trials; none is verified here. Use a bounded timeout and import identity so failures do not hang indefinitely or create duplicate drafts.

Zapier supports error handlers and replay, with plan-dependent limits. Error handlers turn off autoreplay for that Zap; a handled run is not proof of useful output. Replays are not guaranteed to succeed. The future importer must inspect its own result and deduplicate retries; the Zap receives no permission to publish menus or move money. [Error handling](https://help.zapier.com/hc/en-us/articles/22495436062605-Set-up-custom-error-handling), [replay behavior](https://help.zapier.com/hc/en-us/articles/19220226086797-What-is-replay).

## Proof still required after the gates

- **[unknown]** Account access: hosting/Actions quota and zero-spend controls, APIMatic tier, usable OpenAI credits, separate model access through judging and no data-sharing opt-in. No Zapier access is needed and no paid hosting fallback is authorized.
- **[unknown]** Menu workflow: consented readable/blurred/Chinese/rotated/small-text/partial/non-SGD samples; exact readable prices and blanks for unreadable values; malformed/empty/late results, abort/disconnect, lost response, RAM/latency/spend caps and injected no-disk/no-log/no-database-image probes. Manual fallback and merchant confirmation are not accuracy proof.
- Buyer-side scan: decode accuracy on authentic stickers scanned in place, camera-permission denial, an unenrolled sticker resolving to no purchase, and a shared identifier covering several enrolled outlets resolving to one. None has been demonstrated.
- Payments: distinct authorized sandbox seller, buyer approval, capture/payee/amount/currency match and uncertain-result reconciliation. PYUSD requires its own mint/extension/wallet/finality and conversion proof before enablement.
- Usability and merchant economics: the proposed 4-of-5/3-minute target and merchant willingness are untested.
- Live launch: provider eligibility, qualified Singapore legal review, merchant ownership/enrollment, retention, support, monitoring, reconciliation and recovery. No-custody is a design boundary, not a licensing conclusion.

Research and mockup checks do not establish runtime evidence.
Gate 1 is re-approved, the Gate 2 amendment was re-approved on 2026-10-11, the Gate 3 revision drafted on 2026-10-11 was re-approved the same day and Gate 4 was revised and approved on 2026-10-12.
No implementation, spend, installation, provisioning, workflow, commit, push or deployment is authorized by this work.
The original brief and protected gate/mockup files remain unchanged in this revision.

## Initial Gate 2 source refresh, 2026-10-07 (hosting choices superseded below)

The Supabase/private Storage/Render-worker choices and five-minute deletion target in this initial draft are historical. The user's subsequent free-hosting instruction replaces them in the following refresh and `02-architecture.md`. Payment, scan and model-authority boundaries remain current.

Public documentation was re-read for architecture decisions. **[verified]** means the source was inspected, not that Envoi executed the capability. Provider behavior below remains **[vendor claim]**; this account's access and runtime compatibility are **[unknown]**.

- **[vendor claim]** PayPal allows sandbox platform testing before live partner approval; its multiparty checkout documents seller assertions/partner headers, and its official Orders specification exposes payee identity and create/read/capture. Idempotency has bounded retention; webhook postback verification is documented, while simulated events do not support that postback path. **[hypothesis]** Select a direct Orders v2 adapter for a distinct allowlisted seller, persist operation keys and verify provider records. Do not assume a pasted merchant ID or toolkit defaults can pay that merchant. [Platform access](https://developer.paypal.com/platforms/get-started/), [multiparty checkout](https://developer.paypal.com/platforms/checkout/standard/integrate), [Orders specification](https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi/checkout_orders_v2.json), [idempotency](https://developer.paypal.com/api/rest/reference/idempotency/), [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/).
- **[vendor claim]** Supabase private assets require authorized access or signed URLs; signed URLs survive Auth-key changes until expiry. **[hypothesis]** Replace the earlier external-signed-URL candidate with private Storage behind an Envoi proxy checking import state/deadline on every fetch. Proposed 5-minute processing/access window; immediate access closure and deletion target within 5 minutes of closure. These are Envoi controls awaiting runtime fetch/denial/removal evidence, not a claim of upstream deletion. [Storage serving](https://supabase.com/docs/guides/storage/serving/downloads), [object deletion](https://supabase.com/docs/guides/storage/management/delete-objects).
- **[vendor claim]** AI by Zapier requires publicly accessible images, supports structured/list outputs and has account/model restrictions. Webhooks by Zapier documents incoming triggers and outgoing requests with headers; a trigger response does not establish completed analysis. **[hypothesis]** Use a configured callback with per-import bearer scope, bounded output and no publication/payment permission. Model/temporary-link compatibility and account retention remain **[unknown]**. [Image analysis](https://help.zapier.com/hc/en-us/articles/8496342944013-Use-AI-by-Zapier-to-analyze-and-return-data), [trigger](https://help.zapier.com/hc/en-us/articles/8496288690317-Trigger-Zap-workflows-from-webhooks), [result request](https://help.zapier.com/hc/en-us/articles/8496326446989-Send-webhooks-in-Zap-workflows).
- **[vendor claim]** Anonymous Supabase users have the authenticated role, and service keys can bypass RLS. **[hypothesis]** Explicit merchant membership checks and isolated private schemas/roles remain necessary even with Auth/RLS. [Anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- **[vendor claim]** Next.js supports Node deployment, Render workers have no inbound HTTP, and pg-boss uses PostgreSQL with transaction support. **[hypothesis]** One web app/worker shares domain rules and a database; queue/library/runtime compatibility needs proof. No deployment or credits were verified. [Next.js](https://nextjs.org/docs/app/getting-started/deploying), [Render worker](https://render.com/docs/background-workers), [pg-boss](https://github.com/timgit/pg-boss).
- **[hypothesis]** PYUSD stays disabled in the core draft. Official test-token guidance does not establish a usable mint/wallet/FX/recovery configuration; pin those through a Gate 2 amendment before dependent wallet contracts/slices. [Test-token guide](https://developer.paypal.com/community/blog/testnet-pyusd/).

Gate 2 specifies proposed upload/output limits, authenticated writes, operation ownership, timeouts and failure behavior. Exact types, version pins and meaningful failure tests belong to Gate 3; execution proof belongs to authorized slices after Gate 4. Earlier unsourced prior-art breadth/uniqueness statements above are not used as architecture evidence; authentic SGQR scheme coverage remains unknown. No accounts were connected, packages installed, external workflows changed or transactions run in this refresh.

## Free-hosting revision, 2026-10-07 (historical, before Gate 2 approval)

The `[unknown]` labels below on Actions quota and zero-spend controls were resolved by the [Gate 3 cross-check](#gate-3-cross-check-2026-10-07); the storage and delete assumptions were corrected by it. This section is retained for traceability.

- **[verified] User constraint:** Supabase free-database quota unavailable; user answered "Free services only" for hosting. This authorizes revision of unapproved Gate 2, not provisioning, repository publication, paid services or implementation. Product behavior and Gate 1 approval remain unchanged; Render's provisional integration label now says application hosting, with recovery execution selected at Gate 2.
- **[vendor claim]** Render hosts managed Postgres, so Supabase is not required. However, Render Free Postgres expires after 30 days; free apps sleep after 15 minutes idle and may take about a minute to start. Free filesystems are ephemeral; background workers/disks require paid instances. **[hypothesis]** Select one Render Free app and use another persistent free database for the submission/judging period. No always-running task inside the sleeping app. [Postgres](https://render.com/docs/postgresql-creating-connecting), [Free limits](https://render.com/docs/free).
- **[vendor claim]** Neon plans now document 1 GB Postgres/project, 100 CU-hours/project/month, 5 GB public transfer/project/month and five-minute scale-to-zero. Current documentation describes quota-limited access without Render's 30-day expiry; exhausted compute/transfer suspends compute and storage exhaustion can block updates/deletes. The 2026-10-02 storage announcement supersedes older 0.5 GB figures. **[hypothesis]** Neon Free is the selected database, with a small compute and no continuous polling. **[unknown]** Account access, remaining shared limits, regions and capacity through judging. Web extraction of Neon docs rejected their Markdown content type; primary Markdown was read directly over HTTPS. [Plans](https://neon.com/docs/introduction/plans), [October update](https://neon.com/blog/neon-free-plan-1-gb-per-project), [pooling](https://neon.com/docs/connect/connection-pooling).
- **[vendor claim]** Better Auth documents Next.js, Drizzle/PostgreSQL, email/password and anonymous sessions. **[hypothesis]** Host the auth library inside Envoi; durable secure-cookie sessions, pre-provisioned allowlisted merchant accounts and anonymous buyers. Reject anonymous merchant actions and require approved memberships. No public merchant signup/mail/reset service assumed. **[unknown]** Combined configuration and runtime compatibility. [Introduction](https://better-auth.com/docs/introduction), [Next.js](https://better-auth.com/docs/integrations/next), [Drizzle](https://better-auth.com/docs/adapters/drizzle), [anonymous](https://better-auth.com/docs/plugins/anonymous), [email/password](https://better-auth.com/docs/authentication/email-password).
- **[vendor claim]** PostgreSQL supports binary `bytea` values; Neon includes database restore history. **[hypothesis]** Capped private menu-source rows avoid a separate storage service for this small demo: one source at most 5 MiB, ten sources/50 MiB live bytes globally, transactional import/source insertion, revocable Envoi proxy, five-minute fetch/result expiry, transactional removal on completion/failure/cancel. Idle/crash cleanup uses best-effort hourly maintenance, not the earlier five-minute deletion target. Proposed stale-maintenance/overdue-source threshold is 90 minutes, blocking new imports. Logical deletion does not erase database versions/restore history or upstream copies; byte caps do not bound total provider storage. Real images need runtime fetch/denial/removal evidence, capacity headroom and consent explaining retention. [Binary data](https://www.postgresql.org/docs/current/datatype-binary.html), [Neon history](https://neon.com/docs/introduction/plans#history-window).
- **[vendor claim]** Standard public GitHub Actions runners are free; private runs consume included minutes. Schedules can be delayed/dropped, require the default branch and may auto-disable after 60 inactive days in public repositories. **[hypothesis]** Hourly finite Node maintenance with a proposed two-minute timeout, no overlap, direct database access and recoverable leases on existing records. No Render wake-up pings, initial capture/create, menu re-analysis or image/payment artifacts/caches. **[unknown]** Included account quota, zero-spend stop controls, actual duration and schedule reliability. Public-repository conversion is not authorized; a manual operator run does not establish unattended recovery. [Billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [included usage](https://docs.github.com/en/billing/reference/product-usage-included), [schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- **[hypothesis] Proof boundaries:** include idle wake time in the three-minute buyer metric; prove lost-response/idle maintenance with delayed/missing runs and keep uncertain payments blocked. Monitor database/history and execution quotas before exhaustion blocks cleanup. Free hosting does not establish free OpenAI/Zapier access; the published Zapier workflow and model entitlements through judging remain separate blockers. No account, scheduled workflow, image import or transaction was created in this planning revision.

## Gate 3 cross-check, 2026-10-07

Primary sources were re-read independently while preparing `03-program-design.md`, because Gate 2 approval explicitly left the preceding review's findings unresolved. Four results correct or tighten a Gate 2 assumption. Nothing below is runtime evidence for this account, and no package was installed to obtain it.

- **[verified] Neon storage exhaustion blocks cleanup writes.** On the Free plan the history window is a `6-hour limit`, storage accounting includes `Database storage (instant restore), GB-month`, and `Change history is a log of write operations`. Exceeding storage `causes operations that increase storage (inserts, updates, and deletes) to fail`. Consequence: Gate 2's transactional delete-on-close is not a reliable capacity control, because a logical `DELETE` neither reclaims space until history ages out nor executes at all once the limit is reached. Image-access denial must therefore be a read-only computation from `accepted_at`, and capacity must be bounded at admission, including bytes admitted per rolling history window rather than live bytes alone. Recovery after exhaustion is a console action with **[unknown]** immediacy. [Neon plans](https://neon.com/docs/introduction/plans)
- **[verified] Better Auth deletes the anonymous user on link by default.** The anonymous plugin documents that `The anonymous user is deleted by default when the account is linked to a new authentication method`, with `disableDeleteAnonymousUser` to disable that behaviour and a manual `/delete-anonymous-user` endpoint. Gate 2 stated only that sessions survive sleep and redeploy, which is true but incomplete: a link event would by default delete the row owning every buyer purchase, orphaning receipts. Gate 3 sets `disableDeleteAnonymousUser: true` and requires that linking create no membership. [Anonymous plugin](https://better-auth.com/docs/plugins/anonymous)
- **[verified] PayPal idempotency has no fixed window and penalizes concurrency.** The reference states `To determine whether your API supports it and for information about how long the server stores the ID, see the reference for your API`, that retries work `for as long as the server stores the ID`, that a repeated key makes `PayPal return the latest status of the previous request that used that same header`, and that for simultaneous identical keys `PayPal processes the first request and might fail the second request`. Consequence: same-key replay is the correct recovery for a lost response, and concurrent same-key requests are unsafe, so capture must be serialized behind a lease rather than merely behind a stored request id. Gate 2's claim of a documented per-operation idempotency window is not supported and is corrected here. [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- **[verified] GitHub Actions zero-spend is structural on a Free account.** GitHub Free includes `2,000` minutes monthly, `GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners`, and `If your account does not have a valid payment method on file, usage is blocked once you use up your quota`. Consequence: the zero-spend control is the absence of a payment method plus a $0 spending limit, not an assumption. An hourly schedule in a private repository consumes roughly 720 of 2,000 minutes (36%), and becomes free once the repository is public, which the official rules require for submission anyway. [Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)
- **[unknown] PayPal Orders v2 scope granularity.** The publicly reachable Orders v2 reference lists the operations without exposing scope strings, so whether a read-only scope exists could not be verified from a primary source in this pass. Maintenance's restriction to provider reads therefore remains **code-level and build-graph-enforced**, not credential-enforced. Verify at provisioning whether a second REST app can be limited to reads; if it can, add it as defence in depth and record the change.
- **[hypothesis] Registry-read version pins.** Current versions were read with `npm view <pkg> version` for Next 16.4.0, React 19.3.0, TypeScript 7.0.2, Drizzle ORM 0.45.3, Drizzle Kit 0.31.11, postgres.js 3.4.9, Better Auth 1.7.7, Zod 4.6.5, AI SDK 7.0.130, `@ai-sdk/openai` 4.0.86, MCP SDK 1.32.1, `barcode-detector` 3.2.2, Sharp 0.35.5, Vitest 5.0.3, Playwright 1.63.0, Tailwind 4.3.3 and ESLint 10.12.0. Mutual compatibility across these majors is untested; the Slice 1 boot check is the falsifier. No installation occurred.

## Sponsor rules re-check, 2026-10-10

The official overview and rules pages were fetched and read on 2026-10-10.
[Overview](https://paypalaihackathon.devpost.com/), [rules](https://paypalaihackathon.devpost.com/rules).

- **[verified]** Sponsor tools are optional. The overview says using one of the partner tools "is not required", and that any AI tool works as long as PayPal integration is central.
- **[verified]** The project must meaningfully integrate at least one PayPal technology and meaningfully incorporate AI.
- **[verified]** Sponsor prizes exist for AG Grid, APIMatic, Bryntum, Channel3 and Render. There is **no Zapier prize**. Best Use of APIMatic is $1,000 USD plus six months of an APIMatic Business subscription, with three winners. Best Use of Render is Render credits for first to third place.
- **[verified]** A project can win at most one Grand Prize and one Sponsor Prize, or one Honorable Mention and one Sponsor Prize.
- **[verified]** Grand prizes include "Best Use of PayPal + AI" and "Best Use of Agentic Commerce". The second matches Envoi's agent handoff over MCP (S13).
- **User decision, same day:** Zapier is removed because it is paid. The "Recommend APIMatic + Render + Zapier" recommendation in [Proposed sponsor integrations and access](#proposed-sponsor-integrations-and-access) is superseded for Zapier. The user later chose a direct vision call through the existing OpenAI provider as the replacement, so the Zapier rows and Zapier-specific menu-import notes in this file are historical; the output-validation rules for a draft still apply.

## AI provider and PYUSD re-check, 2026-10-10

Read on 2026-10-10 to support the four questions in [`handoff.md`](handoff.md#questions-to-ask-the-user-before-revising), before the reopened gates are revised.
Sources were documentation pages plus one read-only `getAccountInfo` call to the public Solana devnet RPC.
No account, faucet, wallet, API key or transaction was used, and nothing was installed.
The Devpost overview and rules pages now return HTTP 403 to direct fetches and a bot-verification page in the browser, so the prize facts in [Sponsor rules re-check](#sponsor-rules-re-check-2026-10-10) were not re-read in this pass.

### AI provider cost and free-tier data terms

- **[verified]** OpenAI bills API usage per token: "Prices per 1M tokens" and "Tokens are billed at the chosen model's input and output rates".
The pricing page names no free tier and no free credits for model usage.
Standard short-context prices per 1M input/output tokens include `gpt-5-nano` $0.05/$0.40, `gpt-4.1-nano` $0.10/$0.40 and `gpt-4o-mini` $0.15/$0.60.
[Pricing](https://developers.openai.com/api/docs/pricing).
- **[verified]** OpenAI states that API data "is not used to train or improve OpenAI models" unless the customer opts in, keeps abuse-monitoring logs "for up to 30 days", and may retain an image flagged by its CSAM classifier for manual review even under zero-retention settings.
[Your data](https://developers.openai.com/api/docs/guides/your-data).
- **[verified]** The Gemini API has a free tier on its current Flash and Flash-Lite models (pricing page last updated 2026-10-09 UTC).
The free tier is marked "Used to improve our products: Yes" and the paid tier "No".
The page gives no per-modality breakdown for the free tier, so free-tier image input is **[unknown]**, and free-tier rate limits were not read.
[Pricing](https://ai.google.dev/gemini-api/docs/pricing).
- **[verified]** The Gemini API terms for Unpaid Services (last updated 2026-04-28) say Google uses submitted content and responses "to provide, improve, and develop" its products, that "human reviewers may read, annotate, and process your API input and output", and "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
Users must be 18 or older, and API clients made available to users in the EEA, Switzerland or the UK must use Paid Services.
[Terms](https://ai.google.dev/gemini-api/terms).
- **[vendor claim]** Groq states "By default, Groq does not retain customer data for inference requests", while inference logs may be kept "for up to 30 days" for reliability or abuse investigation with an opt-out in Data Controls.
The page does not say whether inputs train models.
Its only listed vision model is `qwen/qwen3.8-27b`, with up to three images per request and JSON mode with images.
The rate-limit page shows Developer-plan limits only, so free-plan access to that model is **[unknown]**.
[Your data](https://console.groq.com/docs/your-data), [vision](https://console.groq.com/docs/vision), [rate limits](https://console.groq.com/docs/rate-limits).
- **[verified]** GitHub Models was "fully retired" on 30 July 2026 and is not an option.
[GitHub Models](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models).
- **[vendor claim]** AI SDK user messages accept image parts as base64, `ArrayBuffer`, `Uint8Array`, `Buffer` or a URL, and "Not all language models support all message and content types".
Structured output with an image for a given provider and model is **[unknown]** until tried.
[Prompts](https://ai-sdk.dev/docs/foundations/prompts).

### PYUSD blockers against primary sources

| Blocker | Finding | Label |
| --- | --- | --- |
| Official devnet token | Paxos lists the Solana Devnet PYUSD token as `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM` and says "Testnet tokens have no value!"; it lists no Solana supply-control address. A devnet read of that account at slot 509781623 returned owner `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` (Token-2022), `decimals: 6`, token metadata name "PayPal USD" and symbol "PYUSD" with a metadata URI under `token-metadata.paxos.com/.../sandbox/solana/`, and the extensions `mintCloseAuthority`, `permanentDelegate`, `transferFeeConfig` (0 basis points, maximum fee 0), `confidentialTransferMint` (auto-approve off), `confidentialTransferFeeConfig`, `transferHook` (no program), `metadataPointer` and `tokenMetadata`. PayPal's own test-token guide shows the address as the placeholder "[insert token address here]", so Paxos is the citable source. The mainnet mint `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` is a different token and must never be configured for devnet. [Paxos testnet](https://docs.paxos.com/guides/stablecoin/pyusd/testnet) | **[verified]** |
| Transfer instruction | Solana's transfer-fee page says to "Transfer tokens with TransferCheckedWithFee and verify the expected fee", and that with `TransferChecked` "The configured fee is still withheld on the destination token account." The fee authority can change the fee with `SetTransferFee`, which "takes effect starting two epochs later." Verification must therefore read the fee configuration for the transfer's epoch rather than assume zero. [Transfer fees](https://solana.com/docs/tokens/extensions/transfer-fees) | **[verified]** source; the verification rule is **[hypothesis]** |
| Test tokens | PayPal's guide (15 May 2025) names the Google Cloud Web3 Faucet, Solana Devnet, "up to 100 testnet PYUSD per Google account per day", and says it "requires no sign-up". Paxos recommends its own Testnet Faucet for PYUSD and says "Faucet availability and limits change over time." Both faucet pages render client-side and could not be read here. Fees and token-account rent need devnet SOL from `faucet.solana.com`. [Guide](https://developer.paypal.com/community/blog/testnet-pyusd/), [Paxos funding](https://docs.paxos.com/guides/developer/fund-sandbox-with-test-crypto) | **[vendor claim]** route; access **[unknown]** until the user tries it with their own Google account |
| Buyer wallet | Phantom supports Solana Devnet after the user turns on Settings, Developer Settings, Testnet Mode, and then "will display testnet balances and allow transactions". Its Token Extensions page lists metadata, metadata pointer, permanent delegate ("Phantom will display a warning"), transfer fees (shown "on the confirmation screen of every send") and transfer hooks; confidential transfer is not listed, and the devnet mint has it initialized. The page does not say how a dapp requests devnet. How a phone browser at the shop counter reaches the wallet (in-app browser or deep link) was not established. [Testnet mode](https://docs.phantom.com/developer-powertools/testnet-mode), [Token Extensions](https://docs.phantom.com/developer-powertools/solana-token-extensions-token22) | **[vendor claim]** for the listed features; devnet PYUSD display and the phone path are **[unknown]** |
| Merchant wallet ownership | Phantom says message signatures "do not involve network fees and are a convenient way for apps to verify ownership of an address", uses Ed25519 signatures, and "validates recognized Sign-In with Solana (SIWS) messages before displaying an approval prompt", requiring `domain` to match the requesting page's host. Binding purpose, outlet and cluster into the signed message is Envoi's design. [Signing a message](https://docs.phantom.com/solana/signing-a-message), [SIWS](https://docs.phantom.com/recipes/auth/sign-in-with-solana) | **[vendor claim]**; the binding is **[hypothesis]**, untested |
| SGD-to-PYUSD quote | ECB reference rates include SGD and USD (latest shown 9 October 2026) and are free, but are "published for information purposes only" and "Using the rates for transaction purposes is strongly discouraged." Frankfurter serves such rates with no key and "no quotas", and says the rates "fall under each provider's terms". A data.gov.sg daily USD/SGD series was reported to end in October 2015 and MAS rates to come from Thomson Reuters with permission; both are from a search summary and were not re-read. Pyth's FX feed list was unreachable from this environment. [ECB](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [Frankfurter](https://frankfurter.dev/) | **[unknown]**: no free market-rate source was found whose terms clearly allow a transaction basis |
| Merchant-set rate alternative | The merchant states the PYUSD-per-SGD rate it accepts, with the date set, at enrollment; Envoi converts each review with it, rounds the atomic amount up, shows the basis and age, and requires the rate to be re-confirmed after a fixed age. No external FX source or terms are involved, and Gate 1 rule 4 already requires the basis and age to be labeled. | **[hypothesis]**, not yet a decision |
| RPC | `https://api.devnet.solana.com` is "rate-limited": 100 requests per 10 seconds per IP, 40 per 10 seconds per IP for one RPC method, 40 concurrent connections and 100 MB per 30 seconds, and "The public RPC endpoints are not intended for production applications." Whether Render Free's outbound IP is shared with other tenants that consume the same per-IP limit is unknown. [Clusters](https://solana.com/docs/references/clusters) | **[verified]** limits; shared-IP effect **[unknown]** |
| Finality and expiry | A blockhash is usable "for about 60 to 90 seconds"; 151 recent blockhashes are valid; a client polls `getBlockHeight` at `confirmed` until it exceeds the `lastValidBlockHeight` from `getLatestBlockhash`, after which "their previous transaction will NOT ever be processed". `finalized` avoids the dropped-fork risk at the cost of about 13 seconds of validity. This supports a rule that no replacement transfer is requested before the first one's last valid block height has passed. [Confirmation and expiration](https://solana.com/developers/guides/advanced/confirmation) | **[verified]** source; Envoi's rule is **[hypothesis]** |
| Schedule | Adding the rail needs a Gate 2 amendment, Gate 3 wallet contracts and two slices (wallet purchase with the merchant wallet challenge, and wallet recovery; S16 and S17 in the 2026-10-12 Gate 4 draft) inside a plan that already has a 25 October checkpoint and a cut order. | **[hypothesis]** tight |

## Gate 2 source supplement, 2026-10-10

This records the twelve findings supplied in the continuation handoff and the narrow re-checks used by the Gate 2 amendment.
Documentation quoted below was re-read in this run unless explicitly attributed to the previous session.
No OpenAI API call, wallet, faucet, account provisioning, installation or transaction was used.
The slot/epoch/mint authorities and genesis hash below are **prior-session read-only observations supplied by the user**, not fresh RPC output from this run.
Devpost was not fetched or bypassed; the earlier official-rule date record remains the deadline evidence.

### Direct vision and retention

1. **[verified] OpenAI's published data policy:** API data "is not used to train or improve OpenAI models" unless "you explicitly opt in".
   Abuse logs may contain customer content and are normally retained "for up to 30 days", with longer retention for legal requirements or harm prevention.
   Responses has "a 30 day Application State retention period by default", or with `store=true`, and in those cases stores response data for at least 30 days.
   "If the classifier detects potential CSAM content, the image will be retained for manual review", even with Zero Data Retention or Modified Abuse Monitoring.
   **[unknown]** This account's opt-in/ZDR status and the exact foreground `store: false` retention effect outside the specifically described controls/background behavior.
   The published policy is evidence of terms, not independent verification of OpenAI's actual deletion behavior.
   [Your data](https://developers.openai.com/api/docs/guides/your-data).
2. **[vendor claim] AI SDK provider:** `openai(modelId)` uses Responses by default; `store` "Defaults to `true`" and `strictJsonSchema` defaults true.
   Optional schema properties are unsupported; use required nullable values for unreadable prices/portions.
   **[hypothesis]** Explicit `store: false`, one foreground call, no persistent file/conversation state and independent local validation are the selected menu-call controls.
   This does not change the OpenAI provider or `@ai-sdk/openai` pin.
   [OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai).
3. **[vendor claim] AI SDK error surface:** `APICallError` can carry `url`, `requestBodyValues`, `responseHeaders`, `responseBody`, `data` and nested `cause`.
   **[hypothesis]** Whole-error logging could serialize the base64 menu photo; use an allowlisted non-content error record instead, dropping those fields and arbitrary messages.
   Gate 3 must name an actual serialized-log test with an injected image/base64 needle and its own redaction mutation.
   [API-call error](https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-api-call-error).
4. **[vendor claim] OpenAI vision:** accepts PNG, JPEG, WEBP and non-animated GIF, base64 data URLs, up to 512 MB payload and 1,500 images per request.
   `detail` supports low/high/original/auto; auto is the default and resizing is model-specific.
   For example, `gpt-5.5` high detail caps the maximum dimension at 2,048 pixels and allows up to 2,500 patches; neither figure is a universal model limit.
   It warns about non-Latin text such as Japanese/Korean, small text and rotated text.
   **[hypothesis]** Chinese-text Singapore menus and downscaled price text belong in pre-registered falsifier samples; JPEG/PNG-only Envoi admission is a narrower design choice, not all provider-supported formats.
   [Images and vision](https://developers.openai.com/api/docs/guides/images-vision).
5. **[verified] Published shutdown schedule:** `gpt-4.1-nano` and `o4-mini` shut down 23 Oct 2026.
   The `gpt-5`, `gpt-5-mini` and `gpt-5-nano` 2025-08-07 snapshots shut down 11 Dec 2026, before judging ends on 16 Dec.
   The earlier nano-price examples are historical prices, not viable through-judging model selections; alias availability is not inferred from price labels.
   **[hypothesis]** Separate text and proposed `AI_MENU_MODEL` evaluations must select account-available models with the needed schema/image support and no published shutdown before judging ends, then monitor later notices.
   No model name is chosen or evaluation spend authorized by planning.
   [Deprecations](https://developers.openai.com/api/docs/deprecations).
6. **[vendor claim] Render:** compute-plan table lists Free web as 0.1 CPU and 512 MB.
   Its Heroku comparison says "Render allows responses to take up to 100 minutes for HTTP requests".
   The outbound-IP page says ranges are shared across all services in a region, without a Free-specific qualification.
   **[unknown]** Mobile/intermediary timeout, worst-case decoder memory, vision latency and whether competing services consume the same public RPC per-IP allowance as this instance.
   The Free page alone is not evidence for RAM, body size or the quoted timeout.
   [Compute](https://render.com/docs/compute-plans), [HTTP timeout](https://render.com/docs/render-vs-heroku-comparison), [outbound IPs](https://render.com/docs/outbound-ip-addresses).
7. **[vendor claim] Next.js:** Server Actions default to 1 MB raw HTTP request bodies including multipart overhead.
   **Fresh direct re-check:** proxy automatically clones/buffers the request body in memory, with a default 10 MB buffered-body limit; oversize buffering logs a warning, not an application admission rejection.
   This corrects the handoff's search-summary-only status for the proxy finding.
   **[hypothesis]** Use the already-selected Node route-handler surface with its own counted body limit and exclude this upload from proxy body cloning; do not raise Server Action limits or rely on 10 MB as validation.
   Current docs do not prove behavior of the pinned release until the boot/upload tests run.
   [Server Actions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [proxy buffering](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize).

### Phantom, chain identity and recovery

8. **[vendor claim] Phantom:** `signAndSendTransaction` is its recommended path; sign-only methods are not supported in its Wallet Standard implementation and exist only on the legacy `window.solana` object.
   The wallet signs and broadcasts, then returns a signature.
   **[hypothesis]** Envoi therefore constructs/persists unsigned bytes before release and validates the finalized landed transaction, not an unavailable signed pre-broadcast result.
   Unexpected instructions can be rejected as payment evidence after broadcast but that rejection cannot prevent or undo a transfer.
   **[unknown]** Whether Phantom modifies the dapp message/blockhash/instructions.
   [Sending a transaction](https://docs.phantom.com/solana/sending-a-transaction).
9. **[vendor claim] Phantom testnet mode:** Settings -> Developer Settings -> Testnet Mode lists Devnet/Testnet; it does not specify how a dapp requests a network.
   **[verified] Standard source:** `SOLANA_DEVNET_CHAIN` is `solana:devnet`; `SolanaSignAndSendTransactionInput.chain` is required and output `signature` is raw `Uint8Array` bytes.
   **[unknown]** Phantom honoring this chain input and displaying the specific devnet PYUSD mint.
   [Testnet mode](https://docs.phantom.com/developer-powertools/testnet-mode), [chains source](https://raw.githubusercontent.com/anza-xyz/wallet-standard/master/packages/core/chains/src/index.ts), [sign-and-send source](https://raw.githubusercontent.com/anza-xyz/wallet-standard/master/packages/core/features/src/signAndSendTransaction.ts).
10. **[vendor claim] Phantom Browse:** `https://phantom.com/ul/browse/<url>?ref=<ref>` opens a page in its in-app browser and documents no cluster parameter.
    **Fresh direct re-check:** the separate encrypted Connect method documents `cluster=mainnet-beta|testnet|devnet`, default mainnet-beta; HTTPS redirects open the mobile browser.
    It is a different integration, not evidence that Wallet Standard honors devnet or shares cookies.
    **[hypothesis]** Treat wallet-browser cookies as separate and never transfer purchase ownership; a candidate is single-use suggestions redeemed into a newly priced review in that session.
    **[unknown]** Actual phone path/cookie behavior; this candidate is not a delivered or selected transport.
    [Browse](https://docs.phantom.com/phantom-deeplinks/other-methods/browse), [Connect](https://docs.phantom.com/phantom-deeplinks/provider-methods/connect).
11. **[verified, prior-session observation] Read-only devnet:** calls to `https://api.devnet.solana.com` reported slot 509797350, epoch 1180 and genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
    The genesis value comes from `getGenesisHash`, not the clusters documentation page.
    `getAccountInfo` for `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM` returned Token-2022 owner, 6 decimals, name "PayPal USD", symbol "PYUSD" and metadata under `token-metadata.paxos.com/.../sandbox/solana/`.
    Mint authority: `FtU1WxEj7uasRq7WxFQ3FyPE8rz174hV3JHV7Z1rccjb`.
    Freeze authority and permanent delegate: `DFWDTsWsyGgFLbVARTS92wHDKK2hwTUNk71uPM3mf16S`.
    Both older/newer transfer fees were 0 basis points and maximum 0, with epoch 644.
    Transfer-hook program was null, with authority `G8ENSYKVGPbRTbcN1BxXuRMYeCq13271UjCUrrpZTJ4X`, also reported as fee/close/metadata/confidential-transfer authority.
    These are public addresses, not wallet keys, and a historical read is not a future immutable-configuration guarantee.
    **[hypothesis]** Frozen accounts fail transfer; permanent-delegate control permits later movement out of the recipient, so receipt wording must describe finalized transfer, not tokens being "kept".
    Hook activation is a new-preparation stop condition.
    **[vendor claim]** Phantom shows a warning for permanent-delegate mints; its effect on buyer time remains unmeasured.
    [RPC read endpoint](https://api.devnet.solana.com), [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash), [Token Extensions](https://docs.phantom.com/developer-powertools/solana-token-extensions-token22).
12. **[verified] Paxos published devnet address** remains `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM`; "Testnet tokens have no value!".
    **[verified] Published public devnet limits:** 100 requests/10 s/IP; 40/10 s/IP per method; 40 concurrent connections/IP; 40 connections/10 s/IP; 100 MB/30 s.
    Devnet is rate-limited and public endpoints are not intended for production; devnet can reset.
    Those limits are advertised policy, not verified free account capacity or guaranteed retained history.
    [Paxos testnet](https://docs.paxos.com/guides/stablecoin/pyusd/testnet), [clusters](https://solana.com/docs/references/clusters).

### Additional amendment cross-checks and consequences

- **[vendor claim] Transfer fees:** `TransferChecked` still withholds configured fees; `SetTransferFee` takes effect two epochs later.
  **[hypothesis]** Read older/newer fee schedules and their effective epochs before preparation; refuse non-zero fees in the validity horizon, then verify exact per-transaction destination balance delta and zero fee at finality.
  Do not compare to a later live balance, which can include unrelated payments or permanent-delegate movement.
  [Transfer fees](https://solana.com/docs/tokens/extensions/transfer-fees).
- **[vendor claim] Solana confirmation:** recent blockhashes normally last about 60-90 seconds; finalized blockhashes reduce available signing time but avoid dropped-fork blockhash risk.
  The guide recommends wallets refresh stale blockhashes before signing.
  **[hypothesis]** Exact-message/blockhash preservation must be proven for Phantom before saved-height expiry permits replacement; it is not established by the dapp preparing bytes.
  Use finalized height past lastValidBlockHeight plus complete finalized history scanning as a conservative release condition; missing evidence stays uncertain.
  [Confirmation and expiration](https://solana.com/developers/guides/advanced/confirmation).
- **[vendor claim] RPC history:** `getSignaturesForAddress` returns newest-first signatures for references in accountKeys, supports finalized commitment and `before`/`until` pagination, with a maximum 1,000 entries/page.
  **[hypothesis]** Persist cursors/window coverage and retrieve full candidate transactions; null/pruned/incomplete history cannot prove absence.
  A unique mandatory memo reference, expected fee payer and exact prepared message are the proposed attribution controls, not equal amount alone.
  [Signature history](https://solana.com/docs/rpc/http/getsignaturesforaddress).
- **[vendor claim] Phantom message signing** uses Ed25519 and recognizes SIWS messages, checking the requesting host for the domain.
  **[hypothesis]** Envoi's exact saved, single-use 5-minute enrollment challenge additionally binds purpose/outlet/cluster/wallet and nonce; key control does not prove merchant authority.
  [Message signing](https://docs.phantom.com/solana/signing-a-message).
- **[vendor claim] Mint authority consequences, re-read after two fetch timeouts:** a permanent delegate can transfer/burn from any account for that mint and the token account owner cannot revoke it; frozen accounts cannot receive, transfer or burn until thawed.
  **[hypothesis]** Require unfrozen verified accounts before preparation and describe the finalized transfer only, never guaranteed retained ownership.
  [Permanent delegate](https://solana.com/docs/tokens/extensions/permanent-delegate), [freeze account](https://solana.com/docs/tokens/basics/freeze-account).

### Gate 2 review re-checks, 2026-10-11

A review of the amendment against Gate 1 and these sources produced five changes the user accepted on 2026-10-11.
Pages below were read in this run; no OpenAI API call, wallet, faucet, RPC request, transaction or installation was used.
Where a point supersedes an earlier hypothesis above, it says so; the earlier text stays as the historical record.

13. **[vendor claim] Phantom Lighthouse:** Phantom says a submitted transaction may be augmented with Lighthouse assertion instructions before it reaches the network, so the onchain transaction differs from what the dapp submitted, and assertions can make an otherwise valid transaction fail.
    The page names no exception for devnet, the extension or partially signed transactions.
    **[hypothesis]** Exact-bytes matching would leave ordinary Phantom payments uncertain, so verification checks the payment's meaning and allowlists ComputeBudget and Lighthouse assertion instructions only.
    This supersedes the exact-prepared-message attribution and matching hypotheses in item 8 and the confirmation/history cross-checks above; blockhash preservation stays an enablement proof.
    [Lighthouse](https://docs.phantom.com/developer-powertools/lighthouse).
14. **[vendor claim] Phantom priority fees:** Phantom applies its own priority fees when the transaction has no signatures, no existing compute-budget instructions and stays under 1,232 bytes, and it discourages dapps from setting their own.
    **[hypothesis]** Envoi's prepared transaction carries no compute-budget instructions; wallet-added ones are allowlisted.
    [Priority fees](https://docs.phantom.com/developer-powertools/solana-priority-fees).
15. **[vendor claim] Lighthouse program ID:** the Lighthouse repository README lists `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` for both devnet and mainnet beta.
    **[unknown]** Whether Phantom's devnet assertions use that deployment; Gate 3 rechecks the program account before pinning it in code; done read-only on 2026-10-11, see [Gate 3 revision reads](#gate-3-revision-reads-2026-10-11).
    [Lighthouse repository](https://github.com/Jac0xb/lighthouse).
16. **[vendor claim] Blockhash commitment:** Solana's confirmation guide says `confirmed` should almost always be used for RPC requests, that a `finalized` blockhash cuts transaction expiration by about 13 seconds (more under unstable conditions), and that a blockhash from an abandoned block is never recent on the finalized chain.
    **[hypothesis]** Prepare with a `confirmed` blockhash for more buyer approval time; release still requires finalized block height past the saved `lastValidBlockHeight` plus a complete scan.
    This supersedes the finalized-blockhash choice in the confirmation cross-check above.
    [Confirmation and expiration](https://solana.com/developers/guides/advanced/confirmation).
17. **[verified] OpenAI data page re-read:** the `/v1/responses` row lists no training use, 30-day abuse-monitoring retention and application state as none with listed exceptions; the text also describes a 30-day default application-state period.
    The page states no general `store=false` rule for an ordinary foreground request; approved Zero Data Retention is what excludes content from abuse logs, and the CSAM manual-review exception is unchanged.
    **[hypothesis]** The short consent states the facts a merchant needs; its details say the exact `store: false` effect is unpublished and separate from abuse monitoring.
    [Your data](https://developers.openai.com/api/docs/guides/your-data).
18. **[hypothesis] Browser-side shrink:** the browser decodes, orients and re-encodes one JPEG of at most 2,048 pixels/side and 2 MiB, the same target item 4 records for high detail; the server accepts only that, bounds the whole body at 2.5 MiB, re-validates, strips metadata and re-encodes.
    By arithmetic a 2,048 x 2,048 frame is about 4.2 megapixels, roughly 17 MB as RGBA; this is not a `sharp` measurement.
    **[unknown]** Browser decode memory and HEIC handling on target phones.
    This supersedes item 4's JPEG/PNG admission choice and the earlier 5 MiB/20 MP/6,000-pixel server input.
19. **[hypothesis] Phone path:** an "Open in Phantom" link built from item 10's documented Browse URL carries only public outlet/item IDs and quantities into a new wallet-browser session, where the server prices a fresh review.
    It needs no token or new route, copies no cookie and transfers no ownership; the original browser's PYUSD review is never prepared.
    This supersedes item 10's single-use handoff candidate; actual phone behavior remains **[unknown]**.

### Gate 2 proposal mirror and boundary

**[hypothesis] Revised proposal:** browser-shrunk JPEG at most 2,048 pixels/side and 2 MiB, request-memory-only import, bytes-free attempt, 90-second total/60-second model budget, one global in-flight request, 10/outlet and 50/global daily attempts, recorded spend ceiling, strict bounded draft, merchant edits/confirmation preserved and no import maintenance dependency.
Drop source rows, image/result routes and capability principals, `ZAPIER_MENU_HOOK_URL`, `T_IMAGE_ACCESS`, `T_SOURCE_SWEEP`, `expire_imports` and `sweep_sources` in the later Gate 3 revision, not by editing it now.
Separate `AI_MENU_MODEL` is proposed alongside unchanged `AI_MODEL`/provider/pin.

**[hypothesis] PYUSD proposal:** devnet identity/mint/program/decimals as code constants, only RPC/enable env knobs, pre-existing verified merchant ATA, Ed25519/SIWS control proof, dated 30-day merchant rate, integer ceil rounding, persisted locked attempt with a `confirmed` blockhash before wallet sign-and-send, finalized verification of the transfer's meaning with allowlisted ComputeBudget/Lighthouse instructions and complete post-expiry recovery.
Phone path is a Phantom Browse link into a fresh wallet-browser review; no cookie sharing, transfer of ownership or broadcast by Envoi.
PayPal must remain independent.

**[unknown] Carry forward:** model through judging; OpenAI sharing setting and `store: false` effect; English small-price and rotated-text draft accuracy (Chinese text dropped from scope on 2026-10-15); Render latency/decoder RAM and browser shrink on target phones; Phantom token display, chain honoring and blockhash/transfer preservation; phone Browse-link path; user faucet access; RPC shared-IP/history behavior.
R2 narrows to general storage exhaustion; R6 expands to RAM/CPU; image-churn R7 is superseded by mis-sized spend/admission R7a.
Other approved decisions and risks stand.
The architecture was re-approved on 2026-10-11; the Gate 3 revision of affected contracts was drafted and re-approved the same day, the Gate 4 draft was revised on 2026-10-12, and no runtime, spend or external-action authority follows from this research.

Documentary proof is recorded in [status](00-status.md#gate-2-amendment-documentary-verification-2026-10-10), not integration evidence.

## Gate 3 revision reads, 2026-10-11

Read on 2026-10-11 (11:11-11:14 UTC) to pin the Gate 3 revision's new packages and constants.
Every read was an HTTPS GET of a public registry document, package tarball or source file, plus two read-only devnet RPC calls; raw responses stayed in session scratch storage.
No package was installed, no OpenAI call was made, and no wallet, faucet, airdrop or transaction was used.

1. **[verified] Registry pins.**
   The npm registry documents list `@solana/kit` 8.4.0 (published 2026-09-28; peer `typescript >=5.4.0`; engines `node >=20.18.0`), `@solana-program/token-2022` 0.19.0 (2026-09-21; peers `@solana/kit ^8.3.0`, `@solana/sysvars ^8.0.0`, and `@solana/zk-sdk ^0.5.1` marked optional), `@solana-program/memo` 0.15.0 (2026-09-21), `@wallet-standard/app` 1.1.1 (2026-06-03; engines `node >=22`) and `@solana/wallet-standard-features` 1.5.0 (2026-09-10; engines `node >=22`) as latest.
   `lighthouse-sdk` 2.1.0 (2025-05-12) peers `@solana/kit ^2.1.0`, so it cannot share Kit 8.
   The pinned `ai` 7.0.130 and `@ai-sdk/openai` 4.0.86 were both published 2026-10-07; newer patches (7.0.137 and 4.0.91) exist and are not adopted, because the pins are out of scope.
   [npm registry](https://registry.npmjs.org/).
2. **[verified] Program addresses in the pinned clients.**
   `@solana-program/memo` 0.15.0 builds new memos for `Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH` and keeps `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` and `Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo` as legacy addresses for reading.
   Its builder accepts a program-address override.
   `@solana-program/compute-budget` 0.19.0 names `ComputeBudget111111111111111111111111111111`, and `@solana-program/token-2022` 0.19.0 names `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` and the associated-token program `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`.
   Its instruction enum includes `TransferChecked`, `GetAccountDataSize`, `AmountToUiAmount` and `UiAmountToAmount`, and extension instructions such as `Pause` that the reviewed devnet mint does not carry.
3. **[verified] Lighthouse instruction set.**
   At commit `4c579479c98635e419b1b167f08be02a71604a71` (2025-04-27), `programs/lighthouse/src/instruction.rs` orders `MemoryWrite` and `MemoryClose` first, then sixteen assertion instructions from `AssertAccountData` to `AssertBubblegumTreeConfigAccount`.
   The generated Rust client confirms discriminators 0 for `MemoryWrite`, 4 for `AssertAccountDelta` and 9 for `AssertTokenAccount`, consistent with that order.
   `MemoryWrite` takes a writable payer and a memory account it creates, so it moves lamports and is not an assertion.
   The README still lists `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95` for devnet and mainnet beta.
   **[unknown]** Which Lighthouse instructions Phantom adds on devnet.
   [Lighthouse instruction source](https://github.com/Jac0xb/lighthouse/blob/4c579479c98635e419b1b167f08be02a71604a71/programs/lighthouse/src/instruction.rs).
4. **[verified] Read-only devnet check, the one Gate 2 assigned to Gate 3.**
   `getGenesisHash` on `https://api.devnet.solana.com` returned `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`, matching the pinned devnet genesis.
   `getMultipleAccounts` at `finalized`, context slot 509883437, with zero-length data slices, returned all three accounts as executable: the Lighthouse address and the newer memo address owned by `BPFLoaderUpgradeab1e11111111111111111111111`, and `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` owned by the non-upgradeable `BPFLoader2111111111111111111111111111111111`.
   This proves the programs exist on devnet today; it says nothing about future upgrades or a devnet reset.
5. **[vendor claim] Pinned AI SDK options.**
   The type definitions in `ai` 7.0.130 document `maxRetries` ("Set to 0 to disable retries", default 2), `abortSignal` and `maxOutputTokens`, and mark `generateObject` deprecated in favour of `generateText` with an `output` setting.
   `@ai-sdk/openai` 4.0.86 exposes the provider options `store` and `strictJsonSchema`, and reads an image part's `providerOptions.openai.imageDetail` into the request's image `detail`.
   It also exposes `promptCacheRetention`; the menu call never sets it, and its default effect on retention is **[unknown]**.
   These are the package authors' definitions, not observed behaviour on the selected account.
6. **[hypothesis] Consequences for Gate 3.**
   Pin the non-upgradeable memo program and allowlist only it; identify Lighthouse assertions by discriminators 2 to 17 as reviewed constants; call the vision model through `generateText` with an `output` setting; add no Lighthouse SDK, chains package or compute-budget client.
   None of this changes a Gate 2 decision.
