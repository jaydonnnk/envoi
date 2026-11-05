# Envoi demo video: script and shot list

Status: draft, 2026-11-05, for the user to record or approve; the user uploads it to YouTube. It replaces the 2026-10-21 draft, which predated Ask Envoi, the menu translation and the web import.
Length target: 2 minutes 56 seconds, under the 3-minute limit.
Every shot keeps the "Test environment" badge and the test-money notice on screen.
Say "test money" or "devnet test tokens" every time money moves; never call a demo shop a real merchant.
Each spoken claim must appear in the [evidence pack](evidence-pack.md); cut any line that does not.

**The S32 language claim is limited.** The local landing now says "Japanese, Spanish or Malay. One scan. PayPal." Those languages passed five fixed FIXTURE cases on both paths. Ask Envoi scored 24 of 25 and the box 20 of 25, with zero wrong basket links; the interrupted first attempt remains failed. Chinese is unproven in this run and Korean fails the box's scope check. This draft still does not speak a language claim, and no native-reader or general accuracy claim is supported. S32 is not deployed yet. See [S32](00-status.md#s32-ordering-in-other-languages-2026-11-05).

| Time | Shot | Voice-over |
| --- | --- | --- |
| 0:00-0:12 | A phone at a shop counter, then the Envoi landing page with the test badge and the "Test money only" notice visible | "You're visiting Singapore. The shop doesn't take your card. You have PayPal. Envoi lets you pay the shop directly, with what you already have." |
| 0:12-0:30 | The landing's Ask Envoi button, then `/buy/ask`: type a menu question; the steps panel shows `listOutlets` 200 and `getOutletMenu` 200 | "Ask Envoi is the assistant inside the site. It reads shops and menus through Envoi's own API over the Model Context Protocol. It never sets a price, and it never pays." |
| 0:30-0:48 | The one-sentence box on `/buy`: type the box's own example sentence; two items appear with their prices and a "Choose quantities" button | "Or say it in one sentence. The model names registered shops and items only. Prices come from the shop's own published menu, never from the model." |
| 0:48-1:06 | A shop menu with an AI translation beside each original name; one tap shows the original menu alone | "A menu you cannot read is explained and translated beside the original names. A translation never changes a price." |
| 1:06-1:24 | The review screen: server-priced total in SGD, the shop's sandbox seller, unknown costs shown as unknown | "Before you pay, Envoi shows exactly what you're approving: the items, the total, the currency, and who gets the money. The shop's own account, never Envoi's. Costs we don't know are shown as unknown." |
| 1:24-1:44 | PayPal's button opens the sandbox window over the review; approve; the receipt reads Paid with its capture id | "You approve in PayPal, here the PayPal sandbox with test money. The receipt says paid only after PayPal confirms the capture." |
| 1:44-2:00 | The PYUSD option on the review; Phantom on devnet; the receipt reads transferred and finalized on devnet | "A Singapore shop can also take PYUSD on Solana devnet, with test tokens. Envoi prepares the transfer; your wallet signs it. Envoi never holds your keys or sends a transaction." |
| 2:00-2:14 | The scan page: scanning a labeled fixture sticker opens that shop (it needs an approved identifier mapping where it is filmed; the fixture sticker's approved Test Shop mapping was verified 2026-11-02) | "At the counter you can scan the shop's sticker instead. It only identifies the shop; it's never a payment destination." |
| 2:14-2:34 | The merchant side: sign in, paste the shop's own public menu page, the drafted table with its "Needs review" rows and page excerpts, confirm a row, publish | "A merchant pastes their own menu page. A hosted browser reads it and AI drafts a table. A price is filled only when the page prints it. Nothing publishes itself: the merchant confirms every row." |
| 2:34-2:46 | Merchant orders: a paid order and its separate acknowledgment; a pending order not shown as paid | "The merchant sees paid orders as paid, and nothing else. Pending or uncertain payments are checked, never shown as paid." |
| 2:46-2:56 | The README and the evidence pack on GitHub | "Everything here runs on test money, with every claim linked to its record." |

## Do not show or say

- "Any language", Chinese or Korean ordering support. S32 supports only the five fixed Japanese, Spanish and Malay cases on both paths; Chinese is unproven after an instrumentation interruption and Korean fails the box's scope check. The draft makes no general language accuracy claim.
- Ask Envoi reaching a Paid receipt. It has not been run end to end on the deployed site; S33 owns it. Shot 2 stops at the steps panel and shot 3 stops at "Choose quantities" for this reason; the payment shots use the manual path.
- Crypto through PayPal. It is not built; S38 owns it and one simulated sandbox order is all the evidence there is.
- The success target, "4 of 5 first-time buyers". The study was removed on 2026-10-29 and the target is never measured.
- A real merchant's name or logo without their permission.
- Any secret: `.env.local`, Render or GitHub settings, a PayPal or Neon console with credentials, a wallet seed phrase, the judge merchant's password.
- AI menu drafting from photos, which is not claimed: no vision model met its threshold in four rounds.
- Any usability, completion-rate, timing or ease-of-use claim.
