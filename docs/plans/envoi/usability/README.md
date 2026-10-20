# S15 usability test kit

Status: draft, 2026-10-21, for the Gate 1 success metric in [`01-product.md`](../01-product.md#success-metric).
Nothing here is a result.
The sessions run 2-8 Nov 2026 with testers the user recruits; the facilitator is the user or someone the user names.

## The target, unchanged

> 4 of 5 first-time buyers complete an eligible test-environment purchase within 3 minutes, without coaching, with the external payment record matching their approved purchase.

The target is never reshaped after the test.
A smaller sample is reported as it is, with its size.
Failures and help requests are recorded and never excluded afterwards.
It is a small prototype usability target, not a conversion claim or market validation.

## Decisions to record before the first session

Fill these in [`results.md`](results.md) before anyone is tested; they cannot change afterwards.

1. **Rails offered.** PayPal sandbox only, unless the user authorizes opening PYUSD to testers.
   If PYUSD is offered, scheduled maintenance must be running (it is, hourly, since 2026-10-21) and a person must be ready to run maintenance by hand during each session.
2. **Entry points offered.** Text entry; scan only if a real sticker has an operator-approved identifier mapping on Neon (none exists on 2026-10-21).
3. **Shop.** The published shop the testers buy from, for example Test Shop, and its PayPal sandbox seller id.
4. **Account preparation, declared.** Each tester receives a printed card with a PayPal sandbox buyer email and password created for the test, and nothing else.
   For PYUSD: a prepared Phantom devnet wallet with devnet SOL and test PYUSD, and the shop's rate re-confirmed within 30 days.
5. **Device.** The tester's own phone, or a named test phone; record which.
6. **Warm-up.** The facilitator opens the Envoi link before the tester starts, so Render's cold start falls before the timer.
   This is declared here because it moves the cold start out of the measured window; the cold start itself is measured separately in `00-status.md`.

## Eligibility and consent

- The tester has never seen or used Envoi, its mockups, its video or its code.
- The tester agrees, in writing or on a recorded line in `results.md`, to take part, to being timed and to having notes taken; no photo or recording of the tester's face is kept.
- The tester is told: test money only; nothing real is bought; they may stop at any time.

## Session script

Read this aloud word for word; say nothing else about Envoi until the session ends.

> "Imagine you are visiting Singapore and standing at a small shop. You want to buy one drink and one thing to eat from [shop name] with Envoi, using PayPal. This is a test: the money is not real. On this card is a PayPal test account you can use. I can't help you with the app, because we are testing the app, not you. Please think aloud if you can. Tell me when you think you are done."

Hand over the phone with the Envoi page already open and the PayPal sandbox card.

## Timing

- **Start:** the moment the tester submits their request, that is, presses "Find shops and items", opens a shop from the list, or completes a scan or paste.
  Write the clock time to the second.
- **Stop:** the moment the receipt shows the payment as paid.
  A pending, checking, canceled, failed or uncertain receipt is not a stop.
- **Hard stop:** 10 minutes after the start, or when the tester gives up; the outcome is then "not completed".
- Duration = stop minus start, in seconds.
  "Within 3 minutes" means 180 seconds or less.

## What counts as coaching or help

- **Help request:** anything the tester asks the facilitator about the task or the app, answered or not.
  Record the words and the time.
- **Coaching:** anything the facilitator says or does that points at the screen, names a control, or tells the tester what to do next.
  A session with coaching cannot count toward the target; record it anyway.
- Allowed without counting as coaching: "Please keep going", "What are you thinking?", "Tell me when you think you are done", and repeating the scenario word for word.

## Checking the payment record

After the session, compare the receipt with the external record and fill one column per field in the timing sheet.

| Field | Receipt (Envoi) | External record |
| --- | --- | --- |
| Outlet and recipient | shop name and seller id on the review and receipt | payee in the PayPal sandbox transaction (seller account activity or the developer dashboard) |
| Items and quantities | lines on the receipt | the PayPal order's item list, or the purchase in the operator view if PayPal shows none |
| Amount and currency | total in SGD | captured amount and currency |
| Rail | PayPal sandbox or PYUSD devnet | the provider the money moved on |

For PYUSD the external record is the devnet transaction on an explorer: recipient token account, amount in PYUSD, memo reference.
A completed session counts only if every field matches.

## Recording

- One row per tester in [`timing-sheet.csv`](timing-sheet.csv); never delete a row.
- Entry point (`text` or `scan`) and rail (`paypal-sandbox` or `pyusd-devnet`) on every row; the two entry points are scored separately, never as one result.
- Every help request and failure goes in its own column with the time and the words used.
- After all sessions, fill [`results.md`](results.md): the count against the target, per entry point and per rail, with every failure and help request.
