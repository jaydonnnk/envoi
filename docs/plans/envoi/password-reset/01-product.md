# Gate 1: Merchant password reset

**Approved 2026-11-09.** The user said "Approve Gate 1".
It revises the approved [merchant onboarding Gate 1](../merchant-onboarding-review/01-product.md), which states on the form that "Password reset is unavailable in this test environment."

## Problem

- Merchant: "I forgot my password and I am locked out of my shop."
- Envoi admin: "Today a locked-out merchant needs me to make a new account, and their shop cannot move to it."

**[verified 2026-11-09]** Sign-up sends a confirmation email through Resend, and confirmation works on Render for the account owner's own address.
The sign-up form says password reset is unavailable.
There is no forgot-password link on sign-in.

## Proposed flow

- Sign-in shows "Forgot your password?".
  It opens [Reset your password](mockups/forgot-password.html): the merchant enters an email and presses "Send reset link".
- The page always answers the same way, whether or not an account uses that email: "If an Envoi merchant account uses this email, a reset link is on its way."
  So the page never reveals which emails have accounts.
- The [email](mockups/reset-email.html) holds one link that works once and expires in 1 hour.
- The link opens [Choose a new password](mockups/set-new-password.html).
  Saving signs out every other browser signed in to that account, then the merchant signs in with the new password.
  An expired or used link says so and offers a new request.
- Reset requests are rate limited per address and in all, like sign-up.
- Reset changes only the password.
  It never changes shop approval, the PayPal connection, memberships or any payment.
- The sign-up form drops "Password reset is unavailable in this test environment."
- Buyer sessions are anonymous and have no password, so buyers are unaffected.

## Success metric

One merchant account on Render requests a reset, receives the email, sets a new password, and signs in with it.
The old password then fails to sign in.
**[hypothesis]** One run proves the path works; it proves no usability or delivery rate.

## Known limit

**[verified 2026-11-09]** With the sender `onboarding@resend.dev`, Resend delivers only to the Resend account owner's address.
Until a verified domain is set, reset email, like confirmation email, reaches only that address.

## Announcement

"Merchants who forget their password can now reset it by email. The link works once and expires in an hour. A reset changes only the password: shop approval and payments stay as they were."

## Out of scope

Changing email address, password change while signed in, two-factor sign-in, buyer accounts and any admin screen.
