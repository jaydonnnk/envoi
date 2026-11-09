# Gate 2: Merchant email confirmation and Area search

**Re-approved 2026-11-09.** The user answered "yes" to the Gate 2 approval question. The [approved Gate 1 flow](01-product.md) and [approval record](../00-status.md#merchant-email-confirmation-and-area-search-2026-11-09) set the scope.

## Fit

- Keep the installed Better Auth and its PostgreSQL adapter. Use its existing signed email token and `email_verified` field. Mark new self-service accounts at creation with a server-owned flag. Existing accounts, operator-created accounts, and anonymous buyer sessions retain their current access. No backfill marks an email confirmed.
- **[verified from installed Better Auth 1.7.7]** The global `requireEmailVerification` option checks all email-password users. Leave it off. Disable signup auto-sign-in and use a session creation hook to refuse only flagged users whose email is unconfirmed, after Better Auth checks their credentials. The pending-shop database function also checks the flag and confirmation state while it holds the existing user-row lock. Prove both paths on a disposable database before relying on them.
- Add a shared Area picker for shop creation and editing. Keep the existing Area label in storage and in buyer-facing responses. The app imports one versioned catalogue for browser search and server validation. The merchant setup pages make no runtime request to the data source.

## Endpoints

| Route | Proposed contract |
| --- | --- |
| `POST /api/auth/sign-up/email` | Keep existing admission checks. Create a flagged account, request a confirmation email, and return without issuing a merchant session. |
| `POST /api/auth/sign-in/email` | Reject a flagged, unconfirmed account after password verification. Show the resend option. |
| `GET /merchant/setup/confirm-email` | Show a confirmation button. The email link carries the token in the URL fragment so opening the page does not send the token to the server. |
| `POST /api/v1/merchant/email/confirm` | Same-origin request with the token in the body. Call Better Auth's verifier server-side. Redirect the user to sign-in after confirmation. |
| `POST /api/v1/merchant/email/resend` | Same-origin request with an email address. Apply persistent limits before mail work and return the same acknowledgement for eligible, missing, legacy and already confirmed addresses. The server calls Better Auth's resend API without the browser's session cookie, so an anonymous buyer session does not interfere. |
| `POST /api/v1/merchant/outlets` | Keep the current name and Area payload, with an optional country that defaults to Singapore. Singapore Area must match the catalogue. US Area remains validated text. Save the country and shop in the same transaction. |
| `PATCH /api/v1/merchant/outlets/[id]` | Check a changed Area against the current country under the existing outlet lock. For Singapore, a saved Area may be submitted unchanged, including when confirming shop details. US edits retain the current text rules. |

Disable Better Auth's direct HTTP verification and resend paths. **[verified from installed source]** The HTTP router's disabled-path check is separate from the exported server APIs. Gate 3 will specify tests for direct URL attempts and the wrapper calls.

## Data

- Add a boolean flag to the existing auth user row, default false. Only public merchant signup sets it true, in the same write that creates the user. Browser input cannot set it. Keep the auth tables in the pinned `public` schema.
- Extend the existing database-backed limiter for confirmation email requests. Keep normalized recipient and proxy address keys as separate keyed hashes. Set per-address, per-recipient and aggregate limits before contacting the mail provider. Store no recipient addresses in limiter rows.
- Extend the pending-shop database function to check confirmation under its existing user-row lock. Keep its signature and existing transaction. In both shop-creation paths, save the selected country in the same transaction via the web role’s existing country update grant, before reading back the shop. Pause hosted public signup during the transition so the old app cannot create accounts under the former rule. Gate 3 will specify the rollout checks.
- Keep `outlets.area` as text. Do not rewrite saved labels. A country-only edit keeps the saved Area. Choosing a new Area uses the picker or text input for the shop's current country.

## Flow

1. Signup creates the account and requests one confirmation email. Duplicate signup uses the same check-your-email response. A mail timeout leaves the account recoverable through resend. A response never claims the email reached the inbox.
2. The email opens Envoi's confirmation screen. Clicking the button submits the token. This keeps automated email-link previews from confirming the account merely by opening the URL. The server uses Better Auth to check the signature, expiry and account, then marks the email confirmed. A repeat valid link is harmless. An expired or invalid link offers resend. Confirmation issues no session.
3. The merchant signs in with their password and chooses a country and Area. Default to Singapore and offer the existing United States choice. Save the exact canonical label for a new Singapore selection. The merchant then submits the PayPal sandbox seller ID to the existing pending enrollment process. Email confirmation supplies no enrollment approval.
4. When editing, allow an existing Singapore label outside the catalogue to stay selected until the merchant chooses another value. Search matches label, parent planning area and reviewed aliases, for example “Chua Chu Kang” for “Choa Chu Kang”. Search text never becomes the saved value.

## External services and evidence

- **Email delivery [vendor claim].** Propose Resend's HTTPS send API using the existing server `fetch`. It requires a verified sender domain for general delivery. Use server-only `RESEND_API_KEY` and `MERCHANT_EMAIL_FROM`, with confirmation links built from Envoi's configured origin. Disable open and click tracking on the sending domain. Send the recipient, message and confirmation link only. Keep tokens, links and email addresses out of application logs and avoid retries on ambiguous provider responses. [Send API](https://resend.com/docs/api-reference/emails/send-email), [domain verification](https://resend.com/docs/dashboard/domains/introduction).
- **Release dependency [unknown].** Envoi's access to a usable verified sending domain and real inbox delivery is unverified. If the provider settings are absent or incomplete, close public signup and show the matching setup and For shops copy. Existing sign-in continues. Test the workflow with a fake sender first. Verify one delivery to an authorized inbox before enabling hosted signup. Keep the migration and deployment approvals separate from this gate.
- **Area catalogue [verified 2026-11-09].** The full URA Master Plan 2019 Subzone Boundary (No Sea) GeoJSON download contains 55 planning areas and 332 subzones. Eleven names appear in both groups, leaving 376 distinct labels. Pin the source digest `77e30aa02b1784b649d9b6f23e3b2ebb825af787de554f3a3fb76bbee3013c42`. Derive names and parent relationships only. Keep reviewed aliases separate from official names. Show attribution next to the picker with the source, access date and licence link. Coverage is the named areas of this edition. [URA dataset](https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view), [Singapore Open Data Licence](https://data.gov.sg/open-data-licence).

Next gate: [Program design](03-program-design.md).
