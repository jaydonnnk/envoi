# Envoi demo video: script and shot list

Status: draft, 2026-10-21, for the user to record or approve; the user uploads it to YouTube.
Length target: 2 minutes 45 seconds, under the 3-minute limit.
Every shot keeps the "TEST ENVIRONMENT" badge and the sandbox and devnet notice on screen.
Say "test money" or "devnet test tokens" every time money moves; never call a demo shop a real merchant.
Each spoken claim must appear in the [evidence pack](evidence-pack.md); cut any line that does not.

| Time | Shot | Voice-over |
| --- | --- | --- |
| 0:00-0:15 | A phone at a shop counter, then the Envoi buy page with the test badge and notice visible | "You're visiting Singapore. The shop doesn't take your card. You have PayPal, or a crypto wallet. Envoi lets you pay the shop directly, with what you already have." |
| 0:15-0:40 | Type "kopi and kaya toast" with an area; registered shops and items appear; open the shop | "Say what you want. An AI model suggests registered shops and items, but it never sets a price. Prices come from the shop's own published menu." |
| 0:40-1:00 | Choose items; the review screen: server-priced total in SGD, the shop's sandbox seller, unknown costs shown as unknown | "Before you pay, Envoi shows exactly what you're approving: items, total, currency, and who gets the money. The shop's own account, never Envoi's. Costs we don't know are shown as unknown." |
| 1:00-1:25 | Continue to PayPal sandbox approval; return to a receipt reading Paid with the capture id | "You approve in PayPal, here the PayPal sandbox with test money. The receipt says paid only after PayPal confirms the capture." |
| 1:25-1:45 | The PYUSD option on the review; Phantom on devnet; receipt reading transferred and finalized on devnet | "Or pay in PYUSD on Solana devnet with test tokens. Envoi prepares the transfer; your wallet signs it. Envoi never holds your keys or sends a transaction." |
| 1:45-2:00 | The scan page: scanning a labeled fixture sticker opens that shop (needs an approved identifier mapping where it is filmed; Neon has none on 2026-10-21) | "At the counter you can scan the shop's sticker instead. It only identifies the shop; it's never a payment destination." |
| 2:00-2:15 | Merchant orders: a paid order and a separate acknowledgment; a pending order not shown as paid | "The merchant sees paid orders as paid, and nothing else. Pending or uncertain payments are checked, never shown as paid." |
| 2:15-2:30 | An agent in a chat creates a purchase link; the buyer opens a fresh, server-priced review | "AI agents can hand a buyer a one-time link to a review. They can't pay or read your receipt." |
| 2:30-2:45 | The README and evidence pack on GitHub | "Everything here runs on test money, with every claim linked to its record." |

## Do not show or say

- A real merchant's name or logo without their permission.
- Any secret: `.env.local`, Render or GitHub settings, a PayPal or Neon console with credentials, a wallet seed phrase.
- AI menu drafting from photos, which is not claimed.
- Any usability, completion-rate, timing or ease-of-use claim: the usability study was removed on 2026-10-29 and its target is never measured.
