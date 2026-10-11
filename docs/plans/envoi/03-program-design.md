# Program Design: Envoi

**Reopened 2026-10-10.** The user removed Zapier because it is paid and reopened Gates 1, 2 and 3; Zapier-dependent content in this document is pending revision and everything else stays approved. See [`00-status.md`](00-status.md#reopening-2026-10-10-zapier-removed) and [`handoff.md`](handoff.md#reopening-2026-10-10-zapier-removed-pyusd-reconsidered).

Gate 3 program design, 2026-10-07 (Asia/Singapore). **APPROVED by the user 2026-10-07** ("gate 3 is approved"), together with a separate authorization to commit these planning documents and push `main`. Authorities: [approved Gate 1 product](01-product.md) and [approved Gate 2 architecture](02-architecture.md). Approval accepts the contracts below and the disposition of the eight Gate 2 review findings; it establishes no runtime, account, integration or usability evidence, and it does not authorize implementation or Gate 4. A separate, narrowly scoped authorization on the same day covered the R11 flag flip, its redeploy and a read-only schema inspection, all now complete. This document contains contracts only: file map, types and signatures without bodies, call stacks, state transitions, race rules, capacity budgets and named failure tests. No application implementation, no installed application packages and no approved slices exist.

## What this gate resolves

Gate 2 approval left eight review findings open. This gate independently re-checked the vendor claims those findings depend on, against primary sources on 2026-10-07. Four findings are now **resolved by a design contract**, three are **resolved with a named residual risk that must be disclosed rather than hidden**, and one is **partly outside Gate 3's reach** and is dispositioned to a specific later proof.

This gate also surfaced a provisioned Neon project that contradicted an approved Gate 2 decision, and the user resolved both resulting questions on 2026-10-07: **in-app Better Auth** stands, so Gate 2 is not reopened, and the **`aws-us-east-2` region is accepted** subject to a Slice 1 latency measurement.

Three cross-check results changed a Gate 2 assumption:

- **[verified]** Neon Free fails *"operations that increase storage (inserts, updates, and deletes)"* once the 1 GB storage limit is reached, and its history window is a *"6-hour limit"* in which *"Change history is a log of write operations"*. Consequence: a logical `DELETE` neither reclaims space immediately nor works at all once storage is exhausted. Gate 2 assumed cleanup-on-close was the primary control. It is not reliable. Access denial must therefore be a **read-only** decision, and capacity must be bounded at **admission**, not at deletion. [Neon plans](https://neon.com/docs/introduction/plans)
- **[verified]** Better Auth's anonymous plugin states *"The anonymous user is deleted by default when the account is linked to a new authentication method"*, with `disableDeleteAnonymousUser` to turn that off. Gate 2 assumed database sessions simply survive. They do, but a link event would by default delete the row that owns every buyer purchase. Receipts would silently become orphans. [Anonymous plugin](https://better-auth.com/docs/plugins/anonymous)
- **[verified]** PayPal idempotency documents no fixed retention window (*"see the reference for your API"*) and warns that for simultaneous identical keys *"PayPal processes the first request and might fail the second request"*. Consequence: same-key replay is the correct recovery for a lost response, and **concurrent** same-key requests are unsafe. Capture must be serialized behind a lease, not merely behind a stored request id. [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)

Also **[verified]**: GitHub Free includes *"2,000"* Actions minutes monthly, *"GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners"*, and *"If your account does not have a valid payment method on file, usage is blocked once you use up your quota."* The zero-spend control is therefore structural, not a configuration hope. [Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)

## Disposition of the eight unresolved review findings

| # | Finding | Evidence found | Resolution or disposition |
| --- | --- | --- | --- |
| 1 | Free-capacity budgets, bounded polling, complete Actions job overhead, shared quotas, zero-spend controls | **[verified]** 2,000 private minutes/month; public standard runners free; usage blocked with no payment method. **[vendor claim]** Neon 1 GB storage, 100 CU-hours/project, 5 GB transfer, 5-minute scale-to-zero. **[vendor claim]** Render Free 750 shared instance hours, sleep after 15 minutes. | **Resolved** in [Capacity budgets](#capacity-budgets) below: a monthly figure for every shared quota, an admission-based storage budget, a bounded polling contract, and an Actions cadence that starts at every 6 hours and moves to hourly only after quota is confirmed or the repository is public. Zero-spend is enforced by having no payment method on file plus a $0 spending limit. Residual **[unknown]**: actual CU-to-wall-clock conversion at the chosen Neon compute size; must be measured in Slice 1. |
| 2 | Cleanup/recovery when database storage exhaustion blocks `DELETE` | **[verified]** inserts, updates and deletes all fail at the storage limit; 6-hour history retains written bytes after logical deletion. | **Resolved, with a disclosed residual risk.** Two contracts: (a) image-proxy denial is computed from `accepted_at` on a **read** path, so closing access never needs a write; (b) admission is bounded by bytes admitted per rolling 6-hour history window, not by live bytes alone, so exhaustion should be unreachable. If it is reached anyway, no in-application recovery exists: the operator runbook is console-side (shorten the history window to truncate it, then delete). Whether truncation is immediate is **[unknown]** and untested; this is named as residual risk R2 in [Least confident decisions](#least-confident-decisions). |
| 3 | Logical checkout identity across duplicate requests and replacement reviews | Design gap, no external dependency. | **Resolved** by `CheckoutKey`: a deterministic hash over buyer session, outlet, menu revision, destination, rail, currency and canonical lines, with a unique partial index on one open review per key, `supersedes_purchase_id` for replacements, and an explicit rule that a replacement is legal only from a terminal unpaid state. See [Checkout identity](#checkout-identity) and [Races](#races). |
| 4 | Image capability access versus merchant-session/membership requirements | Design gap, no external dependency. | **Resolved** by declaring two disjoint principal kinds. The capability principal is deliberately session-free because the provider fetches without a browser; its compensating controls are a 256-bit unpredictable token stored hashed, single-import scope, a read-only deadline check, `no-store`, log redaction and a rate limit. Merchant routes keep membership checks and never accept a capability token. See [Authorization](#authorization). |
| 5 | Anonymous deletion/linking, durable receipt ownership, payment-record retention | **[verified]** Better Auth deletes the anonymous user on link by default. | **Resolved**: `disableDeleteAnonymousUser: true`, plus an `onLinkAccount` hook that refuses to create any membership. Purchases keep `buyer_user_id` as the owner of record; linking changes nothing about ownership. Retention: purchases, attempts, provider events and audit rows are retained for the whole demo (small, no bytes, no QR payloads, no prompts, no bearer values). Expired Better Auth session rows are purged by maintenance. Receipt loss on cookie clearing is disclosed in the UI, not silently repaired. |
| 6 | Maintenance's code-level versus credential-enforced PayPal authority | **[unknown]**: PayPal's public reference pages reachable in this pass list Orders v2 operations without exposing scope strings, so whether a read-only Orders scope exists could not be verified from a primary source. | **Partly resolved, honestly dispositioned.** The boundary is enforced by construction: maintenance receives a `PayPalReadClient` type that has no `create`/`capture` member, imports only `orders-read.ts`, and a CI test asserts the built maintenance bundle cannot reach the capture module or endpoint path. That is a real, fail-capable guard, but it is **code-level**, not credential-enforced. If provisioning reveals a read-only Orders scope, a second REST app credential is added as defence in depth; until then the residual risk is disclosed as R6 and must appear in submission materials, not be omitted. |
| 7 | Unsupported prior-art and SGQR claims | Bounded search: one public repository reviewed on 2026-10-07; no primary SGQR scheme specification; the "99% of payers" figure is a third-party market claim. | **Resolved by relabeling.** `research.md` is amended in this gate so the agent-surface gap reads as a **[hypothesis]** from a named bounded search rather than an established fact, and the SGQR parser contract returns unrecognized tags explicitly instead of dropping or guessing them. No uniqueness or decode-accuracy claim survives into submission material without a primary source. |
| 8 | Inconsistent timing definitions | Design gap, no external dependency. | **Resolved** by [Named clocks](#named-clocks): one name per clock, its start event, duration, enforcer and expiry consequence. Every other document must use these names. Expiry of any clock is never evidence that a dispatched payment failed, and no clock guarantees physical erasure. |

## Provisioned state discovered during this gate

Planning documents said nothing was provisioned. That is now false, and this gate records the actual state instead of the assumption. While Gate 3 preparation ran, a concurrent session provisioned Neon at the user's direction and left its files untracked in this shared worktree; the user later instructed that they be committed, and they are now tracked in commit `f8caf7d`. **No secret value was read into this document, and none may be committed.** `git status` confirms `.env.local` and `.neon` are matched by `.gitignore` (`.env`, `.env.*`, `.neon`, `node_modules/`) and are in no commit.

| Fact | Value | Consequence |
| --- | --- | --- |
| Neon project | `holy-boat-19447545` (Envoi), org `org-wispy-flower-08821549` | The free-tier database now exists, so the Gate 2 falsifier "free capacity is unavailable" is partly discharged for Neon only. Remaining quota is still **[unknown]** until read from the console. |
| Branch | `production` (`br-fancy-sea-b4xb78sw`) | One branch of the Free plan's 10-branch limit is used. Migrations will run against this branch; there is no separate test branch yet. |
| Region | `aws-us-east-2` | **[verified]** not Singapore. Gate 2 left co-location unverified; it is now known to be US East. Buyers and merchants in Singapore pay trans-Pacific latency on every query, on top of the Render cold start, inside the approved three-minute metric. Residual risk R12. |
| Postgres and Neon Auth | enabled on the branch before `neon deploy` | `neon.ts` declares `auth: true`, which is **Neon Managed Better Auth**, a platform-operated auth service. |
| Installed packages | `@neon/config` 1.8.4, `@neon/env` 1.5.1 in `package.json`, plus `package-lock.json` and `node_modules/` | These are provisioning tooling only. No application, framework or test dependency is installed. The pins in this document are additive. |
| Render | not provisioned | Application hosting remains unproven; the approved host is still Render Free. |

### Discrepancy resolved by user decision: in-app auth wins

Approved Gate 2 states Better Auth is *"a library in our app, not another hosted service"*, with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as our configuration. The provisioned `neon.ts` sets `auth: true`, which is the opposite: auth operated by Neon.

**Decision, 2026-10-07: the user chose Option A, in-app Better Auth.** Gate 2 is not reopened; the approved auth decision stands. The conflict is not cosmetic, which is why it was escalated rather than resolved silently: the finding 5 resolution depends on a specific library knob, `disableDeleteAnonymousUser: true`, plus an `onLinkAccount` hook that creates no membership. Whether Neon Managed Better Auth exposes the anonymous plugin, that flag or that hook is **[unknown]**, and if it does not, receipt ownership cannot be guaranteed as promised here. Whether managed auth is available on the Free plan is also **[unknown]**, and the commented-out AI Gateway line in `neon.ts` (*"Upgrade to a paid plan"*) shows some Neon features are not.

| Option | What it means | Outcome |
| --- | --- | --- |
| **A: in-app Better Auth** | `better-auth@1.7.7` with the Drizzle adapter, exactly as designed here. | **Selected by the user, 2026-10-07.** We own session storage, the secret, the migration and the finding 5 knobs. No Gate 2 reopening. |
| B: Neon Managed Better Auth | Keep `auth: true` and delegate sessions to the platform. | Rejected. Would have reopened Gate 2 and required proving free-plan access and the anonymous-plugin surface first. |

**Follow-up action, executed 2026-10-07 under a separate user authorization.** The user authorized flipping the flag, redeploying and then inspecting the database read-only. `neon.ts` is now `auth: false` with a short explaining comment. `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, and `Utilized services: Postgres`, while `neon neon-auth status` still reports the Auth service enabled. **The `auth` field is therefore not the on/off switch for the branch-level service**; its actual meaning is **[unknown]**.

The inspection then settled the question that mattered, and it removed the hazard rather than the service. A read-only session (`default_transaction_read_only=on`, confirmed in-session) found that **all nine Neon Auth tables live in a dedicated `neon_auth` schema** (`account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`) and that **`public` contains zero tables**. There is no collision with the Better Auth tables this design places in `public`. Managed auth stays enabled but inert and isolated, and **nothing was disabled**. The command that would remove it, `neon neon-auth disable`, was deliberately not run and is not authorized.

**Two containment rules become mandatory as a result.** Never build against or query the `neon_auth` schema, and pin Better Auth's Drizzle adapter explicitly to `public` so that no unqualified `user`, `session`, `account` or `verification` reference can resolve into the other schema through a search path. Whether the idle service costs anything on the Free plan is **[unknown]**.

The same discipline applies to region. **[verified]** The provisioned project is in `aws-us-east-2`, not Singapore. **Decision, 2026-10-07: the user accepts the region as is.** The honest form of that acceptance is a measurement, not an assumption: a named Slice 1 test measures a real Singapore cold first visit and records the latency, and relocation is revisited only if the approved three-minute metric fails because of it. Relocating later is possible but costs more once the database holds real data, and recreating the project is a provisioning action that this gate does not authorize.

## Version pins

Versions below were read from the npm registry on 2026-10-07 with `npm view <pkg> version`. **No package was installed and no lockfile was created.** Compatibility between these majors is **[unknown]** until the Slice 1 boot check runs.

| Package | Proposed pin | Role |
| --- | --- | --- |
| `next` | `16.4.0` | App Router, Node runtime on Render Free |
| `react`, `react-dom` | `19.3.0` | UI |
| `typescript` | `7.0.2` | Type checking; also builds the maintenance runner |
| `drizzle-orm` | `0.45.3` | Queries and row types |
| `drizzle-kit` | `0.31.11` | Migration generation |
| `postgres` | `3.4.9` | postgres.js driver, pooled for web and direct for maintenance/migrations |
| `better-auth` | `1.7.7` | Sessions, anonymous buyers, allowlisted merchant accounts |
| `zod` | `4.6.5` | Every boundary schema: env, request bodies, provider payloads |
| `ai` | `7.0.130` | Vercel AI SDK structured suggestions |
| `@ai-sdk/openai` | `4.0.86` | Single configured provider; exact model from `AI_MODEL` |
| `@modelcontextprotocol/sdk` | `1.32.1` | Streamable HTTP `/mcp` |
| `barcode-detector` | `3.2.2` | Browser camera/paste QR decode with a wasm fallback |
| `sharp` | `0.35.5` | Server-side image decode, normalization and metadata stripping |
| `vitest`, `@vitest/coverage-v8` | `5.0.3` | Unit and integration tests |
| `@playwright/test` | `1.63.0` | Browser journey tests at 390px and 1280px |
| `tailwindcss` | `4.3.3` | Styling |
| `eslint` | `10.12.0` | Lint |
| `tsx` | `4.23.15` | Local maintenance runs only; CI uses the compiled build |

**Boot gate (Slice 1 falsifier):** if `better-auth@1.7.7`, `drizzle-orm@0.45.3` or `drizzle-kit@0.31.11` do not work against `next@16.4.0` / `typescript@7.0.2`, downgrade to the newest mutually supported majors and record the resolved set here. Do not patch around an incompatible auth library; a session bug is a receipt-ownership bug.

`pg_advisory_lock`, prepared statements, `LISTEN/NOTIFY` and temporary tables are unsafe through transaction pooling, so leases use row-level `UPDATE ... WHERE ... RETURNING` and migrations plus any session-state work use `MIGRATION_DATABASE_URL`/`MAINTENANCE_DATABASE_URL` (direct). **[vendor claim]** Neon documents pooled versus direct differences; **[unknown]** for this account.

## Files

Four files already exist from the concurrent provisioning session: `.gitignore`, `neon.ts`, `package.json` and `package-lock.json`, plus `node_modules/` and the ignored `.env.local` and `.neon`. Everything else below is proposed and does not exist. `docs/plans/PAYPAL_PLAN.md` and the six mockups are preserved untouched. The provisioning files belong to that session and are **not** staged, moved or edited by this gate; `neon.ts` in particular carries the unresolved R11 discrepancy and must not be silently flipped.

### Repository root

| Path | Why it lives there |
| --- | --- |
| `package.json` | **Exists and tracked.** Currently holds only `@neon/config` and `@neon/env`. Grows the app scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `runner:build`, `runner:start`. |
| `package-lock.json` | **Exists and tracked** from provisioning. Extends as the app pins are installed; the resolved versions then become the authoritative record against the pins above. |
| `.gitignore` | **Exists and tracked.** Covers `.env`, `.env.*`, `.neon`, `node_modules/`, plus build output and test artifacts: `.next/`, `dist/`, `.maintenance-build/`, `coverage/`, `playwright-report/`, `test-results/`, `.vitest/`, `*.tsbuildinfo`. The earlier gap is closed. |
| `neon.ts` | **Exists and tracked** at `auth: false`, committed in `f8caf7d`. Verified not to control the branch-level Auth service, which remains enabled in its own `neon_auth` schema. |
| `neondb` schema state | **Verified 2026-10-07 by read-only inspection:** `public` contains zero tables; all nine Neon Auth tables sit in `neon_auth`. Better Auth must be pinned to `public`. |
| `tsconfig.json` | Next.js web config, `strict`, no `any` at boundaries. |
| `tsconfig.runner.json` | Separate NodeNext build of the maintenance entrypoint only, so CI can prove what maintenance can reach. |
| `drizzle.config.ts` | Migration generation against `MIGRATION_DATABASE_URL`. |
| `next.config.ts` | Node runtime, image optimizer disabled for the capability route, security headers, no-referrer on approval pages. |
| `render.yaml` | Proposed Render Free web service. Not applied; provisioning is not authorized. |
| `vitest.config.ts`, `playwright.config.ts` | Test runners. |
| `.github/workflows/ci.yml` | Typecheck, lint, unit and integration tests on push. |
| `.github/workflows/maintenance.yml` | Proposed hourly runner. **Creation is not authorized by this gate.** |
| `.env.example` | Names only, never values. Must equal the union of names in `src/env.ts`. Must not duplicate the real `.env.local`, which stays ignored. |

### Configuration, libraries and guards

| Path | Why it lives there |
| --- | --- |
| `src/env.ts` | Single Zod-parsed view of `process.env`; boot fails on a missing or live-environment value. Every other module imports config from here only. |
| `src/lib/db/schema.ts` | All Drizzle tables in one place so constraints are reviewable together. |
| `src/lib/db/web.ts`, `src/lib/db/runner.ts`, `src/lib/db/migrate.ts` | Three least-privileged connection factories with different roles. |
| `src/lib/auth.ts` | Better Auth instance: Drizzle adapter, anonymous plugin with `disableDeleteAnonymousUser: true`, `onLinkAccount` refusing membership creation, public signup disabled. |
| `src/lib/auth-context.ts` | Every principal guard. No route performs its own session logic. |
| `src/lib/errors.ts` | `AppError` union and the only mapping to HTTP status. |
| `src/lib/http/respond.ts` | JSON envelope, cache headers, `no-store` for capability responses. |
| `src/lib/ids.ts` | Identifiers and 256-bit capability tokens, plus hashing for storage. |
| `src/lib/money.ts` | Integer minor-unit SGD arithmetic. No float path exists. |
| `src/lib/time.ts` | The named clocks and an injectable `now` for deterministic tests. |
| `src/lib/log.ts` | Redacting logger: QR payloads, bearer values, capability URLs, prompts and privileged provider bodies never reach a sink. |
| `src/lib/ratelimit.ts` | Database-backed limiter for public and capability routes. |

### Domain modules (no HTTP, no provider SDK)

| Path | Why it lives there |
| --- | --- |
| `src/domain/outlets/types.ts`, `search.ts`, `publish.ts` | Published-outlet reads and the publication precondition transaction. |
| `src/domain/sgqr/decode.ts`, `validate.ts` | EMVCo TLV decode into recognized/unrecognized tags, then allowlisted identifier resolution to zero, one or many outlets. |
| `src/domain/menu/types.ts`, `draft.ts`, `confirm.ts` | Revision/item completeness, non-clobbering suggestion merge, confirmation and invalidation. |
| `src/domain/imports/types.ts`, `admission.ts`, `lifecycle.ts`, `validate-result.ts` | Capacity admission, accept/dispatch/close/expire with transactional source deletion, and Zapier result bounds. |
| `src/domain/purchases/checkout-key.ts`, `price.ts`, `review.ts`, `state.ts`, `reconcile.ts` | Logical checkout identity, server pricing, review creation/replacement, the transition table and provider-read decisions. |
| `src/domain/payments/attempts.ts`, `state.ts` | One active attempt per purchase, operation keys, dispatch legality, attempt lifecycle. |
| `src/domain/suggestions/types.ts`, `suggest.ts` | AI tool schemas and bounded suggestion results. |
| `src/domain/handoffs/types.ts`, `redeem.ts` | Agent purchase-request tokens and single redemption. |
| `src/domain/maintenance/due.ts`, `tasks.ts` | Due-work claiming with leases and the exhaustive finite task list. |
| `src/domain/audit/events.ts` | Append-only audit writes performed inside the business transaction. |

### Integrations (only modules allowed to touch an external SDK or HTTP client)

| Path | Why it lives there |
| --- | --- |
| `src/integrations/paypal/client.ts` | OAuth token, host allowlist from config, request-id injection, timeout and retry classification. |
| `src/integrations/paypal/orders.ts` | Write client: create, read, capture. |
| `src/integrations/paypal/orders-read.ts` | Read-only client type consumed by maintenance. |
| `src/integrations/paypal/verify.ts` | Webhook signature verification and event dedupe. |
| `src/integrations/paypal/map.ts` | Provider payload to domain evidence, with explicit mismatch reasons. |
| `src/integrations/zapier/dispatch.ts` | Catch-hook dispatch with identity persisted before send. |
| `src/integrations/ai/openai.ts` | AI SDK provider, model, tool budget and structured-output schema. |

### HTTP surface

| Path | Purpose |
| --- | --- |
| `src/app/api/auth/[...all]/route.ts` | Better Auth routes, outside `/api/v1`. |
| `src/app/api/v1/outlets/route.ts`, `outlets/[id]/menu/route.ts` | Public paginated reads. |
| `src/app/api/v1/outlets/resolve-sgqr/route.ts` | Bounded QR payload to zero, one or many outlets. |
| `src/app/api/v1/buyer/suggestions/route.ts` | Buyer-session text suggestion. |
| `src/app/api/v1/purchases/route.ts`, `purchases/[id]/route.ts` | Create a review; owning-session or merchant read. |
| `src/app/api/v1/purchases/[id]/paypal/start/route.ts`, `paypal/complete/route.ts` | Execution and post-approval completion. |
| `src/app/api/v1/purchases/[id]/cancel/route.ts`, `reconcile/route.ts` | Close an unexecuted review; request a bounded provider read. |
| `src/app/api/v1/merchant/outlets/route.ts`, `merchant/outlets/[id]/route.ts` | Create and edit an unpublished outlet. |
| `src/app/api/v1/merchant/outlets/[id]/destinations/paypal/route.ts` | Select an operator-prepared connection. |
| `src/app/api/v1/merchant/outlets/[id]/menu-imports/route.ts`, `merchant/menu-imports/[id]/route.ts`, `merchant/menu-imports/[id]/cancel/route.ts` | Import create, status and cancel. |
| `src/app/api/v1/merchant/outlets/[id]/menu-draft/route.ts`, `confirm/route.ts`, `publish/route.ts` | Manual correction with revision conflict checks, confirmation, publication. |
| `src/app/api/v1/merchant/outlets/[id]/orders/route.ts`, `merchant/orders/[id]/acknowledge/route.ts` | Membership-scoped orders and separate acknowledgment. |
| `src/app/api/v1/purchase-requests/route.ts`, `purchase-requests/redeem/route.ts` | Agent request and single redemption. |
| `src/app/api/v1/imports/[id]/image/route.ts` | Capability image proxy. Read-only deadline decision, `no-store`. |
| `src/app/api/v1/integrations/zapier/menu-results/route.ts` | Per-import bearer result callback. |
| `src/app/api/v1/integrations/paypal/webhook/route.ts` | Verified, deduplicated event inbox. |
| `src/app/api/v1/health/route.ts`, `health/operator/route.ts` | Public readiness; operator view of heartbeat, overdue work and capacity. Refines Gate 2's single `GET /health`. |
| `src/app/mcp/route.ts` | Streamable HTTP MCP, `POST` only, three scoped tools. |
| `src/app/buy/page.tsx`, `review/[purchaseId]/page.tsx`, `receipt/[purchaseId]/page.tsx` | Buyer screens. |
| `src/app/merchant/setup/page.tsx`, `merchant/orders/page.tsx` | Merchant screens. |
| `src/app/approve/[handoffToken]/page.tsx` | Agent handoff landing. |
| `src/app/paypal/return/page.tsx`, `paypal/cancel/page.tsx` | Landing pages that read persisted state only; no capture from a `GET`. |

### Maintenance and tests

| Path | Why it lives there |
| --- | --- |
| `src/maintenance/run.ts` | Entrypoint: heartbeat, claim leases, run tasks in fixed order, write a report, exit non-zero on operator-visible failure. |
| `tests/unit/**`, `tests/integration/**`, `tests/e2e/**` | Named tests from the test plan. |
| `tests/fixtures/**` | Visibly labeled demo fixtures; every fixture response and screenshot carries its label. |

## Types and signatures

Declarations only. No bodies.

### Errors and money

```ts
export type ErrorCode =
  | "validation_failed" | "unauthorized" | "forbidden_membership" | "not_found"
  | "review_expired" | "review_invalidated" | "checkout_conflict" | "revision_conflict"
  | "execution_locked" | "capture_already_dispatched" | "payment_uncertain"
  | "import_closed" | "import_expired" | "import_base_revision_changed"
  | "admission_rejected" | "capacity_pressure" | "maintenance_stale"
  | "provider_unreachable" | "provider_mismatch" | "rate_limited";

export type AppError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  operatorVisible: boolean;
  details?: Record<string, string | number | boolean>;
};

export function httpOk<T>(body: T, init?: ResponseInit): Response;
export function httpErr(err: AppError): Response;

export type SgdCents = number & { readonly __brand: "SgdCents" };
export function sgdFromCents(cents: number): SgdCents;
export function sgdFromDecimalString(value: string): SgdCents | null;
export function multiplySgd(unit: SgdCents, quantity: number): SgdCents;
export function sumSgd(values: readonly SgdCents[]): SgdCents;
export function formatSgd(value: SgdCents): string;
```

`sgdFromDecimalString` returns `null` for an unreadable or ambiguous price. It never returns `0` for unknown.

### Clocks

```ts
export type ClockName =
  | "T_REVIEW" | "T_IMAGE_ACCESS" | "T_SOURCE_SWEEP" | "T_HANDOFF"
  | "T_LEASE" | "T_MAINT_RUN" | "T_MAINT_INTERVAL" | "T_MAINT_OVERDUE"
  | "T_AI_BUDGET" | "T_PROVIDER_READ_DEBOUNCE";

export function deadlineOf(clock: ClockName, startedAt: Date): Date;
export function isExpired(clock: ClockName, startedAt: Date, now: Date): boolean;
export function remainingMs(clock: ClockName, startedAt: Date, now: Date): number;
export type Now = () => Date;
```

`T_DB_IDLE` and `T_RENDER_IDLE` are provider-controlled and deliberately **not** in `ClockName`: no application code may depend on or reset them.

### SGQR

```ts
export type TlvTag = { tagId: string; length: number; value: string };

export type SgqrDecode =
  | { kind: "not_emvco" }
  | { kind: "decoded"; recognized: SgqrField[]; unrecognized: TlvTag[]; checksumValid: boolean };

export type SupportedScheme = "paynow_uen" | "paynow_proxy";
export type SgqrField = { scheme: SupportedScheme; identifier: string; label: string };

export function decodeEmvcoTlv(payload: string): SgqrDecode;

export type SgqrResolution =
  | { kind: "no_match" }
  | { kind: "single"; outlet: PublishedOutletSummary }
  | { kind: "ambiguous"; candidates: OutletDistinguisher[] }
  | { kind: "unsupported_payload"; unrecognizedCount: number };

export function resolveSgqr(db: Db, decoded: SgqrDecode): Promise<SgqrResolution>;
```

`decodeEmvcoTlv` never invents a field, never drops an unrecognized tag silently, and its input is never logged or persisted. A resolution is identity only: no destination, no rail and no enrollment can be derived from it.

### Menu and imports

```ts
export type MenuItemDraft = {
  id: string;
  name: string;
  portion: string | null;
  priceSgdCents: SgdCents | null;
  availability: "available" | "unavailable" | "unknown";
  source: "merchant" | "import_suggestion";
};

export type MenuCompleteness =
  | { complete: true; itemCount: number }
  | { complete: false; incompleteItemIds: string[]; reason: "missing_price" | "missing_name" | "missing_availability" };

export function assessMenuCompleteness(items: readonly MenuItemDraft[]): MenuCompleteness;

export type DraftMerge =
  | { applied: true; addedItemIds: string[]; preservedMerchantEditIds: string[] }
  | { applied: false; reason: "base_revision_changed" | "confirmed_revision" };

export function mergeImportSuggestions(
  current: readonly MenuItemDraft[],
  suggestions: readonly DraftItemSuggestion[],
  baseRevisionId: string,
  currentRevisionId: string,
): DraftMerge;

export type AdmissionRejection =
  | "too_large" | "unsupported_type" | "pixel_limit" | "decode_failed"
  | "open_import_exists" | "live_source_cap" | "churn_cap"
  | "maintenance_stale" | "storage_pressure";

export type ImageAdmission =
  | { ok: true; importId: string; sourceId: string }
  | { ok: false; reason: AdmissionRejection };

export function admitMenuImage(db: Db, input: {
  outletId: string;
  actorUserId: string;
  consentVersion: string;
  bytes: Uint8Array;
  declaredContentType: string;
  baseRevisionId: string;
  now: Date;
}): Promise<ImageAdmission>;

export type DraftItemSuggestion = {
  name: string;
  portion: string | null;
  priceSgdCents: SgdCents | null;
  priceBasis: "explicit" | "ambiguous" | "blank";
};

export type ZapierResultValidation =
  | { ok: true; items: DraftItemSuggestion[]; fingerprint: string }
  | { ok: false; reason: "malformed" | "empty" | "oversize" | "too_many_rows" | "currency_unsupported" | "duplicate_variant" };

export function validateZapierResult(raw: unknown): ZapierResultValidation;

export type ImportClosure = "completed" | "failed" | "canceled" | "expired";
export function closeImport(db: Db, importId: string, closure: ImportClosure): Promise<{
  closed: boolean;
  sourceDeleted: boolean;
  sourceDeleteBlockedReason?: "storage_exhausted" | "already_deleted";
}>;
```

`closeImport` returns `sourceDeleted: false` with a reason instead of throwing when the delete is blocked. Access is already closed by the read-path deadline before this runs.

### Checkout identity

```ts
export type RailId = "paypal" | "pyusd";
export type PurchaseLine = { menuItemId: string; quantity: number };

export type CheckoutKeyInput = {
  buyerUserId: string;
  outletId: string;
  menuRevisionId: string;
  destinationId: string;
  rail: RailId;
  currency: "SGD";
  lines: readonly PurchaseLine[];
};

export type CheckoutKey = string & { readonly __brand: "CheckoutKey" };
export function computeCheckoutKey(input: CheckoutKeyInput): CheckoutKey;
```

`computeCheckoutKey` sorts lines by `menuItemId`, rejects a quantity outside `1..20`, and hashes the canonical JSON with SHA-256. Two requests that differ in any priced or routed input produce different keys, which is the point: a changed menu revision is a different checkout, never a mutated one.

### Purchases, attempts and provider decisions

```ts
export type PurchaseState =
  | "review_open" | "review_expired" | "review_invalidated" | "superseded"
  | "pending_payment" | "paid" | "unpaid_closed" | "uncertain";

export type AttemptState =
  | "created" | "order_created" | "externally_approved"
  | "capture_dispatched" | "capture_confirmed" | "capture_failed"
  | "create_unknown" | "capture_unknown" | "abandoned";

export type PurchaseTransition = { from: PurchaseState; to: PurchaseState; reason: string };
export function canTransitionPurchase(t: PurchaseTransition): boolean;
export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean;

export type PricedLine = { menuItemId: string; name: string; quantity: number; unitSgdCents: SgdCents; lineSgdCents: SgdCents };

export type CostProvenance = {
  payerFee: { amountSgdCents: SgdCents | null; payer: "buyer" | "merchant" | "unknown"; basis: string; quotedAt: Date | null };
  merchantFee: { amountSgdCents: SgdCents | null; basis: string };
  fx: { known: false };
};

export type PriceQuote =
  | { ok: true; lines: PricedLine[]; totalSgdCents: SgdCents; currency: "SGD"; menuRevisionId: string; destinationId: string; provenance: CostProvenance; pricedAt: Date }
  | { ok: false; error: AppError };

export function priceBasket(db: Db, input: {
  outletId: string;
  lines: readonly PurchaseLine[];
  rail: RailId;
  now: Date;
}): Promise<PriceQuote>;

export type ReviewCreation =
  | { kind: "created"; purchaseId: string; expiresAt: Date }
  | { kind: "existing_open_review"; purchaseId: string; expiresAt: Date }
  | { kind: "conflict"; error: AppError };

export function createReview(db: Db, principal: BuyerPrincipal, quote: PriceQuote & { ok: true }, now: Date): Promise<ReviewCreation>;

export type PaymentEligibility =
  | { eligible: true; purchaseId: string; attemptId: string }
  | { eligible: false; error: AppError };

export function assertPaymentEligible(db: Db, purchaseId: string, principal: BuyerPrincipal, now: Date): Promise<PaymentEligibility>;

export type ExpectedPurchase = {
  purchaseId: string;
  outletId: string;
  payeeId: string;
  totalSgdCents: SgdCents;
  currency: "SGD";
  lines: readonly PricedLine[];
  correlationId: string;
};

export type CaptureDecision =
  | { decision: "confirmed"; evidence: CaptureEvidence }
  | { decision: "uncertain"; reason: "missing_capture_id" | "amount_mismatch" | "payee_mismatch" | "currency_mismatch" | "basket_mismatch" | "status_not_complete" }
  | { decision: "failed"; reason: string };

export type CaptureEvidence = {
  orderId: string;
  captureId: string;
  grossSgdCents: SgdCents;
  currency: "SGD";
  payeeId: string;
  verifiedAt: Date;
};

export function decideCaptureOutcome(order: PayPalOrder, expected: ExpectedPurchase): CaptureDecision;
export function decideCreateRecovery(attempt: PaymentAttemptRow, now: Date): "replay_same_key" | "safe_to_recreate" | "block_uncertain";
```

`decideCreateRecovery` encodes the argument that makes a lost create safe: capture requires an order id Envoi never received, and the buyer never received an approval link, so no external effect is possible. It returns `safe_to_recreate` only when the attempt has never held an order id.

### PayPal clients

```ts
export type PayPalWriteClient = {
  createOrder(input: CreateOrderInput, requestId: string): Promise<ProviderResult<CreatedOrder>>;
  readOrder(orderId: string): Promise<ProviderResult<PayPalOrder>>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderResult<CapturedOrder>>;
};

export type PayPalReadClient = Pick<PayPalWriteClient, "readOrder">;

export function createPayPalWriteClient(cfg: PayPalConfig): PayPalWriteClient;
export function createPayPalReadClient(cfg: PayPalConfig): PayPalReadClient;

export type ProviderResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "http_error"; status: number; retryable: boolean }
  | { kind: "network_error"; retryable: true }
  | { kind: "timeout"; responseReceived: false };

export function verifyPayPalWebhookEvent(cfg: PayPalConfig, req: Request): Promise<
  { verified: true; eventId: string; resourceType: string; knownOrderId: string | null } | { verified: false; reason: string }
>;
```

`PayPalReadClient` is a distinct exported type, not a runtime flag. Maintenance code cannot call `captureOrder` without changing an import that a CI test detects.

### Suggestions and handoffs

```ts
export type SuggestionRequest = { text: string; area?: string };

export type Suggestion =
  | { kind: "outlets"; matches: PublishedOutletSummary[] }
  | { kind: "items"; outletId: string; matches: PublishedItemSummary[] }
  | { kind: "clarification"; question: string; missing: ("area" | "item" | "outlet")[] }
  | { kind: "no_match" }
  | { kind: "budget_exceeded" };

export function suggestFromText(db: Db, principal: BuyerPrincipal, req: SuggestionRequest, now: Date): Promise<Suggestion>;
```

Tools exposed to the model are read-only: `search_outlets`, `get_published_menu`, `list_item_names`. At most three tool calls, `T_AI_BUDGET` of 30 seconds, and no tool returns a price that the purchase path will trust. Pricing always re-reads the confirmed revision server-side.

```ts
export type HandoffCreation = { handoffToken: string; url: string; expiresAt: Date };
export function createPurchaseRequest(db: Db, agent: AgentPrincipal, input: SuggestionRequest & { lines?: PurchaseLine[] }): Promise<HandoffCreation>;

export type HandoffRedemption =
  | { kind: "redeemed"; purchaseId: string }
  | { kind: "expired" } | { kind: "already_redeemed" } | { kind: "invalid" };
export function redeemPurchaseRequest(db: Db, principal: BuyerPrincipal, token: string, now: Date): Promise<HandoffRedemption>;
```

Redemption creates a fresh server-priced review. It never carries an amount from the agent.

### Maintenance

```ts
export type TaskName =
  | "heartbeat" | "record_capacity" | "expire_imports" | "sweep_sources"
  | "reconcile_attempts" | "close_expired_reviews" | "purge_expired_sessions";

export type ClaimedWork = { id: string; kind: TaskName; dueAt: Date };

export type TaskOutcome =
  | { status: "ok"; processed: number }
  | { status: "partial"; processed: number; blockedReason: string }
  | { status: "failed"; reason: string; operatorVisible: true };

export type MaintenanceTask = {
  name: TaskName;
  timeoutMs: number;
  claim(db: Db, now: Date, limit: number): Promise<ClaimedWork[]>;
  run(db: Db, work: ClaimedWork, deps: MaintenanceDeps): Promise<TaskOutcome>;
};

export type MaintenanceDeps = { paypal: PayPalReadClient; now: Now; log: RedactingLogger };
export const MAINTENANCE_TASKS: readonly MaintenanceTask[];
export async function runMaintenance(deps: MaintenanceDeps): Promise<MaintenanceReport>;
```

`MaintenanceDeps` has no write client. That is the whole enforcement argument for finding 6, and `MAINTENANCE_TASKS` is exhaustive: adding a task requires editing this file, which the review diff makes visible.

## Named clocks

One name per clock. Every other document must use these names.

| Clock | Starts at | Duration | Enforced by | On expiry |
| --- | --- | --- | --- | --- |
| `T_REVIEW` | review creation | 5 minutes | read, `paypal/start`, `paypal/complete` | purchase becomes `review_expired`. Not proof a dispatched payment failed. |
| `T_IMAGE_ACCESS` | import acceptance | 5 minutes | image proxy and result route, **read-only check** | fetch and result denied even if no job ran and even if writes are blocked |
| `T_SOURCE_SWEEP` | import deadline | 0 to 60 minutes late | maintenance `sweep_sources` | overdue sources block new imports at `T_MAINT_OVERDUE` |
| `T_MAINT_OVERDUE` | last successful heartbeat | 90 minutes | import admission gate | new imports refused; operator alert |
| `T_MAINT_INTERVAL` | schedule | hourly at minute 17, every 6 hours before quota confirmation | GitHub Actions | best effort; schedules can be delayed or dropped |
| `T_MAINT_RUN` | job start | 2 minutes | Actions `timeout-minutes` | job killed; leases expire and are reclaimable |
| `T_LEASE` | work claim | 5 minutes | due-work queries | another runner may claim; no duplicate external effect because maintenance performs none |
| `T_HANDOFF` | agent request creation | 10 minutes | redeem route | token unusable; a new request is required |
| `T_AI_BUDGET` | suggestion request start | 30 seconds | AI adapter | `budget_exceeded`; manual selection offered |
| `T_PROVIDER_READ_DEBOUNCE` | last provider read | 30 seconds | status and reconcile routes | stored state returned without a new provider call |

Two rules apply to every clock. Expiry is never evidence about an external effect that may already have happened. No clock promises physical erasure.

## State transitions

### Purchase

```
review_open -> review_expired          (T_REVIEW, no attempt ever dispatched)
review_open -> review_invalidated      (published revision or destination changed)
review_open -> superseded              (a new review for the same CheckoutKey replaced it)
review_open -> pending_payment         (paypal/start created an attempt)
pending_payment -> paid                (decideCaptureOutcome = confirmed)
pending_payment -> uncertain           (capture_dispatched with unknown or mismatched outcome)
pending_payment -> unpaid_closed       (cancel with no dispatched capture, or verified failed/canceled)
uncertain -> paid                      (a later provider read confirms the same capture)
uncertain -> unpaid_closed             (a later provider read establishes a verified non-payment)
paid -> paid                           (terminal; a refund/dispute adds separate status, never rewrites this)
```

Illegal and rejected by `canTransitionPurchase`: any transition out of `paid` to an unpaid state; any transition into `paid` that is not sourced from `decideCaptureOutcome = confirmed`; `review_expired -> pending_payment`; `superseded -> anything`.

### Payment attempt

```
created -> order_created               (create response held an order id)
created -> create_unknown              (create dispatched, response lost)
create_unknown -> order_created        (same-key replay returned the prior result)
create_unknown -> abandoned            (replay confirms nothing landed; safe_to_recreate)
order_created -> externally_approved   (provider read shows buyer approval)
order_created -> abandoned             (T_REVIEW expiry with no approval; no external effect)
externally_approved -> capture_dispatched  (lease held, capture request id persisted first)
capture_dispatched -> capture_confirmed
capture_dispatched -> capture_unknown
capture_unknown -> capture_confirmed   (same-key replay or provider read)
capture_unknown -> capture_failed      (provider read establishes a verified failure)
externally_approved -> capture_failed
```

`capture_unknown` never transitions to `abandoned` and never permits a new capture request id. That is the single most important illegal transition in the system.

### Menu import

```
accepted -> dispatched -> completed
accepted | dispatched -> failed
accepted | dispatched -> canceled
accepted | dispatched -> expired        (T_IMAGE_ACCESS)
completed | failed | canceled | expired -> source_deleted
completed | failed | canceled | expired -> source_delete_blocked   (storage exhausted; operator runbook)
```

A late result for `expired`, `canceled` or a changed base revision is rejected with `import_expired`, `import_closed` or `import_base_revision_changed`. There is no automatic re-analysis path.

## Authorization

| Principal | Obtained by | May | May never |
| --- | --- | --- | --- |
| `anonymous` (buyer) | Better Auth anonymous sign-in, HttpOnly cookie | read published outlets/menus, create and own reviews, start and complete their own payment, read their own receipt | any merchant route; read another buyer's purchase; supply a price, payee or rail |
| `merchant` | permanent pre-provisioned account **plus** an operator-approved `merchant_memberships` row for that outlet | edit their outlet, upload images, correct and confirm a menu, publish when preconditions hold, view and acknowledge their orders | act on an outlet without a membership row; approve their own enrollment; connect an arbitrary pasted merchant id |
| `operator` | allowlisted flag on a permanent account | approve enrollments, prepare destination connections, read the operator health view | capture or create a payment on a buyer's behalf |
| `capability:import-image` | 256-bit token in the query string, stored hashed | `GET` the bytes of exactly one import while `T_IMAGE_ACCESS` is open | enumerate imports; extend the deadline; reach any other route; be treated as a session |
| `capability:import-result` | 256-bit bearer header, stored hashed | `POST` one bounded draft result for exactly one active import | publish, confirm, overwrite merchant edits, reach payment routes |
| `agent-token` | out-of-band scoped demo token, stored hashed | `search_outlets`, `get_menu`, `create_purchase_request` over MCP | capture, transfer, menu writes, receipt reads, private registry data |
| `maintenance` | Actions secret `MAINTENANCE_DATABASE_URL` plus read-only provider config | claim due work, read provider orders, delete overdue source rows, write heartbeat and audit | create or capture an order, re-analyze an image, replace a payment, migrate, keep the app awake |

Two rules make this table enforceable rather than descriptive. Every route begins with exactly one `require*` guard from `src/lib/auth-context.ts`, and a route that needs two principals does not exist. Guest-to-merchant escalation is blocked at two layers: `onLinkAccount` creates no membership, and `requireOutletMembership` reads the membership row rather than any property of the user record.

The capability principal is intentionally session-free, and that is the answer to finding 4: the provider fetches the image without a browser, so a session requirement would make the integration impossible. The compensating controls are the token's entropy, single-import scope, hashed storage, read-only deadline enforcement, `Cache-Control: private, no-store`, no ETag, no redirect, no-referrer, log redaction of the whole URL and a per-import fetch rate limit.

## Call stacks

### Buyer text purchase to confirmed receipt

```
POST /api/v1/buyer/suggestions
  requireBuyerSession -> suggestFromText -> ai/openai.suggest (T_AI_BUDGET, <=3 read tools)
    -> outlets.search -> menu.publishedItems -> Suggestion

POST /api/v1/purchases
  requireBuyerSession -> priceBasket (reads the confirmed revision, never client prices)
    -> computeCheckoutKey -> createReview
      -> INSERT purchases ON CONFLICT (buyer, checkout_key) WHERE review_open -> existing_open_review
      -> audit_events in the same transaction

POST /api/v1/purchases/{id}/paypal/start
  requireBuyerSession -> SELECT ... FOR UPDATE purchases
    -> assertPaymentEligible (owner, T_REVIEW, revision still published, destination still active)
    -> attempts.claimSlot (unique partial index: one non-terminal attempt per purchase)
    -> persist create_request_id
    -> paypal/orders.createOrder (host allowlist, payee from the destination row, amounts from the snapshot)
    -> attempt order_created | create_unknown
  returns the approval link; the human approves at PayPal

POST /api/v1/purchases/{id}/paypal/complete
  requireBuyerSession -> assertPaymentEligible (rechecks T_REVIEW and versions)
    -> paypal/orders.readOrder -> verify order id, status, payee, amount, currency, correlation
    -> mismatch => payment_uncertain, operator alert, stop
    -> acquire attempt lease -> persist capture_request_id -> capture_dispatched
    -> paypal/orders.captureOrder -> decideCaptureOutcome
      confirmed => purchase paid + CaptureEvidence
      uncertain => capture_unknown + purchase uncertain
GET /receipt/{purchaseId}  polls stored state only, at most every T_PROVIDER_READ_DEBOUNCE
POST /api/v1/integrations/paypal/webhook
  verifyPayPalWebhookEvent -> INSERT provider_events ON CONFLICT (event_id) DO NOTHING
    -> if new and the order is known: enqueue a due read. Event content alone never marks paid.
```

### Menu image import

```
POST /api/v1/merchant/outlets/{id}/menu-imports
  requireOutletMembership -> consent recorded -> sharp decode + normalize + strip metadata
    -> imports.admission (live cap, churn cap, open-import rule, maintenance heartbeat, storage pressure)
    -> BEGIN: INSERT menu_imports + menu_import_sources(bytea) + audit_events -> COMMIT
    -> zapier/dispatch (identity persisted before send) -> dispatched
      crash between COMMIT and dispatch => expires visibly; a fresh merchant attempt is required

GET /api/v1/imports/{id}/image?token=...
  requireImportImageCapability (hash lookup) -> read accepted_at and state
    -> isExpired("T_IMAGE_ACCESS") on a READ => 410
    -> stream bytes, no-store, no optimizer, no redirect, URL redacted from logs

POST /api/v1/integrations/zapier/menu-results
  requireZapierResultCapability -> isExpired -> validateZapierResult
    -> mergeImportSuggestions (base revision must match; merchant edits preserved)
    -> closeImport("completed") -> DELETE source row in the same transaction
       delete blocked => source_delete_blocked + operator alert, access already denied

PUT /api/v1/merchant/outlets/{id}/menu-draft
  requireOutletMembership -> revision conflict check -> upsert items -> confirmation invalidated

POST /api/v1/merchant/outlets/{id}/confirm -> assessMenuCompleteness -> record confirmed revision
POST /api/v1/merchant/outlets/{id}/publish
  requireOutletMembership -> BEGIN: recheck enrollment + outlet confirmation + menu confirmation
    + active accepted destination -> switch published pointer atomically -> audit -> COMMIT
```

### Buyer scan

```
browser: barcode-detector decodes locally, or paste supplies the payload
POST /api/v1/outlets/resolve-sgqr
  requireBuyerSession -> decodeEmvcoTlv -> resolveSgqr
    no_match        => "not on Envoi", offer text search. Never enrolls.
    ambiguous       => OutletDistinguisher list, buyer chooses one
    single          => PublishedOutletSummary, then the same purchase path as text
  raw payload is discarded after parsing and never logged
```

### Maintenance run

```
.github/workflows/maintenance.yml -> node .maintenance-build/src/maintenance/run.js
  connect MAINTENANCE_DATABASE_URL (direct) -> heartbeat
  -> record_capacity (pg_database_size plus Neon-reported usage where reachable)
  -> expire_imports -> sweep_sources -> reconcile_attempts (PayPalReadClient only)
  -> close_expired_reviews -> purge_expired_sessions
  -> write maintenance_runs report -> exit non-zero if any outcome is operator-visible
```

## Races

| Race | Contract |
| --- | --- |
| Two tabs create the same basket | Unique partial index on `(buyer_user_id, checkout_key) WHERE state = 'review_open'`. The loser receives `existing_open_review` with the same purchase id. No second review exists. |
| Double click on "continue to PayPal" | `SELECT ... FOR UPDATE` on the purchase plus a unique partial index on `payment_attempts(purchase_id) WHERE state NOT IN ('abandoned','capture_failed','capture_confirmed')`. Repeated clicks return the same attempt and the same approval link. |
| Lost create response | `decideCreateRecovery`. First replay the identical `PayPal-Request-Id`, because PayPal *"returns the latest status of the previous request that used that same header"*. Only if the attempt never held an order id is recreation safe, and it uses a new key. **[verified]** |
| Two concurrent requests with the same key | Forbidden. PayPal *"processes the first request and might fail the second request"*, so capture runs only for a lease holder. `T_LEASE` is 5 minutes and `T_MAINT_RUN` is 2, so a lease cannot outlive a killed job indefinitely. **[verified]** |
| Lost capture response | Persist `capture_dispatched` **before** the call. On loss, replay the same capture key from the lease holder. If still inconclusive: `capture_unknown`, purchase `uncertain`, operator alert. Never a new capture key, never a replacement payment, never a rail switch. |
| Cancel races capture | Cancel is legal only when no attempt is in `capture_dispatched` or later. Otherwise the response is `payment_uncertain` and the buyer sees "checking payment", not "canceled". |
| Menu published while a review is open | Reviews pin `menu_revision_id`. Eligibility re-reads the published pointer inside the execution transaction, so a stale review fails with `review_invalidated` at the moment it matters, not only when a job notices. |
| Destination disconnected mid-review | Same mechanism via the pinned `destination_id`. An already captured payment keeps its original evidence. |
| Duplicate or out-of-order webhook | Unique `provider_events(event_id)`; a duplicate inserts nothing and changes nothing. An unknown order is quarantined. No callback can downgrade `paid`. |
| Two maintenance runs overlap | Leases claimed with `UPDATE ... WHERE lease_expires_at < now() RETURNING`. Because maintenance performs no external write, an overlap costs work, not money. |
| Late Zapier result | Rejected by `T_IMAGE_ACCESS` and by the base-revision check. A confirmed menu is never overwritten by a callback. |
| Storage exhaustion during close | `closeImport` reports `source_delete_blocked` instead of failing the request. Access denial already happened on the read path, which needs no write. |

## Capacity budgets

All figures are **[hypothesis]** arithmetic over **[verified]** or **[vendor claim]** limits. None is a measured result.

| Quota | Documented limit | Envoi budget | Guard |
| --- | --- | --- | --- |
| GitHub Actions minutes (private repo) | **[verified]** 2,000/month; public standard runners free; usage blocked with no payment method on file | every 6 hours = about 180 runs = about 180 minutes = 9%. Move to hourly (about 720 minutes = 36%) only after remaining quota is confirmed or the repository is public, which the official rules require for submission anyway | no payment method on file, plus a $0 spending limit; the workflow is disabled until the cadence decision is recorded |
| Neon storage | **[verified]** 1 GB/project; history window 6 hours; inserts, updates and deletes fail at the limit | domain data 50 MB, live image bytes 100 MB, history churn 100 MB, audit and events 20 MB, reserved headroom 630 MB | admission refuses at 20 live sources **or** 100 MiB admitted in the rolling 6-hour window **or** measured usage above 70% |
| Neon compute | **[vendor claim]** 100 CU-hours/project/month; mandatory scale-to-zero after 5 minutes | 720 maintenance wakes at about 10 s each is about 2 wall-clock hours; buyer sessions budgeted at 200 sessions x 3 minutes is about 10 wall-clock hours | no polling loop anywhere; browser polling only while an attempt is non-terminal, at most every 2 s for at most 60 s per page view. **[unknown]** exact CU conversion; measure in Slice 1 |
| Neon transfer | **[vendor claim]** 5 GB/project/month | images are fetched at most once per import at 5 MiB or less; JSON polling dominates | negligible against quota; monitored by `record_capacity` |
| Render Free instance hours | **[vendor claim]** 750 shared/month; sleep after 15 minutes idle | 744 hours in a month, so exactly one always-listening free service | one web service only; a second free service would halve availability below the month |
| Cold start | **[vendor claim]** about a minute to wake | counted inside the approved three-minute buyer metric | a genuinely idle first visit is measured; no silent pre-warming |

`pg_database_size(current_database())` does not include Neon's history/instant-restore storage, so `record_capacity` records both that value and, where reachable, the provider-reported usage. If provider usage cannot be read programmatically, the operator reads the console weekly and the admission threshold stays at 70% of 1 GB. This limitation is stated rather than smoothed over.

## Test plan

Every test must be able to fail. Each guard gets its own mutation proof, because a fault caught by two tests proves nothing about either one.

### Pricing and checkout identity

| Test | Asserts | Mutation that proves it |
| --- | --- | --- |
| `prices come only from the confirmed revision` | a client-supplied price field is ignored and the server total is used | make `priceBasket` read a body field; test fails |
| `unknown price never becomes zero` | an item with `priceSgdCents: null` blocks review creation with `validation_failed` | default null to 0; test fails |
| `same basket twice returns the same review` | two concurrent creates yield one purchase id | drop the partial unique index; test fails |
| `a changed menu revision is a new checkout` | a different `menuRevisionId` produces a different `CheckoutKey` | remove the revision from the hash input; test fails |
| `replacement only from a terminal unpaid state` | replacing a `pending_payment` purchase is rejected with `execution_locked` | allow replacement from any state; test fails |

### Payment safety

| Test | Asserts | Mutation |
| --- | --- | --- |
| `capture requires an owned lease` | a second concurrent completion returns the in-flight state and issues no capture | remove the lease check; test fails |
| `lost create response replays the same key` | recovery issues an identical `PayPal-Request-Id`, not a new one | generate a fresh id; test fails |
| `create_unknown without an order id is recreatable` | `decideCreateRecovery` returns `safe_to_recreate` only when no order id was ever stored | return it unconditionally; test fails |
| `capture_unknown never becomes abandoned` | the transition is rejected | allow it; test fails |
| `amount mismatch quarantines` | a provider total one cent above the snapshot yields `uncertain`, not `paid` | relax to a tolerance; test fails |
| `payee mismatch quarantines` | a different seller id yields `uncertain` plus an operator-visible audit row | drop the payee comparison; test fails |
| `duplicate webhook changes nothing` | the second event with the same id inserts no row and triggers no transition | remove the unique constraint; test fails |
| `unverified webhook signature is rejected` | a forged body yields 400 and no state change | skip verification; test fails |
| `webhook content alone cannot mark paid` | a `PAYMENT.CAPTURE.COMPLETED` event with no successful provider read leaves the purchase not `paid` | trust the event; test fails |
| `GET return page cannot capture` | landing on `/paypal/return` with arbitrary query values performs no provider write | add a capture on `GET`; test fails |
| `cancel after dispatch reports uncertain` | the response is `payment_uncertain` and the purchase stays `pending_payment` or `uncertain` | allow `unpaid_closed`; test fails |
| `expired review cannot start a payment` | `T_REVIEW` expiry yields `review_expired` | skip the clock check; test fails |
| `maintenance cannot capture` | the compiled maintenance bundle contains no reference to the capture module or endpoint path | add `orders.ts` to the runner build; test fails |

### Menu import and image boundary

| Test | Asserts | Mutation |
| --- | --- | --- |
| `expiry denies a fetch with no write` | with the write path disabled, a fetch after `T_IMAGE_ACCESS` still returns 410 | make denial depend on a state column write; test fails |
| `closed import denies a fetch` | completion, failure and cancel each deny the next fetch | remove the state check; test fails |
| `guessed token is denied` | a wrong or truncated token yields 404 with no timing oracle and no byte leak | compare in plain string form; test fails |
| `blocked delete is reported not thrown` | `closeImport` returns `source_delete_blocked` under a simulated storage error | let the error propagate; test fails |
| `admission refuses churn` | the 21st 5 MiB admission inside the rolling window is refused with `churn_cap` | count live bytes only; test fails |
| `stale heartbeat blocks imports` | a heartbeat older than `T_MAINT_OVERDUE` refuses admission | remove the check; test fails |
| `malformed result is an error not a repair` | invalid JSON yields `import` failure and leaves the draft unchanged | coerce to an empty list; test fails |
| `late result is rejected` | a result after expiry yields `import_expired` and no draft change | accept it; test fails |
| `base revision change is rejected` | a result for a superseded revision yields `import_base_revision_changed` | drop the comparison; test fails |
| `merchant edits survive a merge` | a merchant-corrected name and price are unchanged after a merge | overwrite from suggestions; test fails |
| `confirmed menu is never overwritten` | a result arriving after confirmation changes nothing | allow the write; test fails |
| `blank price stays blank` | an ambiguous price yields `priceBasis: "ambiguous"` and `priceSgdCents: null` | default to 0; test fails |
| `raw QR payload is not logged` | an injected self-test proves the redaction scanner detects a planted payload in the actual serialized log output, including escaped and forward-slash path variants | remove redaction; test fails |
| `capability URL is not logged` | the same scanner detects a planted token in access and error logs | remove redaction; test fails |

### Scan, suggestions and authorization

| Test | Asserts | Mutation |
| --- | --- | --- |
| `unrecognized tags are surfaced not guessed` | an unknown tag appears in `unrecognized` and no field is invented | drop unknown tags; test fails |
| `unenrolled sticker yields no purchase` | `no_match` and no enrollment row is created | auto-create an outlet; test fails |
| `shared identifier asks which outlet` | `ambiguous` with distinguishers, no proximity inference | pick the first match; test fails |
| `scan grants no destination and no rail` | a resolution contains neither a payee nor a rail | add them; test fails |
| `model cannot invent a price` | a suggestion containing an unregistered item id is dropped | trust the model output; test fails |
| `model tool budget is enforced` | the fourth tool call aborts with `budget_exceeded` | remove the counter; test fails |
| `anonymous buyer cannot reach a merchant route` | 403 with `forbidden_membership` | check only authentication; test fails |
| `linking an anonymous account creates no membership` | after `onLinkAccount`, merchant routes still return 403 | create a membership on link; test fails |
| `linking preserves purchase ownership` | with `disableDeleteAnonymousUser: true`, the pre-link receipt is still readable after link | leave the default deletion on; test fails |
| `auth configuration matches the approved gate` | a config check fails while `neon.ts` sets `auth: true` and no recorded Gate 2 amendment exists | flip the flag; test fails |
| `no secret reaches the committed tree` | an injected self-test plants a connection string, a bearer value and a Windows path in the staged surface and proves the scanner detects each, including escaped-JSON and forward-slash variants | remove a detection rule; the self-test fails |
| `membership is per outlet` | a member of outlet A gets 403 on outlet B | check any membership; test fails |
| `agent token cannot read a receipt` | 403 on `GET /purchases/{id}` | accept the agent principal; test fails |
| `handoff redeems once` | the second redemption yields `already_redeemed` | remove the constraint; test fails |
| `handoff carries no amount` | redemption re-prices server-side and ignores any agent-supplied total | accept the agent total; test fails |

### Publication and free-capacity behaviour

| Test | Asserts | Mutation |
| --- | --- | --- |
| `publication requires all four preconditions` | enrollment, outlet confirmation, menu confirmation and an active destination each independently block | remove any one; four separate mutations, four failures |
| `incomplete menu blocks confirmation` | `assessMenuCompleteness` returns the offending item ids | treat unknown availability as available; test fails |
| `editing a published menu creates an unpublished revision` | buyers still read the previously confirmed revision | mutate in place; test fails |
| `maintenance run is finite` | the runner exits, writes a heartbeat and holds no connection after `T_MAINT_RUN` | add a poll loop; test fails |
| `overlapping runs claim disjoint work` | two concurrent claimers get different rows | remove the lease predicate; test fails |
| `polling stops at a terminal state` | a receipt page issues no further requests after `paid` | keep polling; test fails |
| `region latency is measured, not assumed` | a Slice 1 measurement records the real round-trip time from a Singapore client to `aws-us-east-2` on a genuinely cold first visit, and the recorded value is compared against the three-minute budget | skip the measurement and assert the metric passes; the evidence is absent and the claim fails |

If the region measurement shows trans-Pacific round trips consuming a material share of the three-minute budget, relocation to a Singapore region must be revisited as a provisioning decision rather than absorbed silently.

Integration tests run against a real PostgreSQL instance with the real schema and real constraints, because the guarantees above are index and transaction guarantees. A mocked database would prove none of them. Provider HTTP is faked at the `PayPalWriteClient` boundary, and every faked response is labeled as a fixture in test output and evidence.

## Least confident decisions

1. **R1 TypeScript 7.0.2 with Next 16.4.0, Drizzle 0.45.3 and Better Auth 1.7.7.** All are current majors read from the registry today; their mutual compatibility is untested here. The Slice 1 boot check is the falsifier, and the fallback is to downgrade to the newest mutually supported set rather than to patch around it.
2. **R2 Storage exhaustion has no in-application recovery.** Access denial is read-only and therefore survives, but reclaiming bytes when `DELETE` itself fails is a console action whose immediacy is **[unknown]**. If the 70% admission threshold proves insufficient in practice, the honest move is to reduce the image cap or drop image import to manual entry, not to claim cleanup works.
3. **R3 Maintenance's PayPal boundary is code-level.** Finding 6 could not be verified as credential-enforceable. The build-graph test is a genuine guard against accidental reachability, and it is not a security boundary against a deliberately modified runner.
4. **R4 Hourly maintenance is not a deadline.** GitHub schedules can be delayed or dropped, so `T_SOURCE_SWEEP` and `reconcile_attempts` are best effort. Anything described to a judge as "within an hour" must instead be described as "checked at least hourly when the schedule runs".
5. **R5 The exact AI model is unselected.** Gate 2 deferred model choice to a Gate 3 task evaluation, and that evaluation needs an API key and spend that are not authorized. The contracts are model-agnostic; the evaluation moves to a named slice with pre-registered criteria, and `AI_MODEL` stays an environment name.
6. **R6 `sharp` is a native dependency on a free ephemeral host.** Build time and binary availability on Render Free are unverified. If it fails, image normalization must move to a pure-JS decoder with a lower cap, which weakens the metadata-stripping claim and must be disclosed.
7. **R7 Churn-based admission may be too conservative or too lax.** The 100 MiB per rolling 6-hour window figure is arithmetic, not measurement. It could block a legitimate demo retry sequence, or under-protect if history accounting behaves differently than documented.
8. **R8 Browser polling on a sleeping app.** A 2-second poll for 60 seconds keeps Render awake and Neon out of scale-to-zero during an active payment, which is intended, but the interaction with the 750-hour monthly budget across several concurrent judges is unmeasured.
9. **R9 One package with two entrypoints.** Sharing `src/domain` between the web app and the compiled runner is what makes the maintenance boundary type-checkable, but it also means a Next.js dependency change can break the runner build. The separate `tsconfig.runner.json` is the mitigation and may not be sufficient.
10. **R10 `purchase_requests` as an agent surface is unexercised.** No supported MCP client has been run against Next.js 16 in this planning pass, so transport interoperability is **[unknown]** and could force a Gate 2 amendment if a different transport is required.
11. **R11 Managed auth was provisioned and contradicted approved Gate 2. Decided by the user on 2026-10-07: in-app Better Auth. Hazard disproven by inspection; not a blocker.** `neon.ts` is now `auth: false`, though `neon deploy` reported no changes and that field demonstrably does not control the branch-level service. A read-only schema inspection resolved the question that mattered: **all nine Neon Auth tables live in a dedicated `neon_auth` schema and `public` is empty**, so there is no table-name collision with the in-app Better Auth tables this design places in `public`. Managed auth remains enabled but inert and isolated; nothing was disabled. **Two containment rules are mandatory:** never build against `neon_auth`, and pin Better Auth's Drizzle adapter explicitly to `public` so no unqualified `user`, `session`, `account` or `verification` name can resolve into the other schema through a search path. Cost of the idle service on the Free plan is **[unknown]**.
12. **R12 The database is in `aws-us-east-2`. Accepted by the user on 2026-10-07, conditional on measurement.** The residual risk is that trans-Pacific round trips stack inside an approved three-minute metric that already absorbs a Render cold start. It is unmeasured, and relocation is more expensive once real data exists. The acceptance therefore holds only while the Slice 1 latency measurement passes; if the metric fails because of region latency, relocation must be revisited rather than explained away.

## What this gate does not authorize

Approving Gate 3 accepts these contracts. It does not authorize implementation, package installation, account provisioning, workflow creation, deployment, a repository visibility change, real merchant images, real merchant enrollment, any payment outside a sandbox, or Gate 4 slice selection. The R11 flag flip, its redeploy and a read-only schema inspection were separately authorized and executed on 2026-10-07; that authorization did not extend to `neon neon-auth disable`, which remains unauthorized. Gate 3 approval does not establish that any vendor claim above behaves as documented for this account, and it does not reopen Gate 1 or Gate 2: no approved product behaviour or architecture decision is changed here. Two recorded claims are relabeled in `research.md` under finding 7, which is an evidence correction, not a decision change.

A discovery during implementation that changes an approved architecture decision reopens Gate 2 for approval before dependent work continues. A change to product behaviour reopens Gate 1.
