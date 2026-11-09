# Gate 2: Merchant password reset architecture

**Approved 2026-11-09.** The user said "approve gates 2 to 4".
It serves the [approved Gate 1](01-product.md) and adds to the [merchant onboarding architecture](../merchant-onboarding-review/02-architecture.md).

## Facts this relies on

- **[verified 2026-11-09, `node_modules/better-auth/dist/api/routes/password.mjs`, 1.7.7]** `POST /request-password-reset` answers the same `{ status: true }` whether or not the email has a user, and stores a one-use token under `reset-password:<token>` with `resetPasswordTokenExpiresIn`.
  It hands the token to our `sendResetPassword`.
  `POST /reset-password` consumes the token, hashes the new password, runs `onPasswordReset`, and deletes every session of the user when `revokeSessionsOnPasswordReset` is true.
- **[verified, same file]** If the user has no credential account, `/reset-password` **creates one**.
  So a token must never leave the server for an anonymous buyer or any user without a password.
- **[verified, `src/lib/auth.ts` and `src/domain/outlets/email-confirmation.ts` on `main` at `35ee621`]** S51 already sends confirmation mail through Resend after the response (`after()`), limits requests per proxy address (`merchant_email_resend`, 10 an hour) and limits mail per recipient (`merchant_email_delivery`, 3 an hour, 50 a day in all), with only HMAC subjects stored.

## Decisions

1. **Better Auth's own reset.** Turn on `sendResetPassword`, `resetPasswordTokenExpiresIn: 3600` and `revokeSessionsOnPasswordReset: true`.
   No new provider, no new dependency, no migration.
2. **Who gets a link.** Only a permanent user with a credential account whose email is not awaiting confirmation.
   An anonymous buyer, a user without a password, or an unconfirmed sign-up gets nothing, and the page answers the same.
3. **Same answer, same timing.** Delivery runs after the response, as S51's confirmation does, so the response does not reveal whether a mail was sent.
4. **Limits.** A `hooks.before` on `/request-password-reset` reuses the per-address `merchant_email_resend` window; delivery reuses the per-recipient and daily `merchant_email_delivery` window.
   Confirmation and reset mail share one quota per inbox. **[hypothesis]** Enough for a test environment.
5. **Link.** `APP_BASE_URL/merchant/setup/reset-password#token=...`, a fragment like S51's confirmation link, so the token stays out of server and proxy logs.
6. **Switch.** Reset is on whenever the Resend settings exist (`merchantMailSettings()`), for every merchant including operator-made ones.
   Without mail settings the link and pages answer that reset is unavailable.
7. **Scope.** Reset changes the password only; memberships, enrollment, destinations and purchases are untouched.

## Flow

`POST /api/auth/request-password-reset` → `hooks.before` (path, per-address limit) → Better Auth stores the token → `sendResetPassword` schedules delivery → after the response: eligibility read, per-recipient limit, Resend send.
`POST /api/auth/reset-password` → token consumed → password updated → all sessions deleted → the merchant signs in again.

## Risks

- **[verified]** `onboarding@resend.dev` reaches only the Resend account owner until a domain is verified.
- **[unknown]** Resend delivery and spam placement for other inboxes.
- The shared mail quota means a merchant who just signed up may wait up to an hour to request a reset.

## Environment

No new variable: `RESEND_API_KEY`, `MERCHANT_EMAIL_FROM`, `APP_BASE_URL`, `BETTER_AUTH_SECRET`.
