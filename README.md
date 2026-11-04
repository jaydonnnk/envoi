# Envoi

Envoi lets a visitor pay a shop in person with a payment method the visitor already has: PayPal in Singapore (SGD) and in the United States (USD), or optionally PYUSD on Solana devnet for a Singapore shop.
The money goes straight to the shop's own account, never through Envoi's.
The visitor scans the shop's QR or says what they want, AI gets them past a menu they cannot read, Envoi prices the order from the shop's published menu, and the visitor approves the exact amount with PayPal or in their own wallet.

Deployed test environment: <https://envoi-helx.onrender.com> (Render Free, so the first visit after idle can take a while).

## What the AI does

AI here is only ever a reader and a drafter. No model sets a price, approves a payment or moves money: every price comes from the shop's own published menu, and a person approves every payment.

- **Ask Envoi** at `/buy/ask`: the assistant inside the site. It reads shops and menus through Envoi's own `/mcp` endpoint with the official MCP SDK client, asks when one phrase fits two items, and hands the buyer a one-time link to a server-priced review. It cannot pay, approve or read a receipt. It is on only when `OPENAI_API_KEY`, `AI_MODEL` and `ASSISTANT_AGENT_TOKEN` are all set; `/buy/ask` answers 404 when it is off, and the landing page and `/buy` link to it only while it is on.
- **The one-sentence box** at `/buy`: one sentence to a basket the buyer can still change. The model names registered shops and items only; ids that are not on a published menu are dropped, prices come from the registry, and a quantity outside 1 to 20 is refused server-side rather than clamped.
- **The menu explained and translated**: an AI translation beside each original name on the buyer's menu, with the original one tap away. A translation never changes a displayed price and never adds an item.
- **Web menu import** at `/merchant/setup`: one hosted Kernel browser session reads the merchant's own public menu page and one model call drafts an editable table. A price is filled only when the page prints it as text with the same digits. The draft never publishes itself; the merchant confirms every row.
- **Reference buyer agent** at `clients/buyer-agent/` (`npm run agent`): an agent on the person's own machine over the same MCP endpoint. It refuses an item the menu did not return and a quantity outside 1 to 20 before making any call, and it never sees the link's token.

Models are named by the environment and never in code: `AI_MODEL` for the assistant and the box, `AI_MENU_TRANSLATION_MODEL` for translations, `AI_WEB_MENU_MODEL` for the web import. On the deployed test environment `AI_MODEL` is `gpt-6-sol` (user-reported; the model in use cannot be read from outside).

**What is measured, and what is not.** Ask Envoi's model scored 24 of 25 on the registered sentences in one local run against FIXTURE shops, after six candidates had been tried; the box's model scored 25 of 25 in one local run. Both are single runs on fixtures and are not a measure of real buyers. Ordering in languages other than those registered sentences is not evaluated yet, so no language is claimed. Ask Envoi through to a Paid receipt on the deployed site has not been run. Menu photo import ships closed: no vision model met its threshold in four rounds.

## Test money only

Everything here is a hackathon prototype in a test environment.

- **PayPal sandbox.** Every PayPal payment uses sandbox accounts and sandbox money; no real money moves.
- **Solana devnet.** PYUSD payments use devnet test tokens on Solana devnet, never mainnet. PYUSD is off unless `PYUSD_ENABLED` is `true`.
- **Demo fixtures.** Seeded shops and sample data are labeled demo fixtures in the app. Shop branding is fictional unless a merchant has given permission.

The app shows these labels on every screen. Pending, failed or uncertain payments are never shown as paid, and Envoi never holds a buyer's keys or signs a transfer.

## Tools and services

| Tool | What it does here | Limit that matters |
| --- | --- | --- |
| Render Free | Hosts the deployed test environment from `main` | Sleeps when idle; a cold first visit took about 28 s from Singapore |
| Neon Postgres | The database, over three roles: `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `MAINTENANCE_DATABASE_URL` | Holds fixture shops and sandbox payments only |
| PayPal sandbox | The buyer's approval, and the shop's own seller account as payee | Sandbox money only; Envoi is never the payee |
| Solana devnet | PYUSD test tokens, off unless `PYUSD_ENABLED` is `true` | Devnet only, never mainnet; Envoi prepares, the wallet signs |
| OpenAI | `AI_MODEL` for the assistant and the box, `AI_MENU_TRANSLATION_MODEL` for translations, `AI_WEB_MENU_MODEL` for the web import, through the Vercel AI SDK | Faked at its fetch boundary in every test; real calls happen only in recorded runs |
| Kernel | One hosted headless browser session per web menu import, which reads the merchant's own public page | Deleted in a `finally` block on every path; no PDF, no link following, no live view |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.1: Envoi's own `/mcp` server, and the client the assistant and the reference agent use | Each tool answer is validated against the server's own output schema |
| Better Auth | Merchant sign-in and the buyer's anonymous session | There is no public merchant sign-up; the operator creates accounts |
| AG Grid Community 36.2.0 | The merchant's menu draft grid | Community edition only; no paid module and no AG Studio |
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
External providers are replaced by labeled fixtures in tests: PayPal at its write client, OpenAI at its fetch boundary, Kernel at its SDK's fetch boundary, Solana at its RPC transport, and Envoi's own MCP server as the real `McpServer` over an in-memory transport.
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
