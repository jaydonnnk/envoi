# Vertical Slices: Envoi

Gate 4 slice plan, drafted 2026-10-10 (Asia/Singapore).
**Unapproved draft.**
Authorities: [approved Gate 1 product](01-product.md), [approved Gate 2 architecture](02-architecture.md) and [approved Gate 3 program design](03-program-design.md).
This plan selects and orders runnable slices.
It changes no approved product, architecture or contract decision.
Where a slice needs something Gate 3 did not specify, the gap is named in [Gate 3 deltas](#gate-3-deltas) instead of being decided silently.
Drafting this plan installed, provisioned, committed, pushed and deployed nothing, and it contains no application code.

**Reopened 2026-10-10.**
The user removed Zapier because it is paid and reopened Gates 1-3.
Until this plan is revised after those gates are re-approved, S11, S12, the Zapier access check and least confident decision 2 are superseded.
The user also moved S14 down the cut order, which is applied in [Schedule and cut order](#schedule-and-cut-order).
PYUSD is to be reconsidered; its blockers are in [`handoff.md`](handoff.md#why-pyusd-was-left-out-and-its-blockers).

## Starting state, verified 2026-10-10

- **[verified]** `main` and `origin/main` are both `dc1e23c`, confirmed with `git ls-remote`, and the working tree was clean before this branch was created.
- **[verified]** The repository is now checked out on macOS (arm64) at `/Users/jayd0/Desktop/envoi`. Gates 1-3 ran on Windows at `C:\Users\jayd0\OneDrive\Desktop\envoi`.
- **[verified]** Only `git` is installed on this machine. Node.js, npm, PostgreSQL, Docker, Homebrew, the GitHub CLI and the Neon CLI are absent.
- **[verified]** `.env.local`, `.neon` and `node_modules/` are absent. They were ignored on Windows, so they did not travel with the clone, and no database credential exists on this machine.
- **[verified]** The GitHub repository is private: the unauthenticated GitHub API returns 404 for it while authenticated `git ls-remote` succeeds.
- **[verified]** nodejs.org lists `v24.21.0` (Krypton, released 2026-09-07) as the latest LTS and `v26.11.1` as Current, read on 2026-10-10.
- **[verified]** This checkout has LF line endings, and `docs/plans/PAYPAL_PLAN.md` hashes directly to the recorded `6058798E...F3B220A1`. The CRLF caveat in `00-status.md` applies to the Windows checkout only.

## Slice plan

One runnable capability per slice, in build order.
Target windows are the planning windows already recorded in `roadmap.md`; they are targets, not effort estimates.

| # | Slice | What you can see when it is done | Depends on | Target window |
| --- | --- | --- | --- | --- |
| S1 | Tracer bullet on Render Free | A phone opens the Render URL, sees a labeled demo shop read from Neon and reaches an explicitly unpaid stub receipt that survives a redeploy. | Gate 4 approval | 12-25 Oct |
| S2 | PayPal sandbox happy path | A real sandbox approval and capture pays the distinct sandbox seller; the receipt shows the actual capture id; canceling at PayPal stays unpaid. | S1 | 12-25 Oct |
| S3 | PayPal recovery | Lost responses and webhooks converge on the same capture or stay visibly "checking payment"; nothing is charged twice. | S2 | 12-25 Oct |
| S4 | Text entry with AI suggestions | A buyer types a request, gets registered shops and items or a clarifying question, and continues into the S2 review. | S2 | 12-25 Oct |
| S5 | Maintenance runner, manual runs | The operator runs the finite runner once; the health view shows heartbeat, capacity and work it reconciled without a buyer page. | S3 | 12-25 Oct |
| S6 | Merchant sign-in and manual menu draft | A pre-provisioned merchant builds and confirms a menu that buyers cannot see. | S1 | 12-25 Oct |
| S7 | Merchant destination and publication | The merchant publishes; buyers buy from that shop; later edits stay unpublished and invalidate stale reviews. | S2, S6 | 12-25 Oct |
| S8 | Merchant orders and acknowledgment | The merchant sees honest payment states and acknowledges a paid order separately from payment. | S3, S7 | 12-25 Oct |
| S9 | Merchant SGQR decode and mapping | A sticker photo decodes in the browser into reviewed identifiers; the operator approves the outlet mapping. | S7 | 26 Oct-1 Nov |
| S10 | Buyer scan or paste | A scan opens one outlet, asks which outlet, or says "not on Envoi"; camera denial falls back to paste, then text. | S4, S9 | 26 Oct-1 Nov |
| S11 | Menu image intake and capability boundary | A consented test image is fetchable through its capability URL while open and denied after close or expiry. | S5, S6 | 26 Oct-1 Nov |
| S12 | Zapier AI menu draft | AI by Zapier returns a draft beside the image; the merchant corrects, completes and confirms it. | S11 | 26 Oct-1 Nov |
| S13 | Agent handoff over MCP | A supported MCP client creates a purchase request; a human redeems it once into the normal review and payment. | S2, S4 | 26 Oct-1 Nov |
| S14 | APIMatic client and docs (account-conditional) | A generated client calls the running public API and passes a contract check. | S13 | 26 Oct-1 Nov |
| S15 | Judged release | Public licensed repository, scheduled maintenance, the usability result, the video and an evidence pack. | All included slices | 2-8 Nov, buffer 9-12 Nov |

Submission cutoff is 13 Nov 2026 04:00 SGT, and access must last through judging, which ends 16 Dec 2026 00:00 SGT ([research](research.md#hackathon-dates-and-deliverables)).

## Rules for every slice

1. A slice starts only when you say "start Slice N". That authorization covers creating `envoi/slice-<N>-<slug>` from the current `main` tip and confirming it with `git branch --show-current`. It does not cover pushing, merging, deploying, installing or any external action in the slice's **Authorizations** list; each of those is requested by name when the slice starts.
2. Build vertically. A slice adds only the tables, routes, modules and screens its visible result needs, and its migrations are additive.
3. Every Gate 3 test assigned to the slice and every named addition must exist and pass. Each guard gets its own mutation: apply it, record the failing output, restore it and record the passing rerun. If one fault is caught by two guards, record that and add a check that isolates each guard; a pair caught together is not two proofs.
4. Integration tests run against a disposable local PostgreSQL with the real schema and constraints, never against Neon `production`. Provider HTTP is faked at the `PayPalWriteClient` boundary, and every fake is labeled as a fixture in test output and evidence.
5. Done means fresh passing typecheck, lint, unit, integration and the slice's end-to-end checks; a clean `git diff --check`; inspected untracked files; no secret in the diff; screens checked in a real browser at 390px and 1280px; fixtures and sandbox money labeled in the UI and in every screenshot.
6. After verification: show the real result (URL and screenshots), record evidence in the slice's section of `00-status.md`, tick it, run the `architect-reviewer` post-slice cleanup and ask `Continue to slice N+1, or re-steer?`.
7. Two slices whose dependencies are both met may swap order when an access prerequisite is pending. The swap is recorded in `00-status.md` before the swapped slice starts.
8. A discovery that changes an approved decision stops the slice and reopens the affected gate before dependent work continues.

## Gate 3 deltas

Gate 3 did not specify the items below, and the slices cannot run without them.
Each is proposed as a refinement that carries out an approved decision without changing it.
If you judge any of them to be a decision change, Gate 3 reopens for that item before the slice that needs it.

| # | Gap in Gate 3 | Proposed refinement | First needed |
| --- | --- | --- | --- |
| D1 | Gate 2 says merchant accounts, memberships, enrollments and sandbox destinations are prepared "out of band", but no file implements that, and the only operator route is the health view. | `src/operator/cli.ts`, run locally by the human operator with `MIGRATION_DATABASE_URL`. One subcommand per operator act: `seed-demo-fixture`, `assign-paypal-destination`, `create-merchant`, `grant-operator`, `approve-membership`, `approve-enrollment`, `approve-identifier`, `issue-agent-token`. Passwords are typed by the operator and agent tokens are shown once; neither is written to a file, log or commit. No new HTTP route and no new environment name. | S1 |
| D2 | No Node.js version is pinned. | Node `24.x` LTS (`v24.21.0` read 2026-10-10) in `package.json` `engines` and in `.node-version`, which Render reads. Node 26 is Current, not LTS, and is not selected. Covered by the S1 boot check. | S1 |
| D3 | Integration tests need a real PostgreSQL, and Gate 3 does not say which. | A disposable local PostgreSQL on the developer machine and a `postgres` service container in CI, both on the major version Neon reports through `SELECT version()` in S1. One test-only name, `TEST_DATABASE_URL`, joins `.env.example`. Tests never touch Neon, so they cost no Neon storage, history, compute or trans-Pacific latency. | S1 |
| D4 | The capacity table budgets only maintenance runs against the 2,000 private Actions minutes. | CI runs draw from the same pool while the repository is private. S1 records minutes per CI run, the budget becomes maintenance plus CI, and CI stays limited to typecheck, lint, unit and integration jobs with no browser download. | S1 |
| D5 | Five race contracts and several authorization rules have a written contract but no named test. | Named additions in the owning slices, listed per slice and in [Test assignment](#test-assignment). | S1 onward |
| D6 | Gate 2 deferred "OpenAPI details" to Gate 3, and Gate 3 has no OpenAPI file. | A hand-written `openapi/envoi-public.yaml` covering the public read routes only, which needs no new dependency. Choosing a generator dependency instead would be a Gate 3 amendment. | S14 |
| D7 | Gate 2 requires separate least-privileged web, maintenance and migration roles, but creating a role is provisioning. | `envoi_web` is created in S1 and `envoi_maintenance` in S5, each under a named authorization, with grants kept in migrations. | S1, S5 |

## Access checks to start now

These need your accounts or your hands.
None of them is a slice, and approving this plan authorizes none of them.
Each failure could reopen scope, so they belong in the first week even when the slice that needs them comes later.

| Check | Needed by | Passing looks like | If it fails |
| --- | --- | --- | --- |
| Toolchain on this Mac | S1 | You install Node 24 LTS and a local PostgreSQL server; exact commands are supplied at S1 start. | S1 cannot start. |
| Neon credentials on this Mac | S1 | You place the connection strings in the ignored `.env.local` and read remaining storage, compute and transfer from the Neon console. | S1 cannot reach the database. |
| Render Free | S1 | You create a free web service connected to the private repository through your own GitHub grant, with no payment method required. | Stop deployment and reopen Gate 2 hosting. |
| GitHub Actions billing | S1 for CI, S5 or S15 for the schedule | You read the remaining private minutes and confirm no payment method or a $0 limit. | CI stays minimal and no scheduled workflow exists until the repository is public. |
| PayPal developer sandbox | S2 | You create a sandbox REST app, a distinct seller sandbox account and a buyer sandbox account, and enter their credentials in `.env.local` and Render. | S2 still runs and is the proof or falsifier of distinct-seller capture. Envoi's own account is never the payee. |
| OpenAI API access | S4 | A key with a spend limit you set, plus your authorization for the S4 model evaluation spend. | Text entry keeps manual selection and no AI-suggestion claim is made. |
| Zapier | S12, decided before S11 | A plan that can publish a Zap using Webhooks and AI by Zapier image analysis, lasting through judging. | **[unknown] and likely the binding constraint.** `research.md` records that publishing AI by Zapier needs paid access and that the sponsor trial lasts 14 days, while judging ends 16 Dec. Before S11, choose: time a trial, pay, or reopen Gate 1 menu-import scope. |
| MCP client | S13 | One named client that speaks Streamable HTTP and accepts a custom bearer token. | Gate 2 transport amendment (R10). |
| APIMatic | S14 | A tier that generates a client from an OpenAPI file, with acceptable terms. | Drop S14; raw documentation is not a generated-client claim. |
| Consented SGQR sticker photos | S9 | Authentic stickers photographed with each shop's permission. | Decode results are reported as fixture-only. |
| Usability testers | S15 | Five first-time buyers who have not seen Envoi, booked for 2-8 Nov. | Report the smaller sample as it is; the target is never reshaped afterwards. |

## Slices

### S1 Tracer bullet on Render Free

Branch: `envoi/slice-1-tracer`.

**Visible result.**
On a phone in Singapore, open the Render URL.
The buy page lists one shop labeled "Demo fixture", read from Neon.
Opening it shows its menu, "Review" stores a review of a fixed fixture basket, and "Continue" shows a receipt stating that no payment was attempted.
After a Render redeploy the same browser still sees that receipt, and a different browser gets "not found".

**Builds.**
Pinned packages and scripts; `tsconfig.json`, `next.config.ts`, `drizzle.config.ts` with its schema filter set to `public`; `src/env.ts`; `src/lib/{errors,ids,time,log}.ts` and `src/lib/http/respond.ts`; `src/lib/db/{schema,web,migrate}.ts` with only the Better Auth, outlet, menu and purchase tables this slice uses; `src/lib/auth.ts` with the anonymous plugin, `disableDeleteAnonymousUser: true` and the Drizzle adapter pinned to `public`; `requireBuyerSession`; `GET /outlets`, `GET /outlets/{id}/menu`, `GET /purchases/{id}` and public `GET /health`; pages `/buy`, `/review/[purchaseId]` and `/receipt/[purchaseId]`; operator `seed-demo-fixture`; `render.yaml`, `.env.example`, `.node-version` and `.github/workflows/ci.yml`.
`POST /purchases` is a tracer that accepts no client lines and stores the fixture basket server-side; S2 replaces it with real pricing.

**Tests.**
Gate 3: `auth configuration matches the approved gate`, `no secret reaches the committed tree`, `region latency is measured, not assumed`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `pinned versions boot together` | The exact pins install, typecheck, build, start and serve one anonymous request. | None. This is the R1 falsifier, not a guard. |
| `auth tables resolve to public only` | In a test database that also holds a decoy `neon_auth.user` table with `search_path` set to `neon_auth, public`, Better Auth reads and writes only `public`. | Remove the explicit schema pin; the test fails. |
| `buyer session survives a redeploy` | On Render, the receipt stays readable to the same browser after a redeploy. | Generate `BETTER_AUTH_SECRET` per boot; the test fails. |
| `receipt is private to its session` | Another anonymous session gets 404 for the purchase. | Drop the owner predicate; the test fails. |

**Evidence.**
The resolved package set, with any downgrade also recorded in `03-program-design.md` as Gate 3 requires.
The Neon Postgres major version and the matching CI image.
Minutes per CI run.
A read-only listing of `neon_auth` before and after migration, which must still show exactly the nine tables recorded on 2026-10-07.
At least three cold first visits from Singapore on an idle Render service and an idle Neon compute, each reported as total time to an interactive buy page and split into Render wake, Neon wake and request time, plus one warm request time, with the client location stated.
Screenshots at 390px and 1280px.

**Falsifiers and response.**
- Pins incompatible: downgrade to the newest mutually supported set and record it; never patch around the auth library.
- Better Auth cannot be pinned to `public`: stop; no session may resolve into `neon_auth`.
- Render Free cannot build or serve the app: stop deployment and reopen Gate 2 hosting.
- **[hypothesis] pre-registered R12 threshold:** if the database share of any cold first visit (Neon wake plus query round trips) exceeds 18 seconds, which is 10% of the three-minute budget, relocation is put to you as a provisioning decision rather than absorbed.

**Authorizations to request at start.**
Install the pinned packages, which changes `package.json` and `package-lock.json`; create the `envoi_web` role and run migrations on Neon `production`; create `.github/workflows/ci.yml`; push the slice branch; deploy it to Render Free.
You perform: the toolchain install, `.env.local`, the Render service and its GitHub grant, and entering secret values in Render.

### S2 PayPal sandbox happy path

Branch: `envoi/slice-2-paypal-happy-path`.

**Visible result.**
A buyer picks items and quantities from the demo shop.
The review shows the server-priced basket, the distinct sandbox seller and "PayPal sandbox, test money".
"Continue to PayPal" opens sandbox approval; after approving as the sandbox buyer and returning, the receipt shows Paid with the actual sandbox capture id.
Canceling at PayPal returns to an unpaid receipt with no success message.

**Builds.**
`priceBasket`, `computeCheckoutKey` and `createReview`, replacing the tracer route; the purchase and attempt transition tables; `payment_destinations` and `payment_attempts`; `assertPaymentEligible`; `src/integrations/paypal/{client,orders,map}.ts` with the sandbox-only host allowlist; `decideCaptureOutcome`; the attempt lease; `POST /purchases/{id}/paypal/start`, `paypal/complete` and `cancel`; read-only `/paypal/return` and `/paypal/cancel`; operator `assign-paypal-destination`.
Recipient and amount binding and lease-serialized capture are part of this slice, as the Gate 3 handoff requires; lost-response recovery is S3.

**Tests.**
Gate 3: `prices come only from the confirmed revision`, `unknown price never becomes zero`, `same basket twice returns the same review`, `a changed menu revision is a new checkout`, `replacement only from a terminal unpaid state`, `capture requires an owned lease`, `amount mismatch quarantines`, `payee mismatch quarantines`, `GET return page cannot capture`, `expired review cannot start a payment`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `double start returns the same attempt` | Two concurrent starts return one attempt and one approval link. | Two guards, two mutations: remove the row lock, then separately drop the partial unique index. Each must fail a check on its own. |
| `live PayPal host is refused at boot` | Configuration naming a live PayPal host fails boot. | Add the live host to the allowlist; the test fails. |

End to end in the sandbox: approve and capture; cancel at PayPal.

**Evidence.**
The order id and capture id; a provider read showing the assigned seller as payee and the exact SGD gross; the database rows; labeled screenshots.
Whether the APIMatic PayPal Context Plugin was used during integration, stated either way, because it is development tooling and not a runtime claim.

**Falsifier and response.**
If the distinct seller cannot receive an exact capture under the available sandbox permissions, stop payment work and reopen Gate 2.
The payment is never routed to Envoi's own account to make the demo finish.

**Authorizations to request at start.**
Migrations on Neon, push and deploy.
You perform: the sandbox app and accounts, and their credentials in `.env.local` and Render.

### S3 PayPal recovery

Branch: `envoi/slice-3-paypal-recovery`.

**Visible result.**
With the provider faked to lose responses in a labeled test harness, the receipt shows "Checking payment" and never Paid or Canceled until a provider read decides.
"Check status" converges on the same capture id.
A real sandbox webhook reaches the deployed app, is verified and triggers a provider read.
Canceling after capture dispatch shows "Checking payment", not "Canceled".

**Builds.**
`decideCreateRecovery`; `create_unknown` and `capture_unknown` handling with same-key replay by the lease holder; `POST /purchases/{id}/reconcile` with `T_PROVIDER_READ_DEBOUNCE`; `src/integrations/paypal/verify.ts`; the webhook route and `provider_events` inbox; receipt polling at most every 2 seconds for at most 60 seconds while non-terminal; operator-visible audit rows for quarantine.

**Tests.**
Gate 3: `lost create response replays the same key`, `create_unknown without an order id is recreatable`, `capture_unknown never becomes abandoned`, `duplicate webhook changes nothing`, `unverified webhook signature is rejected`, `webhook content alone cannot mark paid`, `cancel after dispatch reports uncertain`, `polling stops at a terminal state`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `lost capture response replays the same capture key` | Recovery reuses the persisted capture request id. | Generate a new key on replay; the test fails. |
| `no callback downgrades paid` | A later event or read reporting a non-complete status leaves `paid` unchanged. | Allow `paid` to `uncertain`; the test fails. |
| `unknown-order webhook is quarantined` | A verified event for an order Envoi never created changes no purchase and leaves an operator-visible record. | Treat an unknown order id as known; the test fails. |

**Evidence.**
The labeled fault-injection transcript and one real sandbox webhook delivery with its verification result.

**Falsifier and response.**
If recovery cannot converge, the purchase stays `uncertain` with an operator alert.
Never a new capture key, a replacement payment or a rail switch.

**Authorizations to request at start.**
Migrations, push and deploy.
You perform: registering the webhook in the sandbox app, which yields `PAYPAL_WEBHOOK_ID`.

### S4 Text entry with AI suggestions

Branch: `envoi/slice-4-text-entry`.

**Visible result.**
A buyer types "kaya toast and kopi" and is asked for an area.
Adding "near Tanjong Pagar" returns the registered demo shop and items, and the buyer continues into the S2 review.
When the model fails or exceeds its budget, manual selection appears.

**Builds.**
`suggestFromText`; `src/integrations/ai/openai.ts` with structured output, the three read-only tools and `T_AI_BUDGET`; `POST /buyer/suggestions`; the text input on `/buy`; a filter that drops any id not in the published registry.

**Tests.**
Gate 3: `model cannot invent a price`, `model tool budget is enforced`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `missing area asks for clarification` | A "near me" request without an area or usable location returns a clarification and no nearest claim. | Default to a fixed area; the test fails. |

**Model evaluation (R5).**
Before the first model call, the fixture request set, the expected outcome for each request and the pass threshold are written into `00-status.md`.
Then every candidate is run and every result is reported, and the chosen model is recorded as the `AI_MODEL` value.

**Falsifier and response.**
If no candidate meets the pre-registered threshold, manual selection stays, no AI-suggestion claim is made, and a provider change goes through Gate 2.

**Authorizations to request at start.**
Install `ai` and `@ai-sdk/openai`; spend on the evaluation within your limit; push and deploy.
You perform: the OpenAI key in `.env.local` and Render.

### S5 Maintenance runner, manual runs

Branch: `envoi/slice-5-maintenance`.

**Visible result.**
The operator health view, reachable only by an operator account, shows the last heartbeat, capacity figures and overdue work.
One run of the compiled runner reconciles an uncertain attempt left by the S3 harness with no buyer page open, closes expired reviews, purges expired sessions and exits.

**Builds.**
`src/maintenance/run.ts`; `src/domain/maintenance/{due,tasks}.ts` with `heartbeat`, `record_capacity`, `reconcile_attempts` through `PayPalReadClient` only, `close_expired_reviews` and `purge_expired_sessions`; `tsconfig.runner.json` and `runner:build`; `maintenance_runs` and lease claims; `src/lib/db/runner.ts`; `GET /health/operator`; operator `grant-operator`.
`expire_imports` and `sweep_sources` join `MAINTENANCE_TASKS` in S11, when their tables exist, so that edit shows in the S11 diff.

**Tests.**
Gate 3: `maintenance cannot capture`, `maintenance run is finite`, `overlapping runs claim disjoint work`.

**Evidence.**
Two manual runs labeled manual, their heartbeat values, capacity readings with the `pg_database_size` limitation stated, and the build-graph check output.

**Scheduled workflow.**
`.github/workflows/maintenance.yml` is created in S5 only if the cadence decision is recorded, remaining private minutes are confirmed or the repository is public, and you authorize creating it.
Otherwise it is created in S15.

**Falsifier and response.**
If the build-graph check cannot prove the runner unable to reach the capture module, stop and fix the module boundary (R9) before continuing.

**Authorizations to request at start.**
Create the `envoi_maintenance` role; migrations, push and deploy.

### S6 Merchant sign-in and manual menu draft

Branch: `envoi/slice-6-merchant-draft`.

**Visible result.**
You create a demo merchant account and membership with the operator CLI, typing the password yourself.
The merchant signs in at `/merchant/setup`, creates an unpublished outlet and types menu items.
A blank price stays blank and blocks confirmation until the merchant supplies it, and then the exact complete revision is confirmed.
A buyer cannot see the draft or reach any merchant route.
Signing in on a browser that already holds a buyer receipt keeps that receipt readable and grants nothing extra.

**Builds.**
Email and password sign-in for allowlisted accounts with public signup disabled; `onLinkAccount` creating no membership; `merchant_memberships` and `enrollments`; `requireOutletMembership`; `POST /merchant/outlets` and `PATCH /merchant/outlets/{id}`; `PUT menu-draft` with a revision conflict check; `POST confirm`; `assessMenuCompleteness`; operator `create-merchant` and `approve-membership`.
Local end-to-end runs create throwaway merchant accounts with a password generated in memory per run and never written down.

**Tests.**
Gate 3: `anonymous buyer cannot reach a merchant route`, `linking an anonymous account creates no membership`, `linking preserves purchase ownership`, `membership is per outlet`, `incomplete menu blocks confirmation`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `stale draft write is rejected` | A draft write based on an older revision returns `revision_conflict` and changes nothing. | Drop the revision check; the test fails. |

**Authorizations to request at start.**
Migrations, push and deploy.
You perform: creating the deployed demo merchant account.

### S7 Merchant destination and publication

Branch: `envoi/slice-7-publication`.

**Visible result.**
The merchant selects the operator-prepared sandbox PayPal connection and publishes.
Buyers now see that shop and buy from it end to end through the S2 path.
The merchant then edits a price: buyers keep seeing the last confirmed menu until republication, and a buyer holding an old review is told the price changed and must review again.

**Builds.**
`PUT /merchant/outlets/{id}/destinations/paypal` limited to the assigned connection; `POST publish` as one transaction rechecking all four preconditions and switching the published pointer atomically; published-revision and destination checks inside `assertPaymentEligible`; operator `approve-enrollment`.

**Tests.**
Gate 3: `publication requires all four preconditions` (four separate mutations), `editing a published menu creates an unpublished revision`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `republication invalidates an open review at execution` | A review pinned to a replaced revision fails at `paypal/start` with `review_invalidated`. | Skip the published-pointer re-read; the test fails. |
| `destination change invalidates an open review` | A review pinned to a changed destination fails the same way. | Skip the destination version check; the test fails. |
| `arbitrary merchant id cannot connect` | A merchant id supplied in the request body is refused. | Accept the body value; the test fails. |

**Authorizations to request at start.**
Migrations, push and deploy.

### S8 Merchant orders and acknowledgment

Branch: `envoi/slice-8-orders`.

**Visible result.**
The merchant orders page lists only that outlet's orders with honest payment states, and pending never appears as paid.
The merchant acknowledges a paid order, and the buyer receipt shows Paid and, separately, Acknowledged.
Acknowledging an unpaid order is refused.

**Builds.**
`GET /merchant/outlets/{id}/orders`, `POST /merchant/orders/{id}/acknowledge`, merchant polling within the S3 bounds, and acknowledgment on the receipt.

**Tests.**

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `acknowledgment requires a verified payment` | Acknowledging a `pending_payment` or `uncertain` order is refused. | Allow it on `pending_payment`; the test fails. |
| `acknowledgment never changes payment state` | Acknowledging writes only the acknowledgment field. | Let acknowledgment write the purchase state; the test fails. |

**Authorizations to request at start.**
Migrations, push and deploy.

### S9 Merchant SGQR decode and mapping

Branch: `envoi/slice-9-sgqr-merchant`.

**Visible result.**
The merchant selects a sticker photo, and it decodes in the browser.
The page shows recognized identifiers, lists unrecognized tags rather than guessing them, shows checksum validity and lets the merchant correct the details or enter them manually.
The merchant records what distinguishes this outlet, and the operator approves the mapping.
An unreadable image offers manual entry.

**Builds.**
`barcode-detector` in the browser; `decodeEmvcoTlv` and validation; `outlet_identifiers`; payload redaction in the logger; identifier submission through the existing outlet edit route; operator `approve-identifier`.

**Tests.**
Gate 3: `unrecognized tags are surfaced not guessed`, `raw QR payload is not logged`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `personal proxy is not published as a business identifier` | A personal PayNow proxy is refused as a published identifier. | Allow a proxy mapping; the test fails. |

**Evidence.**
An authentic-sample report with every result logged, or the result labeled fixture-only.
The roadmap's 8 of 10 clean-sample figure is a planning target, not a claim.

**Authorizations to request at start.**
Install `barcode-detector`; migrations, push and deploy.
You obtain: the consented sticker photos.

### S10 Buyer scan or paste

Branch: `envoi/slice-10-scan`.

**Visible result.**
A buyer taps Scan, points at an enrolled sticker and lands on that outlet's menu with no location asked.
An unenrolled sticker shows "This shop is not on Envoi" with text search, and no purchase is possible.
A shared identifier asks "Which outlet?" with the recorded distinguishers.
With the camera denied, the buyer gets a paste field and then text search.

**Builds.**
`POST /outlets/resolve-sgqr`, `resolveSgqr` and the scan screen with paste and text fallbacks.

**Tests.**
Gate 3: `unenrolled sticker yields no purchase`, `shared identifier asks which outlet`, `scan grants no destination and no rail`.
End to end: camera permission denied falls back to paste, then text.

**Authorizations to request at start.**
Push and deploy.

### S11 Menu image intake and capability boundary

Branch: `envoi/slice-11-image-boundary`.

**Visible result.**
The merchant reads the sharing disclosure, covering Envoi, Zapier, the model provider, database history and upstream copies, then consents and uploads a consented test image.
A labeled stand-in provider, `curl` from outside the app, fetches the bytes through the capability URL.
After cancel, and separately after `T_IMAGE_ACCESS`, the same URL returns 410.
The operator view shows live sources, admitted bytes in the rolling window and heartbeat age, and admission refuses over a cap or with a stale heartbeat.

**Builds.**
`sharp` normalization and metadata stripping; `admitMenuImage`; `menu_imports` and `menu_import_sources`; `GET /imports/{id}/image`; `closeImport`; import status and cancel routes; the capability rate limit; `expire_imports` and `sweep_sources` added to `MAINTENANCE_TASKS`; consent versioning.

**Tests.**
Gate 3: `expiry denies a fetch with no write`, `closed import denies a fetch`, `guessed token is denied`, `blocked delete is reported not thrown`, `admission refuses churn`, `stale heartbeat blocks imports`, `capability URL is not logged`.

**Evidence.**
Fetch followed by denial on Render for cancel and for expiry, including after the app slept and restarted; source-row removal observed after a maintenance run; the `sharp` build on Render Free (R6).

**Exit decision.**
Real merchant images stay blocked until these probes pass and you either approve an R2 operator runbook rehearsed on a separate throwaway Neon project or branch, or explicitly accept residual risk R2.
The decision is recorded in `00-status.md`.

**Falsifiers and response.**
- `sharp` fails on Render Free: switch to a pure-JS decoder with a lower cap and disclose the weaker metadata-stripping claim (R6).
- A closed or expired capability is still fetchable: stop imports until fixed.

**Authorizations to request at start.**
Install `sharp`; migrations, push and deploy.

### S12 Zapier AI menu draft

Branch: `envoi/slice-12-zapier-draft`.

**Visible result.**
The merchant uploads a consented test menu image, and within the access window a draft appears beside the local preview, with readable SGD prices filled and unreadable ones blank.
The merchant corrects names, supplies availability, confirms and publishes through S7.
A second or late result changes nothing, and the image URL is denied after completion.

**Builds.**
`src/integrations/zapier/dispatch.ts` persisting dispatch identity before sending; the result capability; `POST /integrations/zapier/menu-results`; `validateZapierResult`; `mergeImportSuggestions`.
The Zap itself is configured in your Zapier account from step-by-step instructions supplied at slice start.

**Tests.**
Gate 3: `malformed result is an error not a repair`, `late result is rejected`, `base revision change is rejected`, `merchant edits survive a merge`, `confirmed menu is never overwritten`, `blank price stays blank`.

**Evidence.**
Zap run history references, the validated rows, denial after completion, and probes for an inaccessible image, malformed output and a timeout.

**Falsifier and response.**
If the Zap cannot fetch the capability URL or cannot return bounded structured output, Gate 1 menu-import scope reopens.
Manual entry keeps onboarding usable but is never reported as a Zapier integration.

**Authorizations to request at start.**
Push and deploy.
You perform: building and publishing the Zap, and entering `ZAPIER_MENU_HOOK_URL` in `.env.local` and Render.

### S13 Agent handoff over MCP

Branch: `envoi/slice-13-mcp-handoff`.

**Visible result.**
In a named MCP client holding a scoped demo token, `search_outlets`, `get_menu` and `create_purchase_request` return a link.
On a phone, the buyer opens it and redeems it once into a fresh server-priced review, then pays through S2.
The agent cannot read the receipt, a second redemption says already used, and after `T_HANDOFF` the link is expired.

**Builds.**
`src/app/mcp/route.ts` accepting `POST` only; the agent principal; `purchase_requests`, `createPurchaseRequest` and `redeemPurchaseRequest`; `POST /purchase-requests` and `/purchase-requests/redeem`; `/approve/[handoffToken]` with no referrer and no analytics; operator `issue-agent-token`.

**Tests.**
Gate 3: `agent token cannot read a receipt`, `handoff redeems once`, `handoff carries no amount`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `MCP refuses GET and DELETE` | Both return method-not-allowed. | Allow `GET`; the test fails. |
| `foreign Origin is rejected` | A request with a foreign `Origin` header is refused. | Skip the Origin check; the test fails. |

**Falsifier and response.**
If the named client cannot use the route (R10), a Gate 2 transport amendment comes before any workaround.

**Authorizations to request at start.**
Install `@modelcontextprotocol/sdk`; migrations, push and deploy.

### S14 APIMatic client and docs (account-conditional)

Branch: `envoi/slice-14-apimatic`.

Starts only if the APIMatic access check passed.

**Visible result.**
A TypeScript client generated from `openapi/envoi-public.yaml` lists outlets and reads a menu from the running app, and a contract check compares live responses with the document.

**Tests.**

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `public API matches its OpenAPI document` | Live responses from the public read routes validate against the document. | Rename a response field in a route; the check fails. |

**Authorizations to request at start.**
Push; any APIMatic upload of the OpenAPI document, since it sends repository content to a third party.

### S15 Judged release

Branch: `envoi/slice-15-release`.

**Visible result.**
A public repository with an open-source license; a README with setup, reset and the fixture and sandbox labels; scheduled maintenance running on public runners; the usability result; a public video under three minutes; an evidence pack linking every claim to its record.

**Work.**
- Scan the full Git history for secrets with an injected self-test before visibility changes, and review non-secret identifiers in the documents, such as the Neon project and organization ids, before they become public.
- Create `maintenance.yml` at hourly minute 17, if S5 did not.
- Re-measure an idle cold first visit on the release build.
- Run the full suite and the mobile and keyboard checks.
- Run the Gate 1 usability test with five first-time buyers, recording each tester's entry point and keeping every failure and help request.
- Confirm Render, Neon, Actions, OpenAI and Zapier access and capacity through 16 Dec 2026.

**Authorizations to request at start.**
The license choice, the repository visibility change, workflow creation, and the final merge, push and deploy.
You perform: the YouTube upload and the Devpost submission.

## Test assignment

Every one of the 54 named tests in Gate 3 is assigned to exactly one slice, and 20 additions cover contracts Gate 3 wrote without naming a test.

| Slice | Gate 3 tests | Additions |
| --- | --- | --- |
| S1 | 3: auth configuration, committed-tree secrets, region latency | 4 |
| S2 | 10: five pricing and checkout identity tests; owned lease; amount and payee mismatch; `GET` return page; expired review | 2 |
| S3 | 8: create replay; recreatable create; `capture_unknown`; three webhook tests; cancel after dispatch; polling stops | 3 |
| S4 | 2: invented price; tool budget | 1 |
| S5 | 3: maintenance cannot capture; finite run; disjoint claims | 0 |
| S6 | 5: merchant route; link membership; link ownership; per-outlet membership; incomplete menu | 1 |
| S7 | 2: four publication preconditions; unpublished revision on edit | 3 |
| S8 | 0 | 2 |
| S9 | 2: unrecognized tags; QR payload logging | 1 |
| S10 | 3: unenrolled sticker; shared identifier; no destination or rail | 0 |
| S11 | 7: expiry without write; closed import; guessed token; blocked delete; churn; stale heartbeat; capability URL logging | 0 |
| S12 | 6: malformed; late; base revision; merchant edits; confirmed menu; blank price | 0 |
| S13 | 3: agent receipt read; single redemption; no amount | 2 |
| S14 | 0 | 1 |
| **Total** | **54** | **20** |

## Schedule and cut order

- **Checkpoint, 25 Oct.** If S1-S8 are not all done, apply the cut order before starting S9.
- **Cut order.** S10 first, because the roadmap allows scan to be cut before text. S10 is an approved Gate 1 entry point, so cutting it reopens Gate 1 first. S14 second: the user moved it down on 2026-10-10 because APIMatic is the stronger sponsor-prize candidate. Gate 1 already makes S14 conditional on account access, so dropping it for missing access needs no reopening, while dropping it for schedule is recorded as your decision.
- **Never cut:** payment evidence, approval checks, recipient verification, menu confirmation, image cleanup and uncertainty handling. In slice terms, S2, S3, S7, the S11 boundary and the S15 evidence.
- **Zapier is removed** by user decision on 2026-10-10. The menu-import replacement is decided in the reopened gates, not by cutting slices.

## Not in this plan

- **PYUSD**, roadmap candidates 8 and 11. Approved Gate 2 requires an amendment pinning mint, wallet, conversion and recovery before dependent wallet contracts or slices, and Gate 3 has no wallet contracts. No slice here depends on it. Adding it later takes a Gate 2 amendment, Gate 3 wallet contracts and a Gate 4 amendment. Until then the Gate 1 metric's test environment is PayPal sandbox for every tester, which Gate 1 already allows.
- **Merchant offers and negotiation**, roadmap candidate 14. Optional in Gate 1 and first to go.
- Voice, AG Grid and catalogue breadth.
- Production continuation P1-P4, which needs reopened gates of its own.

## Least confident decisions

1. **Buyer journey before merchant screens.** S2-S4 use an operator-seeded, labeled fixture shop, so the full buyer journey and a usability pilot exist early. The cost is that merchant onboarding, including the Zapier sponsor work, lands in the back half. The alternative is to build S6-S8 before S4.
2. **Zapier access is probably the binding constraint.** Publishing needs paid access, the sponsor trial is 14 days and judging ends 16 Dec. A decision is needed before S11, and it may reopen Gate 1.
3. **S1 carries four proofs**: package compatibility, the auth schema pin, Render hosting and the R12 latency measurement. Splitting hosting into its own slice would make S1 smaller, but the tracer's value is that it runs on the real host.
4. **An operator CLI instead of operator pages (D1).** It adds no web attack surface, but every operator act needs the human operator at a terminal with migration credentials.
5. **Local PostgreSQL for tests (D3).** It needs an install on this Mac. A Neon test branch avoids the install but spends shared quota and history and adds trans-Pacific latency to every test query.
6. **The 18-second R12 threshold** is a proposal, set in advance so the measurement cannot be explained away afterwards.
7. **Fifteen slices in about four weeks.** The 25 Oct checkpoint and the cut order exist because this is tight.
8. **Repository goes public in S15.** Going public earlier would make Actions minutes free and allow hourly maintenance sooner, and the rules require it for submission anyway, but it would expose unfinished work for longer.
9. **PYUSD is outside this plan.** Gate 1 approved "PayPal first, then proven PYUSD", and no proof or architecture amendment exists, so planning wallet slices now would plan against contracts that do not exist.

## What approval covers

Approving Gate 4 accepts this slice order, the test assignment and deltas D1-D7 as refinements.
It does not start any slice.
It does not authorize installing packages, provisioning accounts or roles, creating workflows, committing, pushing, merging, deploying, changing repository visibility, importing real merchant images or spending money.
Each slice starts on your "start Slice N", and its external actions are requested by name at that point.
