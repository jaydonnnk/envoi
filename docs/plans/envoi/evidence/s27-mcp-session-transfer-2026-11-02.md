# S27 session transfer, 2026-11-02

The documentation publication and local MCP replacement are complete. S27 as a whole remains in progress. The continuation prompt below copies the approved contract from current `main`; its local evidence is in `00-status.md` under the S27 MCP continuation section.

Publication update, 2026-11-02: after this handoff, the user answered "yes authorze" to committing the MCP changes and pushing `envoi/slice-27-us-shops` for CI. The prompt and review below preserve the earlier authorization state. Follow the current publication record in `00-status.md`; merge, migration, sandbox captures and deployment remain unauthorized.

Read-only preflight update, 2026-11-02: the user subsequently answered "Authroize" to the read-only Neon preflight. The local, uncommitted `s27-neon-preflight-2026-11-02.json` records its passing snapshot at 17:08:52 Asia/Singapore, through schema 0026, with no open purchases or non-SGD purchases/attempts. The original prompt's no-Neon-read statements are historical. No writes, migration, merge, deployment or payment is authorized. Refresh the baseline before release; Render environment/rollback access remains unverified.

Coordinated release update, 2026-11-02: the user later explicitly authorized the evidence commit, main merge/push, deployment, migration 0027, maintenance verification and documented rollback if checks fail. Render target identity and signed-in rollback controls are verified. Follow the coordinated release section of `00-status.md`; earlier authorization limits below are historical. Sandbox purchases, the US fixture and later slices remain outside this release authority.

## Completed

- Exactly eight gate files published to main `94df453ea8108315d8d7aee582cd2a08b66647c4`; remote verified; CI 41408301808 passed.
- Documentation synced into the S27 branch in merge `f72ed9f`. Earlier branch work and untracked user files remain intact.
- MCP switch implemented and reviewed locally. Two review findings fixed with failing regression tests first.
- 674 tests in 90 files pass without unhandled errors; typecheck/lint/build, fixture REST/MCP over HTTP, source scan and built-code scan pass. 18 mutation proofs and 80/80 documentary proofs passed.

## Decisions and traps

- The gate files were published without merging unfinished S27 code. The deploy plan uses branch-local paths for rollback artifacts absent from main.
- SDK output validators are cached by `listTools`, not by connection initialization. Local validation is still needed for the currency refinement.
- The SDK's initialized notification does not inherit the caller signal. The HTTP wrapper combines the turn and transport signals to enforce the deadline there too.
- SDK Mini Zod errors are not instances of Classic `z.ZodError`. `z.core.$ZodError` handles both.
- The first combined suite had 673 passing assertions and an uncaught canceled-stream fixture timer. That run was not clean proof. The fixture producer now cancels its timer; the final run passes 674 tests without that error.
- Schema and client mutations are sequential, restore exact bytes in `finally`, and require an AssertionError and a green restored rerun. They must not overlap with other source readers or tests.
- Runtime HTTP status is 200 for the MCP proposal, not the prior REST route's 201. Operation names remain the approved UI names.

## Files changed

- `src/integrations/mcp/contracts.ts`: shared tool definitions and schemas, including outlet/menu/item currency agreement and integer positive or null prices.
- `src/integrations/assistant/envoi-mcp.ts`: SDK connection, discovery, local validation, error mapping, per-request HTTP status and abort propagation.
- `src/integrations/assistant/{agent,tools,trace}.ts`: per-turn lifecycle, tool routing and error traces.
- `src/app/mcp/route.ts`: declared outputs, structured answers and coded errors. The assistant route logs the same error field.
- `tests/support/fake-envoi-api.ts`: actual McpServer and shared definitions over InMemoryTransport with a fetch bridge, corruption seams and FIXTURE SG/US data.
- `tests/unit/envoi-mcp.test.ts`, changed assistant/buyer-agent tests and `tests/integration/us-shops.test.ts`: named tests 17/36, SDK validation, deadline/error regressions and preserved budgets/link boundaries. The slow-body integration fixture now cancels its timer.
- APIMatic generated files/tests, `clients/README.md` and `config/tsconfig.client.json` are deleted. Root TS/lint and CI no longer exclude the terminal agent or invoke `typecheck:client`. The obsolete generated-client webpack rule is gone. README/OpenAPI describe the MCP/currency path.
- `tests/e2e/run-public-api.ts`: public REST contract plus the real SDK client against the production build on a disposable database. No PayPal call.
- `docs/plans/envoi/evidence/s27-mcp-mutate.py` and its JSON report: 18 rerunnable mutation proofs. Status, evidence pack, deployment notes and local PROGRESS record distinguish local evidence from external S27 work.

## Open work

Implementation is published as `bdc87a49dab3e4b84bad1d0085687c79c2d4181e` on `envoi/slice-27-us-shops`, remotely verified after the user's branch publication authorization. CI run `41414544915` passed all steps, including the production build, build scan and fixture HTTP/MCP check. Migration, hosted SGD/scan checks, a US seller/fixture and USD capture remain unrun and unauthorized. These block full S27 completion; the post-slice architecture cleanup also remains open. The hosted assistant stays off. The prompts below are historical handoffs from before this publication; current status wins.

## Prompt for New Chat

```text
Background context for S27 of Envoi in /Users/jayd0/Desktop/envoi. Written 2026-11-02, Asia/Singapore, from current main and the actual working tree. The gate documents govern any conflict; Git and files need re-verification before action.

1. Project in brief
Envoi is a PayPal AI hackathon app for an in-person visitor buying from an enrolled merchant. It finds shops and published menus, lets agents propose a basket, and gives the human a one-time review link. Payment goes to the shop's own PayPal sandbox account; Singapore shops can also offer the devnet wallet rail.
Buyer: "I am visiting Singapore. I want to buy something from this shop, but I do not have a payment method it accepts. I need to know whether I can pay, what I am approving, and whether the payment actually reached the shop."
Merchant: "I want visitors to find my shop and pay using a method I have chosen to accept, without sending the money through another company's account."
The 4 of 5 first-time buyer success target remains proposed and is never measured. Test money only; demo shops are FIXTURE; Envoi is never the payee; no AI sets a price; humans approve every payment; an assistant cannot pay, approve or read a receipt; uncertain is never paid. Gate 1 was approved 2026-10-29 and left unchanged on 2026-11-02. Gates 2, 3 and 4 were re-approved 2026-11-02, respectively "yes i authroize gate 2", "Approved" and "Approved.".

2. Where this slice sits
Build order: S25 Ask Envoi in the site; S26 The connected run; S27 US shops and currency-explicit money; S28 PayPal PYUSD rewards card; S29 The menu explained and translated; S30 Draft review aids; S31 PayPal approval over the review page. S25 and S26 have completion evidence; S27 is in progress; S28-S31 have not started. S25 and S26 are never cut. Cut order is S31, S30, S29, then S27 with S28 together. S27 opens US shops in USD and prevents amounts being read in the wrong currency; its MCP replacement removes the generated-client build blocker.

3. This slice's contract, copied from main:docs/plans/envoi/04-slices.md
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

Plan-wide rules, copied from the same main file:
- Every guard named in a slice's tests gets its own mutation, recorded in `00-status.md` with the slice.
- Every model, PayPal and Kernel call in a test is faked at its boundary and labeled as a fixture; real calls happen only in evaluations and recorded runs you authorize.
- Every screen keeps the test-environment badge and wording; nothing is shown as real money, a real merchant or a measured return.
- A slice is done when it is merged to `main` and deployed with your authorization, its evidence is in `00-status.md`, and the post-slice cleanup review has run.

Gate 3 MCP contract, copied from main:docs/plans/envoi/03-program-design.md#reopening-2026-11-02-mcp-client:

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

Gate 3 S27 file rows, money signatures and named tests from #reopening-2026-10-29-second-build-plan:
| `src/app/mcp/route.ts` | S27 | Each of `search_outlets`, `get_menu` and `create_purchase_request` registers a zod `outputSchema` and returns `structuredContent` beside the existing JSON text. The menu schema refines that every item's `currency` equals the menu's; `unitMinor` is an integer of at least 1 or null. A tool error stays `isError: true` with its message and also carries Envoi's error code. |
| `src/integrations/assistant/envoi-mcp.ts` | S27 | New. `connectEnvoi(baseUrl, agentToken, fetch?)` opens one MCP SDK client per assistant turn over `StreamableHTTPClientTransport` with `Authorization: Bearer`, and `callEnvoi(tool, args, signal)` returns `{ ok: true, value }` validated against the tool's schema or `{ ok: false, error }`. Closed when the turn ends. |
| `src/integrations/assistant/tools.ts` | S27 | The three tools call `callEnvoi` instead of the generated client. Error mapping: Envoi code `not_found` gives `not_found`; any other tool error code gives `status_<code>`; no response, timeout or abort gives `unreachable`; a schema mismatch gives `invalid_answer`. `MAX_TOOL_CALLS`, the menu id check, the basket rebuilt from ids and quantities, and `onLink` stay. |
| `src/integrations/assistant/trace.ts` | S27 | Operations keep the names `listOutlets`, `getOutletMenu` and `createPurchaseRequest`, so the steps panel matches the approved mockup. `status` is the HTTP status of the MCP request, or null when no response arrived; an error result also records its error code. |
| `clients/buyer-agent/agent.ts` | S27 | Connects through `connectEnvoi` with `ENVOI_BASE_URL` and `ENVOI_AGENT_TOKEN`; nothing else changes. |
| `src/app/api/v1/buyer/assistant/route.ts` | S27 | Passes `APP_BASE_URL` and `ASSISTANT_AGENT_TOKEN` to `connectEnvoi`; no other change. |
| `openapi/envoi-public.yaml` | S27 | `unitMinor` and `currency` as already planned; `info.description` no longer says prices are Singapore cents and names no generator. |
| `package.json`, `config/tsconfig.client.json`, `tsconfig.json`, `.github/workflows/ci.yml`, `eslint.config.mjs` | S27 | `typecheck:client` and its CI step go; `config/tsconfig.client.json` is deleted; the root typecheck and lint now cover `clients/buyer-agent/` and its test; the eslint ignore of `clients/typescript` goes. |
| `tests/support/fake-envoi-api.ts` | S27 | Replaced by a fake MCP server: the real `McpServer` with the route's tool definitions over an in-memory transport, so tests exercise the real schemas without HTTP. |
| `src/lib/money.ts` | S27 | Currency-explicit money below; the SGD-only names go. |
| every file naming `SgdCents`, `sgd_cents` or a `formatSgd` call (about 62, found by `rg`) | S27 | Renamed to the currency-neutral names below, the currency carried beside every amount. PYUSD code keeps SGD by calling `requireSgd`. |
| `drizzle/0027_currency_and_country.sql` | S27 | `outlets.country` (`SG` or `US`, not null, default `SG`, check); every `*_sgd_cents` column renamed to `*_minor`; `purchases.currency` (`SGD` or `USD`, not null, default `SGD`, check); a trigger refusing a change of `outlets.country` once any revision of that outlet has been published. No grant changes. |
| `src/domain/outlets/merchant.ts`, `src/app/api/v1/merchant/outlets/[id]/route.ts` | S27 | The merchant sets `country` before first publication; a later change answers the new code `country_locked` (409). |
| `src/integrations/paypal/orders.ts`, `map.ts`, `verify.ts` | S27 | Orders use the purchase's currency; a captured or webhook currency unlike the purchase's is a verification failure, never paid. |
| `src/domain/pyusd/*` | S27 | Preparation refuses a purchase whose currency is not SGD, with the new unavailable reason `not_sgd_shop`. |
| `src/domain/sgqr/resolve.ts` | S27 | Resolves only outlets with `country = 'SG'`. |
| `openapi/envoi-public.yaml`, `clients/typescript/`, `src/app/mcp/route.ts` | S27 | `unitSgdCents` becomes `unitMinor` with `currency` on the outlet and menu; the client is regenerated by APIMatic and committed unchanged; the MCP tools' outputs change the same way. Superseded 2026-11-02: no regeneration; see [Reopening 2026-11-02](#reopening-2026-11-02-mcp-client). |
| `src/app/merchant/setup/country.tsx` | S27 | The country choice in the mockup's words, before the SGQR step, which is shown for SG only. |
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

Gate 2 amendment, copied from main:docs/plans/envoi/02-architecture.md#mcp-client-amendment-2026-11-02:

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
S28-S31, public assistant enablement, ASSISTANT_AGENT_TOKEN on Render, any repeated S24/S25 evaluation, APIMatic uploads/regeneration, add-demo-iced-teas on Neon, and S25 review notes 3/5/6/7 remain outside this continuation. Test Shop, its merchant, the two uncertain S2 purchases and the S26 records remain protected. No external database query has been made in this session.

5. Current state
[verified 2026-11-02] Branch envoi/slice-27-us-shops, HEAD f72ed9f; main and origin/main 94df453ea8108315d8d7aee582cd2a08b66647c4; origin/envoi/slice-27-us-shops remains 49b3bcde163d6e721544d59695fe7ab57f1afacf. Earlier local S27 commits remain unpushed. All MCP implementation changes are uncommitted, including 82 deleted files at the time of this record. The unrelated untracked RTF and four earlier handoff text files are retained.
[verified] Node24 and installed dependencies were used with no installs. Tests use local TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test with DATABASE_URL, MIGRATION_DATABASE_URL and MAINTENANCE_DATABASE_URL unset. No .env or .env.local was read. Source scan self-test and actual surface scan passed.
[verified] Final suite: 674 tests in 90 files; typecheck/lint; production build in /var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/envoi-mcp-build-wlg5af90 excluding local env files; REST contract and three MCP SDK calls over real HTTP at localhost:3117; server stopped/database dropped. Built runtime sources match the current tree. Mutation report: docs/plans/envoi/evidence/s27-mcp-mutations.json,18/18. Gate proofs:80/80. CI 41408301808 only covers the docs commit, not this implementation.
[unknown] Current US PayPal sandbox seller access and USD acceptance remain unverified. Neon/Render/PayPal state was not checked by this session.

6. Authority
The user said "Commit and push the eight gate related files to main and then subsequently start the S27 MCP client implementation. Thank you." on 2026-11-02. The eight files were published as 94df453; the local implementation is done under that code-start authority. Implementation commits/pushes, Neon reads/writes/migration/rollback, PayPal sandbox actions, the S27 merge/deploy and maintenance workflow_dispatch still need named authorization. The user controls the US sandbox seller/sign-ins and Render settings/rollback. No later slice is authorized.

7. Read first
AGENTS.md and the software-factory skill; docs/plans/envoi/00-status.md top and S27 local continuation; 04-slices.md S27; 03-program-design.md the MCP reopening and S27 portions of the second build plan; 02-architecture.md MCP amendment; s27-deploy-plan.md; PROGRESS.md and the mutation JSON. The local session-transfer file contains precise changed-file details and review findings. The gate documents override this prompt if they disagree; a conflict requires clarification rather than a guess.

8. Done means
The local MCP replacement has verified evidence, but S27 is still incomplete. Full S27 requires the named-authorized publication, CI, Neon before/after counts and sums with migration 0027, served-build check and maintenance run, an SGD PayPal capture read from Neon as paid, Singapore scan and conditional PYUSD regression, then US fixture/USD capture evidence. The existing deploy plan preserves that order and its rollback guard. The S27 status entry must record branch, authorizations, deviations, evidence and limits; the final architecture cleanup remains after the full slice. Only then is the closing question "Continue to slice S28, or re-steer?" appropriate.

Wait for instructions before taking any action.
```

## Prompt for Handoff Review

```text
Independently review the uncommitted S27 MCP replacement in /Users/jayd0/Desktop/envoi. Assume it may be flawed; be unbiased, thorough and honest. Read AGENTS.md and the MCP contract in docs/plans/envoi/03-program-design.md, S27 in 04-slices.md and the local evidence in 00-status.md. Only eight planning files were published to main94df453; all application implementation is local on envoi/slice-27-us-shops at f72ed9f.

Review the changed route, new shared contracts/client, shared assistant agent/tools/trace, fake MCP server, altered tests/config/README/OpenAPI and removal of the APIMatic client. Do not enumerate removed generated files. No .env files, credentials, installations or external account calls are authorized. Fixtures and local databases only.

Claims to cross-check:674 passing tests, typecheck/lint/build and real HTTP fixture REST/MCP checks,18 independent mutation proofs with exact restoration,80/80 documentary proofs. S27 is not claimed complete or deployed. The two review defects were abort propagation to notifications/initialized and SDK Mini Zod error classification; both have regression tests. One prior combined suite had an uncaught late fixture write despite 673 passing assertions; the timer cancellation fix and final clean run need verification.

Stress-test code and evidence rather than confirming the author's account. Re-run relevant tests and mutations sequentially, inspect actual guard failures, check budgets/lifecycle/concurrent HTTP status, model/trace link boundaries, malformed answers and currency/price semantics. Check quality, hidden assumptions, regressions, scope and whether tests would detect broken behaviour. Do not pass tests for the sake of passing. Flag weakened/trivial tests or unsupported claims. Probe cases the original tests miss.

Return PASS / ISSUES FOUND / FAIL with specific paths, line numbers and observed outputs for each finding. State exactly what the evidence establishes and what remains unknown. Deliver your verdict and wait for instructions.
```
