# Envoi demo video: script and shot list

Status: draft, 2026-11-09, rewritten for the fourth build plan's pitch and the final build (S44 to S50, S43, S51 to S53); for the user to record or approve, and the user uploads it to YouTube. It replaces the 2026-11-05 draft, which predated the tourist pitch, the copilot, the sales desk and the digest, and wrongly said crypto through PayPal was not built.
Length target: 2 minutes 56 seconds, under the 3-minute limit.
Every shot keeps the "Test environment" badge and the test-money notice on screen.
Say "test money" or "devnet test tokens" every time money moves; never call a demo shop a real merchant.
Each spoken claim must appear in the [evidence pack](evidence-pack.md); cut any line that does not.

**The pitch.** "Scan the stall's SGQR. Pay with the PayPal you already have." The first audience is a visitor from the UK, the US or Australia at a Singapore stall where their card does not work. PayPal is not on SGQR: Envoi identifies an enrolled shop from its sticker and pays that shop's own PayPal. An unenrolled sticker stays unpayable. Never say cheaper than cards, and never present the founder's observation as measured demand.

| Time | Shot | Voice-over |
| --- | --- | --- |
| 0:00-0:14 | A phone at a stall counter showing an SGQR sticker, then the Envoi landing page with the test badge and "Test money only" notice | "You're visiting Singapore. The stall takes SGQR, not your card. You have PayPal. Envoi lets you pay the shop directly, with what you already have." |
| 0:14-0:34 | `/buy/scan` on the phone: scan the labeled fixture SGQR, the shop opens with its menu | "Open Envoi and scan the stall's own SGQR. The sticker only identifies the shop; it is never a payment code, and only enrolled shops can be paid." |
| 0:34-0:54 | "Ask Envoi about this shop": ask what a dish is or what to order within a budget; open "How this was checked" (`listOutlets` 200, `getOutletMenu` 200); accept the offer into the review | "Ask Envoi reads the shop's own published menu over the Model Context Protocol and helps you order. It never sets a price, and it never pays." |
| 0:54-1:10 | The shop menu with an AI translation beside each original name; one tap shows the original alone | "A menu you cannot read is explained and translated beside the original names. A translation never changes a price." |
| 1:10-1:30 | The review: server-priced total in SGD, the shop's own sandbox seller, unknown costs shown as unknown; the PayPal button opens the sandbox window over the review; approve; the receipt reads Paid with its capture id | "You approve the exact amount in PayPal, here the PayPal sandbox with test money. The money goes to the shop's own account, never Envoi's, and the receipt says paid only after PayPal confirms the capture." |
| 1:30-1:42 | The Paid receipt's "Show this paid order to the stall": large text in English, then 中文, Melayu or தமிழ் | "After paying, show the stall your order in their language, so they know what to make." |
| 1:42-2:02 | The merchant's sales desk: paid orders with PayPal's fee, net and the payer's country; the pinned totals row; the by-method chart; Export CSV | "The merchant sees what actually reached them: PayPal's own fee and net on each paid order. A fee PayPal did not give reads unknown, never zero." |
| 2:02-2:24 | The copilot panel: "What did I take in this week?" and its answer with "What it checked"; then "Refund the last paid order", the confirmation card, and the merchant's tap on Confirm; the order stays Paid with Refunded beside it | "The copilot reads this shop's PayPal records through PayPal's own hosted MCP server. It can propose a refund, but only the merchant's own tap sends one. It can never take a payment." |
| 2:24-2:38 | "This week, written by AI": pick a language, the summary appears with the "Written by AI" label | "The weekly summary is written by AI around figures Envoi computes. A summary holding any other figure is refused." |
| 2:38-2:56 | `/for-shops` with the fee calculator, then the README and evidence pack on GitHub | "Shops keep their SGQR and add no hardware. Everything here runs on test money, with every claim linked to its record." |

## Do not show or say

- Cheaper than cards, savings, or any demand, adoption or usability claim. The micropayment rate, if ever shown, carries "needs PayPal's approval"; whether a food stall qualifies is unknown, so no spoken fee-savings line.
- Universal language support or Korean ordering support. The landing's list is Japanese, Malay, Spanish and Chinese, each passed on fixed fixture cases with builder AI review, not native-reader validation.
- PayPal on SGQR, or any partnership with PayPal or PayPal World. Envoi identifies an enrolled shop and pays its own PayPal; an unenrolled sticker stays unpayable.
- Crypto through PayPal on screen: it is built but exercised only in PayPal's sandbox simulator, labeled simulated. It is left out of this cut; if ever shown, the simulated label must be visible and no token may be claimed to move.
- PYUSD mainnet, or any real-money claim. PYUSD shots, if added, say devnet test tokens and keep the wallet-signing boundary.
- The success target, "4 of 5 first-time buyers". The study was removed on 2026-10-29 and the target is never measured.
- A real merchant's name or logo without their permission.
- Any secret: `.env.local`, Render or GitHub settings, a PayPal or Neon console with credentials, a wallet seed phrase, the judge merchant's password.
- AI menu drafting from photos, which is not claimed: no vision model met its threshold in four rounds.
- Any usability, completion-rate, timing or ease-of-use claim.

## Optional closing line

**PayPal World line, chosen by the user on 2026-11-07:**

> PayPal World connects wallets to local QR networks, but it has not reached Singapore. Envoi shows what that could look like for visitors here, one enrolled shop at a time.

- **Angle:** it has not been done in Singapore yet, so Envoi shows the idea working.
- **Do not say:** that Envoi works for or with PayPal, connects to SGQR or PayPal World, or is a partner.
- **Check first:** re-read whether PayPal World has reached Singapore on the day of recording; a change makes this line wrong. See the [evidence pack](evidence-pack.md).

## Recording notes

- The scan-to-Paid footage can come from the final Ask Envoi to Paid run on the final build, authorized 2026-11-09 and recorded after the last code change. The S49 fixture journey (S$6.50, US sandbox buyer) is earlier raw material; prefer the final run.
- The copilot and refund shots run on Judge Demo Cafe or Test Shop, the labeled demo seller's shops, with sandbox money. Any refund shown is a sandbox refund the merchant confirms on screen.
- The desk's older orders read Unknown for fees; the shot may use the orders with PayPal's known fee so the columns read honestly.
- Keep every shot's test badge and fixture labels visible; do not crop them out.