# Gate 3: Merchant email confirmation and Area search

**Re-approved 2026-11-09.** The user answered "yes" to the Gate 3 approval question. This defines the implementation contract for the [approved product](01-product.md) and [approved architecture](02-architecture.md). See the [gate record](../00-status.md#merchant-email-confirmation-and-area-search-2026-11-09).

## Files

| Path | Responsibility |
| --- | --- |
| `drizzle/0036_merchant_email_confirmation.sql`, `drizzle/meta/0036_snapshot.json`, `drizzle/meta/_journal.json` | Add the cohort flag, two limiter buckets and the locked shop-creation guard. Use the next migration number if 0036 is taken. |
| `src/lib/db/schema.ts`, `src/lib/auth.ts` | Map the flag, set it during signup, guard session creation, configure Better Auth tokens and disable direct confirmation and resend routes. |
| `src/env.ts`, `.env.example` | Server settings, mail readiness and the effective public signup switch. Keep optional mail configuration from preventing existing sign-in. |
| `src/domain/outlets/signup.ts`, `src/domain/outlets/email-confirmation.ts` | Reuse the trusted proxy address extraction. Normalize, hash and admit confirmation requests. Bind outgoing mail to the committed account. |
| `src/integrations/email/resend.ts` | Send one bounded HTTPS request with an injected fetch for tests. |
| `src/app/api/v1/merchant/email/{confirm,resend}/route.ts` | Private, no-store responses, same-origin and bounded input checks, and Better Auth server API calls. |
| `src/app/merchant/setup/{page,sign-up,sign-in}.tsx`, `src/app/merchant/setup/verification-prompt.tsx`, `src/app/merchant/setup/confirm-email/{page,confirmation-form}.tsx` | Email/password signup, check-email and resend states, explicit confirmation and return to sign-in. |
| `src/app/for-shops/page.tsx`, `src/app/api/v1/merchant/outlets/route.ts`, `src/app/api/v1/merchant/outlets/[id]/destinations/paypal/request/route.ts` | Follow the effective signup switch in copy and pending-shop actions. |
| `scripts/import-sg-areas.mjs`, `src/domain/outlets/sg-areas.json`, `src/domain/outlets/sg-areas.ts` | Extract the pinned URA names and parent relationships. Provide canonical choices, reviewed aliases and pure search. |
| `src/app/merchant/setup/{area-picker,shop-location,workspace}.tsx`, `src/app/globals.css` | Share the country and Area fields across shop creation forms and use the picker on edit. Use existing field styles and status feedback. |
| `src/app/api/v1/merchant/outlets/input.ts`, `src/domain/outlets/merchant.ts` | Separate create input from update input. Validate changed Area against the locked shop country and save country atomically on create. |
| `tests/integration/merchant-email-confirmation.test.ts`, `tests/integration/merchant-signup.test.ts`, `tests/integration/merchant-draft.test.ts`, `tests/integration/us-shops.test.ts`, `tests/support/merchant.ts`, `tests/support/menu-import.ts` | Drive the real auth and outlet routes with local Postgres and fake mail. Change test fixtures to send valid catalogued areas where applicable. Preserve S43's behavioral assertions. |
| `tests/unit/merchant-setup-signup.test.ts`, `tests/unit/for-shops.test.ts`, `tests/unit/sg-areas.test.ts` | Cover actual rendered signup states and Area catalogue/search behavior. |

Leave the existing buyer API representation, public OpenAPI contract, payments, admin enrollment and release configuration alone during local implementation. Document the confirmed rollout later.

## Types and signatures

```ts
type MailSettings = { apiKey: string; from: string };
type ConfirmationMail = { to: string; confirmationUrl: string };
type ScheduleAfterResponse = (task: () => Promise<void>) => void;

function merchantMailSettings(source?: NodeJS.ProcessEnv): MailSettings | null;
function merchantSignupOpen(source?: NodeJS.ProcessEnv): boolean;
function sendConfirmationMail(settings: MailSettings, mail: ConfirmationMail, send?: typeof fetch): Promise<"accepted" | "failed">;

type SingaporeArea = { label: string; parents: readonly string[] };
function isSingaporeArea(label: string): boolean;
function searchSingaporeAreas(query: string): readonly SingaporeArea[];

type OutletInput = { name: string; area: string };
type OutletCreateInput = OutletInput & { country: Country };
type OutletUpdate = OutletInput & { detailsConfirmed: boolean };
```

## Auth and mail call stacks

1. **Configuration.** Read a nonblank `RESEND_API_KEY` and a bare email address in `MERCHANT_EMAIL_FROM`. Both must pass to configure sending. Only `MERCHANT_SIGNUP_ENABLED=true` with both settings opens public signup. Keep verification of already-issued links available with signup off. Keep resend available for flagged accounts while mail is configured, even during a signup pause. Failures due to unavailable settings produce no send.
2. **Signup.** Better Auth's existing `hooks.before` admission runs on `/sign-up/email`. Its user-create hook sets the server-owned `merchantEmailVerificationRequired` field for this path only. It maps to `user.merchant_email_verification_required` with default false, and is excluded from Better Auth input and output. Better Auth creates the user and credential, generates its token and returns without a session. The form supplies the display name “Merchant” to satisfy the existing auth contract without adding a name field. The UI handles the same check-email state on successful initial or duplicate signup. Browser input cannot set either verification field. Record no membership and issue no merchant cookie during signup.
3. **Send.** In the configured Better Auth callback, enqueue a function through Next.js `after`. Before sending, the queued function verifies that the account ID still has a credential, is flagged and unconfirmed, and still has the same recipient address. Schedule failures and mail failures record a bounded outcome only. Use a 3-second request timeout, one fetch and no retry. The UI says “If confirmation is needed, check your email.” A lost or rejected send can be recovered with resend. The task is process-local and can be lost on restart. [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after)
4. **Resend.** Both email POST routes use `assertSameOrigin` and `readCountedBody` with a 4 KiB request limit and 2-second read timeout. Resend accepts strict JSON `{ email }` and validates a maximum of 254 characters. Lowercase and trim the email the same way as signup. Apply the resend address limit before calling Better Auth's server resend API. Pass only the normalized email and exclude the caller's cookie and authorization. For admitted valid addresses, return 202 with `{ accepted: true }` inside the standard response envelope, including for unknown, legacy, verified and delivery-failed cases. Log no account lookup or recipient. For a malformed request or an address-wide limit, use the existing validation or rate-limit error response. The mail callback admits only an eligible recipient before fetch.
5. **Limits [hypothesis].** Retain S43's 3 signups per proxy address per hour and 30 overall per hour. Add `merchant_email_resend` at 10 requests per proxy address per hour. Add `merchant_email_delivery` at 3 attempts per normalized recipient per hour and 50 overall per day, shared across signup and resend. Consume the delivery slot before fetch even if delivery fails. Reuse the advisory-lock limiter and separate HMAC prefixes per bucket. Its shorter per-recipient window and longer global window use the existing longest-window retention.
6. **Confirm.** The email URL is built from the configured `APP_BASE_URL` origin. It points to `/merchant/setup/confirm-email#token=<encoded token>`. The screen keeps the fragment token in memory, clears the fragment using `history.replaceState`, and submits strict JSON `{ token }` on click. Never forward a client callback or redirect URL. Limit the token to 2 KiB, set its Better Auth expiry to one hour, and keep auto-sign-in on confirmation off. The server route runs the same-origin guard and Better Auth's verifier with the token alone. Success returns `{ confirmed: true }` in the standard envelope and offers sign-in. Invalid and expired tokens share a generic response with a resend action. Repeat confirmation is safe. Keep direct Better Auth HTTP `/verify-email` and `/send-verification-email` disabled. No token, URL or address goes to analytics or application logs.
7. **Sign-in and pending shop.** In the session-create hook, query the authoritative user row by the session's user ID. If the account is flagged and still unconfirmed, throw a forbidden `EMAIL_NOT_VERIFIED` error before inserting a session or setting a cookie. The UI offers resend only on that code after a valid password. Anonymous and legacy accounts continue. Under the existing SQL user-row lock, `create_self_signup_outlet` refuses a flagged unconfirmed account with `self_signup_refused: email_unconfirmed`. Map it to the existing `forbidden_membership` response with reason `email_unconfirmed`. Keep the prior one-shop refusal separate. A buyer session is linked only at the subsequent real sign-in, and pre-link receipts retain their owner.

## Area call stacks

1. **Catalogue.** The import script takes a local GeoJSON file and checks the pinned SHA-256 before parsing. Extract planning codes and names and subzone codes, names and parents. Verify 55 planning-area codes, 332 subzone codes and 376 distinct labels. A name in both levels produces one option with its applicable parent names. Validate the parent codes and reject conflicting code/name pairs. Generate deterministic labels and order. Ship the derived list and its provenance, with no geometry or runtime requests. Keep aliases reviewed and separate from the official source data.
2. **Picker.** Render the existing country choices with Singapore selected on create. The Singapore picker has a labelled search input and a native dropdown. Search is case-insensitive and folds punctuation and repeated spaces. It matches canonical labels, parent names and reviewed aliases. Keep the selected option available while filtering. Show an accessible status when no other options match. Submit only the selected label. A US selection uses the existing bounded text field. On edit, use the server-returned country, keep an unlisted saved value selected, and switch it only on explicit selection. Include the [required source and licence attribution](https://data.gov.sg/open-data-licence).
3. **Create.** Parse `{ name, area, country? }`, default country to `SG`, and admit only a catalogue label for SG or bounded nonblank text for US. Reuse the two existing create paths. Inside either transaction set `country` using the existing web-role update grant before reading back the created shop and its draft. Validation failure creates no outlet, draft or enrollment. PayPal seller submission follows creation as a separate action and remains recoverable if it fails.
4. **Edit.** Keep the existing country-only and identifier-only request paths strict. For details, preserve the submitted Area's original value through parsing so a saved label can be submitted unchanged. Read the current outlet under its existing lock. When Area differs, require the exact catalogue label for a Singapore shop or trim and validate US text. An invalid selection returns `validation_failed` without changing name, Area or confirmation. Keep published-details and country locks. A country-only update retains the existing Area and uses the new country for the next edit.

## Named tests and fail conditions

Use the production handlers, real Better Auth and a disposable migrated database. Stub the mail provider at fetch and drain the injected scheduler. Independently disable each tested guard to prove the stated failure where practical.

| Test | Assertion and failing change |
| --- | --- |
| `public signup stores the confirmation requirement and creates no session` | The real auth route writes the flag, user and credential, sends one fixture mail, sets no session cookie and grants no membership, even with forged verification fields in the request. Remove the signup hook, permit the input fields or enable auto-sign-in. |
| `new unconfirmed users cannot sign in or create a pending shop` | After the correct password, sign-in returns `EMAIL_NOT_VERIFIED` without a session. Independently invoke the real SQL function as `envoi_web`; it creates no rows. Bypass each guard separately. |
| `confirmation proves mailbox token and does not sign in` | GET preview leaves the row unconfirmed, then the real confirm POST marks only the target user. Expired and altered tokens leave it false. Repeat succeeds, creates no session, and subsequent credential sign-in and shop creation succeed. Remove expiry validation, enable confirmation auto-sign-in or allow the direct GET route. |
| `confirmation and resend accept only same-origin requests` | Both reject missing and foreign origins. Each blocked request causes no state change and no mail. Remove the guard on either route separately. |
| `resend conceals account state and tolerates an anonymous cookie` | Known, unknown, verified and legacy addresses give the same 202 body. Only the flagged unconfirmed account reaches the sender. Supply a buyer cookie and verify receipt ownership. Remove the eligibility check or forward the cookie to Better Auth. |
| `confirmation limits hold under retry and concurrency` | Saturate address, recipient and aggregate windows independently. Vary case, supplied forwarded headers and concurrent requests. Show one provider call at the last delivery slot and no raw identifiers in serialized limiter rows. Disable each limit independently. |
| `provider failure leaves a recoverable account` | Force timeout and non-2xx. The signup response remains neutral, the account remains unconfirmed, and a later admitted resend yields a valid link. Inspect responses and logs with synthetic address and token needles. Remove failure handling or inject an echoed payload. |
| `missing sender config closes public signup without locking out existing accounts` | Incomplete mail settings with the switch on refuse signup and hide the form in both entry pages. Legacy and operator accounts keep signing in. An already-issued link still confirms while signup is off. Revert one consumer to reading the raw switch. |
| `country governs Area on create and edit` | Check both creation paths, valid Singapore selection, forged Singapore input and US text persisted atomically. Unchanged legacy Singapore labels can be saved and confirmed. A bad replacement returns 400 and leaves the saved fields intact. Skip each country-aware check independently. |
| `Area search uses catalogue labels and preserves selection` | During catalogue import, compare generated options against an independent extraction of the pinned source, including overlapping labels and parent names. Offline tests use the committed catalogue to check lowercased search, the Chua Chu Kang alias, no match and a retained selection. Remove the alias, a parent mapping or a catalogue row. Verify form behavior with keyboard at desktop and mobile widths. |

Update S43 tests 89 to 98 through the same authenticated entry points. Test 89 adds confirmation and sign-in before pending shop creation. Test 95 observes buyer receipt ownership through signup, confirmation and subsequent sign-in. Preserve the other S43 outcomes, including operator approval, concurrent shop creation, pending spend restrictions and fixture labels. Run the full local suite after focused checks. A controlled real-inbox test is a later, separate release gate.

## Least confident decisions and rollout

- **Auth hook and API behavior [unknown until runtime].** Prove the pinned Better Auth hook propagates the proposed error before cookie issuance, the browser-supplied fields cannot bypass it, and disabling direct routes leaves the internal APIs callable. Prove the email task runs with a real Next route handler. If a proof fails, stop for design review before loosening a guard.
- **Recovery under load [hypothesis].** The proposed hourly and daily limits trade throughput for bounded mail volume. Verify that signup and resend share the delivery budget and that hitting the aggregate cap cannot report delivery. Revisit limits only with observed use.
- **Hosted readiness [unknown].** Under separate authorization, pause signup on the old hosted service and verify the disabled route before migration. Verify existing account readback after the additive migration. Deploy the candidate with signup paused. Prove one complete confirmation through an authorized inbox on an isolated candidate environment before opening hosted signup. Leave signup closed if sender, link, readback or migration evidence is missing. Keep the cohort flag and new code on a pause. An old binary could let a flagged unconfirmed account sign in, so do not roll back to it after opening signup without an approved mitigation.

Next gate: [Vertical slices](04-slices.md).
