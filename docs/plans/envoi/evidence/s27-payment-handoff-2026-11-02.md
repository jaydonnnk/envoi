# S27 payment verification session transfer

Written 2026-11-02, Asia/Singapore. Local handoff from main `25a3b1252e150725eabcc9acdcb0a91ac7575ec0`; not a new payment run or published commit.

## Completed

MCP/currency code is on main and live; migration 0027 is applied with identical recorded before/after and post-maintenance counts/sums. Final CI and maintenance passed. Hosted merchant country/SGD labels and fixture SGQR paste/resolve were verified. No fresh SGD, USD or PYUSD checkout ran.

## Decisions and traps

The new authorization carries to the next agent; human approvals/signatures/sign-ins remain human. Old gate/MCP/APIMatic/migration-start instructions are obsolete. REST uses an ok/data envelope and menu-level currency; MCP adds item currency. The SGQR mapping uses approved_at, not a status column, and mapping authority does not come from sticker branding. Historical migration totals are not frozen after new legitimate purchases. Rollback refuses at the first US shop or USD row. The saved migration URL is pooled; the existing authorized runner used its matching direct hostname with verified TLS.

## Working agreement

Concise, evidence-backed reporting; no repeat permission request for the same authorized checks. This session only records authorization and writes the handoff.

## Files changed

- `docs/plans/envoi/00-status.md:459, 483-489`: new test authorization and current boundary.
- `docs/plans/envoi/evidence-pack.md:49`: authorized-but-unrun evidence row.
- `docs/plans/envoi/s27-deploy-plan.md:4`: steps 8-9 authorized but unrun; completed release not repeated.
- `docs/plans/envoi/evidence/s27-mcp-session-transfer-2026-11-02.md:3-4`: superseding handoff pointer.
- `PROGRESS.md:3`: latest authorization and handoff-only scope, still untracked.

## Open work

The human-approved SGD sandbox regression is unrun and blocks US fixture/USD testing. PYUSD regression depends on verified enablement/devnet prerequisites. US seller/merchant identity and USD acceptance are unknown. Final cleanup/acceptance depends on payment evidence; S28-S31 are unstarted.

## Prompt for New Chat

````text
Background context for S27 payment verification in /Users/jayd0/Desktop/envoi, macOS arm64. Written 2026-11-02, Asia/Singapore, from main 25a3b1252e150725eabcc9acdcb0a91ac7575ec0 and the actual checkout. The receiving agent must re-verify Git and files before action, and stop and ask if a material conflict appears. Gate documents govern conflicts. The user's new payment-test authorization is in section 6; the technical release is complete and must not be repeated.

1. Project in brief

Envoi is a PayPal AI hackathon app for an in-person visitor buying from an enrolled merchant. Buyers find a published menu or receive an agent's one-time review link; Envoi prices the basket and the human approves payment directly to the shop's sandbox account. Singapore shops may also offer PYUSD on Solana devnet.
Buyer: "I am visiting Singapore. I want to buy something from this shop, but I do not have a payment method it accepts. I need to know whether I can pay, what I am approving, and whether the payment actually reached the shop."
Merchant: "I want visitors to find my shop and pay using a method I have chosen to accept, without sending the money through another company's account."
The 4 of 5 first-time buyer success target remains proposed and is never measured. Hard rules: test money only; FIXTURE labels; Envoi is never the payee; AI never sets a price; humans approve every exact payment; an Envoi assistant cannot pay, approve or read a receipt; uncertain is never paid. Authorized operator receipt/Neon evidence reads do not grant that capability to the assistant.
[verified 2026-11-02] Gate 1 re-approved 2026-10-29 and unchanged for MCP on 2026-11-02. Gates 2, 3 and 4 re-approved 2026-11-02: "yes i authroize gate 2", "Approved", "Approved.". No gate approval or MCP implementation is pending.

2. Where this slice sits

Order: S25 Ask Envoi in the site; S26 The connected run; S27 US shops and currency-explicit money; S28 PayPal PYUSD rewards card; S29 The menu explained and translated; S30 Draft review aids; S31 PayPal approval over the review page.
[verified] S25/S26 have completion evidence. S27 is in progress. S28-S31 are unstarted. S25/S26, earlier payment/approval/recipient guards and human approval are never cut. Cut order: S31, S30, S29, then S27 and S28 together. S27 permits US shops in USD and keeps currency beside every amount. Its release is complete; payment regressions and US setup/testing are remaining evidence, not a new feature.

3. This slice's contract, copied from current main

These are approved contracts with historical proposal/start-authority wording. Sections 5 and 6 carry the completed state and later authorization; the historical clauses do not require repeating the release.

Source: docs/plans/envoi/04-slices.md#s27-us-shops-and-currency-explicit-money

#### S27 US shops and currency-explicit money

Branch: `envoi/slice-27-us-shops`. Depends on: S26 (so the connected run is on record before the money rename), S2, S7, S16 and S19.

**Visible result.**
1. A merchant chooses the United States, as in [`mockups/merchant-country.html`](mockups/merchant-country.html), prices in US dollars, connects a US PayPal sandbox seller and publishes; trying to change the country afterwards says it is locked.
2. A buyer's review matches [`mockups/review-us-shop.html`](mockups/review-us-shop.html) apart from the in-page button, which is S31's: US dollars, PYUSD unavailable with its reason; PayPal sandbox approval completes in USD and the receipt reads Paid.
3. Every Singapore journey of the earlier slices still works on Render: an SGD PayPal purchase, a PYUSD devnet purchase if PYUSD is switched on for the check, and a scan.

**Builds.** The S27 rows of the [Gate 3 reopening](03-program-design.md#reopening-2026-10-29-second-build-plan)'s file map, including migration `0027_currency_and_country.sql`, and the S27 rows of the [Gate 3 MCP client reopening](03-program-design.md#reopening-2026-11-02-mcp-client): output schemas on `/mcp`, the assistant and the terminal agent on the MCP SDK client, and the generated client, its tests and `typecheck:client` removed. *Changed 2026-11-02:* the regenerated client is no longer built.

**Tests.** Named tests 10-19 of the Gate 3 reopening, with test 17 replaced on 2026-11-02 by `the assistant's MCP client reads a USD menu and rejects a price without its currency`, and test 36 `every MCP tool answer matches its output schema`; S25 test 6 and S20 test 13 renamed to the MCP client and S19 test 3 retired, as the [MCP client reopening](03-program-design.md#reopening-2026-11-02-mcp-client) says; every existing payment, PYUSD, pricing and public API test passes on the renamed code, including the 5 that failed on 2026-11-02 for the missing `unitMinor`.

**Evidence.** The three visible results; the migration run on Neon with row counts and a sum of every amount column before and after, equal; each new or changed MCP guard failing under its own mutation; typecheck, lint, `next build` and CI green. *Changed 2026-11-02:* no APIMatic regeneration record.

**Falsifiers.** Not merged and deployed by 8 Nov: revert to `main` before S27, cut S27 and S28 together, and say Envoi is Singapore-only. Any SGD purchase misbehaves after the migration: roll the deploy back first, then fix.

**Authorizations to request at start.** Starting S27; migration 0027 on Neon; the merge, push and deploy. *Changed 2026-11-02:* the APIMatic upload is withdrawn; the one v1-endpoint upload of 2026-10-30 ("Lets use v1 endpoint first while waiting for support") stays on record as used and not chosen.
You perform: creating a US PayPal sandbox business account for the US fixture shop.

Source: docs/plans/envoi/04-slices.md#second-build-plan-s25-to-s31-added-2026-10-29

**Plan-wide rules.**
- Every guard named in a slice's tests gets its own mutation, recorded in `00-status.md` with the slice.
- Every model, PayPal and Kernel call in a test is faked at its boundary and labeled as a fixture; real calls happen only in evaluations and recorded runs you authorize.
- Every screen keeps the test-environment badge and wording; nothing is shown as real money, a real merchant or a measured return.
- A slice is done when it is merged to `main` and deployed with your authorization, its evidence is in `00-status.md`, and the post-slice cleanup review has run.

Source: docs/plans/envoi/04-slices.md#rules-for-every-slice

## Rules for every slice

1. A slice starts only when you authorize it by its slice ID, for example "start S13" or "start Slice 13".
   A number in that request is always the slice ID, never a position in the build order, so "start Slice 5" means S5, not the fifth slice built.
   A request that names no ID, such as "start the next slice", names a retired ID such as S12, or names a slice whose "Depends on" slices are not all done, starts nothing: I reply with the next slice in build order and its ID and ask you to confirm by ID.
   That authorization covers creating `envoi/slice-<ID number>-<slug>` from the current `main` tip and confirming it with `git branch --show-current`.
   It does not cover pushing, merging, deploying, installing or any external action in the slice's **Authorizations** list; each of those is requested by name when the slice starts.
2. Build vertically.
   A slice adds only the tables, routes, modules and screens its visible result needs, and its migrations are additive.
3. Every Gate 3 test assigned to the slice and every named addition must exist and pass.
   Each guard gets its own mutation: apply it, record the failing output, restore it and record the passing rerun.
   In a group, each row is one guard with its own mutation; if one mutation fails two rows, narrow the fixture or move one row out as a standalone test and record it, as the Gate 3 batching rules require.
   A pair caught together is not two proofs.
4. Integration tests run against a disposable local PostgreSQL with the real schema and constraints, never against Neon `production`.
   Provider HTTP is faked at the `PayPalWriteClient` boundary, OpenAI at the provider's fetch boundary and Solana RPC at the bounded transport.
   Every fake is labeled as a fixture in test output and evidence, and a landed devnet transaction is synthetic unless the slice records it as real devnet evidence.
5. Done means fresh passing typecheck, lint, unit, integration and the slice's end-to-end checks; a clean `git diff --check`; inspected untracked files; no secret in the diff; screens checked in a real browser at 390px and 1280px; fixtures, sandbox money and devnet test tokens labeled in the UI and in every screenshot.
6. After verification, show the real result (URL and screenshots), record evidence in the slice's section of `00-status.md`, tick it and run the `architect-reviewer` post-slice cleanup.
   Then ask `Continue to slice N+1, or re-steer?` with N+1 replaced by the ID of the next slice in build order, for example `Continue to slice S13, or re-steer?` after S4.
   "Continue" authorizes only the slice that question names.
7. Two slices whose dependencies are both met may swap order when an access prerequisite is pending.
   The swap is recorded in `00-status.md` by both slice IDs before the swapped slice starts, and the slice still starts only on an authorization naming its ID.
8. A discovery that changes an approved decision stops the slice and reopens the affected gate before dependent work continues.

S27 rows, money signatures and named tests, copied from docs/plans/envoi/03-program-design.md#reopening-2026-10-29-second-build-plan:

| File | Slice | Change |
| --- | --- | --- |
| `src/lib/money.ts` | S27 | Currency-explicit money below; the SGD-only names go. |
| every file naming `SgdCents`, `sgd_cents` or a `formatSgd` call (about 62, found by `rg`) | S27 | Renamed to the currency-neutral names below, the currency carried beside every amount. PYUSD code keeps SGD by calling `requireSgd`. |
| `drizzle/0027_currency_and_country.sql` | S27 | `outlets.country` (`SG` or `US`, not null, default `SG`, check); every `*_sgd_cents` column renamed to `*_minor`; `purchases.currency` (`SGD` or `USD`, not null, default `SGD`, check); a trigger refusing a change of `outlets.country` once any revision of that outlet has been published. No grant changes. |
| `src/domain/outlets/merchant.ts`, `src/app/api/v1/merchant/outlets/[id]/route.ts` | S27 | The merchant sets `country` before first publication; a later change answers the new code `country_locked` (409). |
| `src/integrations/paypal/orders.ts`, `map.ts`, `verify.ts` | S27 | Orders use the purchase's currency; a captured or webhook currency unlike the purchase's is a verification failure, never paid. |
| `src/domain/pyusd/*` | S27 | Preparation refuses a purchase whose currency is not SGD, with the new unavailable reason `not_sgd_shop`. |
| `src/domain/sgqr/resolve.ts` | S27 | Resolves only outlets with `country = 'SG'`. |
| `openapi/envoi-public.yaml`, `clients/typescript/`, `src/app/mcp/route.ts` | S27 | `unitSgdCents` becomes `unitMinor` with `currency` on the outlet and menu; the client is regenerated by APIMatic and committed unchanged; the MCP tools' outputs change the same way. Superseded 2026-11-02: no regeneration; see [Reopening 2026-11-02](#reopening-2026-11-02-mcp-client). |
| `src/app/merchant/setup/country.tsx` | S27 | The country choice in the mockup's words, before the SGQR step, which is shown for SG only. |

```ts
type Currency = "SGD" | "USD";
type Country = "SG" | "US";
const CURRENCY_BY_COUNTRY: Record<Country, Currency> = { SG: "SGD", US: "USD" };
type Money = { readonly currency: Currency; readonly minor: number };       // integer minor units, no float path
function money(currency: Currency, minor: number): Money;                   // RangeError on a non-safe integer
function multiply(value: Money, quantity: number): Money;
function sum(currency: Currency, values: readonly Money[]): Money;          // CurrencyMismatchError on any other currency
function sameAmount(a: Money, b: Money): boolean;                           // CurrencyMismatchError when currencies differ
function fromDecimalString(currency: Currency, value: string): Money | null;
function toDecimalString(value: Money): string;                             // provider form, "11.25"
function formatMoney(value: Money): string;                                  // "S$4.40", "US$11.25"
function requireSgd(value: Money): Money;                                    // PYUSD entry points only; CurrencyMismatchError otherwise
```

10. `money of two currencies cannot be summed or compared`.
    11. `an outlet's country cannot change after its first publication`: the domain check and the database trigger are each mutated separately.
    12. `a US purchase creates a USD PayPal order`.
    13. `a capture in another currency never marks a purchase paid`: through the return, reconcile, webhook and maintenance paths.
    14. `PYUSD preparation refuses a purchase that is not in SGD`.
    15. `SGQR resolution never returns a US outlet`.
    16. `public menu answers carry the currency and match the OpenAPI document`.
    17. `the regenerated client reads a USD menu`. Retired 2026-11-02 and replaced by `the assistant's MCP client reads a USD menu and rejects a price without its currency`; test 36 added (see [Reopening 2026-11-02](#reopening-2026-11-02-mcp-client)).
    18. `the currency migration keeps every amount and marks existing outlets SG`.
    19. `the MCP tools answer with the currency beside every price`.
    Every existing payment, PYUSD and pricing test re-runs on the renamed code; a renamed test keeps its old name in its description.
  - S28:

Source: docs/plans/envoi/03-program-design.md#reopening-2026-11-02-mcp-client

## Reopening 2026-11-02: MCP client

Drafted 2026-11-02 on `envoi/slice-27-us-shops` for the [MCP client amendment](02-architecture.md#mcp-client-amendment-2026-11-02) of Gate 2; **REOPENED and RE-APPROVED 2026-11-02** ("Approved").
Approval accepts these contracts as a proposal; it establishes no runtime evidence and authorizes no Gate 4 change, code change, install, upload, commit, merge, push or deploy.
It replaces only the contracts below; every other contract of the [second build plan reopening](#reopening-2026-10-29-second-build-plan) stays as approved.

- **Version pins:** nothing is installed. The assistant uses the already pinned `@modelcontextprotocol/sdk` (1.32.1 resolved [verified 2026-11-02]) `Client` and `StreamableHTTPClientTransport`, and the pinned `zod`. The generated client's `zod` range goes with it.
- **Environment names:** none added or removed.
- **Files:**

| File | Slice | Change |
| --- | --- | --- |
| `src/app/mcp/route.ts` | S27 | Each of `search_outlets`, `get_menu` and `create_purchase_request` registers a zod `outputSchema` and returns `structuredContent` beside the existing JSON text. The menu schema refines that every item's `currency` equals the menu's; `unitMinor` is an integer of at least 1 or null. A tool error stays `isError: true` with its message and also carries Envoi's error code. |
| `src/integrations/assistant/envoi-mcp.ts` | S27 | New. `connectEnvoi(baseUrl, agentToken, fetch?)` opens one MCP SDK client per assistant turn over `StreamableHTTPClientTransport` with `Authorization: Bearer`, and `callEnvoi(tool, args, signal)` returns `{ ok: true, value }` validated against the tool's schema or `{ ok: false, error }`. Closed when the turn ends. |
| `src/integrations/assistant/tools.ts` | S27 | The three tools call `callEnvoi` instead of the generated client. Error mapping: Envoi code `not_found` gives `not_found`; any other tool error code gives `status_<code>`; no response, timeout or abort gives `unreachable`; a schema mismatch gives `invalid_answer`. `MAX_TOOL_CALLS`, the menu id check, the basket rebuilt from ids and quantities, and `onLink` stay. |
| `src/integrations/assistant/trace.ts` | S27 | Operations keep the names `listOutlets`, `getOutletMenu` and `createPurchaseRequest`, so the steps panel matches the approved mockup. `status` is the HTTP status of the MCP request, or null when no response arrived; an error result also records its error code. |
| `clients/buyer-agent/agent.ts` | S27 | Connects through `connectEnvoi` with `ENVOI_BASE_URL` and `ENVOI_AGENT_TOKEN`; nothing else changes. |
| `src/app/api/v1/buyer/assistant/route.ts` | S27 | Passes `APP_BASE_URL` and `ASSISTANT_AGENT_TOKEN` to `connectEnvoi`; no other change. |
| `openapi/envoi-public.yaml` | S27 | `unitMinor` and `currency` as already planned; `info.description` no longer says prices are Singapore cents and names no generator. |
| `clients/typescript/`, `clients/README.md`, `tests/unit/generated-client.test.ts`, `tests/e2e/apimatic-client.ts` | S27 | Removed, by the user's decision of 2026-11-02 ("Remove it"). `tests/e2e/run-public-api.ts` drops its call of the APIMatic check. |
| `package.json`, `config/tsconfig.client.json`, `tsconfig.json`, `.github/workflows/ci.yml`, `eslint.config.mjs` | S27 | `typecheck:client` and its CI step go; `config/tsconfig.client.json` is deleted; the root typecheck and lint now cover `clients/buyer-agent/` and its test; the eslint ignore of `clients/typescript` goes. |
| `tests/support/fake-envoi-api.ts` | S27 | Replaced by a fake MCP server: the real `McpServer` with the route's tool definitions over an in-memory transport, so tests exercise the real schemas without HTTP. |

- **Call stack (Ask Envoi and the terminal agent):** the turn opens `connectEnvoi`; each tool spends the turn budget, then `callEnvoi` sends one `tools/call` to `/mcp` with the turn's abort signal; the route checks the agent token, reads the counted body and runs the tool against the domain as today; the client validates `structuredContent` against the tool's schema; the tool maps the result; the purchase request's link goes to `onLink`, never the model. The turn closes the client.
- **Named tests (changes):**
  - S25 test 6 `the assistant reaches Envoi only through the generated client` becomes `the assistant reaches Envoi only through the MCP client`: a static check, proved by a planted `fetch` in the tools module and by a planted import of another HTTP client.
  - S27 test 17 `the regenerated client reads a USD menu` is retired and replaced by `the assistant's MCP client reads a USD menu and rejects a price without its currency`: through the fake MCP server, a USD menu reads with its `unitMinor`, and an answer with `currency` removed, `unitMinor` as a string, or an item currency unlike the menu's is `invalid_answer` with nothing passed to the model. Each of the three corruptions is its own mutation.
  - New S27 test 36 `every MCP tool answer matches its output schema`: each of the three tools' answers for an SG and a US fixture shop validates against its declared schema; mutations: currency `EUR`, an item currency unlike the menu's, `unitMinor` as a string, a missing purchase `url`, and the menu refine removed.
  - S19 test 3 `generated client reaches no receipt or payment route` is retired with the client; the MCP route already exposes no payment or receipt tool, covered by the existing S13 tests.
  - S20 test 13 `agent tools call only the generated client` becomes `agent tools call only the MCP client`, the same check as S25 test 6 on the terminal agent.
  - The 5 tests failing on 2026-11-02 for the missing `unitMinor` (`tests/unit/buyer-agent.test.ts` 4, `tests/integration/buyer-assistant.test.ts` 1) re-run on the fake MCP server unchanged in intent.
  - Tests 1-35 stay otherwise; the count becomes 36 named tests. Each new or changed guard gets its own mutation, recorded with S27.
- **Least confident decisions:**
  1. [hypothesis] The SDK client validates `structuredContent` against a declared output schema; `callEnvoi` also validates with the same zod schemas, so the guard does not rest on SDK behaviour alone. The mutation proves which one fails.
  2. The reads now need the agent token. Outside agents already needed it for every MCP tool; the REST reads stay open.
  3. Trace operation names stay those of the REST operations so the approved mockup holds; a reader of the trace sees REST names for MCP calls.
  4. One MCP client per turn costs an `initialize` round trip per turn; a long-lived client would save it but must survive Render restarts.
  5. Removing the generated client may weaken the APIMatic sponsor story [unknown prize effect].

US/currency contract, copied from docs/plans/envoi/02-architecture.md#second-build-plan-amendment-2026-10-29:

**Shops in the United States.**
1. `outlets` gains `country`, `SG` or `US`, set by the merchant before the first publication and refused as a change after it. The currency follows from the country: `SGD` or `USD`. Existing outlets become `SG` in the migration.
2. Money becomes currency-explicit everywhere it is SGD-only today: the money module carries a currency with every integer minor-unit amount, and columns, types and API fields named for SGD cents are renamed to currency-neutral minor units with a currency beside them. A purchase copies its outlet's currency at review, and the review's hash already covers currency.
   Mixing two currencies in one sum or comparison throws; there is no conversion anywhere.
3. PayPal orders use the purchase's currency, and capture, read and webhook verification compare the captured currency with the purchase's, so a USD capture can never settle an SGD purchase or the reverse.
4. A US outlet has no SGQR step and no PYUSD destination: PYUSD preparation refuses any purchase whose currency is not SGD, and SGQR resolution only ever returns SG outlets.
5. The public OpenAPI document's menu and purchase-request schemas change with the rename and gain the currency field, so the generated client must be regenerated through one more APIMatic upload, and the MCP tools' outputs change the same way.
   Superseded 2026-11-02 by the [MCP client amendment](#mcp-client-amendment-2026-11-02): no regeneration or upload; the generated client is removed and the MCP tools declare output schemas. Nothing else about the public routes changes.
6. A US shop needs a PayPal sandbox business account in the United States as its destination, connected exactly as a Singapore one is.

Source: docs/plans/envoi/02-architecture.md#mcp-client-amendment-2026-11-02

### MCP client amendment, 2026-11-02

Drafted 2026-11-02 on `envoi/slice-27-us-shops` for the user's decision "Switch to MCP client" (2026-11-02); **REOPENED and RE-APPROVED 2026-11-02** ("yes i authroize gate 2").
Approval accepts this amendment as a proposal; it authorizes no Gate 3 or 4 change, code change, install, upload, migration, commit, merge, push or deploy.
Gate 1 is unchanged by the user's decision of 2026-11-02 ("Gate 1 unchanged"): no buyer or merchant behaviour changes, and the Ask Envoi steps keep the mockup's names.

**Why.**
- [verified 2026-11-02] The committed APIMatic client (codegen v4, generated from the pre-S27 document) has no `unitMinor`, so typecheck, `next build` and CI fail at `src/integrations/assistant/tools.ts`, and 5 tests fail for the same reason. APIMatic support request 25184 is open.
- [verified 2026-10-30, scratch only] The codegen v3 client works for the three calls but coerces `"1295"` to 1295, turns a missing `unitMinor` or `available` into null, fixes its base URLs, cannot take an injected `fetch` and fails TypeScript 6.0.3 under Envoi's settings. Not chosen.
- [verified 2026-11-02, scratch only, local production build of a copy, disposable database dropped] The official MCP SDK client (`@modelcontextprotocol/sdk` 1.32.1, already a dependency) against `src/app/mcp/route.ts` read a FIXTURE SG and a FIXTURE US shop with the right currencies and `unitMinor` equal to the database, created purchase requests for both, answered an unknown shop and quantity 21 with `isError`, refused a missing or wrong token with Envoi's 401, and surfaced timeout, abort and a closed port as errors.
- [verified 2026-11-02, same run] The three tools declare no output schema and return JSON only as text, so a client with no schema of its own accepted seven corrupted answers (currency EUR, an item currency unlike the menu's, `unitMinor` as a string, missing or 12.5, `isDemoFixture` as `"True"`, a missing purchase url). A zod schema rejected all seven only once it also checked that every item's currency equals the menu's.
- [verified, hackathon rules] APIMatic is an optional sponsor tool; the hard rule is meaningful use of PayPal and AI. [unknown] Whether dropping the generated client loses the APIMatic prize; the user chose the switch knowing this.

**Decision.**
1. The assistant's three tools (hosted Ask Envoi and the terminal agent `clients/buyer-agent/agent.ts`) each make one MCP `tools/call` to Envoi's own `/mcp` route through the official MCP SDK client, over HTTP to `APP_BASE_URL` (the terminal agent: `ENVOI_BASE_URL`), with the agent token as a bearer header. No tool calls `fetch` itself.
2. The shop list and menu reads now need the agent token, as every MCP tool already does; the public REST reads stay open to everyone else.
3. `/mcp` declares an output schema on each of its three tools and returns its answer as structured content beside the text, so every MCP client, the assistant and outside agents, can validate it. The menu schema requires every item's currency to equal the menu's, and each price to be an integer of at least 1 or null.
4. The assistant validates every answer against those schemas and treats a mismatch as an error, never as data for the model. [hypothesis] The SDK client validates structured content against the declared schema; the implementation proves it with a mutation.
5. Tool errors and transport errors map to the assistant's existing error results; the tool budget, the basket rebuilt from ids and quantities alone, and the link going to the browser, never the model, stay as they are.
6. APIMatic leaves the runtime path and the repository: the generated client `clients/typescript/`, its unit test, the APIMatic end-to-end check and `typecheck:client` are removed, by the user's decision of 2026-11-02 ("Remove it"). The public OpenAPI document stays, because the REST routes stay, and its description is corrected to currency-explicit prices with no generator named.
7. No new dependency, environment name, table, route or grant. `ASSISTANT_AGENT_TOKEN` keeps its role.

**Deviations recorded.** S14 made APIMatic development tooling; S19 and S20 named the generated client as the agent's only path; the second build plan made the assistant route its one caller and gave S27 one more APIMatic upload. All three are superseded here. The S27 v1-endpoint upload of 2026-10-30 ("Lets use v1 endpoint first while waiting for support") stays on record as used and not chosen.

**Risks.**
- **R25 changes:** the assistant's calls now reach `/mcp` and its limits instead of the public REST limits; the same rule holds that assistant traffic must not lock itself or others out [hypothesis until measured].
- **New, R30:** an MCP answer that drifts from the database or the schema could mislead the model about a price. The output schemas and the client's validation stop a malformed answer; nothing stops a well-formed wrong one, and Envoi's review page still prices from the server.
- **New, R31:** the APIMatic sponsor story weakens: no generated client ships. [unknown] prize effect.

4. Out of scope

S28-S31; public assistant enablement or ASSISTANT_AGENT_TOKEN changes on Render; S24/S25 evaluations; new paid model calls, installs, credential/configuration changes, APIMatic uploads/regeneration, add-demo-iced-teas, S25 review notes 3/5/6/7, real money and unrelated merchant changes.
Protected configuration/history: Test Shop out_vrlbnc3zylbrr6g2drovaiqkfu, its merchant, the two uncertain S2 purchases, S26 outlet out_rigqfs5f2vdtsmibj5rxenbnjq and purchases pur_f5gja6qvu3uc4oshpqwjvom7gi / pur_xidgcr7ruzastkxwsuecv3en6u. A new human-approved Test Shop checkout through the normal UI is allowed; repurposing its owner/menu/destination or old purchases is not. No neon_auth query. The original RTF, four earlier handoff .txt files and PROGRESS.md remain untracked and are not implicit commit candidates.

5. Current state

[verified 2026-11-02] Checkout main = remote main = 25a3b1252e150725eabcc9acdcb0a91ac7575ec0, verified with git ls-remote. Local envoi/slice-27-us-shops = a7f60cb7816b2c978f3da35367c9cd9b02b64333; its remote = 89ab2cd08e2201393811d9beaf730ffd0f18ccbd. Local handoff/authority mirror edits are intentionally uncommitted on main. Verification alone needs no new code branch. Any code fix must preserve those edits and safely bring the S27 branch forward before editing; no reset/stash/force push.
[verified] App https://envoi-helx.onrender.com. Main 25a3b12 was observed live in Render deployment dep-dbk5him417fc73bjg74g, service srv-db6drknlk1mc73ct4a30. Final CI https://github.com/jaydonnnk/envoi/actions/runs/41421571765 passed on that SHA. Its runtime source is unchanged from release a7f60cb.
[verified] Migration 0027 is ALREADY applied. Render reported a7f60cb live at 17:21:24 SGT; the migration runner finished at 17:21:44. All 28 migration hashes/timestamps matched local files through 0027. No old-schema preflight or blind migration rerun is appropriate.
[verified at snapshots] Before/after/post-maintenance totals matched: 3 outlets, 34 menu items, 49 purchases, 19 attempts, 58 basket lines. Aggregate SGD-cent sums: menu units 11530, purchases 16800, attempt totals 7700, capture gross 4170, basket units 13830, basket line amounts 16800; unknown menu prices 0. All outlets SG, all purchases/attempts SGD, no open purchases or old/missing basket keys, uncertain count 2. Legitimate new test purchases change counts/sums; these are migration evidence, not a frozen post-test target.
[verified] Maintenance https://github.com/jaydonnnk/envoi/actions/runs/41420143081 passed on a7f60cb. Neon manual heartbeat mnt_gbaabnslvr4kykxg5eign7tpau was ok, 17:24:11-17:24:14 SGT, all tasks ok. Pre-release maintenance 41419115035 also passed.
[verified] Fresh merged-tree suite: 674 tests in 90 files. Typecheck/lint/build and real HTTP fixture REST/MCP checks passed in CI. Eighteen independent MCP mutations and 80/80 documentary proofs are recorded, with source hashes matching the released code. An earlier 673-assertion run had an uncaught fixture timer error; it is not clean proof. Final 674-test runs were clean.
[verified] Registry/Test Shop menu return 200; menu currency SGD and unitMinor. /buy and /buy/scan are 200; /buy/ask is 404, assistant off. S26 merchant setup showed Singapore Locked and SGD labels on desktop/mobile. The labeled repository SGQR fixture paste resolved to Test Shop through its approved SG mapping; basket stayed empty and Review disabled. Camera capture and payments were not tested by these checks.
[verified] Render dashboard and rollback controls were accessible. Its displayed DATABASE_URL normalized endpoint/database identity matched the configured Neon fingerprint; credentials were never printed and were masked again. The saved MIGRATION_DATABASE_URL is pooled; its matching direct hostname was used with verified TLS. Existing pgConnection handles URL/TLS options. Necessary credentials may be loaded privately for authorized operations; the old reference's blanket no-.env.local rule belonged to the earlier code-only phase. No secrets in chat, files, screenshots, logs or commits.
[verified] Node v24.21.0, gh and installed postgres/tsx/dependencies were used without installs. Local tests use TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test with DATABASE_URL, MIGRATION_DATABASE_URL and MAINTENANCE_DATABASE_URL unset. Builds that exclude private env files use an isolated copy. Browser inventory must be refreshed; old handles/tab IDs are not reliable.
[verified source discrepancy] Applied migration 0027 includes a column-level UPDATE(country) grant to envoi_web, while the older Gate 3 S27 file-map row copied above says "No grant changes." Preserve that distinction between the proposal wording and published SQL. It is not a reason to rerun the migration or silently rewrite a gate; any material conflict affecting new work is surfaced before dependent changes.
[unknown] Current sandbox buyer/US seller sign-ins, verified US seller country and USD acceptance, dedicated US fixture merchant identity, current PYUSD_ENABLED, usable devnet wallet/funds and valid merchant rate. A browser tab, outlet country flag or advertised provider capability does not establish these.
The pre-S27 rollback deployment was dep-dbk3uvjbc2fs73e35lf0 at 94df453. Availability must be re-verified. The documented rollback order is Render first, then tested database down script, then new Git revert/push. The down script refuses once ANY US shop or USD row exists, even before a USD capture. After that boundary, stop for a forward-repair decision rather than bypassing the guard.

6. Authority and remaining verification contract

The user was shown: "S27 still needs payment checks: an SGD sandbox checkout you approve, then US seller/USD testing, plus PYUSD regression if enabled. These need separate authorization."
The user's reply on 2026-11-02: "I authroize. please handoff to the next agent in a copy paste prompt for these. Thanks. Use this prompt as reference on how to structure the prompt".
This authorizes those remaining S27 test-money checks for the next agent. No payment check ran while writing this handoff. No repeat authorization is needed for the same checks. Missing account/recipient choices and human approval of an exact payment still require the user's participation.
A. A fresh SGD PayPal sandbox purchase at Test Shop precedes US fixture/USD work. A fresh release/schema read and baseline establish the starting state. The normal review/provider approval flow shows exact items, quantity, recipient, SGD amount and sandbox environment to the human, who signs in and approves. Evidence connects the review, order/capture id, Paid receipt and matching Neon purchase/attempt state. A success page alone is insufficient. An uncertain outcome is reconciled before retrying or changing rails. Historical purchases do not satisfy a fresh regression.
B. Only after SGD passes, the user identifies or creates the US PayPal sandbox business seller and performs sign-ins. Narrow, labeled US fixture setup necessary for the authorized test is within scope, after merchant/account/recipient are confirmed; protected Test Shop/S26 identities are not reused. Existing merchant/operator/domain flows are used, not ad hoc table rewrites. Evidence covers US country before publication, USD menu/review, country locked afterwards, PYUSD unavailable with not_sgd_shop, PayPal USD order/capture to that seller, Paid receipt and Neon readback. Seller consent and USD acceptance are verified, not assumed.
C. PYUSD regression is conditional on verified enablement and existing SG devnet prerequisites. The user connects/signs in the wallet. Evidence ties the approved review, accepted valid shop rate, PYUSD devnet transfer/destination, verification and Paid receipt/Neon state. No private key reaches the agent. One basket is not charged twice on different rails. If PYUSD is off or prerequisites unavailable, record conditional/not run, never passed. No flag/configuration change is silently inferred.
The user performs all PayPal approvals, wallet signing, seller-account creation and sign-ins. This authorization states no numeric spending budget, permits no real money and grants no paid AI evaluation allowance. The manual /buy flow avoids waking a paid assistant.
Earlier release authorization: "I authorized committing the evidence, merging and pushing to main, deployment, migration zero zero two seven, maintenance verification, and the document rollback if checks fail. Let me know if this succeeds and if I need to do anything else. Thank you." Completed release actions are recorded. The documented conditional rollback remains scoped to S27's SGD falsifier and its prerequisites. This does not grant unrelated deployment/install/later-slice authority. Consequential actions outside recorded scope still require named authorization, not an inference from gate approval.

7. Read first and evidence map

AGENTS.md; /Users/jayd0/.agents/skills/software-factory/SKILL.md; docs/plans/envoi/00-status.md top, S27 continuation/release/payment-authorization sections; 01-product.md problem/success/rules; 04-slices.md S27/plan-wide rules; copied Gate 2/Gate 3 sections above; s27-deploy-plan.md steps 8-9/rollback; PROGRESS.md. Earlier no-authorization notes are historical.
Evidence in docs/plans/envoi/evidence/: s27-neon-preflight-2026-11-02.json; s27-neon-release-before-2026-11-02.json (17:17:19 SGT); s27-neon-release-after-2026-11-02.json (17:22:04); s27-neon-release-maintenance-2026-11-02.json; s27-hosted-release-smoke-2026-11-02.json; s27-mcp-mutations.json and s27-mcp-mutate.py, with other S27 proofs linked in status. These are frozen evidence, not reusable output destinations for new payment runs.
Old s27-mcp-session-transfer-2026-11-02.md and four handoff .txt files are historical. Temporary /tmp/envoi-s27-neon-preflight.mjs and /tmp/envoi-s27-release-neon.mjs may exist; their old-schema/migration modes are not payment verification and must not be run blindly.
Documentary command: python3 -I docs/plans/envoi/checks/gate4_check.py docs/plans/envoi . main. Local changed-record checks include git diff --check and the self-tested tests/unit/no-secret.test.ts. Runtime checks are proportional to actual code changes or unresolved evidence gaps; application tests never point at Neon.

8. Done means

Fresh hosted evidence satisfies S27's remaining visible results: human-approved SGD capture/readback, US setup/publication/lock and human-approved USD capture/readback, plus PYUSD regression if enabled. Fixture paste/resolve evidence exists but is not camera or payment proof. Skipped/unavailable checks remain explicitly open.
00-status.md and existing mirrors record the new purchase/attempt/capture or devnet ids, amount/currency/recipient, human approval boundary, times, failures/retries and evidence limits. Historical snapshots stay unchanged; new runs have separate artifacts. Branch/authorization/deviation/evidence/limits stay consistent. Any code correction receives real regression/guard proof and relevant checks. No weakened tests or invented publication authority.
The architect-reviewer post-slice cleanup remains required after actual acceptance; deletion is not implicit. Only after all S27 exit checks pass is the slice complete, with the closing question exactly "Continue to slice S28, or re-steer?". S28 never starts automatically.

Wait for instructions before taking any action.

````

## Prompt for Handoff Review

```text
Independently review the S27 technical release and payment handoff in /Users/jayd0/Desktop/envoi. Be unbiased, thorough and honest. Assume the work may be flawed and seek real problems, not confirmation. Scope: main 25a3b1252e150725eabcc9acdcb0a91ac7575ec0 MCP/currency release, migration 0027, Neon/hosted/maintenance evidence, and local authorization/handoff changes. S27 is incomplete; payment checks are not claimed passed.
Read AGENTS.md, current S27 status, 04-slices.md S27, Gate 2/Gate 3 money/MCP contracts, s27-deploy-plan.md and the evidence JSONs named in the handoff. The user authorized the next agent's SGD sandbox checkout, US seller/USD test and conditional PYUSD regression. A review is not authority to perform a new payment, fixture write, migration, rollback or provider/model call.
Stress-test actual diffs, before/after/post-maintenance totals and migration hashes, trace/error/currency/recipient guards and the 18 independent mutation proofs. Re-run meaningful local fixture checks sequentially as warranted; inspect failures and exact restoration. Application tests never use Neon. Any remote evidence inspection stays read-only within existing scope and protects credentials.
Assess quality: hidden assumptions, weak tests, scope creep and gaps between claims and evidence. Do not pass tests for the sake of passing. Flag trivially satisfied/weakened tests and unsupported claims. Challenge scope/order, rollback after a US/USD record, count baselines after new purchases, stale branches and protection of Test Shop/S26/S2 history. Gate approval does not confer human payment authority.
Return PASS / ISSUES FOUND / FAIL with exact paths, verified line numbers, observed outputs and acceptance gaps. State uncertainty and distinguish implementation defects from changes to approved decisions. Deliver your verdict and wait for instructions.
```
