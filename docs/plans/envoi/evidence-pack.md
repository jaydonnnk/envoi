# Envoi evidence pack

Status: draft, 2026-10-21, on `envoi/slice-15-release`; completed when S15 closes.
Every claim made in the README, the video or the submission is listed here with its label and the record that supports it.
A claim with no record here is not made.

Labels: **[verified]** means supported by the linked record; **[user-reported]** means the user observed it and the record says so; **[unknown]** means not established; **[not run]** means planned and not yet done.
Every payment below used PayPal sandbox money or Solana devnet test tokens; none is real money, real adoption or a real merchant.

## Payments

| Claim | Label | Record |
| --- | --- | --- |
| A buyer paid a shop's own PayPal sandbox seller account, never Envoi's, after a server-priced review | [verified] | [S2](00-status.md#s2-paypal-sandbox-happy-path-2026-10-13), [S7](00-status.md#s7-merchant-destination-and-publication-2026-10-14) |
| A lost PayPal response stays "checking payment" until reconcile, a webhook or maintenance decides it; it is never shown as paid early | [verified] | [S3](00-status.md#s3-paypal-recovery-2026-10-13), [S5](00-status.md#s5-maintenance-runner-manual-runs-and-operator-health-view-2026-10-14) |
| A changed menu or destination invalidates an earlier review before payment starts | [verified] | [S7](00-status.md#s7-merchant-destination-and-publication-2026-10-14) |
| A buyer paid in PYUSD devnet test tokens from Phantom, the shop's rate rounded up, and the receipt read paid only after the transfer was finalized and verified | [verified] | [S16](00-status.md#s16-pyusd-devnet-purchase-2026-10-17-to-2026-10-18), [devnet proof](evidence/s16-devnet-proof.json) |
| A PYUSD payment made on an iPhone through Phantom's browser was confirmed | [verified] | [S16 Phantom landing](00-status.md#s16-amendment-phantom-landing-2026-10-18) |
| A PYUSD attempt with a lost wallet response is decided by a complete history scan; an extra transfer is shown, never hidden | [verified] | [S17](00-status.md#s17-pyusd-recovery-2026-10-18), [devnet scan](evidence/s17-devnet-scan.json) |
| Envoi never signs or sends a transfer: no send method is in the built server or browser bundles | [verified] | `scripts/scan-build.ts`, run in CI on every push |

## Buyer and merchant journeys

| Claim | Label | Record |
| --- | --- | --- |
| A buyer can describe what they want in text and get registered shops and items; the model never sets a price | [verified] | [S4](00-status.md#s4-text-entry-with-ai-suggestions-2026-10-13-to-2026-10-14) |
| A buyer can scan or paste a shop's SGQR sticker to open that shop; the sticker is never payment authority | [verified] with fixture stickers only | [S9](00-status.md#s9-merchant-sgqr-decode-and-mapping-2026-10-16), [S10](00-status.md#s10-buyer-scan-or-paste-2026-10-17) |
| An AI agent can hand a buyer a one-time link to a server-priced review over MCP, and cannot pay or read the receipt | [verified] | [S13](00-status.md#s13-agent-handoff-over-mcp-2026-10-14) |
| A merchant signs in, enters a menu by hand, connects a sandbox seller and publishes | [verified] | [S6](00-status.md#s6-merchant-sign-in-and-manual-menu-draft-2026-10-14), [S7](00-status.md#s7-merchant-destination-and-publication-2026-10-14) |
| A merchant sees only paid orders as paid and acknowledges them separately | [verified] | [S8](00-status.md#s8-merchant-orders-and-separate-acknowledgment-2026-10-15) |
| Menu photo import drafts menus with AI | **not claimed**: no model met the pre-registered threshold, so import ships closed | [S11](00-status.md#s11-menu-photo-import-with-direct-vision-2026-10-15) |
| The public read API matches its OpenAPI document, and an APIMatic-generated TypeScript client reads it | [verified] | [S14](00-status.md#s14-apimatic-client-and-docs-2026-10-19) |

## Operations and release

| Claim | Label | Record |
| --- | --- | --- |
| Maintenance runs on a public GitHub runner on a schedule | [verified]; hourly in the workflow, about every three hours in practice | [S15](00-status.md#s15-judged-release-2026-10-20) |
| The repository's whole Git history was scanned for secrets before it became public | [verified] | [S15](00-status.md#s15-judged-release-2026-10-20), [scan](evidence/s15-history-scan.txt) |
| An idle cold first visit on Render Free takes about 28 s from Singapore, about 2 s of it the database | [verified] | [S15](00-status.md#s15-judged-release-2026-10-20), [S15 latency](evidence/s15-cold-visit.json), [S1 latency](evidence/s1-r12-latency.json) |
| Storage exhaustion risk R2 is accepted at 35 MB of 1 GB | [user-reported] storage reading | [S15](00-status.md#s15-judged-release-2026-10-20) |
| Render, Neon, Actions and OpenAI stay available through 16 Dec 2026 | [unknown] | to be confirmed in S15 |

## Success metric

| Claim | Label | Record |
| --- | --- | --- |
| 4 of 5 first-time buyers complete an eligible test-environment purchase within 3 minutes, without coaching, with a matching external record | [not run] | [usability results](usability/results.md), [kit](usability/README.md) |
