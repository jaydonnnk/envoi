# Gate 4: Merchant password reset slice plan

**Approved 2026-11-09 in advance.** The user said "approve gates 2 to 4". It authorizes local implementation only; commit, push and deploy are asked separately.

## S53 Merchant password reset

Branch `envoi/slice-53-password-reset` from `main`.
**Visible result.** On Render, the account owner's merchant account requests a reset, receives the email, sets a new password and signs in with it; the old password fails.
**Builds.** Everything in the [Gate 3 files table](03-program-design.md#files).
**Tests.** R1 to R7 and the guard mutations.
**Evidence.** Tests and mutations, typecheck, lint, `npm test`, build, `scan-build`, public API e2e, `gate4_check.py`, browser at 390 px and 1280 px against the three mockups, then the Render run.
**Falsifiers.** A reset link sent to an anonymous buyer or an unconfirmed sign-up; a response or timing that reveals whether an email has an account; a reset that changes anything but the password: the slice does not ship.
**Authorizations to request.** Commit, merge and push, deploy, and the Render run with the user's own inbox.
**Out of scope.** Email change, password change while signed in, two-factor, buyer accounts, an admin screen.
