# S27 MCP client continuation

Current scope update, 2026-11-02: the release below is complete and the user has now authorized the remaining S27 payment checks for the next agent. This session only writes `docs/plans/envoi/evidence/s27-payment-handoff-2026-11-02.md` and records the authorization locally. Earlier no-payment-authorization statements are historical. No checkout, US fixture creation or wallet action ran during handoff preparation.

Updated 2026-11-02, Asia/Singapore. Gate authority is `docs/plans/envoi/00-status.md`.

- [x] Record Gate 3 and Gate 4 approvals, including checker pins and mirrors.
- [x] Publish exactly eight gate files to main, commit `94df453`, verified with `git ls-remote`.
- [x] Sync main into `envoi/slice-27-us-shops`, merge `f72ed9f`. Only documentation was published.
- [x] Baseline focused unit run: 4 failures in buyer-agent, 8 passes. Existing generated-client price mismatch.
- [x] Prove missing MCP structured answers with the real route, then add shared tool definitions and schemas.
- [x] Connect both assistants through the SDK client; preserve budgets, links and trace boundaries.
- [x] Replace the REST fake with a real MCP server over in-memory transport; add named tests 17 and 36.
- [x] Remove APIMatic runtime files, obsolete checks and its webpack rule. Fold the terminal agent into root checks.
- [x] Prove new guards independently by mutations, restoring exact bytes and rerunning.
- [x] Run typecheck, lint, unit, integration, isolated build, public HTTP contract and documentary checks.
- [x] Record implementation evidence and remaining external S27 actions. No implementation commit or push authorized.

Existing untracked user files: `paypalhackathonfullrequirements.rtf` and four S27 handoff text files in `docs/plans/envoi/evidence/`. Never stage them.
Do not read `.env` or `.env.local`, or print APIMatic configuration. No external account, model or database actions are authorized by this code-start request.

Implementation interfaces: shared MCP tool definitions serve the route and fixture server; the client validates the same schemas. The agent owns one connection per turn; tools own budgets and proposal validation. HTTP status comes from the transport, never a fabricated REST status.

Beyond the Gate 3 file list: `agent.ts` must own connection lifecycle; shared tool definitions must live outside the Next route so client/tests can import them without loading the web database; the obsolete generated-client webpack rule and its test must go with the client. These are ownership/cleanup consequences of the approved switch.

Baseline command: `env -u DATABASE_URL -u MIGRATION_DATABASE_URL -u MAINTENANCE_DATABASE_URL npm run test:unit -- tests/unit/buyer-agent.test.ts tests/unit/assistant.test.ts`. Full output at `/tmp/envoi-mcp-baseline.log`.

Final verification: 674 tests in 90 files pass, no unhandled errors. Typecheck/lint and isolated build pass. E2E REST/MCP at port 3117 passed; server stopped and DB dropped. 18 mutation proofs passed; checker proofs 80/80. Docs-only main CI 41408301808 passed. Runtime source matches the isolated build.

Review fixes: abort now reaches initialized notification HTTP; error parsing uses core Zod error to cover SDK Mini Zod. A prior combined test run had an uncaught late fixture write after body cancellation, fixed by canceling the fixture producer timer. Logs are `/tmp/envoi-mcp-review-red.log`, `/tmp/envoi-mcp-review-green.log`, `/tmp/envoi-mcp-full-suite.log` and `/tmp/envoi-mcp-final-verification.log`.

Build copy: `/var/folders/zn/8xx89l71235c5k2qhc_k3ck80000gn/T/envoi-mcp-build-wlg5af90`, local env files excluded. Build/HTTP logs: `/tmp/envoi-mcp-build-final.log`, `/tmp/envoi-mcp-http.log`. Implementation remains uncommitted. No external S27 work occurred.

## Resume verification, 2026-11-02

- [x] Re-verified branch `envoi/slice-27-us-shops`, HEAD `f72ed9f`, and local main/tracking main `94df453`. No remote lookup made.
- [x] Fresh `npm test` with the local TEST_DATABASE_URL and external database variables unset: 674 tests in 90 files pass. Typecheck, lint and `git diff --check` pass. Logs: `/tmp/envoi-s27-resume-{suite,typecheck,lint}.log`. The missing-object Git diagnostic comes from the history scanner's intentional missing-remote-ref fixture.
- [x] Fresh gate checker and documentary mutation proofs pass. Logs: `/tmp/envoi-s27-resume-{docs,proofs}.log`.
- [x] All 18 existing MCP mutation entries pass and their source hashes still match. All 193 compared build inputs match the existing isolated build. Build, HTTP checks and MCP mutations were reused, not rerun.
- [x] Prepared `/tmp/envoi-s27-proposed-commit-files.txt`: 103 tracked changes and six new implementation/evidence files. Protected user files and this uncommitted progress record are excluded. Nothing staged.
- [x] Named authorization received, 2026-11-02: "yes authorze" to committing the MCP changes and pushing `envoi/slice-27-us-shops` for CI. Main merge, Neon actions, deployment and sandbox captures remain separately gated by `s27-deploy-plan.md`.
- [x] Committed the 109-path reviewed manifest as `bdc87a49dab3e4b84bad1d0085687c79c2d4181e` and pushed only `envoi/slice-27-us-shops`. `git ls-remote` confirms the exact branch SHA and main still `94df453`.
- [x] CI run `41414544915` passed all steps for `bdc87a4`; watcher log `/tmp/envoi-s27-ci-41414544915.log`. Connector returned no status details, so `gh run list/watch` was used for the push-triggered run.
- [x] Published the four-file documentary result as `89ab2cd08e2201393811d9beaf730ffd0f18ccbd`, after the local gate checker and diff check passed. The branch SHA is remotely verified; main remains `94df453`. Its automatic CI is a separate run from the passing implementation run.

## Read-only Neon preflight, 2026-11-02

- [x] Latest branch CI `41415253875` passed on `89ab2cd`; remote main remains `94df453`.
- [x] The user answered "Authroize" to the named read-only Neon preflight. No database write, release, rollback, payment or new Git action is authorized.
- [x] `/tmp/envoi-s27-neon-preflight.mjs` ran with `node --import tsx`, using installed postgres and the existing `pgConnection` TLS handling. It loads saved credentials without printing them. First direct-endpoint guard stopped before any database query because the saved migration URL is pooled; the matching direct hostname was then derived and its endpoint/database identity compared with the configured web target.
- [x] Direct verified-TLS owner connection succeeded. Snapshot transaction is repeatable read and explicitly read only. All migration hashes/timestamps through 0026 match; 0027 absent. Snapshot passed at 17:08:52 Asia/Singapore. Saved sanitized JSON: `docs/plans/envoi/evidence/s27-neon-preflight-2026-11-02.json`. Log: `/tmp/envoi-s27-neon-preflight.log`.
- [x] Totals and basket keys recorded. Counts: 3 outlets, 34 menu items, 49 purchases, 19 attempts, 58 lines. No open purchases or non-SGD purchases/attempts; uncertain count 2. No database writes ran. The country column does not exist yet, so physical merchant location was not established.
- [ ] Coordinate a separately authorized release with a refreshed baseline, Render environment/rollback readiness, main merge/push, deployment, direct-endpoint migration 0027 and maintenance verification. Sandbox capture checks remain later authorized actions. Preflight evidence and documentary updates remain uncommitted.

## Coordinated release, 2026-11-02

- [x] User explicitly authorized evidence commit, merge/push main, deployment, migration 0027, maintenance verification and documented conditional rollback. No sandbox payment/US fixture/later slice authority.
- [x] Render dashboard accessible in CUA Chrome tab 998841210, `renderTab`. Live pre-S27 deployment `dep-dbk3uvjbc2fs73e35lf0`, commit `94df453`; recent rollback links enabled. Render DATABASE_URL normalized identity hashes to the Neon preflight target fingerprint. Revealed only for DOM-backed identity comparison, never printed, then masked again. No settings changed.
- [x] Prepare migration/after-check commands, run maintenance on old main and refresh preflight.
- [x] Commit scoped evidence, fast-forward main, run full local tests and push after maintenance succeeds.
- [x] Watch Render live, migrate immediately on the verified direct endpoint, compare totals and inspect served build/SGD menu/scan.
- [x] Dispatch new-main maintenance, verify its heartbeat and CI, publish result evidence.
- [x] Verify final evidence commit CI/deploy, then report remaining sandbox payment and US fixture work. S27 remains incomplete.

Release boundary: maintenance `41419115035` passed on old main. Refreshed baseline at `2026-11-02T09:17:19.671Z` passes with all original totals unchanged. Evidence commit `a7f60cb` is on the slice branch and fast-forwarded locally into main. Main has not yet been pushed. Current rollback target remains Render `dep-dbk3uvjbc2fs73e35lf0` at `94df453`. Prepared `/tmp/envoi-s27-release-neon.mjs`: mode `migrate` calls the existing migration runner on the verified direct endpoint; modes `after` and `maintenance` compare against the refreshed baseline in read-only transactions. No migration has run. Running fresh merged-tree suite at `/tmp/envoi-s27-merged-suite.log`; gate check `/tmp/envoi-s27-merged-docs.log`.

Main push completed: `a7f60cb7816b2c978f3da35367c9cd9b02b64333` pushed after the successful 09:15 maintenance run and the 09:17 baseline. Merged-tree suite passed 674 tests; documentary checker passed. Watching Render for this exact commit to become live before running `node --import tsx /tmp/envoi-s27-release-neon.mjs migrate`. Immediately follow with mode `after`. No migration has run yet. Rollback target is unchanged. Do not repeat the push or migration based only on this log; inspect actual state first.

Critical release update: Render deployment `dep-dbk5av7b9u1s73ccgrk0` of exact commit `a7f60cb` reported live at 17:21:24 Asia/Singapore. The authorized existing migration runner completed at 17:21:44 on the verified direct endpoint, exit 0. Log `/tmp/envoi-s27-migration-0027.log`. **0027 has now run. Do not rerun the old preflight or roll the app back alone.** The after-check is in progress, `/tmp/envoi-s27-release-after.log`. Main CI `41419610639` is still being watched. No payments or US fixture writes have run.

Post-migration snapshot passed at 17:22:04: 28 migration hashes match through 0027; every before/after count and sum is identical; all outlets SG, all purchases/attempts SGD; no old/missing basket keys or open purchases, uncertain count 2. Hosted smoke passed at 17:23:26: registry, Test Shop SGD menu with unitMinor, buyer page and scan page 200; assistant page 404. The first scratch smoke script failed in its own unwrapped-REST assumption; corrected from `httpOk` and the REST menu contract before the passing run, with no product failure found. Merchant setup visually inspected at desktop and 390px: published S26 fixture country Singapore Locked, SGD labels, mobile document width 390 and no horizontal overflow, viewport reset. Main CI `41419610639` passed. Post-release maintenance `41420143081` passed on a7f60cb; read-only heartbeat/amount verification is now running in mode `maintenance`. Release records are not yet committed.

Final runtime checks passed: post-maintenance read-only snapshot has identical counts/sums and manual heartbeat `mnt_gbaabnslvr4kykxg5eign7tpau` status ok, all tasks ok. Decoded the repository fixture SGQR image with installed local ZXing WASM and pasted into deployed `/buy/scan`; it redirected to Test Shop with SGD prices, empty basket and disabled Review. Its approved mapping to Test Shop was verified read-only. The scratch mapping query first assumed a status column; after reading the owning schema it was corrected to `approved_at`, with no database changes. One post-navigation browser snapshot timed out; screenshot and fresh full accessibility tree proved the result. Camera capture was not tested. All evidence/mirrors updated; local documentary checker, secret scanner self-test/actual scan and diff check pass. Publish the scoped result record next; no checkout or US fixture action is authorized.

Published the final seven-file documentary/evidence result as `25a3b1252e150725eabcc9acdcb0a91ac7575ec0` on main, after the gate checker, scanner and diff check passed. Main remote SHA is being verified. No runtime source changed after the passing a7f60cb release. Its automatic CI/deploy is separate; watch those before final reporting. Retained S27 branch and protected user files; nothing stashed, discarded or implicitly staged. 0027 is already applied and must not be run again based on the historical prompts.

Final result: remote main verified at `25a3b1252e150725eabcc9acdcb0a91ac7575ec0`; Render dashboard reports that exact commit live in `dep-dbk5him417fc73bjg74g`. Latest menu GET is 200, SGD, first unitMinor 180. CI watcher `41421571765` exited 0; log `/tmp/envoi-s27-final-ci.log`. Only this progress record and the original protected RTF/four handoffs remain untracked. No rollback was required. The next work is a separately authorized human-approved SGD sandbox capture, conditional PYUSD regression, then US seller/fixture and USD capture, followed by final S27 cleanup. No later slice starts.

Payment handoff prepared, 2026-11-02: the user authorized the named remaining SGD sandbox, US seller/USD and conditional PYUSD checks and asked for a copy-paste prompt. No checks were executed in this handoff-writing turn. The new uncommitted `s27-payment-handoff-2026-11-02.md` contains the eight required sections, verbatim main S27 and relevant Gate 2/Gate 3 contracts, exact authority, updated release evidence, ordering/rollback/credential limits and an independent review prompt. Current status/deploy/evidence/older-handoff mirrors record authorization. Gate checker and secret scanner self-test/actual surface passed; diff check clean. No commits, pushes, live database/provider actions, installs or new slice work occurred. The handoff explicitly distinguishes the published country-column grant from the older Gate 3 row's no-grant wording. Earlier pending-authorization statements in this progress history are superseded by this new authorization.

## Payment verification, 2026-11-02

- [x] A, SGD PayPal: `pur_gmzbuujinxr4eozj47dqdrxcra` paid S$4.00, capture `13X59411JL1833901` to `EQN6264CF9F4Y`, verified 20:19:50 SGT; receipt Paid. Earlier review `pur_h7bus...` expired unpaid.
- [x] B, US/USD: seller `972VTMQPEUZ5A` consented (tracking `envoi-s27-us-fixture-2`, payments_receivable true); dedicated merchant/outlet `out_ft27b47w7r6iu7e74mb23yvydq`; country US locked (`409 country_locked`); USD menu; PYUSD `not_sgd_shop`; `pur_ssy6hdhw33pe2gwakmbvn5ovcq` paid US$7.75, capture `6UJ28034J5731743J`, verified 21:18:03 SGT. `pur_j4ik...` approved after expiry, unpaid_closed, no capture.
- [x] C, PYUSD: `pur_tkeuy5cd2cdamzccxpcwwkgqte` paid S$2.20 as 2.200000 devnet PYUSD, signature `5wBHzXgVr73MeqvSEs24BVZY5KbHGgmBAezTxvZfMAMGknwdS8QkYRz6HeU4Y3dWEbQMEYGHcAxmqAixKsiitjR1`, verified 21:33:28 SGT; finalized Token-2022 `TransferChecked`. `pur_4gwr...` first attempt closed_unpaid with no transfer (blockhash window expired); no money.
- [x] Final read-only inventory: 4 outlets, 36 items, 57 purchases, 24 attempts, 71 lines; 15 paid, 7 unpaid_closed, 2 uncertain, 1 stored open (expired review).
- [ ] Architect-reviewer cleanup and evidence publication.
Evidence: `docs/plans/envoi/evidence/s27-payment-verification-2026-11-02.json`; baseline `docs/plans/envoi/evidence/s27-payment-baseline-2026-11-02.json`. No code, config, dependency, migration or secret changed. Main is still `25a3b12`; the evidence is local and uncommitted.
