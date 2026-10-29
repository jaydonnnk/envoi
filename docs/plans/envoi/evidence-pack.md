# Envoi evidence pack

Status: draft, 2026-10-21, extended 2026-10-29 for S19, S20, S21, the S22 round 4 outcome, S24 and the removal of the usability study; completed when S15 closes.
Every claim made in the README, the video or the submission is listed here with its label and the record that supports it.
A claim with no record here is not made.

Labels: **[verified]** means supported by the linked record; **[user-reported]** means the user observed it and the record says so; **[vendor claim]** means advertised by a provider and not independently checked; **[hypothesis]** means our judgment; **[unknown]** means not established; **[not run]** means planned and not yet done.
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
| A merchant's setup page shows an Envoi shop QR that opens the shop's buy page; it is not a payment code and the SGQR itself is never stored | [verified] locally; [user-reported] on the deployed site | [S18](00-status.md#s18-merchant-shop-qr-and-order-archive-2026-10-24) |
| A merchant can delete any order; it is archived as a record, never erased, and an order paid after its archive comes back as Paid | [verified] | [S18](00-status.md#s18-merchant-shop-qr-and-order-archive-2026-10-24), [mutations](evidence/s18-mutations.json) |
| A buyer can type one sentence and get a basket they can still change, holding only published, priced, available items, with nothing reviewed or paid until they tap Review | [verified] on a local production build at 390 px and 1280 px; the deployed screen is [unknown] | [S21](00-status.md#s21-order-from-one-sentence-2026-10-26) |
| The model that fills that basket met a pre-registered threshold of 24 of 25 sentences | [verified], with the limit that run 2 followed a prompt fix informed by run 1, so four of the 25 are not out-of-sample | [S21 evaluation](00-status.md#s21-model-evaluation-results-2026-10-26) |
| An AI agent running on a person's own machine, built on the generated SDK, turned one sentence into a link that the person then paid with PayPal sandbox money on the deployed site; the agent never sent an amount and never saw the link's token | [verified] on the deployed app; the merchant's order view [user-reported] | [S20](00-status.md#s20-reference-buyer-agent-on-the-generated-sdk-2026-10-28), [S20 on Render](00-status.md#s20-on-render-2026-10-28) |
| That agent refuses an item the menu did not return and a quantity outside 1 to 20 before making any call | [verified] | [S20](00-status.md#s20-reference-buyer-agent-on-the-generated-sdk-2026-10-28) |
| Menu photo import drafts menus with AI | **not claimed**: no model met the pre-registered threshold in four rounds, the last on 2026-10-28, so import ships closed and the work stopped | [S11](00-status.md#s11-menu-photo-import-with-direct-vision-2026-10-15), [S22 round 4](00-status.md#s22-round-4-results-2026-10-28), [gap analysis](photo-import-gap-analysis.md) |
| A merchant can paste their own shop's public menu page and get an editable draft table; a price is filled only when the page prints it as text with the same digits, and the draft never publishes itself | [verified] on a local production build with real Kernel and OpenAI calls; web import is switched on on the deployed site by the user's settings [user-reported], and a signed-in import there is [unknown] | [S24](00-status.md#s24-menu-from-the-shops-own-page-2026-10-29) |
| The web import model met a pre-registered threshold: zero wrong filled prices and 51 of 51 expected priced items drafted, across seven FIXTURE pages and three real pages used with the owners' verbal permission | [verified], with the limit that only one real page had a text menu and the fixture pages were written by the builder, so it does not show accuracy on other sites [hypothesis] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29), [output](evidence/s24-web-eval-gpt-6-luna.json) |
| That evaluation cost US$0.001341 in model calls, and every one of its ten browser sessions was deleted after the read | [verified] token counts and deletions; the prices behind the cost are a [vendor claim] and Kernel's charge is [unknown] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29) |
| A picture menu, a sign-in page or a PDF menu link drafts nothing; a PDF link answers "Envoi cannot read PDF menus" | [verified] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29), [S24 review](00-status.md#s24-review-2026-10-29) |
| A shop published and bought from after a web import | [not run]: the FIXTURE shop has no PayPal sandbox destination, so publication and the buy page were not shown after a web import | [S24](00-status.md#s24-menu-from-the-shops-own-page-2026-10-29) |
| The public read API matches its OpenAPI document, and an APIMatic-generated TypeScript client reads it | [verified] | [S14](00-status.md#s14-apimatic-client-and-docs-2026-10-19) |
| The agent's purchase request route is in that same OpenAPI document, and the client APIMatic regenerated from it is committed byte-identical to the generator's output | [verified] | [S19](00-status.md#s19-agent-route-in-the-openapi-document-and-a-regenerated-client-2026-10-25) |
| The generated client reaches no receipt or payment route | [verified] | [S19](00-status.md#s19-agent-route-in-the-openapi-document-and-a-regenerated-client-2026-10-25) |

## Operations and release

| Claim | Label | Record |
| --- | --- | --- |
| Maintenance runs on a public GitHub runner on a schedule | [verified]; hourly in the workflow, and in practice every 4 to 7 hours over the five runs to 2026-10-29, all successful | [S15](00-status.md#s15-judged-release-2026-10-20) |
| The repository's whole Git history was scanned for secrets before it became public | [verified] | [S15](00-status.md#s15-judged-release-2026-10-20), [scan](evidence/s15-history-scan.txt) |
| An idle cold first visit on Render Free takes about 28 s from Singapore, about 2 s of it the database | [verified] | [S15](00-status.md#s15-judged-release-2026-10-20), [S15 latency](evidence/s15-cold-visit.json), [S1 latency](evidence/s1-r12-latency.json) |
| Storage exhaustion risk R2 is accepted at 35 MB of 1 GB | [user-reported] storage reading | [S15](00-status.md#s15-judged-release-2026-10-20) |
| Render, Neon, Actions and OpenAI stay available through 16 Dec 2026 | OpenAI credit lasts to 2026-12-24 across two grants [user-reported]; Neon's margin is [unknown], so availability through 16 Dec is not claimed; Render and Neon usage on 2026-10-29 was well inside its free allowance [user-reported] | [S15](00-status.md#s15-judged-release-2026-10-20) |

## Success metric

| Claim | Label | Record |
| --- | --- | --- |
| 4 of 5 first-time buyers complete an eligible test-environment purchase within 3 minutes, without coaching, with a matching external record | **not claimed**: the five-tester study was removed from S15 on 2026-10-29 by the user's decision, so the target is never measured | [usability results](usability/results.md), [kit](usability/README.md), [Gate 1 success metric](01-product.md#success-metric) |

No usability, completion-rate, timing or ease-of-use claim is made anywhere in the README, the video or the submission.
What exists instead is a set of single observed end-to-end runs, each listed above with its own record, and one observed journey is not a sample of first-time buyers.
