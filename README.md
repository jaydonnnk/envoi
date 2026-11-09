# Envoi

Envoi lets a visitor pay a shop in person with a payment method the visitor already has: PayPal in Singapore (SGD) and in the United States (USD), or optionally PYUSD on Solana devnet for a Singapore shop.
The money goes straight to the shop's own account, never through Envoi's.
The visitor scans the shop's QR or says what they want, AI gets them past a menu they cannot read, Envoi prices the order from the shop's published menu, and the visitor approves the exact amount with PayPal or in their own wallet.

The headline on the site is "Scan the stall's SGQR. Pay with the PayPal you already have."
The first audience is a visitor from the UK, the US or Australia at a Singapore stall where their card does not work.
PayPal is not on SGQR: Envoi identifies an enrolled shop from its sticker and pays that shop's own PayPal, and an unenrolled sticker stays unpayable.
PayPal's fee is the shop's cost and Envoi adds nothing to it, so `/for-shops` shows the fee at PayPal's published Singapore rates and links the source; Envoi makes no claim to be cheaper than cards.
PayPal's micropayment rate can cost a shop less than PayPal's standard rate on orders under S$26, but it needs PayPal's approval and then applies to every sale, and whether a food stall qualifies is unknown.

Deployed test environment: <https://envoi-helx.onrender.com> (Render `0.5c-512mb`, which does not sleep, since S50).

S49 demo polish is complete (2026-11-08). The deployed public list hides the internal fixtures Test Shop and Judge Demo Cafe; their direct links and records still work. The revised poster proposal uses the stall's existing SGQR, with no second QR. Gates 1 and 3 are approved for an optional "Print poster" utility. The QR-free sheet is deployed and was checked on Render at 390 px and 1280 px. One recorded fixture scan-to-Paid journey is verified: a US sandbox buyer personally approved three items totaling S$6.50; Envoi and PayPal records match. See the [S49 record](docs/plans/envoi/00-status.md#s49-demo-polish-2026-11-08).

## What the AI does

AI here is only ever a reader and a drafter. No model sets a price, approves a payment or moves money: every price comes from the shop's own published menu, and a person approves every payment.

- **Ask Envoi** at `/buy/ask`: the assistant inside the site.
  It reads shops and menus through Envoi's own `/mcp` endpoint with the official MCP SDK client, asks when one phrase fits two items, and hands the buyer a one-time link to a server-priced review.
  A shop's page or QR can open it for that one shop.
  Asked for a suggestion within a budget, it suggests only available menu items, Envoi checks the sum against the menu prices, and no link exists until the buyer accepts.
  It gives no dietary assurance, and it cannot pay, approve or read a receipt.
  It is on only when `OPENAI_API_KEY`, `AI_MODEL` and `ASSISTANT_AGENT_TOKEN` are all set; `/buy/ask` answers 404 when it is off, and the landing page and `/buy` link to it only while it is on.
- **The one-sentence box** at `/buy`: one sentence to a basket the buyer can still change.
  The model names registered shops and items only; ids that are not on a published menu are dropped, prices come from the registry, and a quantity outside 1 to 20 is refused server-side rather than clamped.
- **The menu explained and translated**: an AI translation beside each original name on the buyer's menu, with the original one tap away.
  A translation never changes a displayed price and never adds an item.
- **Show the stall**: after a Paid receipt, the visitor can show the order in large text in English, 中文, Melayu or தமிழ் and play it aloud where the browser supports that language.
  Original names and the paid amount stay on screen, and any translation is labeled as AI.
- **A stall that is not on Envoi** at `/buy/scan`: a sticker that matches no published shop shows a static card the visitor can show the stall, in English, 中文, and Melayu and தமிழ் marked as draft translations, with a QR code to `/for-shops`.
  Scanning still pays nothing and adds no shop. Envoi keeps only a weekly count of scans under an HMAC-SHA256 of the sticker's UEN keyed by `STICKER_HASH_KEY`: no stall name, sticker text or anything about the visitor.
  A merchant who later submits that UEN in setup sees the count as scans, never as sales or visitors; one buyer adds at most 5 in 10 minutes.
- **Web menu import** at `/merchant/setup`: one hosted Kernel browser session reads the merchant's own public menu page and one model call drafts an editable table.
  A price is filled only when the page prints it as text with the same digits.
  The draft never publishes itself; the merchant confirms every row.
- **Your sales desk** at `/merchant/orders`: each paid PayPal order shows PayPal's fee, the net and the country of the payer's PayPal account, read from the order PayPal returns when Envoi verifies the capture.
  A fee PayPal did not give reads Unknown, never zero, and an order is called overseas only from that PayPal country.
  Tiles, a pinned "Totals, paid only" row, a by-method table and an AG Charts bar chart are computed on the server over paid orders only, leaving out orders with a completed refund, and Export CSV saves the table.
  Orders paid before 2026-11-08 carry no fee and read Unknown.
- **This week, written by AI** at `/merchant/orders`: on a shop with an approved enrollment, the merchant picks English, 中文, Melayu or தமிழ் and asks for a short weekly summary.
  The model writes only a template with placeholder names and never sees a figure; Envoi fills in every figure from its own records, once per currency.
  A template holding any number of its own, or a fee or net while a fee is unknown, is refused and no summary is shown.
- **Ask your orders** at `/merchant/orders`: one sentence from the merchant becomes filters, a sort and a view on the orders table.
  The model sees the sentence and the date, never an order, and it cannot change anything.
  Its sort and view answered 16 of 16 pre-registered sentences as registered on `gpt-6-sol` on 2026-11-08: one run of fixed English sentences, not a measure of accuracy.
- **Merchant copilot** at `/merchant/orders`, for the labeled demo shops only (Judge Demo Cafe and Test Shop, which share one sandbox demo seller): the merchant asks about their own sandbox PayPal records in plain words.
  It reads Envoi's own orders of that shop and four PayPal reads (`get_order`, `list_transactions`, `list_disputes`, `get_dispute`) through PayPal's hosted MCP server over SSE, on the demo seller's own sandbox credentials.
  Every PayPal result is filtered to that shop and stripped of the payer's name, email and account id before the model sees it, and PayPal's write tools never reach the model.
  It can suggest a full refund of one paid order, but only the merchant's own tap on Confirm sends it, and the order stays recorded as Paid with the refund beside it.
  It is on only when `PAYPAL_DEMO_SELLER_CLIENT_ID`, `PAYPAL_DEMO_SELLER_CLIENT_SECRET`, `PAYPAL_DEMO_SELLER_MERCHANT_ID`, `OPENAI_API_KEY` and `AI_MODEL` are all set, and only for a shop with an approved enrollment whose PayPal seller is that merchant id.
  Deployed 2026-11-08. Its pre-registered evaluation ran 7 of 8 questions once each on sandbox data, and all 7 passed with no invented amount; the eighth, an injected order note, could not be placed without a write and is covered by an automated test only.
  On the deployed site one sandbox purchase of S$1.80 was refunded by the merchant's tap on a refund the copilot proposed (sandbox refund `99V07871LW516274N`). One run, not a measure of reliability.
- **Bring your own assistant** at `/agents`: how to connect an outside MCP assistant with an operator-issued token, limited to 60 `/mcp` requests per 10 minutes and revocable.
  It gets the same reads and the same one-time link, and the person still approves the payment.
- **Reference buyer agent** at `clients/buyer-agent/` (`npm run agent`): an agent on the person's own machine over the same MCP endpoint.
  It refuses an item the menu did not return and a quantity outside 1 to 20 before making any call, and it never sees the link's token.

Models are named by the environment and never in code: `AI_MODEL` for the assistant, the box and Ask your orders, `AI_MENU_TRANSLATION_MODEL` for translations, `AI_WEB_MENU_MODEL` for the web import.
On the deployed test environment `AI_MODEL` is `gpt-6-sol` (user-reported; the model in use cannot be read from outside).

**What is measured, and what is not.** Every result below is a single run on FIXTURE shops with builder review, not a measure of real buyers.

- **Languages:** the site lists Japanese, Malay, Spanish and Chinese because those languages passed fixed cases.
  In the S32 set, Ask Envoi scored 24 of 25 and the box 20 of 25, with zero wrong basket links.
  Chinese passed all five cases on both paths in a separate follow-up.
  This is not general language accuracy or native-reader validation.
- **Ask Envoi today:** its current instructions scored 10 of 10 on the budget advice cases, with none off the menu, over budget or giving a dietary assurance, and 25 of 25 on the frozen sentences with zero wrong basket links.
- **On the deployed site:** Ask Envoi reached a Paid receipt with PayPal sandbox test money, most recently on 2026-11-07 ([record](docs/plans/envoi/00-status.md#s34-accept-button-2026-11-07)).
  An outside assistant, Claude Code, also made a link that the user then paid in sandbox ([record](docs/plans/envoi/00-status.md#s37-bring-your-own-assistant-2026-11-06)).
- **Not claimed:** menu photo import ships closed, because no vision model met its threshold in four rounds.
  No usability, completion or adoption result exists.

## Test money only

Everything here is a hackathon prototype in a test environment.

- **PayPal sandbox.** Every PayPal payment uses sandbox accounts and sandbox money; no real money moves. To pay on the deployed site, a tester uses a PayPal sandbox buyer account.
- **Crypto through PayPal.** Offered only for seller ids listed in `PAYPAL_CRYPTO_ENABLED`, and exercised only in PayPal's sandbox simulator, labeled simulated; no token moves.
- **Solana devnet.** PYUSD payments use devnet test tokens on Solana devnet, never mainnet. PYUSD is off unless `PYUSD_ENABLED` is `true`.
- **Demo fixtures.** Seeded shops and sample data are labeled demo fixtures in the app. Shop branding is fictional unless a merchant has given permission.

The app shows these labels on every screen. Pending, failed or uncertain payments are never shown as paid, and Envoi never holds a buyer's keys or signs a transfer.

## Tools and services

| Tool | What it does here | Limit that matters |
| --- | --- | --- |
| Render | Hosts the deployed test environment from `main` on the `0.5c-512mb` plan (S50), and the `envoi-workflow` Workflow that stores five menu translations after each publish through `@renderinc/sdk`; `render.yaml` records both and is not applied as a Blueprint | Does not sleep; after 25 idle minutes one request answered in 0.32 s. Before S50, on Free, a cold first visit took about 28 s. A failed Workflow run leaves on-demand translation working |
| Neon Postgres | The database, over three roles: `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `MAINTENANCE_DATABASE_URL` | Holds fixture shops and sandbox payments only |
| PayPal sandbox | The buyer's approval, and the shop's own seller account as payee | Sandbox money only; Envoi is never the payee |
| PayPal's MCP server | The merchant copilot's reads at `mcp.sandbox.paypal.com/sse`, on the demo seller's own token | Sandbox only; Envoi passes on four read tools and no write tool |
| Solana devnet | PYUSD test tokens, off unless `PYUSD_ENABLED` is `true` | Devnet only, never mainnet; Envoi prepares, the wallet signs |
| OpenAI | `AI_MODEL` for the assistant, the box and Ask your orders, `AI_MENU_TRANSLATION_MODEL` for translations, `AI_WEB_MENU_MODEL` for the web import, through the Vercel AI SDK | Faked at its fetch boundary in every test; real calls happen only in recorded runs |
| Kernel | One hosted headless browser session per web menu import, which reads the merchant's own public page | Deleted in a `finally` block on every path; no PDF, no link following, no live view |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.1: Envoi's own `/mcp` server, and the client the assistant and the reference agent use | Each tool answer is validated against the server's own output schema |
| Better Auth | Merchant sign-up and sign-in, and the buyer's anonymous session | Sign-up is on only while `MERCHANT_SIGNUP_ENABLED` is `true`, limited to 3 per address and 30 in all per hour; each account gets one pending test shop that the operator approves before it has a public page or takes payment |
| AG Grid Community 36.2.0 | The merchant's menu draft grid and orders table | Community edition only; no paid module and no AG Studio |
| AG Charts Community 14.2.0 | The sales desk's bar chart of paid sales and known PayPal fees by payment method | Community edition only; it draws the server's totals and computes none |
| `barcode-detector` and `zxing-wasm` | SGQR sticker decode in the merchant's own browser | The sticker is never stored and never a payment destination |
| GitHub Actions | CI on every push, and the maintenance runner on a schedule | The runner reconciles and closes only; it can never capture or send a payment |

Next.js 16.4.2 and React 19.3.0 on Node 24, with Drizzle ORM over `postgres`, Tailwind CSS 4 and `zod` 4. Migrations run against PostgreSQL 18 locally and Neon in the deployed environment.

## Setup

Requirements: Node 24 (`.node-version`) and a local PostgreSQL 18 server for development and tests.

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` with your own values; it is ignored by Git, and `.env.example` lists every name the app reads with a comment on each group.
A local database needs the two application roles first, then the migrations and the demo fixture shop:

```bash
psql -h 127.0.0.1 -U postgres -c "CREATE ROLE envoi_web LOGIN" -c "CREATE ROLE envoi_maintenance LOGIN" -c "CREATE DATABASE envoi_dev"
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run db:migrate
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- seed-demo-fixture
npm run dev
```

## Reset

To start again from an empty local database, drop it and repeat the setup steps after `CREATE ROLE`:

```bash
psql -h 127.0.0.1 -U postgres -c "DROP DATABASE envoi_dev" -c "CREATE DATABASE envoi_dev"
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run db:migrate
MIGRATION_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_dev npm run operator -- seed-demo-fixture
```

`seed-demo-fixture` creates the labeled fixture shop only when it is absent, so running it twice changes nothing.
Never point these commands at a shared or hosted database you mean to keep.

## Checks

```bash
npm run typecheck
npm run lint
npm run test:unit
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test npm run test:integration
```

Integration tests create and drop their own databases on the server `TEST_DATABASE_URL` names; give them a disposable local server.
External providers are replaced by labeled fixtures in tests: PayPal at its write client, PayPal's MCP server at its fetch boundary, OpenAI at its fetch boundary, Kernel at its SDK's fetch boundary, Solana at its RPC transport, and Envoi's own MCP server as the real `McpServer` over an in-memory transport.
`npm run build && npx tsx tests/e2e/run-public-api.ts 3100` checks the public read API and the MCP client over HTTP against the production build and a disposable database it creates and drops.

## Maintenance

`.github/workflows/maintenance.yml` runs the maintenance runner hourly at minute 17 on GitHub Actions.
It reconciles uncertain payments with read-only PayPal and devnet clients, closes expired work and records a heartbeat and storage use; it can never capture or send a payment.
To run it by hand: `npm run runner:build`, then `npm run runner:start` with the names listed under "Maintenance runner" in `.env.example`.

## Public API

`openapi/envoi-public.yaml` describes the two public read routes (list shops, read a published menu) and the agent's purchase request route, which takes an agent token and answers a one-time link a human buyer opens to review and approve.
The assistant and terminal buyer agent use the MCP SDK client against Envoi's `/mcp` endpoint. Each tool answer is validated against the same output schema as the server. The public REST API and its OpenAPI document remain available.

## Project records

The product, architecture, program design and slice plan, with every approval and its evidence, are in [`docs/plans/envoi/`](docs/plans/envoi/).
[`00-status.md`](docs/plans/envoi/00-status.md) is the record of what was built and verified, and what was not; [`evidence/`](docs/plans/envoi/evidence/) holds the raw records it links to.

## License

[MIT](LICENSE).

S49 completion, 2026-11-08 [verified]: the user recorded a phone scanning the labeled Test Shop fixture SGQR, reviewing three items totaling S$6.50, approving with a US PayPal sandbox buyer, reaching Paid and viewing Show the stall in four languages. PayPal order `6FP05345YE454760E` and capture `77E816612H944211M` match Envoi's purchase, SGD650, seller and items. The basket differs from the proposed one-item S$1.80 run because the user selected and approved three items. The original video remains private; only sanitized metadata is recorded. One fixture journey proves no completion rate, usability or general translation accuracy. See [S49](docs/plans/envoi/00-status.md#s49-demo-polish-2026-11-08).
