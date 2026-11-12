# Envoi

**Scan the stall's SGQR. Pay with the PayPal you already have.**

Envoi helps a visitor order and pay at a shop whose menu they cannot read and whose payment methods they cannot use.
AI explains the menu and helps build the order, Envoi prices it from the shop's own published menu, and the visitor approves the exact amount in PayPal.
The money goes straight to the shop's own PayPal account, never through Envoi.

- **Live test environment:** <https://envoi-helx.onrender.com>
- **Everything runs on PayPal sandbox test money.** No real money moves.

## The problem

Many tourists come to Singapore with a card and a little cash.
At shopping malls a card works fine, but hawker stalls and small shops often take only cash or QR payment through SGQR.
A visitor from the UK, the US or Australia sits down at a stall where the menu is only in Chinese or in Singlish, and their card is not accepted.
The stall has an SGQR sticker, but PayPal is not on SGQR, so the visitor pays in cash or walks away.

On the other side of the counter, many stalls confirm a payment by ear, with a spoken "$3 received", and have no simple view of what they sold that week.
And more and more visitors plan their trips with a personal AI assistant, yet no assistant can order from a hawker stall.

Envoi is built for all three: the visitor, their AI assistant, and the stall that wants the order.

## How it works for a visitor

1. **Scan.** The visitor opens Envoi in their phone's browser, with no app to install, and scans the stall's existing SGQR sticker.
   Envoi uses the sticker only to identify an enrolled shop.
   It is never treated as a payment code, and a sticker from a shop that is not on Envoi stays unpayable.
2. **Ask.** AI translates each dish beside its original name, explains what to expect, and builds an order within the visitor's budget.
   It can only pick items from the shop's own published menu.
3. **Approve.** Envoi prices the order from that menu and shows the exact total and who gets paid.
   The visitor approves it in PayPal themselves.
   The receipt says Paid only after PayPal confirms the capture.
4. **Show the stall.** After Paid, the order appears in large text in English, 中文, Melayu or தமிழ், and can be read aloud, so the stall knows what to make.

If the stall is not on Envoi yet, the visitor gets a card in the stall's languages explaining Envoi, with a QR code to `/for-shops`.
Envoi counts those scans anonymously, so a stall that signs up later can see how many visitors tried to pay it.

## How it works for a shop

- **Keep the SGQR, add no hardware.** A shop enrolls, connects its own PayPal account and publishes its menu.
  An optional printable poster tells visitors to scan the stall's existing SGQR with Envoi, with no second QR code.
- **AI menu import.** The merchant pastes their own public menu page.
  A hosted browser reads it once, and AI drafts an editable table.
  A price is filled only when the page prints it as text with the same digits, and nothing publishes until the merchant confirms every row.
- **Sales desk.** Every paid order shows PayPal's actual fee, the net, and the country of the payer's PayPal account.
  A fee PayPal did not report reads Unknown, never zero.
  There is a pinned totals row, a chart by payment method, and Export CSV.
- **This week, written by AI.** A short weekly summary in English, 中文, Melayu or தமிழ்.
  The model writes only a template with placeholders, and Envoi fills in every figure from its own records.
- **Ask your orders.** One sentence becomes filters, a sort and a view on the orders table.
  The model sees the sentence and the date, never an order.
- **Merchant copilot.** The merchant asks about their own PayPal records in plain words.
  It reads them through PayPal's hosted MCP server and can propose a full refund of one paid order, but only the merchant's own tap on Confirm sends it.
  It is enabled for the labeled demo shops only.
- **Fees, shown honestly.** `/for-shops` has a calculator that shows what the shop keeps at PayPal's published Singapore rates.
  For a payer with an overseas PayPal account, PayPal's standard rate is 4.40% + S$0.50.
  PayPal's micropayment rate, 6.00% + S$0.08, costs less on orders under about S$26, which suits small hawker orders.
  The micropayment rate needs PayPal's approval, then applies to every sale, and whether a food stall qualifies is not confirmed.
  Envoi adds no fee of its own and never claims to be cheaper than cards.
- **Shops in the United States.** A merchant chooses Singapore or the United States before publishing.
  A US shop takes PayPal in USD.
  Merchant setup shows a card with what the shop was paid through Envoi this month and PayPal's advertised PYUSD rewards, which PayPal offers to US businesses and not yet to Singapore ones.
  That is PayPal's offer, shown with the date it was read, not a return Envoi promises.

## Bring your own AI

Envoi has its own MCP endpoint at `/mcp`.
Any assistant that supports the Model Context Protocol can connect with an operator-issued, revocable token, find a shop, read its published menu and create a one-time link to a priced order.
Each token is limited to 60 requests per 10 minutes.
The link works once and expires after 10 minutes, and the person still opens it and approves the payment.
The assistant cannot pay, approve a payment or read a receipt.

It has been tested with two assistants:

- **Claude Code** made a link that the user then paid in sandbox.
- **Meta Muse**, connected as a custom connector, found Ah Seng Chicken Rice, read its menu with prices matching Envoi's own, asked which chicken rice the user meant, and created a one-time link.
How to connect is described at `/agents`.

A reference buyer agent in `clients/buyer-agent/` (`npm run agent`) runs on the person's own machine over the same endpoint.
It refuses an item the menu did not return, or a quantity outside 1 to 20, before making any call, and it never sees the link's token.

## Why Envoi, when Wise exists

Wise can pay a PayNow QR code and reaches far more stalls than Envoi does, and Google Lens can translate a menu.
But paying and translating are only part of what a visitor needs at a hawker stall.
Before paying, they have to read the menu, choose dishes they have never heard of, agree a price across a language barrier and tell the stall what they want.

Envoi does all of that in one flow, in the browser, with the PayPal the visitor already has.
The visitor never types in an amount they heard in a language they do not speak, because Envoi prices the order from the menu.
The stall sees the order in its own language and gets a record of every paid order.

The trade-off is real: the shop pays PayPal's fee, and Envoi only works at enrolled shops.

## How PayPal is used

All PayPal use runs in the sandbox.

| PayPal tool | What it does in Envoi |
| --- | --- |
| Orders API v2 | Creates an order at the price Envoi calculates, with the shop's own PayPal account as payee, then captures it after the buyer approves |
| Payments API v2 | Verifies each capture before an order is called Paid, and sends a refund only after the merchant confirms it |
| Webhooks | Every webhook signature is verified with PayPal before Envoi trusts the event, and events for unknown orders are rejected |
| PayPal's hosted MCP server | The merchant copilot reads `get_order`, `list_transactions`, `list_disputes` and `get_dispute` at `mcp.sandbox.paypal.com/sse`, on the demo seller's own sandbox credentials |
| Fee and payer data | The sales desk reads PayPal's fee, net and payer country from the order PayPal returns |
| Crypto through PayPal | Offered only for seller ids listed in `PAYPAL_CRYPTO_ENABLED`, and exercised only in PayPal's sandbox simulator, labeled simulated |

Optionally, a Singapore shop can also accept PYUSD on Solana devnet with test tokens.
The shop sets its own PYUSD rate, Envoi prepares the transfer, and the visitor's own wallet signs it.

## How AI is used

**The rule:** AI is only ever a reader and a drafter.
No model sets a price, approves a payment or moves money.

- Every price comes from the shop's own published menu.
- Any item the model names that is not on a published menu is dropped, and a quantity outside 1 to 20 is refused rather than clamped.
- A translation never changes a price or adds an item, and every translation is labeled as AI.
- The weekly summary model never sees a figure, and a template holding any number of its own is refused.
- The merchant copilot refuses any reply that names an amount Envoi has not checked against its own records.
- Every PayPal result the copilot reads is filtered to that shop and stripped of the payer's name, email and account id before the model sees it, and PayPal's write tools never reach the model.
- A person approves every payment and every refund.

| Feature | Where | What the AI does |
| --- | --- | --- |
| Ask Envoi | `/buy/ask` | Reads shops and menus through Envoi's own `/mcp` endpoint, explains dishes, asks when one phrase fits two items, suggests an order within a budget, and hands the buyer a one-time link once they accept |
| One-sentence order | `/buy` | Turns one sentence into a basket the buyer can still change |
| Menu translation | Shop menu | Translates each item beside its original name |
| Show the stall | Paid receipt | Shows the order in the stall's language |
| Web menu import | `/merchant/setup` | Drafts an editable menu from the merchant's own public page |
| Weekly summary | `/merchant/orders` | Writes a short summary template in the merchant's language |
| Ask your orders | `/merchant/orders` | Turns one sentence into filters, a sort and a view |
| Merchant copilot | `/merchant/orders` | Answers questions about the shop's sandbox PayPal records and can propose a refund |

Models are chosen by environment variable, never in code: `AI_MODEL` for the assistant, the order box, Ask your orders and the copilot, `AI_MENU_TRANSLATION_MODEL` for translations, and `AI_WEB_MENU_MODEL` for menu import.

Ask Envoi is on only when `OPENAI_API_KEY`, `AI_MODEL` and `ASSISTANT_AGENT_TOKEN` are all set; otherwise `/buy/ask` answers 404 and nothing links to it.
The copilot is on only when `PAYPAL_DEMO_SELLER_CLIENT_ID`, `PAYPAL_DEMO_SELLER_CLIENT_SECRET`, `PAYPAL_DEMO_SELLER_MERCHANT_ID`, `OPENAI_API_KEY` and `AI_MODEL` are all set, and only for a shop whose PayPal seller is that merchant id.

## What was measured, and what was not

Each result below is a single run on labeled test shops, reviewed by the builder.
None of them is a measure of real buyers.

- **Languages:** the site lists Japanese, Malay, Spanish and Chinese because those languages passed fixed test cases.
  Ask Envoi scored 24 of 25 and the one-sentence box 20 of 25, with zero wrong basket links.
  This is not general language accuracy or native-reader validation.
- **Budget advice:** Ask Envoi scored 10 of 10, with nothing off the menu, nothing over budget and no dietary assurance.
- **Ask your orders:** its sort and view matched 16 of 16 pre-registered sentences.
- **Merchant copilot:** 7 of 8 pre-registered questions were run once each on sandbox data, and all 7 passed with no invented amount.
  The eighth, an injected order note, is covered by an automated test only.
- **End to end on the deployed site:** a US sandbox buyer scanned a test shop's SGQR on a phone, approved three items totaling S$6.50 and reached Paid, and Envoi's records matched PayPal's.
  Ask Envoi and Claude Code have each produced links that were paid in sandbox, and Meta Muse produced a link through the same MCP endpoint.
  A copilot-proposed refund of S$1.80 was sent by the merchant's tap.
- **Not claimed:** menu photo import is turned off, because no vision model met the accuracy bar in four rounds.
  No usability, completion-rate or adoption result exists.

## Test money only

- **PayPal sandbox.** Every PayPal payment uses sandbox accounts and sandbox money.
  To pay on the deployed site, a tester needs a PayPal sandbox buyer account.
- **Solana devnet.** PYUSD uses devnet test tokens, never mainnet, and is off unless `PYUSD_ENABLED` is `true`.
- **Labeled test shops.** Seeded shops and sample data are labeled as test fixtures in the app.
  Shop branding is fictional unless a merchant has given permission.

Every screen shows these labels.
Pending, failed or uncertain payments are never shown as Paid, and Envoi never holds a buyer's keys or signs a transfer.

## Try it

Everything below runs on the live test environment at <https://envoi-helx.onrender.com>.
Nothing needs installing, and no real money moves.

### What you need

- **A PayPal sandbox buyer account**, to approve a payment.
  Sign in at <https://developer.paypal.com> with any PayPal account, open **Testing Tools > Sandbox Accounts**, and use the **Personal** account it lists, or create one.
  Use that account's email and password on PayPal's sandbox sign-in page, never a real PayPal login.
- **A phone or laptop browser.** Scanning needs a camera; every other step works on a laptop.

### The listed test shops

All are labeled demo fixtures, and every one takes PayPal sandbox payments.

| Shop | Country | Good for |
| --- | --- | --- |
| Ah Huat Confirm Plus Chop Kopitiam | Singapore | The scan demo: a menu in Chinese and Singlish that Envoi explains |
| Ah Seng Chicken Rice | Singapore | Ask Envoi and assistant orders |
| Lorong Demo Kopi | Singapore | A short kopitiam menu |
| Tiong Bahru Kopi House | Singapore | A short kopitiam menu |
| Envoi Singapore Shop | Singapore | The only shop that also takes PYUSD on Solana devnet |
| Larkspur Street Taqueria | United States | A USD order |
| US Demo Shop | United States | A USD order |

### Pay at a stall

1. Open <https://envoi-helx.onrender.com/buy/scan>.
2. Scan the labeled test sticker [`sgqr-sticker-R26ZZ0002A.png`](docs/plans/envoi/fixtures/sgqr-sticker-R26ZZ0002A.png), shown on a second screen or printed.
   It opens Ah Huat Confirm Plus Chop Kopitiam.
   Its UEN is made up, so it is not a real SGQR, and no bank app can pay it.
   Without a camera, copy the sticker's contents from any QR reader into **Or paste the sticker contents**.
3. Read the menu: each dish is explained beside its original name.
   Switch the language to see the same menu in another language at the same prices.
4. Add items and press **Review**.
   The review shows the exact total and the shop's PayPal sandbox account as the payee.
5. Approve in PayPal with your sandbox buyer account.
   The receipt says **Paid** once PayPal confirms the capture.
6. Under **Show the stall** on the receipt, pick 中文, Melayu or தமிழ் and press **Play aloud**.

The receipt opens only in the browser that made the purchase.

### Ask Envoi

1. On the home page, choose **Ask Envoi**, or open `/buy/ask`.
2. Ask, for example, `What should I try at Ah Seng Chicken Rice for S$10?`
3. Accept the suggested basket, then open the review and pay as above.

### Bring your own assistant

1. Add the MCP server `https://envoi-helx.onrender.com/mcp` to an assistant that supports remote MCP servers, such as Claude Code or Meta Muse.
2. Use an Envoi agent token as the bearer token.
   Tokens are issued by the Envoi operator; judges have one in the submission form.
3. Ask, for example, `Two Kopi O at Lorong Demo Kopi.`
4. Open the link within 10 minutes, press **Open the review**, and approve in PayPal yourself.
   Each link works once.

### Optional: PYUSD on Solana devnet

1. In Phantom, turn on Testnet Mode and choose Solana Devnet.
   The wallet needs some devnet SOL for the network fee and some devnet PYUSD.
2. Open Envoi Singapore Shop, add items, press **Review** and choose **PYUSD on Solana devnet**.
3. Press pay and approve in Phantom.
   The receipt says **Paid** only after Envoi verifies the finalized devnet transfer, which can take up to a minute; press **Check status** to recheck.

Pay from your own wallet, not the shop's: a transfer from the shop's own account to itself is flagged as a mismatch and never shown as Paid.

### The shop side

`/for-shops` shows the fee calculator.
`/merchant/setup` lets anyone create an account and draft a shop, but a shop can publish only after the Envoi operator approves it and connects a PayPal sandbox seller account, so a new shop will wait at that step.

## Built with

| Tool | What it does here |
| --- | --- |
| Next.js 16.4.2, React 19.3.0, Node 24 | The web app, its API routes and the `/mcp` server |
| Neon Postgres and Drizzle ORM | The database, over three roles: `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `MAINTENANCE_DATABASE_URL` |
| Render | Hosts the deployed test environment from `main`, plus a Render Workflow that stores menu translations after each publish through `@renderinc/sdk` |
| PayPal sandbox and PayPal's hosted MCP server | Payments, refunds, webhooks and the copilot's reads |
| OpenAI through the Vercel AI SDK | Every AI feature listed above |
| MCP SDK (`@modelcontextprotocol/sdk`) | Envoi's own `/mcp` server, and the client used by Ask Envoi and the reference agent; every tool answer is validated against the server's output schema |
| Kernel | One hosted browser session per web menu import, deleted on every path |
| AG Grid Community and AG Charts Community | The menu import grid, the orders table and the sales chart |
| Better Auth | Merchant sign-up and sign-in, and the buyer's anonymous session |
| `barcode-detector` and `zxing-wasm` | Reads the SGQR sticker in the browser; the sticker is never stored |
| Solana Kit | Optional PYUSD payments on devnet |
| Tailwind CSS 4 and `zod` 4 | Styling and input validation |
| GitHub Actions | CI on every push, and a scheduled maintenance runner |

## Run it locally

Requirements: Node 24 (`.node-version`) and a local PostgreSQL 18 server.

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` with your own values.
It is ignored by Git, and `.env.example` lists every name the app reads, with a comment on each group.

Create the two application roles and the database, run the migrations, and seed the labeled test shop:

```bash
psql -h 127.0.0.1 -U postgres -c "CREATE ROLE envoi_web LOGIN" -c "CREATE ROLE envoi_maintenance LOGIN" -c "CREATE DATABASE envoi_dev"
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run db:migrate
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- seed-demo-fixture
npm run dev
```

`seed-demo-fixture` creates the test shop only when it is absent, so running it twice changes nothing.

To start again from an empty local database:

```bash
psql -h 127.0.0.1 -U postgres -c "DROP DATABASE envoi_dev" -c "CREATE DATABASE envoi_dev"
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run db:migrate
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- seed-demo-fixture
```

Never point these commands at a shared or hosted database you mean to keep.

## Tests and checks

```bash
npm run typecheck
npm run lint
npm run test:unit
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test npm run test:integration
```

Integration tests create and drop their own databases on the server `TEST_DATABASE_URL` names, so give them a disposable local server.
External services are replaced by labeled fakes in tests: PayPal at its write client, PayPal's MCP server, OpenAI and Kernel at their fetch boundaries, and Solana at its RPC transport.
Envoi's own MCP server runs for real over an in-memory transport.

`npm run build && npx tsx tests/e2e/run-public-api.ts 3100` checks the public read API and the MCP client over HTTP against the production build and a disposable database.

## Maintenance runner

`.github/workflows/maintenance.yml` runs the maintenance runner hourly on GitHub Actions.
It reconciles uncertain payments with read-only PayPal and devnet clients, closes expired work and records a heartbeat.
It can never capture or send a payment.
To run it by hand, use `npm run runner:build`, then `npm run runner:start` with the names listed under "Maintenance runner" in `.env.example`.

## Public API

`openapi/envoi-public.yaml` describes the two public read routes, listing shops and reading a published menu, and the agent purchase request route.
That route takes an agent token and answers with a one-time link that a person opens to review and approve.

## Project records

The product decisions, architecture, test plan and build history, with the evidence behind each claim above, are in [`docs/plans/envoi/`](docs/plans/envoi/).
[`00-status.md`](docs/plans/envoi/00-status.md) records what was built and verified, and what was not.

## License

[MIT](LICENSE).
