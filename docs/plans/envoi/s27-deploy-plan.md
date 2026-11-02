# S27 deploy order and rollback for migration 0027

Written 2026-10-30 on `envoi/slice-27-us-shops`.
This is a plan, not a record: nothing here has run on Neon or Render.
Each step marked **[asks]** needs the user's words for that step by name before it runs.

## Why the order matters

Migration `0027_currency_and_country.sql` renames four amount columns (`unit_sgd_cents`, two `total_sgd_cents`, `capture_gross_sgd_cents`) and the two amount keys in every stored basket line.
The code before S27 reads only the old names, and the S27 code reads only the new names.
So between the migration and the moment Render serves the S27 build, every database read of an amount fails, in either order [hypothesis, from the code; not measured].
Three things run against Neon and are affected:

- The Render web service, which auto-deploys `main` on push (`render.yaml` `autoDeployTrigger: commit`) and keeps serving the previous build until the new one is live.
  A Render Free build has taken 20 minutes or more [user report], so the gap cannot be closed by pushing and migrating at the same moment.
- The scheduled maintenance workflow, hourly at minute 17 (`.github/workflows/maintenance.yml`), which checks out `main`.
- PayPal webhooks, which PayPal retries on failure, and buyers' receipt checks, which reconcile on the next read.

A failed read in the gap leaves the money where it is: no path marks a purchase paid on a failed read, and the reconcile, webhook retry and maintenance paths recover any capture made in the gap [hypothesis, from the S3 and S5 recovery design; not tested across a schema change].

## Preconditions

1. CI is green on the S27 branch, which needs the regenerated APIMatic client (blocked as of 2026-10-30).
   Changed 2026-11-02, Gates 2, 3 and 4 re-approved 2026-11-02: the MCP replacement is published on the S27 branch as `bdc87a4`, and [CI run 41414544915](https://github.com/jaydonnnk/envoi/actions/runs/41414544915) passed typecheck, lint, tests, production build, build scan and the fixture HTTP/MCP check. The generated client is removed, so CI no longer needs a regeneration ([publication record](00-status.md#s27-mcp-client-local-continuation-2026-11-02)). No deployment or Neon precondition is established by this CI result.
2. The US fixture shop does not exist on Neon yet, and no `USD` row exists.
   It is created only after step 8 passes, so the rollback below stays available for the whole risky window.
3. No Test Shop purchase is in `review_open` or `pending_payment` (read-only check in step 1).

## Order

1. **[asks]** Read-only on Neon: the row counts and per-column sums of `totals()` in `tests/integration/currency-migration.test.ts` under the old names, and the count of open purchases.
   Record them.
2. **[asks]** Fast-forward `main` to the S27 tip and push it, right after a maintenance run (minute 17), so the next one is about an hour away.
   Render starts building; the old build keeps serving the old schema, so nothing breaks yet.
3. Watch the Render deploy (the user's dashboard, or the served pages): when the new build reports live, Render starts sending traffic to it.
4. **[asks]** Run `npm run db:migrate` against Neon at once.
   The gap is the time between steps 3 and 4: one to two minutes in the plan [hypothesis].
5. Re-read the same counts and sums under the new names: each must equal step 1.
   If one differs, stop and roll back (below).
6. Verify the served build: a page or file only S27 has (for example `/merchant/setup` JavaScript holding "Where is your shop?") and `/api/v1/outlets/{Test Shop}/menu` answering `"currency":"SGD"`.
7. Trigger the maintenance workflow by hand once (`workflow_dispatch`) and read its result.
8. **[asks]** An SGD PayPal sandbox purchase at Test Shop, read back from Neon as `paid` with `currency = 'SGD'` and the amount unchanged.
   This is the falsifier check: any SGD misbehaviour here means roll back first.
9. Only then: the user creates the US sandbox seller, **[asks]** the operator writes the US fixture shop on Neon, and **[asks]** the USD capture is run and read back from Neon.

## Rollback

Allowed only while no US shop and no `USD` row exists, which the order above keeps true until step 9.

1. In Render, roll the service back to the deploy before S27 (the user's dashboard action; it serves the old build without a new build).
2. **[asks]** Run `drizzle/rollback/0027_currency_and_country.down.sql` on `envoi/slice-27-us-shops` against Neon as the migration role.
   It is one `DO` block, so it applies whole or not at all.
   It refuses if any US shop or `USD` amount exists, or if a migration after 0027 is applied; it restores the 0026 schema and every amount, and deletes 0027's journal row so the migration can run again.
3. Re-read the counts and sums under the old names: each must equal step 1 of the order.
4. Revert `main` to the commit before S27 with a new revert commit (no force push), **[asks]** push it, and let Render settle on it.
5. Fix forward on a new branch.

Tested on a disposable database by `the 0027 rollback refuses once a US shop exists, else restores 0026 with every amount kept` in `tests/integration/currency-migration.test.ts`, with three mutations proved in `evidence/s27-rollback-mutations.json` on that branch.
Not tested against Neon or a Render rollback [unknown].

Once a US shop or a `USD` row exists, the rollback refuses and the only way is forward: the old code would show US dollar amounts as Singapore dollars, which the product never allows.
