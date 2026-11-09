# Gate 3: Merchant password reset program design

**Approved 2026-11-09 in advance.** The user said "approve gates 2 to 4" before this draft existed; it follows the [approved Gate 2](02-architecture.md) without adding a decision.

## Files

| File | Change |
| --- | --- |
| `src/lib/auth.ts` | `emailAndPassword.sendResetPassword`, `resetPasswordTokenExpiresIn: 3600`, `revokeSessionsOnPasswordReset: true`; `hooks.before` also admits `/request-password-reset` |
| `src/domain/outlets/email-confirmation.ts` | `deliverPasswordReset`, mirroring `deliverMerchantConfirmation` with the eligibility of decision 2 |
| `src/integrations/email/resend.ts` | `sendPasswordResetMail(settings, { to, resetUrl })` |
| `src/app/merchant/setup/forgot-password/page.tsx` and its form | Reset your password (mockup `forgot-password.html`) |
| `src/app/merchant/setup/reset-password/page.tsx` and its form | Choose a new password (mockup `set-new-password.html`); reads the token from the fragment |
| `src/app/merchant/setup/sign-in.tsx` | "Forgot your password?" link when mail is configured |
| `src/app/merchant/setup/sign-up.tsx` | Drops "Password reset is unavailable in this test environment." |
| `tests/integration/merchant-password-reset.test.ts` | Tests R1 to R7 |

## Types

```ts
// src/domain/outlets/email-confirmation.ts
function deliverPasswordReset(options: { db: Db; secret: string; settings: MailSettings; origin: string; recipient: { id: string; email: string }; token: string }): Promise<void>;
// src/integrations/email/resend.ts
function sendPasswordResetMail(settings: MailSettings, mail: { to: string; resetUrl: string }, send?: typeof fetch): Promise<"accepted" | "failed">;
```

## Tests (real routes, disposable local database, Resend faked at its fetch boundary, FIXTURE values)

- **R1:** a confirmed merchant requests a reset; one FIXTURE mail is sent to it with a `/merchant/setup/reset-password#token=` link; resetting with that token lets the new password sign in and the old one fail, and every earlier session is gone.
- **R2:** an unknown email, an anonymous buyer's email, an unconfirmed sign-up and a user with no credential account each get the same 200 body and no mail; the buyer gains no credential account.
- **R3:** a used token and an expired token answer `INVALID_TOKEN` and change nothing.
- **R4:** the eleventh request from one address in an hour answers 429 and stores no address; the fourth mail to one inbox in an hour is not sent.
- **R5:** reset changes no membership, enrollment, destination or purchase row.
- **R6:** without mail settings the request sends nothing and the sign-in shows no reset link.
- **R7:** the sign-up form no longer says reset is unavailable; sign-in shows "Forgot your password?" with mail configured.
- **Guards:** the eligibility checks (anonymous, no credential, unconfirmed), the per-address and per-recipient limits, session revocation and the fragment link each get their own mutation failing on an AssertionError, with byte-identical restoration.
