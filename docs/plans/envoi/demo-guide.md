# Envoi demo and test guide

Status: 2026-10-23, written from `main` at `1d354f8`; the buyer text steps corrected 2026-10-26 for S21's one-box screen.
It walks through every built journey, in the order a judge or tester would meet them.
Test money only: PayPal sandbox and Solana devnet test tokens; no real money moves.
Where this guide and a gate document disagree, the gate document wins.

## 0. Before you start

Pick where you test:

| Where | Address | Use it for |
| --- | --- | --- |
| Deployed | <https://envoi-helx.onrender.com> | The real demo: Render, Neon, PayPal sandbox |
| Local | <http://localhost:3000> | Repeatable runs on a disposable database |

Have ready:

1. A PayPal sandbox **buyer** account (developer.paypal.com, Sandbox accounts).
2. The shop's PayPal sandbox **seller** merchant id, to check the payee afterwards.
3. For merchant steps: a merchant account made with `create-merchant` (see step 6).
4. For PYUSD only: Phantom set to devnet, with devnet SOL and test PYUSD, and `PYUSD_ENABLED=true` on the server.
5. For the agent step: an agent token from `issue-agent-token` configured in an MCP client such as Claude Code.

Never type a real password, card or seed phrase into Envoi, and never show `.env.local`, Render settings or a wallet seed on screen.

Warm the deployed site first: open it once and wait.
An idle cold first visit takes about 28 s on Render Free.

## 1. Local setup (skip for deployed)

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local`; `.env.example` explains every name.
Then create the database, migrate, seed the demo shop and start:

```bash
psql -h 127.0.0.1 -U postgres -c "CREATE ROLE envoi_web LOGIN" -c "CREATE ROLE envoi_maintenance LOGIN" -c "CREATE DATABASE envoi_dev"
```

```bash
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run db:migrate
```

```bash
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- seed-demo-fixture
```

```bash
npm run dev
```

The seed creates "Lorong Demo Kopi" in Tanjong Pagar with Kopi O (S$1.60), Kaya toast set (S$4.50), Teh C peng (S$2.20) and Soft-boiled eggs (2) (S$2.00).
It has no PayPal seller yet; attach one with:

```bash
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- assign-paypal-destination <outletId> <sellerMerchantId>
```

## 2. Landing page

1. Open `/`.
2. Check: headline "PayPal or PYUSD. Straight to the shop.", buttons "Find a shop" and "I run a shop", the notice "Test money only. No real money moves.", no navigation bar and no demo shop named.
3. Resize to phone width (390 px): no sideways scroll.

## 3. Buyer: find a shop by text

1. Click "Find a shop", or open `/buy`.
2. Check the "Test environment" badge and the sandbox and devnet notice.
3. In the one box labeled "What would you like, and where?", type `two kopi o and one kaya toast near Tanjong Pagar`, then press "Find it". There is no separate area field: the place goes in the same sentence.
4. Check: only registered shops and items appear, with prices from the shop's menu, not from the AI. A sentence that gives quantities opens the shop with the basket already filled and the note "Nothing is reviewed or paid yet."; a sentence that gives none lists the items with a "Choose quantities" button.
5. Try nonsense such as `asdfgh`: you get no invented shop. Try `kopi near me`: you get "Which area, or which shop?", because Envoi has no location and does not guess the nearest shop.
6. Change a quantity or add an item, then press Review.

## 4. Buyer: review and pay with PayPal sandbox

1. Press Review.
2. Check the review screen:
   - items, quantities and total in SGD, priced by the server;
   - the payee is the shop's own sandbox seller, never Envoi;
   - unknown costs show as unknown, not zero.
3. Press "Continue to PayPal" and sign in with the sandbox **buyer** account.
4. Approve.
5. Check the receipt reads Paid and shows the capture id.
6. Compare with PayPal: in the sandbox seller account activity, the payee, amount and currency match the receipt.

Negative checks:

- Cancel on the PayPal page: the receipt is not paid, and you can return to the basket.
- Refresh the receipt mid-payment: it says "checking payment", never Paid early.

## 5. Buyer: scan or paste a sticker

1. Open `/buy/scan`.
2. Allow the camera and scan a shop's SGQR sticker, or paste its contents under "Or paste the sticker contents".
3. Check: a sticker with an approved identifier mapping opens that shop; the sticker is never used as a payment destination.
4. Check: an unknown sticker gives a clear message and still offers text search.
5. Deny the camera: the paste field still works.

The sticker must have a mapping submitted by the merchant and approved with `approve-identifier`.
On 2026-10-21 Neon had no approved mapping, so do step 6 first; use the labeled test sticker [`fixtures/sgqr-sticker-R26ZZ0001X.png`](fixtures/sgqr-sticker-R26ZZ0001X.png), shown on a second screen or printed.
`R26ZZ0001X` is made up: "ZZ" is not a real entity type, so it cannot be a real company's UEN.

## 6. Merchant: sign in, menu, seller, publish

Make the account first (the password is typed at a hidden prompt, never in chat or a file):

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- create-merchant <email> "<name>"
```

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- approve-membership <email>
```

Then in the browser:

1. Click "I run a shop", or open `/merchant/setup`, and sign in.
2. Check: public sign-up is refused; only operator-made accounts work.
3. Create an outlet with a name and area, confirm its details, then enter the menu by hand and confirm it.
4. Leave a price blank: confirmation is blocked until you fill it; a zero price is refused.
5. In the sticker section, choose [`fixtures/sgqr-sticker-R26ZZ0001X.png`](fixtures/sgqr-sticker-R26ZZ0001X.png), check it reads "PayNow UEN R26ZZ0001X" with a valid checksum, and press "Submit for operator approval".
   For another shop, make a new labeled sticker with `npx tsx scripts/make-fixture-sticker.ts <uen> "<shop name>" <out.png>`.
6. As operator, list the pending mapping, then approve it by id:

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- approve-identifier
```

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- approve-identifier <identifierId>
```

7. As operator, prepare the PayPal sandbox seller and approve the enrollment:

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- assign-paypal-destination <outletId> <sellerMerchantId>
```

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- approve-enrollment <outletId>
```

8. Back in `/merchant/setup`, accept the PayPal sandbox connection, then publish.
9. Check the shop now appears on `/buy`, and that scanning or pasting the sticker on `/buy/scan` opens it.
10. Open a buyer review, then change a price and republish in another tab.
    Go back and try to pay: the old review is refused before payment starts.

Menu photo import is built but ships closed; do not demo it as working.

## 7. Merchant: orders

1. Open `/merchant/orders`.
2. Check: the order from step 4 shows as paid.
3. Acknowledge it: acknowledgment is a separate action and does not change the paid state.
4. Check: a pending, canceled or uncertain order is never shown as paid.

## 8. AI agent handoff over MCP

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- issue-agent-token "Claude Code"
```

Configure the token in the MCP client yourself against `<site>/mcp`; never paste it into chat.

1. Ask the agent: "Find a kopi shop near Tanjong Pagar and make me a purchase link for a Kopi O and a Kaya toast set."
2. Check: the agent uses `search_outlets`, `get_menu` and `create_purchase_request`, and returns a link.
3. Open the link as the buyer: you see names and quantities, then a fresh server-priced review.
4. Pay as in step 4.
5. Check: the link works once and expires 10 minutes after creation; reopening it is refused.
6. Check: the agent cannot pay, approve or read the receipt.
7. Without a token, `POST /mcp` answers 401; `GET /mcp` answers 405.

## 9. PYUSD on Solana devnet (only when enabled)

1. On the review, pick PYUSD.
2. Check: the amount is the shop's rate, rounded up; the recipient is the shop's devnet token account.
3. Approve in Phantom (desktop extension, or "Open in Phantom" on a phone, which lands straight on the PYUSD review).
4. Check: the receipt reads transferred, then paid only after the transfer is finalized and verified on devnet.
5. Check on a devnet explorer: recipient, amount in PYUSD and memo reference match.
6. Envoi never signs or sends: the wallet does.

Recovery check: close the wallet popup after signing, before Envoi hears back.
The receipt stays "checking"; maintenance or reconcile decides it from devnet history, and any extra transfer is shown, never hidden.

## 10. Operator view and maintenance

1. Grant an account operator rights:

```bash
MIGRATION_DATABASE_URL=<database url> npm run operator -- grant-operator <email>
```

2. Sign in as that account and open `/operator/health`.
3. Check: last maintenance heartbeat, storage use and any uncertain payments.
4. Run maintenance by hand with the names under "Maintenance runner" in `.env.example`:

```bash
npm run runner:build
```

```bash
npm run runner:start
```

5. Check: an uncertain payment left from step 4 or 9 is now decided; maintenance never captures or sends a payment.

## 11. Public read API

```bash
curl -s https://envoi-helx.onrender.com/api/v1/outlets
```

```bash
curl -s https://envoi-helx.onrender.com/api/v1/outlets/<outletId>/menu
```

Check the responses match `openapi/envoi-public.yaml`.

## 12. Automated checks

```bash
npm run typecheck
```

```bash
npm run typecheck:client
```

```bash
npm run lint
```

```bash
npm run test:unit
```

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test npm run test:integration
```

```bash
npm run build && npx tsx tests/e2e/run-public-api.ts 3100
```

All must exit 0.
Integration tests create and drop their own databases, so point `TEST_DATABASE_URL` at a disposable local server only.

## 13. Pass sheet

| Step | Pass when |
| --- | --- |
| 2 Landing | Copy matches, no sideways scroll at 390 px |
| 3 Text | Only registered shops and menu prices |
| 4 PayPal | Receipt Paid, PayPal payee and amount match |
| 5 Scan | Approved sticker opens shop, unknown one does not |
| 6 Merchant | Publish works, stale review refused |
| 7 Orders | Only paid shown as paid, acknowledge separate |
| 8 Agent | One-time link, expires in 10 min, no pay access |
| 9 PYUSD | Paid only after finalized devnet transfer |
| 10 Operator | Uncertain payment decided by maintenance |
| 11 API | Matches OpenAPI |
| 12 Checks | All exit 0 |

The usability target (4 of 5 first-time buyers within 3 minutes) is not run yet; follow [`usability/README.md`](usability/README.md) for it and never claim it from this guide.
