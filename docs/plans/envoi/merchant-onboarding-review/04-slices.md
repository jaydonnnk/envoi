# Gate 4: Merchant email confirmation and Area search

**Re-approved 2026-11-09.** The user said "yes i approve. Then go ahead and start s51". Implement the [approved product](01-product.md), [architecture](02-architecture.md) and [program design](03-program-design.md). Track approvals and evidence in [Envoi status](../00-status.md#merchant-email-confirmation-and-area-search-2026-11-09).

## Build order

| Order | Slice | Depends on | Visible result |
| --- | --- | --- | --- |
| 1 | S51 Merchant email confirmation | Shipped S43 | A new merchant opens a fixture email, confirms, signs in and creates a pending test shop. |
| 2 | S52 Singapore Area search | S51 | The merchant can search and select a Singapore Area when creating or editing a shop. A US shop can enter Area as text. |

Both slices are required for the requested result. The cut order is empty. An incomplete slice stays open. Hosted release is separate and can wait on sender readiness without blocking local implementation.

## Rules for both slices

- Apply the existing [rules for every slice](../04-slices.md#rules-for-every-slice). Gate 4 approval accepts this plan. Each slice starts on explicit authorization by ID and uses its listed branch from the current `main` tip. Recheck Git state and the approved gate documents first. Keep the existing local card alignment work and unrelated files separate from the slice diff. If the gate drafts are still uncommitted, carry the approved documents to the slice checkout and verify them before editing.
- Integration tests use disposable local PostgreSQL and the real HTTP handlers. Fake Resend at fetch and drain the test scheduler. In a separate browser smoke, run the local app with real Next scheduling and a fixture provider. Keep all fixture accounts, shops and email clearly labeled. Capture no address, token, signed link or password in committed evidence.
- Follow the Gate 3 contract and its named failure checks. For each guard covered by a mutation, record the failing check with the guard disabled, restore it and record the passing rerun. After focused checks run `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check` and the Gate 4 documentary checker. Inspect the actual browser at 390 px and 1280 px and the final tracked and untracked diff.
- Record the real result and evidence in `00-status.md`. Run the architect-reviewer cleanup pass after each slice. Request Git and external authority separately. Gate approval and slice authorization do not authorize a commit, push, merge, dependency install, provider call, spend, DNS change, migration on Neon or deployment.

## S51 Merchant email confirmation

**Branch.** `envoi/slice-51-merchant-email-confirmation`.

**Visible result.** The merchant sees “Check your email” after signup. They cannot sign in or create a shop before confirmation. A confirmation sent to a local fixture mailbox opens Envoi's confirmation screen. Clicking Confirm lets them sign in and create their one pending test shop, using the existing Area field. They can resend after an expired link or failed send.

**Builds.** Use [Gate 3's auth and mail file map and call stacks](03-program-design.md#auth-and-mail-call-stacks). Add the local migration, cohort guard, server-only mail settings, Resend transport, guarded confirmation and resend routes, signup and sign-in screens, and switch-consistent copy. Prove the pinned Better Auth session hook, direct HTTP route blocks, internal API calls and Next scheduling early in the local flow. Use a fake Resend response through the real mail adapter. Preserve operator and anonymous account behavior and S43's separate shop approval.

**Assigned Gate 3 tests.**

1. `public signup stores the confirmation requirement and creates no session`
2. `new unconfirmed users cannot sign in or create a pending shop`
3. `confirmation proves mailbox token and does not sign in`
4. `confirmation and resend accept only same-origin requests`
5. `resend conceals account state and tolerates an anonymous cookie`
6. `confirmation limits hold under retry and concurrency`
7. `provider failure leaves a recoverable account`
8. `missing sender config closes public signup without locking out existing accounts`

Update and rerun S43 tests 89 to 98. Existing assertions on pending enrollment, publication, receipt ownership and account isolation still apply. [Assertions and mutations](03-program-design.md#named-tests-and-fail-conditions).

**Evidence and exit.** Show signup to pending shop in a real local browser with fixture mail and a disposable database. Record that the pre-confirmation sign-in and shop attempts fail and create no session or shop. Show a pre-existing operator account still signs in and a resend recovers the fixture failure. If any bypass, lockout, token leak or scheduler incompatibility remains, keep S51 open. Fixture mail establishes the app path. Hosted delivery remains unverified.

**Authorizations.** Request `Start S51` for local work and branch creation. Request integration into `main` separately before starting S52 from it. Run local migrations only on disposable test databases under this slice.

## S52 Singapore Area search

**Branch.** `envoi/slice-52-singapore-area-search`.

**Visible result.** A verified merchant can search for “Bedok”, select “Bedok North” and see it in saved Shop details. They can reopen Edit and find the saved value selected. A pre-existing unlisted Singapore Area stays usable until changed. A US merchant can save text in Area.

**Builds.** Use [Gate 3's Area file map and call stacks](03-program-design.md#area-call-stacks). Derive and verify the catalogue against the pinned URA file. Add the shared picker and country field to both creation paths and the country-aware edit. Validate the server payload, keep the existing buyer-facing Area representation, and show source attribution. Preserve S51's onboarding behavior.

**Assigned Gate 3 tests.**

1. `country governs Area on create and edit`
2. `Area search uses catalogue labels and preserves selection`

Rerun S51 and S43 tests 89 to 98 as regression checks. [Assertions and mutations](03-program-design.md#named-tests-and-fail-conditions).

**Evidence and exit.** Compare the checked-in options with an independent extraction of the pinned URA file. Show both creation paths and editing in the local browser. Check keyboard search and selection, an alias match, no match, a retained legacy label, a US text edit and a rejected forged Singapore value. Read the saved country and Area back through the real route. Keep S52 open if a source label is missing, an invalid SG replacement persists or a previously saved label cannot be retained.

**Authorizations.** Request `Start S52` for local work and branch creation. The public URA download is a read-only input. Request integration, push and deployment separately.

## Hosted release, outside the two local slices

1. Verify access to a sender domain and a candidate environment. Request the DNS and Resend configuration changes by name if needed. Ask before sending one confirmation to the authorized test inbox.
2. Under separate authority, pause public signup on the existing hosted app and verify the route is closed. Apply the additive migration on the approved target, read it back and verify existing account access. Deploy the candidate with public signup paused.
3. On the isolated candidate, prove one real signup, inbox receipt, explicit confirmation, password sign-in and pending shop save. Check the Area label, enrollment status and legacy sign-in. Report this separately from fixture proof. With approval, enable hosted signup only after the checks pass.
4. If a release check fails, keep hosted signup paused and retain the migration and cohort guard while diagnosing. Any older binary would require a separately reviewed rollback plan once it could encounter flagged accounts.

S51 and S52 are complete locally. See the [status record](../00-status.md#merchant-email-confirmation-and-area-search-2026-11-09).
