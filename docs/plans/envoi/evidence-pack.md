# Envoi evidence pack

Status: complete, 2026-10-29, when S15 closed; drafted 2026-10-21 and extended 2026-10-29 for S19, S20, S21, the S22 round 4 outcome, S24 and the removal of the usability study. The video is the user's and is not part of S15; anything it says must already be listed here.
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
| A merchant can paste their own shop's public menu page and get an editable draft table; a price is filled only when the page prints it as text with the same digits, and the draft never publishes itself | [verified] on a local production build with real Kernel and OpenAI calls; web import is switched on on the deployed site by the user's settings [user-reported], and a signed-in import there ran in [S26](00-status.md#s26-the-connected-run-2026-10-30) [verified] | [S24](00-status.md#s24-menu-from-the-shops-own-page-2026-10-29) |
| The web import model met a pre-registered threshold: zero wrong filled prices and 51 of 51 expected priced items drafted, across seven FIXTURE pages and three real pages used with the owners' verbal permission | [verified], with the limit that only one real page had a text menu and the fixture pages were written by the builder, so it does not show accuracy on other sites [hypothesis] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29), [output](evidence/s24-web-eval-gpt-6-luna.json) |
| That evaluation cost US$0.001341 in model calls, and every one of its ten browser sessions was deleted after the read | [verified] token counts and deletions; the prices behind the cost are a [vendor claim] and Kernel's charge is [unknown] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29) |
| A picture menu, a sign-in page or a PDF menu link drafts nothing; a PDF link answers "Envoi cannot read PDF menus" | [verified] | [S24 evaluation](00-status.md#s24-evaluation-results-2026-10-29), [S24 review](00-status.md#s24-review-2026-10-29) |
| A shop published and bought from after a web import | [verified] on Render with PayPal sandbox test money: a signed-in merchant read the FIXTURE page, checked the table, added two items by hand, confirmed and published; the terminal reference agent made the order and the buyer approved it; capture `10L96007C13236320` (S$4.40, sandbox seller `4F58DLN39SWBS`) and the merchant's orders read Paid. The first attempt was refused by PayPal (`PAYEE_NOT_CONSENTED`) and stayed unpaid until the seller consented | [S26](00-status.md#s26-the-connected-run-2026-10-30) |
| The public read API matches its OpenAPI document, and an APIMatic-generated TypeScript client reads it | [verified] | [S14](00-status.md#s14-apimatic-client-and-docs-2026-10-19) |
| The agent's purchase request route is in that same OpenAPI document, and the client APIMatic regenerated from it is committed byte-identical to the generator's output | [verified] | [S19](00-status.md#s19-agent-route-in-the-openapi-document-and-a-regenerated-client-2026-10-25) |
| The generated client reaches no receipt or payment route | [verified] | [S19](00-status.md#s19-agent-route-in-the-openapi-document-and-a-regenerated-client-2026-10-25) |
| The three rows above describe the APIMatic client as of S19; S27 now replaces it with the MCP client on deployed main `a7f60cb`, with CI passing. Hosted Ask Envoi stays off | [verified deployed, 2026-11-02] | [S27 evidence and publication](00-status.md#s27-mcp-client-local-continuation-2026-11-02) |
| S27's read-only Neon baseline was recorded: schema through 0026, 0027 unapplied, all purchases/attempts in SGD and no open purchases at the snapshot time. No migration or hosted regression was run | [verified read-only snapshot, 2026-11-02] | [Snapshot](evidence/s27-neon-preflight-2026-11-02.json), [limits and next steps](s27-deploy-plan.md) |
| Migration 0027 was applied after the S27 build became live; every recorded row count and amount sum is unchanged, all outlets are SG and the new-main maintenance heartbeat is ok. The fixture SGQR paste opened its approved Test Shop mapping. Fresh SGD, USD and PYUSD payment evidence is recorded in the S27 payment verification results | [verified technical release and payment verification, 2026-11-02; S27 awaits cleanup and evidence publication] | [Release record](00-status.md#s27-coordinated-release-authorized-2026-11-02), [after snapshot](evidence/s27-neon-release-after-2026-11-02.json), [maintenance](evidence/s27-neon-release-maintenance-2026-11-02.json), [served checks](evidence/s27-hosted-release-smoke-2026-11-02.json), [payment results](00-status.md#s27-payment-verification-results-2026-11-02) |
| The authorized SGD sandbox checkout, US seller/USD testing and PYUSD regression all passed: `pur_gmzbu...` paid S$4.00 to `EQN6264CF9F4Y` (capture `13X59411JL1833901`); `pur_ssy...` paid US$7.75 to the new US seller `972VTMQPEUZ5A` (capture `6UJ28034J5731743J`) after the US shop's country locked and PYUSD answered `not_sgd_shop`; `pur_tkeu...` settled 2.200000 PYUSD on devnet (signature `5wBHz...`). Four expired or unpaid reviews, two of them with an order or attempt, charged nothing | [verified in Neon and on devnet, 2026-11-02] | [Payment verification results](00-status.md#s27-payment-verification-results-2026-11-02), [JSON](evidence/s27-payment-verification-2026-11-02.json), [handoff](evidence/s27-payment-handoff-2026-11-02.md) |
| PayPal advertises "Unlock 4% rewards" on PYUSD on its US business page, an annual rate "as of today" and subject to change; S28's card states it as PayPal's with the checked date. The page names no eligibility beyond a PayPal account | [vendor claim, read 2026-11-03] | [PayPal](https://www.paypal.com/us/business/accept-crypto-payments), [S28](00-status.md#s28-paypal-pyusd-rewards-card-2026-11-03) |

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
