# Vertical Slices: Envoi

Gate 4 slice plan, drafted 2026-10-10 and revised 2026-10-12 (Asia/Singapore).
**APPROVED by the user on 2026-10-12** ("I approve both pls publish the branches and commit all the changes to main so that we can proceed with the first slice").
Approval starts no slice; each starts only on an authorization naming its slice ID.
Authorities: [re-approved Gate 1 product](01-product.md), [re-approved Gate 2 architecture](02-architecture.md) and [Gate 3 program design](03-program-design.md), re-approved on 2026-10-11, reopened on 2026-10-12 for one change and re-approved the same day.
This plan selects and orders runnable slices.
It changes no approved product or architecture decision.
Its one contract change, delta D10, is made in Gate 3 itself, which you reopened for it on 2026-10-12.
**Reopened 2026-10-15 for one change, approved by the user in advance:** S11's menu photos are English only, so its evaluation photos no longer include Chinese text; rotated and small-price text stay. Gates 2 and 3 carry the same change.
**Reopened 2026-10-18 for one change and RE-APPROVED by the user the same day** ("Yea sure i approve the gates then make the relevant changes and push to main thnaks"): the [S16 amendment](#s16-amendment-2026-10-18-phantom-landing) builds the Phantom landing that Gates 2 and 3 now describe, on its own branch before S14; no build order, test count or cut order changes.
Where a slice needs something Gate 3 did not specify, the gap is named in [Gate 3 deltas](#gate-3-deltas) instead of being decided silently.
Drafting and revising this plan installed, provisioned, deployed and spent nothing, and it contains no application code.

## Revision 2026-10-12

The user reopened Gates 1-3 on 2026-10-10 to remove Zapier and include PYUSD.
Gate 1 was re-approved on 2026-10-10, and Gates 2 and 3 on 2026-10-11.
This revision applies their decisions and the Gate 3 [test delta](03-program-design.md#test-delta-for-the-gate-4-revision):

- **S11 and S12 merge** into S11, menu photo import with direct vision.
  The ID S12 is retired.
  The Zapier access check, the image capability boundary and its seven tests are gone.
- **S13 moves to right after S4**, as the user decided on 2026-10-10.
- **PYUSD is added** as S16, PYUSD devnet purchase, and S17, PYUSD recovery.
  Both come after the PayPal journey and S13, and PYUSD is first in the cut order.
- **S11 moves ahead of S9 and S10.**
  This was not asked for; it is proposed because the menu import is never cut while scan is cut second ([least confident decision 3](#least-confident-decisions)).
- **Tests are reassigned.**
  All 92 named tests and 231 cases of the re-approved Gate 3 test plan are assigned once each, and named additions grow from 20 to 39.
- **Cut order** is PYUSD, then scan, then S14, with a second checkpoint on 1 Nov.
- **New delta D8** shows PYUSD as unavailable from S2 onward, as Gate 1 requires, whether or not PYUSD is later cut.
- **The R2 storage-exhaustion decision moves from S11 to S15.**
  This was not asked for; it is proposed because no image churn remains to tie R2 to the import ([least confident decision 14](#least-confident-decisions)).
- **Review fixes, 2026-10-12.**
  An independent review of this revision found four major issues, fixed as follows.
  - The `paypal/start` basket-lock recheck moves from S16 to S7, so cutting PYUSD removes no part of a Gate 3 contract, and neither operator command changes an existing outlet (D1).
  - S6 is built before S5, because the operator health view needs S6's sign-in, and S5 now builds and tests the operator guard.
  - The double-start proof is split: its concurrency test proves the row lock, and a direct-insert test proves the partial unique index.
  - The documentary checker now lives in [`checks/gate4_check.py`](checks/gate4_check.py) with stricter rules, and its record claims only what it tests.
- **Minor review fixes, 2026-10-12.**
  The same review's minor findings are fixed or dispositioned as recorded in [`00-status.md`](00-status.md#gate-4-minor-review-fixes-2026-10-12).
  - S16 now builds the hint branch of `decideRecoveryStep`, and S17 the rest of `recovery.ts`.
  - "Depends on" lists every earlier slice whose builds a slice uses, so S16 adds S4, S5 and S11, and S11 adds S5.
  - S17's PYUSD acts refuse an account without the operator flag, S11 quotes the approved consent verbatim, and S2 tests that rail `pyusd` is refused before S16.
  - New delta D9 places the public-route limiter in S4 with two tests.
  - New delta D10 records that Gate 3 specified no PayPal check of `PAYMENTS_ENABLED`.
    You then reopened Gate 3 for it on 2026-10-12, and S2 gains its named test.
  - A PYUSD go/no-go follows S11, slice authorization always names a slice ID, and several stale mirror statements are corrected.

Slice IDs are stable names, not positions.
Approved Gate 2 and Gate 3 refer to S2, S3, S4, S7, S11, S12 and S13 by these IDs, so renumbering would silently change what those references mean.
The **Order** column is the build order.

## Starting state, verified 2026-10-12

- **[verified]** `main`, `origin/main` and the remote `main` are all `5f6ab39`, confirmed with `git ls-remote`, and the working tree was clean.
- **[verified]** This revision runs on `envoi/gate-4-vision-pyusd`, created from `envoi/gate-3-vision-pyusd` at `74b1f64`.
  That commit is `main` plus your own commit of AGENTS.md's "Context transfer" section, so a later merge of this branch would carry it into `main`.
- **[verified]** The repository is checked out on macOS (arm64) at `/Users/jayd0/Desktop/envoi`.
  Gates 1-3 first ran on Windows at `C:\Users\jayd0\OneDrive\Desktop\envoi`.
- **[verified]** Node.js `v24.21.0` with npm `11.19.0` is now installed under `~/.local/node`, and the GitHub CLI under `~/.local/bin`.
  PostgreSQL, Docker, Homebrew and the Neon CLI are still absent.
- **[verified]** `.env.local`, `.neon` and `node_modules/` are absent, so no database credential exists on this machine.
- **[verified]** The GitHub repository is private: the unauthenticated GitHub API returns 404 for it while authenticated `git ls-remote` succeeds.
- **[verified 2026-10-10]** nodejs.org listed `v24.21.0` (Krypton) as the latest LTS and `v26.11.1` as Current; the installed version matches that LTS.
- **[verified]** This checkout has LF line endings, and `docs/plans/PAYPAL_PLAN.md` hashes directly to the recorded `6058798E...F3B220A1`.

## Slice plan

One runnable capability per slice, in build order.
"Depends on" names every earlier slice whose builds this slice uses; a slice already reached through a listed one may be left out.
Target windows are the planning windows recorded in `roadmap.md`; they are targets, not effort estimates.

| Order | Slice | What you can see when it is done | Depends on | Target window |
| --- | --- | --- | --- | --- |
| 1 | S1 Tracer bullet on Render Free | A phone opens the Render URL, sees a labeled demo shop read from Neon and reaches an explicitly unpaid stub receipt that survives a redeploy. | Gate 4 approval | 12-25 Oct |
| 2 | S2 PayPal sandbox happy path | A real sandbox approval and capture pays the distinct sandbox seller and the receipt shows the actual capture id. Canceling at PayPal, or approving and never returning, stays unpaid. PYUSD shows as unavailable with its reason. | S1 | 12-25 Oct |
| 3 | S3 PayPal recovery | Lost responses and webhooks converge on the same capture or stay visibly "checking payment"; nothing is charged twice. | S2 | 12-25 Oct |
| 4 | S4 Text entry with AI suggestions | A buyer types a request, gets registered shops and items or a clarifying question, and continues into the S2 review. | S2 | 12-25 Oct |
| 5 | S13 Agent handoff over MCP | A supported MCP client creates a purchase request; a human redeems it once into the normal review and payment. | S2, S4 | 12-25 Oct |
| 6 | S6 Merchant sign-in and manual menu draft | A pre-provisioned merchant builds and confirms a menu that buyers cannot see. | S1 | 12-25 Oct |
| 7 | S5 Maintenance runner, manual runs | The operator signs in, runs the finite runner once and sees heartbeat, capacity and work it reconciled without a buyer page in a health view no other session can read. | S3, S6 | 12-25 Oct |
| 8 | S7 Merchant destination and publication | The merchant publishes and buyers buy from that shop. Later edits stay unpublished and invalidate stale reviews, and a basket whose payment is still checking cannot be bought again on the new menu. | S2, S6 | 12-25 Oct |
| 9 | S8 Merchant orders and acknowledgment | The merchant sees honest payment states and acknowledges a paid order separately from payment. | S3, S7 | 12-25 Oct |
| 10 | S11 Menu photo import with direct vision | A consented menu photo becomes an unpublished draft within 90 seconds, with readable SGD prices filled and the rest blank; the merchant corrects, confirms and publishes, and nothing of the photo is stored. | S5, S6, S7 | 26 Oct-1 Nov |
| 11 | S9 Merchant SGQR decode and mapping | A sticker photo decodes in the browser into reviewed identifiers; the operator approves the outlet mapping. | S7 | 26 Oct-1 Nov |
| 12 | S10 Buyer scan or paste | A scan opens one outlet, asks which outlet, or says "not on Envoi"; camera denial falls back to paste, then text. | S4, S9 | 26 Oct-1 Nov |
| 13 | S16 PYUSD devnet purchase | The merchant proves a devnet wallet and sets a dated rate; a buyer pays the rounded-up PYUSD amount in Phantom and the receipt says transferred and finalized on devnet. PayPal keeps working when PYUSD is off. | S3, S4, S5, S7, S8, S11 | 26 Oct-1 Nov |
| 14 | S17 PYUSD recovery | A lost wallet response stays "checking payment" until a complete history scan decides it; an extra transfer is shown, never hidden; the operator closes a mismatch only as unpaid. | S5, S8, S16 | 26 Oct-1 Nov |
| 15 | S14 APIMatic client and docs (account-conditional) | A generated client calls the running public API and passes a contract check. | S13 | 26 Oct-1 Nov |
| 16 | S15 Judged release | Public licensed repository, scheduled maintenance, the usability result, the video and an evidence pack. | All included slices | 2-8 Nov, buffer 9-12 Nov |

S12 is retired: it was merged into S11 on 2026-10-12.
Submission cutoff is 13 Nov 2026 04:00 SGT, and access must last through judging, which ends 16 Dec 2026 00:00 SGT ([research](research.md#hackathon-dates-and-deliverables)).

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

## Gate 3 deltas

Gate 3 did not specify the items below, and the slices cannot run without them.
Each is proposed as a refinement that carries out an approved decision without changing it.
If you judge any of them to be a decision change, Gate 3 reopens for that item before the slice that needs it.
The re-approved Gate 3 [reviewed D1-D7](03-program-design.md#gate-4-deltas-d1-d7-reviewed) and handed parts of D1, D5 and D7 back to this plan; D8, D9 and D10 are new.
D10 is not a refinement: it changes a Gate 3 contract, so Gate 3 was reopened for it on 2026-10-12 and must be re-approved before S2 starts.

| # | Gap in Gate 3 | Proposed refinement | First needed |
| --- | --- | --- | --- |
| D1 | Gate 2 says merchant accounts, memberships, enrollments and sandbox destinations are prepared "out of band", but no file implements that, and the only operator route is the health view. Gate 3 now also names two out-of-band PYUSD operator acts and leaves their placement and tests to this plan. | `src/operator/cli.ts`, run locally by the human operator with `MIGRATION_DATABASE_URL`. One subcommand per operator act: `seed-demo-fixture`, `assign-paypal-destination`, `create-merchant`, `grant-operator`, `approve-membership`, `approve-enrollment`, `approve-identifier`, `issue-agent-token`, and in S17 `resolve-pyusd-mismatch` and `record-extra-transfer-refund`. Neither setup command changes an existing outlet: `seed-demo-fixture` creates the fixture only when it is absent, and `assign-paypal-destination` writes a destination only for an outlet that has none; run again, each changes nothing and says so. So no operator act gives a basket a second checkout key, and the first path to one is S7's republication or destination change. `grant-operator` flags a permanent account made with `create-merchant`. The two PYUSD acts take the operator account by name, refuse unless that account holds the operator flag, as Gate 3's authorization table defines the operator, and write an audit row naming that account, the reason and the evidence, because the CLI runs with migration credentials and could otherwise record any name; the first closes a mismatch only as unpaid and only after its window scan completes, and the second changes no payment state. Gate 3 calls them "the same act"; they are two subcommands of the one CLI because a refund reference can belong to a confirmed attempt that has no mismatch. Each has its own named tests in S17. Passwords are typed by the operator and agent tokens are shown once; neither is written to a file, log or commit. No new HTTP route and no new environment name. | S1; the PYUSD acts in S17 |
| D2 | No Node.js version is pinned. | Node `24.x` LTS (`v24.21.0`) in `package.json` `engines` and in `.node-version`, which Render reads. Node 26 is Current, not LTS, and is not selected. It also satisfies the PYUSD pins, which need Node 20.18 or later, and the Wallet Standard packages, which need Node 22 or later. Covered by the S1 boot check. | S1 |
| D3 | Integration tests need a real PostgreSQL, and Gate 3 does not say which. | A disposable local PostgreSQL on the developer machine and a `postgres` service container in CI, both on the major version Neon reports through `SELECT version()` in S1. One test-only name, `TEST_DATABASE_URL`, joins `.env.example`. Tests never touch Neon, so they cost no Neon storage, history, compute or trans-Pacific latency. The import and PYUSD tests add only the labeled OpenAI and RPC fakes. | S1 |
| D4 | The capacity table budgets only maintenance runs against the 2,000 private Actions minutes. | CI runs draw from the same pool while the repository is private. S1 records minutes per CI run, the budget becomes maintenance plus CI, and CI stays limited to typecheck, lint, unit and integration jobs with no browser download. | S1 |
| D5 | Five 2026-10-07 race contracts and several authorization rules have a written contract but no named test. Gate 3's 2026-10-11 revision named a test for every rule it added, except the merchant's view of an extra transfer and the two operator acts it left to D1. | Named additions in the owning slices, listed per slice and in [Test assignment](#test-assignment). New in this revision: three PayPal basket-lock tests in S7, including the `paypal/start` recheck, so the PayPal half of the lock stays built and tested if PYUSD is cut; the attempt partial unique index as its own direct-insert test in S2; the operator guard on the health view in S5, which Gate 3's authorization table implies but declares no guard or test for; the two D1 setup-command rules in S1 and S2; and the merchant extra-transfer view and the D1 PYUSD acts in S17. Added with the minor review fixes: the two public-route limits of `src/lib/ratelimit.ts` in S4 (D9), the D8 rail refusal in S2, and the operator-flag check of each D1 PYUSD act in S17. | S1 onward |
| D6 | Gate 2 deferred "OpenAPI details" to Gate 3, and Gate 3 has no OpenAPI file. | A hand-written `openapi/envoi-public.yaml` covering the public read routes only, which needs no new dependency. Choosing a generator dependency instead would be a Gate 3 amendment. | S14 |
| D7 | Gate 2 requires separate least-privileged web, maintenance and migration roles, but creating a role is provisioning. | `envoi_web` is created in S1 and `envoi_maintenance` in S5, each under a named authorization, with grants kept in migrations. Later migrations extend the grants: S4 gives the web role the public-route limiter rows (D9); S13 gives it SELECT on `agent_tokens` and SELECT, INSERT and a column-level UPDATE of the redemption binding (`redeemed_at`, `redeemed_by_user_id`, `purchase_id`) on `purchase_requests`, approved by you as a refinement on 2026-10-14; S11 gives the web role `menu_imports` and `menu_import_admission`; S16 gives it `wallet_challenges`, `pyusd_rates`, the RPC limiter rows and the PYUSD attempt columns; S17 gives it `pyusd_extra_transfers` and gives the maintenance role the PYUSD attempt columns, `pyusd_extra_transfers` and the limiter rows. | S1, S4, S13, S5, S11, S16, S17 |
| D8 | Gate 1 requires PYUSD to show as unavailable with its reason until its test passes, and lets PYUSD be cut, but no Gate 3 contract renders the rail before the PYUSD slices exist. | S2's review shows a PYUSD option that cannot be selected, with the reason "PYUSD has not passed its tests yet". It is static markup that imports nothing from Solana and adds no route or environment name. On the server, S2's `priceBasket` prices only rail `paypal`, so a request for rail `pyusd` answers `pyusd_unavailable` with `rail_disabled` and creates no review, the same answer Gate 3 gives while `PYUSD_ENABLED` is off; S2 names a test for it. S16 replaces the option with the real reasons from the enable flag, the devnet identity and the shop's rate. If PYUSD is cut, the option stays, but its reason becomes "PYUSD is not part of this demo", because a pending-test reason would promise a test that will never run; that copy change is part of recording the cut. | S2 |
| D9 | Gate 3 names `src/lib/ratelimit.ts` as the limiter for public routes but gives no limits, and no slice built it before S16, although S4 deploys the first public route that spends money on OpenAI. | S4 builds the public-route part of `src/lib/ratelimit.ts`, database-backed as Gate 3 says, and applies it to `POST /buyer/suggestions` before any model call: **[hypothesis]** at most 10 requests per buyer session in 10 minutes and 100 across all sessions in an hour, kept as reviewed code constants. A refusal answers Gate 3's existing `rate_limited` and makes no model call. Because anonymous sessions are free to create, the global window is a separate guard with its own test. S16 adds the wallet-challenge and RPC limits to the same file. | S4 |
| D10 | Gate 2 names `PAYMENTS_ENABLED`, but the 2026-10-11 Gate 3 checked it only for PYUSD: PayPal start and complete never read it, and Gate 3's error codes had no PayPal refusal for it. | **Decided by you on 2026-10-12 and made in Gate 3, reopened for it:** `assertPaymentEligible` refuses a PayPal purchase with the new code `payments_disabled` while the flag is false, so `paypal/start` claims no attempt and creates no order and `paypal/complete` takes no lease and sends no capture. Reads, reconcile, webhooks and maintenance never check it. S2 builds the check and names its test, `payments kill switch refuses PayPal start and completion`. See [Gate 3's reopening](03-program-design.md#reopening-2026-10-12-paypal-payments-kill-switch). | S2, after Gate 3 re-approval |

## Access checks to start now

These need your accounts or your hands.
None of them is a slice, and approving this plan authorizes none of them.
Each failure could reopen scope, so they belong in the first week even when the slice that needs them comes later.

| Check | Needed by | Passing looks like | If it fails |
| --- | --- | --- | --- |
| Toolchain on this Mac | S1 | Node 24 LTS is installed (verified 2026-10-12). You install a local PostgreSQL server; exact commands are supplied at S1 start. | S1 cannot start. |
| Neon credentials on this Mac | S1 | You place the connection strings in the ignored `.env.local` and read remaining storage, compute and transfer from the Neon console. | S1 cannot reach the database. |
| Render Free | S1 | You create a free web service connected to the private repository through your own GitHub grant, with no payment method required. | Stop deployment and reopen Gate 2 hosting. |
| GitHub Actions billing | S1 for CI, S5 or S15 for the schedule | You read the remaining private minutes and confirm no payment method or a $0 limit. | CI stays minimal and no scheduled workflow exists until the repository is public. |
| PayPal developer sandbox | S2 | You create a sandbox REST app, a distinct seller sandbox account and a buyer sandbox account, and enter their credentials in `.env.local` and Render. | S2 still runs and is the proof or falsifier of distinct-seller capture. Envoi's own account is never the payee. |
| OpenAI for text suggestions | S4 | A key with a spend limit you set, plus your authorization for the S4 model evaluation spend. | Text entry keeps manual selection and no AI-suggestion claim is made. |
| OpenAI for menu vision | S11 | You confirm your organization has no data-sharing opt-in, choose the daily spend ceiling and authorize the S11 vision evaluation spend. At least one candidate model takes image input, supports strict structured output and has no published shutdown before 16 Dec 2026. | Imports stay closed, because they fail closed without a recorded ceiling. Manual entry keeps onboarding usable but is never reported as AI drafting, and Gate 1 menu-import scope reopens. |
| Evaluation menu photos | S11 | English menu photos you own or have permission to send to OpenAI, including rotated and small-price text. | The evaluation cannot run, and no AI-drafting claim is made. |
| MCP client | S13 | One named client that speaks Streamable HTTP and accepts a custom bearer token. | Gate 2 transport amendment (R10). |
| Consented SGQR sticker photos | S9 | Authentic stickers photographed with each shop's permission. | Decode results are reported as fixture-only. |
| Phantom on devnet | S16 | Two Phantom wallets you control, one for the merchant and one for the buyer, on devnet: the desktop extension and the app on each target phone. | PYUSD stays visibly unavailable (R13, R14); PayPal is unaffected. |
| Devnet funds | S16 | Devnet SOL for fees and test PYUSD through PayPal's documented test-token route reach the buyer wallet, and a deposit creates the merchant's PYUSD token account. | PYUSD stays unavailable (R15), and no purchase or recovery proof can run. |
| APIMatic | S14 | A tier that generates a client from an OpenAPI file, with acceptable terms. | Drop S14; raw documentation is not a generated-client claim. |
| Usability testers | S15 | Five first-time buyers who have not seen Envoi, booked for 2-8 Nov. | Report the smaller sample as it is; the target is never reshaped afterwards. |

## Slices

Sections follow the build order.

### S1 Tracer bullet on Render Free

Branch: `envoi/slice-1-tracer`.

**Visible result.**
On a phone in Singapore, open the Render URL.
The buy page lists one shop labeled "Demo fixture", read from Neon.
Opening it shows its menu, "Review" stores a review of a fixed fixture basket, and "Continue" shows a receipt stating that no payment was attempted.
After a Render redeploy the same browser still sees that receipt, and a different browser gets "not found".

**Builds.**
Pinned packages and scripts; `tsconfig.json`, `next.config.ts`, `drizzle.config.ts` with its schema filter set to `public`; `src/env.ts`; `src/lib/{errors,ids,time,log}.ts` and `src/lib/http/respond.ts`; `src/lib/db/{schema,web,migrate}.ts` with only the Better Auth, outlet, menu and purchase tables this slice uses; `src/lib/auth.ts` with the anonymous plugin, `disableDeleteAnonymousUser: true` and the Drizzle adapter pinned to `public`; `requireBuyerSession`; `GET /outlets`, `GET /outlets/{id}/menu`, `GET /purchases/{id}` and public `GET /health`; pages `/buy`, `/review/[purchaseId]` and `/receipt/[purchaseId]`; operator `seed-demo-fixture`, which only creates (D1); `render.yaml`, `.env.example`, `.node-version` and `.github/workflows/ci.yml`.
`POST /purchases` is a tracer that accepts no client lines and stores the fixture basket server-side; S2 replaces it with real pricing.

**Tests.**
Gate 3: `auth configuration matches the approved gate`, `no secret reaches the committed tree`, `region latency is measured, not assumed`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `pinned versions boot together` | The exact pins install, typecheck, build, start and serve one anonymous request. | None. This is the R1 falsifier, not a guard. |
| `auth tables resolve to public only` | In a test database that also holds a decoy `neon_auth.user` table with `search_path` set to `neon_auth, public`, Better Auth reads and writes only `public`. | Remove the explicit schema pin; the test fails. |
| `buyer session survives a redeploy` | On Render, the receipt stays readable to the same browser after a redeploy. | Generate `BETTER_AUTH_SECRET` per boot; the test fails. |
| `receipt is private to its session` | Another anonymous session gets 404 for the purchase. | Drop the owner predicate; the test fails. |
| `re-seeding never changes an existing fixture` | Running `seed-demo-fixture` again leaves the fixture outlet, its menu revision and its published pointer unchanged and reports the existing ids. | Let a rerun write a new revision; the test fails. |

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
You perform: the PostgreSQL install, `.env.local`, the Render service and its GitHub grant, and entering secret values in Render.

### S2 PayPal sandbox happy path

Branch: `envoi/slice-2-paypal-happy-path`.

**Visible result.**
A buyer picks items and quantities from the demo shop.
The review shows the server-priced basket, the distinct sandbox seller and "PayPal sandbox, test money".
It also lists PYUSD as unavailable, with the reason "PYUSD has not passed its tests yet", and offers no way to select it (D8).
"Continue to PayPal" opens sandbox approval; after approving as the sandbox buyer and returning, the receipt shows Paid with the actual sandbox capture id.
Canceling at PayPal returns to an unpaid receipt with no success message.
Approving at PayPal and never returning reads as unpaid once the five-minute review window passes, and no capture is ever sent for it.

**Builds.**
`priceBasket`, `computeCheckoutKey` and `createReview`, replacing the tracer route; the purchase and attempt transition tables; `payment_destinations` and `payment_attempts`; `assertPaymentEligible`; `src/integrations/paypal/{client,orders,map}.ts` with the sandbox-only host allowlist; `decideCaptureOutcome`; the attempt lease; the capture-dispatch compare-and-set that requires the review deadline; `derivePurchaseView` and `applyDerivedTransitions` for PayPal abandonment, derived on read; `POST /purchases/{id}/paypal/start`, `paypal/complete` and `cancel`; read-only `/paypal/return` and `/paypal/cancel`; the static PYUSD option of D8 and `priceBasket`'s refusal of any rail but `paypal`; the `PAYMENTS_ENABLED` check in `assertPaymentEligible` with the error code `payments_disabled` (D10); operator `assign-paypal-destination`, which writes a destination only for an outlet that has none (D1).
Recipient and amount binding and lease-serialized capture are part of this slice, as the Gate 3 handoff requires; lost-response recovery is S3.
`attempts.claimSlot` treats a unique violation as an error, never as a reason to re-read, so the partial unique index is a backstop that the purchase row lock keeps unreachable and each has its own test.

**Tests.**
Gate 3: `prices come only from the confirmed revision`, `unknown price never becomes zero`, `same basket twice returns the same review`, `a changed menu revision is a new checkout`, `replacement only from a terminal unpaid state`, `capture requires an owned lease`, `amount mismatch quarantines`, `payee mismatch quarantines`, `GET return page cannot capture`, `expired review cannot start a payment`, `an approved PayPal order that never returns closes unpaid`, `capture is never dispatched once the review has expired`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `double start returns the same attempt` | Two concurrent starts of one review return the same attempt id and approval link, and neither answers an error. An injected barrier holds the first start after its existing-attempt read until the second is waiting on the purchase row lock or has reached the same read. | Remove the row lock; the second start reads no attempt, its slot claim hits the partial unique index and it answers an error, so the test fails. This test proves the row lock only. |
| `a purchase holds at most one non-terminal attempt` | Direct inserts against the real schema in PostgreSQL, rolled back: inserting a second non-terminal attempt for one purchase violates the partial unique index. | Drop the partial unique index; the test fails. |
| `a PayPal destination is assigned once` | Running `assign-paypal-destination` for an outlet that already has a destination, naming the same or another seller, changes no destination row or version and reports the existing one. | Let a rerun replace the destination; the test fails. |
| `live PayPal host is refused at boot` | Configuration naming a live PayPal host fails boot. | Add the live host to the allowlist; the test fails. |
| `rail pyusd is refused before PYUSD exists` | `POST /purchases` for the demo basket with rail `pyusd` answers `pyusd_unavailable` with `rail_disabled` and creates no review or purchase row (D8). | Let `priceBasket` price any rail as PayPal; the test fails. |
| `payments kill switch refuses PayPal start and completion` | With `PAYMENTS_ENABLED` false, `paypal/start` on an open review answers `payments_disabled`, saves no attempt and sends no request to the fake PayPal boundary; `paypal/complete` on an `externally_approved` attempt answers `payments_disabled`, takes no lease, leaves the attempt `externally_approved` and sends no capture (D10). | Skip the `PAYMENTS_ENABLED` check in PayPal eligibility; the test fails. |

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
`suggestFromText`; `src/integrations/ai/openai.ts` with structured output, the three read-only tools and `T_AI_BUDGET`; `POST /buyer/suggestions`; the public-route part of `src/lib/ratelimit.ts` and its limiter rows, applied to that route before any model call (D9); the text input on `/buy`; a filter that drops any id not in the published registry.

**Tests.**
Gate 3: `model cannot invent a price`, `model tool budget is enforced`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `missing area asks for clarification` | A "near me" request without an area or usable location returns a clarification and no nearest claim. | Default to a fixed area; the test fails. |
| `text suggestions are rate limited per buyer session` | The eleventh suggestion request from one buyer session within 10 minutes answers `rate_limited` and the fake OpenAI boundary records no call for it, while a second session is still served. | Remove the per-session window; the test fails. |
| `text suggestions are rate limited across all sessions` | With the per-session window raised in the fixture, the 101st request in an hour, spread over many sessions, answers `rate_limited` with no model call. | Remove the global window; the test fails. |

**Model evaluation (R5).**
Before the first model call, the fixture request set, the expected outcome for each request and the pass threshold are written into `00-status.md`.
Then every candidate is run and every result is reported, and the chosen model is recorded as the `AI_MODEL` value.

**Falsifier and response.**
If no candidate meets the pre-registered threshold, manual selection stays, no AI-suggestion claim is made, and a provider change goes through Gate 2.

**Authorizations to request at start.**
Install `ai` and `@ai-sdk/openai`; spend on the evaluation within your limit; migrations for the limiter rows, push and deploy.
You perform: the OpenAI key in `.env.local` and Render.

### S13 Agent handoff over MCP

Branch: `envoi/slice-13-mcp-handoff`.

Moved to right after S4 by your decision of 2026-10-10; it depends only on S2 and S4.

**Visible result.**
In a named MCP client holding a scoped demo token, `search_outlets`, `get_menu` and `create_purchase_request` return a link.
On a phone, the buyer opens it and redeems it once into a fresh server-priced review, then pays through S2.
The agent cannot read the receipt, a second redemption says already used, and after `T_HANDOFF` the link is expired.

**Builds.**
`src/app/mcp/route.ts` accepting `POST` only; the agent principal; `purchase_requests`, `createPurchaseRequest` and `redeemPurchaseRequest`; `POST /purchase-requests` and `/purchase-requests/redeem`; `/approve/[handoffToken]` with no referrer and no analytics; the `Origin` check on `/mcp` that its test names, inside `src/app/mcp/route.ts`, because Gate 3's same-origin helper serves browser mutations and arrives only in S11; operator `issue-agent-token`.

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

### S6 Merchant sign-in and manual menu draft

Branch: `envoi/slice-6-merchant-draft`.

**Visible result.**
You create a demo merchant account and membership with the operator CLI, typing the password yourself.
The merchant signs in at `/merchant/setup`, creates an unpublished outlet and types menu items.
A blank price stays blank and blocks confirmation until the merchant supplies it, and then the exact complete revision is confirmed.
A buyer cannot see the draft or reach any merchant route.
Signing in on a browser that already holds a buyer receipt keeps that purchase owned by its buyer session, which stays readable with that session, and grants the merchant account nothing extra.
The browser itself can no longer open that receipt once the merchant session replaces the buyer session, so `/merchant/setup` says so before sign-in (a Gate 4 amendment you confirmed on 2026-10-14; Gate 3 unchanged).

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

### S5 Maintenance runner, manual runs

Branch: `envoi/slice-5-maintenance`.

Built after S6, because the operator signs in with S6's email and password sign-in to an account made with S6's `create-merchant`.

**Visible result.**
The operator signs in with a permanent account flagged by `grant-operator`.
The operator health view shows the last heartbeat, capacity figures and overdue work, and an anonymous buyer or a merchant without the flag gets the same "not found" as an unknown route.
One run of the compiled runner reconciles an uncertain attempt left by the S3 harness with no buyer page open, closes expired reviews, purges expired sessions and exits.

**Builds.**
`src/maintenance/run.ts`; `src/domain/maintenance/{due,tasks}.ts` with `heartbeat`, `record_capacity`, `reconcile_attempts` through `PayPalReadClient` only, `close_expired_reviews` and `purge_expired_sessions`; `tsconfig.runner.json` and `runner:build`; `maintenance_runs` and lease claims; `src/lib/db/runner.ts`; the operator flag on permanent accounts; `requireOperator` in `src/lib/auth-context.ts`, which reads that flag and refuses every other session with 404 `not_found`, because Gate 3's error codes have no operator code; `GET /health/operator` behind it; operator `grant-operator`.
`close_expired_reviews` is cleanup only: no buyer path waits for it, because S2 derives PayPal abandonment on read.
An overdue heartbeat is an operator alert only; no import or payment admission depends on it.
`reconcile_pyusd_attempts` joins `MAINTENANCE_TASKS` in S17, so that edit shows in the S17 diff.

**Tests.**
Gate 3: `maintenance cannot capture`, `maintenance run is finite`, `overlapping runs claim disjoint work`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `only an operator reads the operator health view` | An anonymous buyer session and a signed-in merchant without the operator flag each get 404 `not_found` and no health data from `GET /health/operator`, and a flagged operator gets the view. | Two guards, two mutations: drop `requireOperator` from the route, and both refusal cases fail; let the guard accept any permanent account, and the merchant case fails while the anonymous case still passes. |

**Evidence.**
Two manual runs labeled manual, their heartbeat values, capacity readings with the `pg_database_size` limitation stated, and the build-graph check output.

**Scheduled workflow.**
`.github/workflows/maintenance.yml` is created in S5 only if the cadence decision is recorded, remaining private minutes are confirmed or the repository is public, and you authorize creating it.
Otherwise it is created in S15.

**Falsifier and response.**
If the build-graph check cannot prove the runner unable to reach the capture module, stop and fix the module boundary (R9) before continuing.

**Authorizations to request at start.**
Create the `envoi_maintenance` role; migrations, push and deploy.
You perform: creating the deployed operator account with `create-merchant` and flagging it with `grant-operator`, typing its password yourself.

### S7 Merchant destination and publication

Branch: `envoi/slice-7-publication`.

**Visible result.**
The merchant selects the operator-prepared sandbox PayPal connection and publishes.
Buyers now see that shop and buy from it end to end through the S2 path.
The merchant then edits a price: buyers keep seeing the last confirmed menu until republication, and a buyer holding an old review is told the price changed and must review again.
A buyer whose PayPal payment for a basket is still checking cannot open the same basket again on the republished menu; once a review window passes with no capture sent, the basket opens again with no maintenance run.
Two reviews of one basket, one opened on each side of a republish, cannot both start a PayPal payment.

**Builds.**
`PUT /merchant/outlets/{id}/destinations/paypal` limited to the assigned connection; `POST publish` as one transaction rechecking all four preconditions and switching the published pointer atomically; published-revision and destination checks inside `assertPaymentEligible`; operator `approve-enrollment`.
`computeBasketLockKey`, `moneyCanStillMove` and `findBasketLock`, called at review creation and again inside `paypal/start`.
There, as Gate 3's call stack specifies, the start locks every purchase of the buyer with the same basket lock key in id order and calls `findBasketLock` with `lockRows: true` over the others before it claims an attempt slot.
S7 is the first slice where one basket can get a second checkout key, through a republished revision or a changed destination, because neither operator setup command changes an existing outlet (D1).
S16 adds the same recheck to the second `pyusd/prepare` transaction, so a PYUSD cut leaves Gate 3's `paypal/start` contract complete.

**Tests.**
Gate 3: `publication requires all four preconditions`, `editing a published menu creates an unpublished revision`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `republication invalidates an open review at execution` | A review pinned to a replaced revision fails at `paypal/start` with `review_invalidated`. | Skip the published-pointer re-read; the test fails. |
| `destination change invalidates an open review` | A review pinned to a changed destination fails the same way. | Skip the destination version check; the test fails. |
| `arbitrary merchant id cannot connect` | A merchant id supplied in the request body is refused. | Accept the body value; the test fails. |
| `a payment that can still move blocks the same basket on a republished menu` | With a PayPal attempt in `capture_unknown` on the old revision, a review of the same lines on the republished revision is refused with `execution_locked`. | Key the lock by menu revision; the test fails. |
| `a PayPal order abandoned before capture does not lock a republished basket` | A PayPal attempt in `order_created` whose review passed `T_REVIEW`, with its purchase still stored as `pending_payment`, does not block a review of the same lines on the republished revision, with no maintenance run. | Lock on any `pending_payment` purchase; the test fails. |
| `two PayPal reviews of one basket across a republish cannot both start` | Review P1 on the old revision enters `paypal/start`, and an injected barrier holds it after its locks and eligibility check, before its attempt is saved. The merchant republishes, the buyer opens review P2 of the same lines on the new revision, and P2's start runs; P1 is released once P2's start has returned or is seen waiting on a lock in `pg_stat_activity`. Exactly one attempt is saved, and P2's start answers `execution_locked`. | Two guards, two mutations, each failing the test on its own: check the lock only at review creation; check it in `paypal/start` without first locking the buyer's same-basket purchases. |

The last three keep the PayPal half of the lock tested if PYUSD is cut.
Two of them re-test guards that S16's Gate 3 tests exercise again; each is one guard tested twice, not two guards proven by one fault.
S16's `an abandoned PayPal order does not lock its basket` exercises the abandonment rule across rails.
S16's `two open reviews of one basket cannot both start payment` applies its two mutations to the second `pyusd/prepare` transaction, with the PYUSD start second, because the test above already proves the `paypal/start` half.

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

### S11 Menu photo import with direct vision

Branch: `envoi/slice-11-menu-import`.

Merged on 2026-10-12 from the earlier S11, image intake, and S12, the Zapier draft, as you decided on 2026-10-10.
It now runs before S9 and S10.

**Visible result.**
The merchant opens menu import on `/merchant/setup` and reads the short consent, which is Gate 2's [approved copy](02-architecture.md#request-memory-menu-boundary) word for word:

> Your menu photo is sent to OpenAI to draft item names and SGD prices while you wait.
> Envoi does not store it; only this browser tab keeps a copy, for side-by-side review.
> OpenAI may keep it for up to 30 days for abuse monitoring, or longer where the law or harm prevention requires, and does not train on it unless the account owner opts in.
> Upload only a menu, with no people or personal information.

Gate 2's four "Details" sentences sit behind a "Details" control and belong to the same consent version.
After consenting, the merchant selects a menu photo, and the browser shrinks it to one JPEG of at most 2,048 pixels per side and 2 MiB.
Within 90 seconds an unpublished draft appears: readable SGD prices are filled, and unreadable, non-SGD, ambiguous and duplicate-variant prices stay blank and flagged.
The merchant corrects names, supplies missing prices and availability, confirms and publishes through S7; buyers see nothing until then.
If the response is lost, reloading the draft shows the import's outcome.
A second import while one is live, an import past the daily caps, before a spend ceiling is recorded or while imports are disabled is refused before any photo byte is read, and manual entry stays available throughout.
The operator health view shows import outcomes, latency, spend reservations and decoder memory.

**Builds.**
`src/lib/http/bounded-body.ts` and `src/lib/http/origin.ts`, whose `assertSameOrigin` S16 reuses; `src/domain/imports/{types,consent,admission,upload,lifecycle,validate-result}.ts`; `src/integrations/ai/menu-vision.ts`; `src/integrations/image/normalize.ts`, the only module that imports `sharp`; the `menu_imports` and `menu_import_admission` tables; `POST /merchant/outlets/{id}/menu-imports` as a Node route handler that no proxy matcher covers; `GET menu-draft` returning the latest import outcome, derived on read; `commitImport` with its membership recheck and the edit-preserving merge; the browser shrink and the consent screen; allowlisted `SafeErrorRecord` logging and image redaction in the logger; `AI_MENU_MODEL` and `MENU_IMPORTS_ENABLED` in `src/env.ts` and `.env.example`; the spend ceiling and model bounds as reviewed code constants; the import figures in `GET /health/operator`.
No import task joins `MAINTENANCE_TASKS`, and imports do not depend on the maintenance heartbeat.

**Tests.**
Gate 3: group `import route refusals read no body` (4 cases), group `import upload and photo rejects` (8 cases), group `import route static checks` (3 cases), group `menu import admission` (12 cases), group `menu vision request` (8 cases), group `vision draft validation` (8 cases), group `import commit merges nothing unless every recheck passes` (4 cases), `re-encoded photo carries no metadata`, `import writes nothing to disk`, `concurrent admissions admit one`, `aborted attempt keeps its spend reservation`, `model dispatch is recorded before the call`, `image bytes never reach logs, responses or audit`, `import tables have no image column`, `an abandoned import reads as expired with no write`, `draft reload reports the latest import outcome`, `merchant edits survive a merge`.

Seventeen named tests in 57 cases.
Six of its cases keep names approved on 2026-10-07 and assigned to S12 in the earlier draft: five group cases and the standalone `merchant edits survive a merge`.
No additions: Gate 3's 2026-10-11 revision gave every import guard its own case.

**Vision model evaluation (R5).**
Before the first vision call, the fixture photo set of English menus, including rotated and small-price text, the expected draft for each photo, the pass threshold and a latency bound are written into `00-status.md`.
Only candidates with image input, strict structured output and no published shutdown before 16 Dec 2026 are run.
Every result is reported, and the chosen model is recorded as the `AI_MENU_MODEL` value.

**Evidence.**
One consented photo imported on Render, with its latency, its actual usage against its reservation and its peak memory.
The leak probes on the deployed build: no file written; the scanner detects the injected base64 needle in the actual serialized log format, and the needle is absent from logs, responses and audit rows; no image column exists.
The `sharp` build on Render Free and its decode memory against 512 MB (R6).

**Exit decision.**
Real merchant photos stay blocked until the leak probes pass on Render, you confirm there is no OpenAI data-sharing opt-in, a daily spend ceiling is recorded, and you approve real photos.
The decision is recorded in `00-status.md`.

**Falsifiers and response.**
- No candidate meets the pre-registered threshold: manual entry stays, no AI-drafting claim is made, and Gate 1 menu-import scope reopens.
- `sharp` fails on Render Free, or decoding breaks the memory or time budget: switch to a pure-JS decoder with a lower cap and disclose the weaker metadata-stripping claim (R6); limits are never loosened in code to make a run pass.
- Any image byte reaches a log, response, audit row, file or database column: imports stay disabled until it is fixed.

**Authorizations to request at start.**
Install `sharp`; spend on the vision evaluation within your ceiling; record the ceiling and model bounds as reviewed code constants, which needs a commit; migrations, push and deploy.
You perform: the OpenAI data-sharing check, the ceiling choice and the evaluation photos.

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

### S16 PYUSD devnet purchase

Branch: `envoi/slice-16-pyusd-purchase`.

Starts only after the Phantom and devnet-funds access checks pass; otherwise PYUSD is cut, first in the cut order.

**Visible result.**
The demo merchant connects a Phantom devnet wallet on `/merchant/setup` by signing a five-minute challenge, which proves key control and nothing else, and sets a PYUSD rate shown with today's date.
A buyer picks PYUSD on the review and sees the shop's rate, its date and the rounded-up PYUSD amount, labeled devnet test tokens.
Phantom on devnet is asked once; after it sends, the receipt says "Transferred and finalized on Solana devnet" with the signature, recipient and amount, and the merchant orders page shows the order paid.
On a phone without a wallet, the review shows "Open in Phantom" instead of a pay button.
With `PYUSD_ENABLED` off, the RPC unreachable or the devnet identity wrong, PYUSD shows as unavailable with the reason and the PayPal journey still completes.
While a basket's payment can still move on one rail, the same basket cannot be reviewed or started on the other.

**Builds.**
The five PYUSD pins; `src/domain/pyusd/{constants,identity,mint,rate,challenge,attempts,state,verify}.ts`; `src/integrations/solana/{rpc,limiter,build,decode}.ts`; the wallet-challenge and RPC limits in `src/lib/ratelimit.ts`, beside S4's public-route limits; `assertSameOrigin` from S11's `src/lib/http/origin.ts` on every PYUSD browser mutation; the `wallet_challenges` and `pyusd_rates` tables, the limiter rows, PYUSD columns on `payment_attempts` and PYUSD rows in `payment_destinations`; `POST destinations/pyusd/challenge`, `PUT destinations/pyusd`, `PUT pyusd-rate`, `POST /purchases/{id}/pyusd/prepare` and `pyusd/submitted`; PYUSD pricing in `priceBasket` and the rate version in the checkout key; the basket-lock recheck inside the second `pyusd/prepare` transaction, beside the `paypal/start` recheck S7 built; hint verification through the shared `reconcile` route before expiry, which needs `src/domain/pyusd/recovery.ts` with `decideRecoveryStep`'s hint branch: for a `prepared` attempt it yields `verify_hints_then_wait`, so the readable hint is verified, as Gate 3's PYUSD recovery call stack does on both sides of the attempt's bound; `src/lib/wallet/{standard,phantom-browse}.ts`, `pyusd-pay.tsx` and `pyusd-wallet.tsx`; the PYUSD receipt copy; `SOLANA_RPC_URL` and `PYUSD_ENABLED`, which is off by default.
The real unavailable reasons replace D8's static option.
No post-expiry scan, PYUSD maintenance task or PYUSD operator act exists yet; those are S17.
Until S17 adds the expiry branch, nothing moves a `prepared` attempt past its bound to `expired_scanning`, so it stays locked; that is why the exit decision below keeps PYUSD off outside proof runs.

**Tests.**
Gate 3: group `PYUSD identity check` (3 cases), group `PYUSD static boundary checks` (7 cases), group `merchant PYUSD routes` (17 cases), group `rate parsing, bounds and conversion` (4 cases), group `PYUSD pricing` (2 cases), group `mint eligibility for a transfer` (5 cases), group `PYUSD preparation` (15 cases), group `PYUSD attempt constraints` (2 cases), group `browser wallet handoff` (4 cases), group `signature hints and reconcile before expiry` (8 cases), group `PYUSD verification by meaning` (22 cases), group `bounded RPC transport` (4 cases), group `shared RPC limiter` (5 cases), `only two settings configure the PYUSD rail`, `PYUSD failure leaves PayPal working`, `a PYUSD-only shop cannot publish while PYUSD is disabled`, `wallet proof verifies the saved challenge bytes`, `wallet challenge is single-use`, `a changed PYUSD rate is a new checkout`, `rate change never alters a prepared attempt`, `prepared transaction is exactly a memo and one TransferChecked`, `cancel after PYUSD preparation reports checking`, `phone without a wallet gets the Phantom link, not a pay button`, `PYUSD receipt says transferred and finalized on devnet`, `a PYUSD mismatch can close only unpaid`, `an unresolved payment blocks the same basket on the other rail`, `an abandoned PayPal order does not lock its basket`, `two open reviews of one basket cannot both start payment`.

Twenty-eight named tests in 113 cases: Gate 3's PYUSD purchase unit, 25 named tests in 110 cases, plus three of its five basket-lock tests, which need both rails.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `PYUSD pins build together` | The five PYUSD pins typecheck under `typescript@6.0.3`, the pin resolved by the S1 boot check, resolve `@solana/sysvars` through `@solana/kit@8.4.0` without a second copy, and build in the browser and Node bundles. | None. This is Gate 3's PYUSD boot check, a falsifier, not a guard. |

**Evidence.**
All on devnet with test tokens, and labeled so.
- One real Phantom payment from the buyer to the merchant's token account, with its signature, the decoded landed transaction and every instruction Phantom added beside the prepared memo and transfer.
- R13: whether Phantom honors `solana:devnet`, displays this mint and keeps the prepared blockhash, transfer and memo, read from the landed transaction rather than the wallet screen.
- R14: on each target phone, whether the Phantom Browse link keeps its query and whether the wallet browser completes a fresh review and payment.
- R17: RPC throttling seen from Render, with the limiter counts.
- A one-off read-only devnet recheck that the Lighthouse program is still executable, recorded in `research.md`.
- The merchant's wallet challenge and its verification audit row.

**Exit decision.**
`PYUSD_ENABLED` is turned on only for the recorded proof runs and back off afterwards until S17 passes, because without S17 an attempt whose wallet response is lost stays locked with no recovery path.
PYUSD opens to testers only after S17, on your authorization.

**Falsifiers and response.**
- Phantom refreshes the blockhash or changes the transfer or memo: stop the rail and reopen Gate 2 (R13).
- Phantom adds instructions outside the allowlist: those payments stay uncertain, and widening the allowlist is a Gate 2 amendment, not a code change.
- The phone path fails: phone PYUSD stays unavailable and no session or purchase ever moves between browsers (R14).
- Any failure keeps PYUSD visibly unavailable and leaves PayPal untouched.

**Authorizations to request at start.**
Install the five PYUSD pins; migrations, push and deploy; turning `PYUSD_ENABLED` on and off on Render for each proof run; read-only devnet RPC reads.
You perform: the Phantom wallets on devnet, devnet SOL and test PYUSD, the merchant's PYUSD token account and the phone checks.
No private key or recovery phrase ever reaches Envoi, a document or a log.

#### S16 amendment 2026-10-18: Phantom landing

Branch: `envoi/slice-16-phantom-landing`, from `main`, built after S17 and before S14.

**Visible result.**
On a phone without a wallet, "Open in Phantom" on a PYUSD review opens Phantom's browser straight on a fresh PYUSD review of the same basket, with its Pay button; no shop page, PayPal review or switch comes first.
A refused review leaves the shop page with the basket filled in and the refusal's message.

**Builds.**
`buildPhantomBrowseLink` adds `rail=pyusd`; `/buy` with `rail=pyusd` and a basket asks once, on landing, for the PYUSD review through the ordinary `POST /purchases` and opens it.

**Tests.**
Gate 3's case `Phantom link carries only public outlet and item ids and the rail` (renamed, `rail=pyusd` added to what it asserts), and a slice test that a landing with `rail=pyusd` and a basket requests exactly one PYUSD review and opens it, and that a refusal keeps the basket and shows the message, each with its own mutation.
Like the S16 review fixes, the slice test is recorded in `00-status.md` and is not a named addition, so no count in [Test assignment](#test-assignment) changes.

**Evidence.**
R14 again on the user's iPhone: which page Phantom's browser opens first, and one payment confirmed on the receipt.

**Authorizations to request at start.**
Push and deploy; turning `PYUSD_ENABLED` on for the phone check (the user's Render change).

### S17 PYUSD recovery

Branch: `envoi/slice-17-pyusd-recovery`.

**Visible result.**
In a labeled fake-chain harness, an attempt whose wallet response was lost shows "Checking payment" and stays locked until the finalized height passes its bound and a complete scan of the merchant account's history decides it.
A verified transfer confirms it, a mismatching one marks it uncertain and operator-visible, and a complete empty scan holds it while automatic unpaid release is off.
On devnet, one real payment whose signature hint is withheld is confirmed by a manual maintenance run.
An extra transfer from one release keeps the purchase paid and is shown on the buyer receipt, the merchant orders page and the operator health view, which also lists held and mismatched attempts with their scan coverage.
The operator closes a mismatch only as unpaid, with recorded evidence, after its window scan completes, and records an out-of-band refund reference against an extra transfer without changing any payment state.

**Builds.**
the rest of `src/domain/pyusd/recovery.ts`, beyond S16's hint branch: the expiry branch of `decideRecoveryStep`, scan coverage, release and candidate classification; post-expiry window scanning with persisted cursors and lease claims through the shared `reconcile` route; `reconcile_pyusd_attempts` added to `MAINTENANCE_TASKS` with `SolanaReadClient`; the `pyusd_extra_transfers` table; extra transfers on the receipt and the merchant orders page; held, mismatched and extra-transfer rows in `GET /health/operator`; operator `resolve-pyusd-mismatch` and `record-extra-transfer-refund`, each refusing an account without the operator flag that S5's `grant-operator` sets (D1); the maintenance-role grants (D7).
`PYUSD_PROOFS.automaticUnpaidRelease` stays false.

**Tests.**
Gate 3: group `PYUSD recovery over a fake chain` (15 cases), `web and runner cannot scan one attempt at once`, `a second reference landing is an extra transfer`, `PYUSD receipt shows a detected extra transfer`.

| Addition | Asserts | Mutation |
| --- | --- | --- |
| `merchant orders show a detected extra transfer` | A paid PYUSD order with one extra transfer lists it, with its amount, on the merchant orders page and never as refunded. | Hide extra transfers from the merchant orders page; the test fails. |
| `mismatch resolution waits for a complete window scan` | `resolve-pyusd-mismatch` refuses while the attempt's window scan is incomplete and changes nothing. | Skip the scan-completeness check; the test fails. |
| `mismatch resolution needs recorded evidence` | The act refuses without an evidence reference, and on success its audit row names the operator account, the reason and the evidence. | Make the evidence optional; the test fails. |
| `a refund needs an out-of-band reference` | `record-extra-transfer-refund` refuses an empty reference. | Accept an empty reference; the test fails. |
| `a refund reference changes no payment state` | Recording a reference leaves the purchase `paid` and the attempt and its bound evidence unchanged, and the receipt never says Envoi refunded anything. | Let the act close the purchase; the test fails. |
| `mismatch resolution needs a flagged operator account` | `resolve-pyusd-mismatch` naming an existing permanent account without the operator flag, or an unknown account, refuses, writes no audit row and leaves the attempt in `mismatch`; naming a flagged account succeeds. | Skip the flag check in `resolve-pyusd-mismatch`; the test fails. |
| `a refund reference needs a flagged operator account` | `record-extra-transfer-refund` naming an account without the operator flag refuses and records no reference or audit row; naming a flagged account succeeds. | Skip the flag check in `record-extra-transfer-refund`; the test fails. |

Gate 3's `a PYUSD mismatch can close only unpaid`, in S16, already proves that no path leads from `mismatch` to `confirmed`.

**Evidence.**
The labeled fake-chain transcript; one real devnet payment confirmed by a manual maintenance run with no hint; whether devnet signature history reached back before preparation within the page and fetch caps (R17); the audit rows of both operator acts on a fixture attempt.

**Exit decision.**
`PYUSD_PROOFS.automaticUnpaidRelease` changes to true only after S16 recorded exact blockhash preservation, a complete-history scan has been shown on devnet, and you approve the change, which is a reviewed commit.
Until then, a buyer who cancels in Phantom stays "checking payment" for that basket in that browser session (R17).

**Falsifiers and response.**
- A landing inside the window can go unrecorded: PYUSD stays disabled, as Gate 2 requires.
- Devnet history is pruned or throttled so that scans cannot complete: attempts stay locked, never released, and the gap is reported.

**Authorizations to request at start.**
Maintenance-role grants, migrations, push and deploy; manual maintenance runs with `SOLANA_RPC_URL`; opening PYUSD to testers; any change to `PYUSD_PROOFS.automaticUnpaidRelease`; using either operator act on a real attempt.

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
A public repository with an open-source license; a README with setup, reset and the fixture, sandbox and devnet labels; scheduled maintenance running on public runners; the usability result; a public video under three minutes; an evidence pack linking every claim to its record.

**Work.**
- Scan the full Git history for secrets, including Solana secret-key arrays, with an injected self-test before visibility changes, and review non-secret identifiers in the documents, such as the Neon project and organization ids, before they become public.
- Create `maintenance.yml` at hourly minute 17, if S5 did not.
- R2 decision: approve an operator runbook for storage exhaustion, rehearsed on a separate throwaway Neon project or branch, or explicitly accept residual risk R2; recorded in `00-status.md` before the usability test.
- Re-measure an idle cold first visit on the release build.
- Run the full suite and the mobile and keyboard checks.
- Run the Gate 1 usability test with five first-time buyers, recording each tester's entry point and payment rail and keeping every failure and help request.
- Confirm Render, Neon, Actions and OpenAI access and capacity through 16 Dec 2026, and, if PYUSD shipped, the devnet RPC, the mint identity and test-token access, because devnet can reset (R17).

**Authorizations to request at start.**
The license choice, the repository visibility change, workflow creation, and the final merge, push and deploy.
You perform: the YouTube upload and the Devpost submission.

## Test assignment

Every one of the 92 named tests in the re-approved Gate 3 test plan, 71 standalone tests and 21 groups covering 231 cases, is assigned to exactly one slice.
The ten names the Gate 3 [test delta](03-program-design.md#test-delta-for-the-gate-4-revision) removed are assigned nowhere.
39 named additions: 33 cover approved Gate 2 and Gate 3 contracts with no named test in the slice that builds them, four are test refinements this plan adds (the two D1 setup-command rules, the D8 rail refusal and the D6 OpenAPI document), and two are pin falsifiers.
The 33 are the 28 of the review's major fixes plus the two D9 limits on Gate 3's public-route limiter, the two operator-flag checks Gate 3's authorization table requires of the D1 PYUSD acts and the one D10 kill switch of Gate 3's 2026-10-12 reopening.
Two of the 33, both in S7, re-test the PayPal half of guards that Gate 3 names a test for in S16, so PayPal keeps them if PYUSD is cut.

| Order | Slice | Gate 3 named tests | Gate 3 cases | Additions | What the Gate 3 tests cover |
| --- | --- | --- | --- | --- | --- |
| 1 | S1 | 3 | 3 | 5 | auth configuration, committed-tree secrets, region latency |
| 2 | S2 | 12 | 12 | 6 | five pricing and checkout identity tests; owned lease; amount and payee mismatch; `GET` return page; expired review; PayPal abandonment; dispatch after the review deadline |
| 3 | S3 | 8 | 8 | 3 | create replay; recreatable create; `capture_unknown`; three webhook tests; cancel after dispatch; polling stops |
| 4 | S4 | 2 | 2 | 3 | invented price; tool budget |
| 5 | S13 | 3 | 3 | 2 | agent receipt read; single redemption; no amount |
| 6 | S6 | 5 | 5 | 1 | merchant route; link membership; link ownership; per-outlet membership; incomplete menu |
| 7 | S5 | 3 | 3 | 1 | maintenance cannot capture; finite run; disjoint claims |
| 8 | S7 | 2 | 2 | 6 | four publication preconditions, one case with four mutations; unpublished revision on edit |
| 9 | S8 | 0 | 0 | 2 | none |
| 10 | S11 | 17 | 57 | 0 | the whole import unit: route refusals, upload bounds, admission and spend, the vision request, leak boundary, draft validation, merge and commit |
| 11 | S9 | 2 | 2 | 1 | unrecognized tags; QR payload logging |
| 12 | S10 | 3 | 3 | 0 | unenrolled sticker; shared identifier; no destination or rail |
| 13 | S16 | 28 | 113 | 1 | the whole PYUSD purchase unit, plus the three cross-rail basket-lock tests |
| 14 | S17 | 4 | 18 | 7 | the whole PYUSD recovery unit |
| 15 | S14 | 0 | 0 | 1 | none |
| 16 | S15 | 0 | 0 | 0 | none |
| **Total** | | **92** | **231** | **39** | |

By Gate 3 slice unit: the 41 core tests keep the earlier draft's placement; the five basket-lock and PayPal abandonment tests split two to S2 and three to S16; the import unit goes to S11, the PYUSD purchase unit to S16 and the PYUSD recovery unit to S17.

## Schedule and cut order

- **Checkpoint, 25 Oct.** If the nine slices through S8 in build order (S1-S4, S13, S6, S5, S7 and S8) are not all done, apply the cut order before starting S11.
- **PYUSD go/no-go, when S11 is done [hypothesis].** Before S9 starts, you decide whether PYUSD stays in the plan.
  Go needs both PYUSD access checks, Phantom on devnet and devnet funds, to have passed by then.
  No-go cuts S16 and S17 at that point, as item 1 of the cut order below, instead of on 1 Nov, and the rest of the second window goes to S9, S10 and S14.
  If S11 is not done by 28 Oct, the decision is taken on 28 Oct.
  The date is a planning guess, set so that the decision leaves days to use rather than arriving after the window is spent.
- **Checkpoint, 1 Nov [hypothesis].** S15 starts on 2 Nov whatever remains.
  Any unfinished slice in the cut order is cut in that order; an unfinished slice that is never cut is reported to you with its evidence rather than dropped silently.
- **Cut order.**
  1. **PYUSD, S16 and S17 together.** Gate 1 makes PYUSD the first cut, so cutting it needs no reopening.
     S7 already built the PayPal half of the basket lock, so no Gate 3 contract loses a part.
     PYUSD stays visibly unavailable with its cut reason (D8), PayPal is untouched, and the decision is recorded in `00-status.md`.
     S16 without S17 never opens to testers.
  2. **Scan, S10.** It is an approved Gate 1 entry point, so cutting it reopens Gate 1 first.
     That reopening also decides whether S9's merchant SGQR mapping stays.
  3. **S14.** Gate 1 makes it conditional on account access, so dropping it for missing access needs no reopening, while dropping it for schedule is recorded as your decision.
     You moved it below scan on 2026-10-10 because APIMatic is the stronger sponsor-prize candidate.
- **Never cut:** payment evidence, approval checks, recipient verification, menu confirmation, no-image-retention controls and uncertainty handling.
  In slice terms: S2, S3, S7, S11's admission and leak boundary, S17 whenever S16 is open to testers, and the S15 evidence.
  Cutting S11 itself would reopen Gate 1, because manual entry alone cannot support the AI-drafting scope.

## Not in this plan

- **Merchant offers and negotiation**, roadmap candidate 14.
  Optional in Gate 1 and first to go.
- Voice, AG Grid and catalogue breadth.
- Mainnet PYUSD and production continuation P1-P4, which need reopened gates of their own.
- Zapier and stored menu images, removed by your decision of 2026-10-10.

## Least confident decisions

1. **Buyer journey before merchant screens.** S2-S4 and S13 use an operator-seeded, labeled fixture shop, so the full buyer journey, the agent handoff and a usability pilot exist early.
   The cost is that merchant onboarding lands at the end of the first window.
   The alternative is to build S6-S8 before S4.
2. **Stable slice IDs instead of renumbering.** Approved Gates 2 and 3 name slices by these IDs, and renumbering would silently change what those references mean.
   The cost is that the next slice is not always N+1, so the Order column and each `Continue to slice` question name it by ID.
   Rule 1 makes every start name a slice ID and resolves a request without one by asking.
3. **S11 before S9 and S10.** Not asked for.
   The import is never cut and depends on your OpenAI decisions, while scan is cut second, so a slip after 25 Oct should land on scan rather than on the import.
   The alternative keeps the earlier S9, S10, S11 order.
4. **PYUSD as two slices, as Gate 3 grouped it.** S16 carries 28 named tests and 113 of the 231 cases, about half of all cases.
   Splitting the merchant wallet and rate from the buyer purchase would make it smaller.
   It would also regroup three Gate 3 groups by case and leave the first half without a purchase anyone can make.
5. **The PayPal half of the basket lock, at review creation and inside `paypal/start`, lands in S7, not S16.** The lock is Gate 2's rule for both rails, and PYUSD is cut first.
   Tying either check to S16 would leave PayPal without it after a cut and change Gate 3's `paypal/start` contract.
   S7 is the first slice where one basket can have two checkout keys, because the D1 setup commands never change an existing outlet.
   The alternative is S2, earlier, but testable there only with fixture-made revisions.
6. **PYUSD is enabled only for proof runs until S17 passes.** It is safer, but the S16 demonstration needs your flag changes on Render.
   The go/no-go after S11 may cut PYUSD before either slice starts.
7. **S1 carries four proofs**: package compatibility, the auth schema pin, Render hosting and the R12 latency measurement.
   Splitting hosting into its own slice would make S1 smaller, but the tracer's value is that it runs on the real host.
8. **An operator CLI instead of operator pages (D1)**, now also for the PYUSD mismatch and refund acts.
   It adds no web attack surface, but every operator act, including one during judging, needs the human operator at a terminal with migration credentials.
   Those credentials could name any account, so the PYUSD acts check the operator flag; the CLI still trusts whoever holds the credentials.
9. **Local PostgreSQL for tests (D3).** It still needs an install on this Mac.
   A Neon test branch avoids the install but spends shared quota and history and adds trans-Pacific latency to every test query.
10. **The 18-second R12 threshold** is a proposal, set in advance so the measurement cannot be explained away afterwards.
11. **Sixteen slices in about four weeks.** S13's move makes the first window nine slices, and the second window holds the two largest, S11 and S16.
    The checkpoints, the PYUSD go/no-go and the cut order exist because this is tight, **[hypothesis]**.
12. **Repository goes public in S15.** Going public earlier would make Actions minutes free and allow hourly maintenance sooner, and the rules require it for submission anyway.
    It would also expose unfinished work for longer.
13. **A static "PYUSD unavailable" option in S2 (D8).** It satisfies Gate 1 before any PYUSD code exists, but shows a rail that may later be cut.
    A cut changes only its reason text.
14. **The R2 storage-exhaustion decision in S15, not S11.** Not asked for.
    The earlier draft tied it to S11 because image churn drove storage; direct vision stores no image, so R2 now concerns payment-state writes in general.
    The cost is that the runbook or the accepted risk is decided late, just before the usability test.
15. **The D9 public-route limits** of 10 suggestion requests per session in 10 minutes and 100 an hour overall are guesses.
    Too low blocks a usability tester; too high lets anonymous sessions spend OpenAI credit until your provider-side limit stops it.

## What approval covers

Approving Gate 4 accepts this slice order, the test assignment, the cut order, deltas D1-D9 as refinements and D10's placement in S2.
D10 also rests on Gate 3's re-approval of its 2026-10-12 reopening, which S2 needs before it starts.
It does not start any slice.
It does not authorize installing packages, provisioning accounts or roles, creating workflows, committing, pushing, merging, deploying, changing repository visibility, sending real merchant photos to OpenAI, choosing a model or a spend ceiling, using a wallet or faucet, enabling PYUSD, changing `PYUSD_PROOFS.automaticUnpaidRelease` or spending money.
Each slice starts only on an authorization that names its slice ID, as rule 1 says, and its external actions are requested by name at that point.
