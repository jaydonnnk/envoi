# Envoi

Envoi lets a visitor in Singapore pay a shop in person with a payment method the visitor already has, PayPal or, optionally, PYUSD on Solana devnet.
The money goes straight to the shop's own account, never through Envoi's.
The buyer describes or scans what they want, Envoi prices the order from the shop's published menu, and the buyer approves the exact amount with PayPal or in their own wallet.

Deployed test environment: <https://envoi-helx.onrender.com> (Render Free, so the first visit after idle can take a while).

## Test money only

Everything here is a hackathon prototype in a test environment.

- **PayPal sandbox.** Every PayPal payment uses sandbox accounts and sandbox money; no real money moves.
- **Solana devnet.** PYUSD payments use devnet test tokens on Solana devnet, never mainnet. PYUSD is off unless `PYUSD_ENABLED` is `true`.
- **Demo fixtures.** Seeded shops and sample data are labeled demo fixtures in the app. Shop branding is fictional unless a merchant has given permission.

The app shows these labels on every screen. Pending, failed or uncertain payments are never shown as paid, and Envoi never holds a buyer's keys or signs a transfer.

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
npm run typecheck:client
npm run lint
npm run test:unit
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test npm run test:integration
```

Integration tests create and drop their own databases on the server `TEST_DATABASE_URL` names; give them a disposable local server.
External providers are replaced by labeled fixtures in tests: PayPal at its write client, OpenAI at its fetch boundary and Solana at its RPC transport.
`npm run build && npx tsx tests/e2e/run-public-api.ts 3100` checks the public read API and the generated client over HTTP against the production build and a disposable database it creates and drops.

## Maintenance

`.github/workflows/maintenance.yml` runs the maintenance runner hourly at minute 17 on GitHub Actions.
It reconciles uncertain payments with read-only PayPal and devnet clients, closes expired work and records a heartbeat and storage use; it can never capture or send a payment.
To run it by hand: `npm run runner:build`, then `npm run runner:start` with the names listed under "Maintenance runner" in `.env.example`.

## Public API

`openapi/envoi-public.yaml` describes the two public read routes (list shops, read a published menu) and the agent's purchase request route, which takes an agent token and answers a one-time link a human buyer opens to review and approve.
`clients/typescript/` is a TypeScript client generated from it by APIMatic and committed unchanged; the app never calls it. [`clients/README.md`](clients/README.md) says how it was generated and what it checks.

## Project records

The product, architecture, program design and slice plan, with every approval and its evidence, are in [`docs/plans/envoi/`](docs/plans/envoi/).
[`00-status.md`](docs/plans/envoi/00-status.md) is the record of what was built and verified, and what was not; [`evidence/`](docs/plans/envoi/evidence/) holds the raw records it links to.

## License

[MIT](LICENSE).
