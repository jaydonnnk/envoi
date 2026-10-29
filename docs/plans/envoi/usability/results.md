# S15 usability results

Status: **not run, and removed from S15 on 2026-10-29** by the user's decision ("remove the usability test. Its a hackathon we dont need them").
No session was held, no tester was recruited and no timing was taken, so every table below is empty and stays empty.
This file is kept as the record of the method that was prepared and of the decision not to run it; see the [kit](README.md).
Envoi makes no completion-rate, timing, usability or ease-of-use claim, and the target below may not be quoted as a result or an expectation.

## Declared before the first session

| Decision | Value | Recorded on |
| --- | --- | --- |
| Rails offered | PayPal sandbox only; PYUSD stays off | 2026-10-24, the user's choice |
| Entry points offered | Text and scan, scored separately; scan uses the printed labeled FIXTURE sticker `R26ZZ0001X`, whose mapping was approved on Neon on 2026-10-24 | 2026-10-24, the user's choice |
| Shop and sandbox seller id | Test Shop (`out_vrlbnc3zylbrr6g2drovaiqkfu`), sandbox seller `EQN6264CF9F4Y` | 2026-10-24, the user's choice |
| Account preparation | A printed card per tester with a PayPal sandbox buyer email and password created for the test, and nothing else (kit item 4) | 2026-10-24 |
| Device | Each tester's own phone | 2026-10-24, the user's choice |
| Warm-up before the timer | Yes: the facilitator opens the Envoi link before the tester starts (kit item 6) | 2026-10-24 |
| Facilitator | The user | 2026-10-24, the user's choice |

## Field reference

- `outcome`: `completed`, `not completed (gave up)`, `not completed (hard stop)` or `not completed (error)`.
- `counts_toward_target`: `yes` only when the outcome is `completed`, the duration is 180 seconds or less, no coaching happened and all four match columns are `yes`.
- `help_requests` and `failures`: `mm:ss "words or event"`, separated by `;`, or `none`.
- `external_record_id`: the PayPal sandbox capture or order id, or the devnet transaction signature.

## Result against the target

Target: 4 of 5 first-time buyers within 3 minutes, without coaching, with a matching external payment record.

| Group | Testers | Counted | Met target? |
| --- | --- | --- | --- |
| All | | | |
| Entry point: text | | | |
| Entry point: scan | | | |
| Rail: PayPal sandbox | | | |
| Rail: PYUSD devnet | | | |

## Every failure and help request

| Tester | Time | What happened | Words used |
| --- | --- | --- | --- |

## Boundary

Five testers is a small sample; the result supports only the claim the target names, for this prototype, in a test environment.
