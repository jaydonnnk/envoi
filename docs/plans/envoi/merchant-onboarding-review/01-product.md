# Gate 1: Merchant email confirmation and Area search

**Re-approved 2026-11-09.** The user answered “yes” to the Gate 1 approval question. This revises [S43's approved product decision](../01-product.md#fourth-build-plan-proposed-2026-11-07). [Current gate status](../00-status.md#merchant-email-confirmation-and-area-search-2026-11-09).

## Problem

- Merchant: "I want to find my neighbourhood without guessing how to type it."
- Envoi admin: "I want to know the merchant can receive mail at the address they entered before I review their shop."

**[verified]** Signup currently signs the merchant in without email confirmation. Signup and Shop details accept Area as free text. Existing shop country choices include Singapore and the United States.

## Approved flow

- New self-service merchants create an account, receive a confirmation email, then sign in to create their shop. Shop creation waits for confirmation. An expired link leads to a resend option. Merchants can restart with a corrected email address.
- Email confirmation establishes access to the inbox. The Envoi admin still reviews the shop and its PayPal sandbox seller ID separately. Existing merchants keep access and are not treated as email-confirmed by default. Test money and demo fixture labels still apply.
- Singapore merchants search and select a named planning area or subzone when creating a shop or editing its Area. Search also matches common alternate spellings. A merchant can choose the broader planning area if their street, mall or building is missing. The catalogue covers the named areas in its source. The selector does not promise a list of every address or business.
- Saved Area labels remain usable until changed. Non-Singapore shops continue to enter Area as text.

**[verified]** The [URA subzone dataset](https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view) includes named subzones and their parent planning areas. **[hypothesis]** This is a useful starting catalogue for merchants. The [approved architecture](02-architecture.md) records the source edition and alias handling.

## Success target

**[hypothesis]** At least 4 of 5 first-time test merchants create a pending shop without help. Each uses an inbox they control and selects their intended Singapore Area within 30 seconds of opening the picker. Record the elapsed time for each selection and verify that zero shops are created before their email confirmation. This is an acceptance target and has not been measured.

## Announcement

When you create an Envoi merchant account, we'll email you a link to confirm your address. Then sign in and search for your neighbourhood or town when you set up your Singapore shop. An Envoi admin will still review your shop and PayPal sandbox seller ID before you can publish or take payments.

## Screens

- [Create your account](mockups/create-account.html)
- [Check your email and resend](mockups/check-email.html)
- [Confirmation email](mockups/confirmation-email.html)
- [Create your shop and choose an Area](mockups/create-shop.html)
- [Edit shop details](mockups/edit-shop.html)

The mockups use sample addresses and a short sample of Area choices. They run locally without sending email or creating an account.

Next gate: [Architecture](02-architecture.md).
