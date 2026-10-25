# Continuation slice plan: Envoi after the 2026-10-24 review

Drafted 2026-10-25 (Asia/Singapore) on `main` at `6535635`; Gates 1, 2 and 3 were re-approved and Gate 4 amended for it the same day.
This plan is supporting material; it starts no slice and authorizes no install, model call, upload, migration, push or deploy.
Each slice below starts only when you authorize it by its slice ID, as rule 1 of [`04-slices.md`](04-slices.md#rules-for-every-slice) says.
Each slice now has its own section in `04-slices.md`, approved 2026-10-25; where this plan and `04-slices.md` differ, `04-slices.md` wins.

## Why this plan exists

An external agent reviewed Envoi on 2026-10-24 and gave a provisional 32 / 50 against the five equally weighted judging criteria.
That score is **[hypothesis]**: another model's judgement, not an official score, and not an independent oracle.
This plan targets four of the five criteria; Presentation is handled separately, as you asked.

| Criterion | Review score | Review's main deduction | Slices that answer it |
| --- | --- | --- | --- |
| Technological Implementation | 8 / 10 | AI usefulness is narrower than the payment engineering; the APIMatic client is exercised by checks, never consumed by an agent. | S19, S20 |
| Design | 7 / 10 | The buyer page asks for a request and an area; Test Shop has one available item; cold start. | S21, demo data, cold-start decision |
| Potential Impact | 6 / 10 | No buyer or merchant demand evidence; the usability study has not run. | S15 usability study, merchant feedback, S21 |
| Innovation/Idea | 6 / 10 | AI + QR + payments alone has adjacent products; the difference must rest on the small-merchant workflow and measured usefulness. | S20, S21, S22 |

No slice here promises a higher score.
A score moves only if the result exists, works and is shown; this plan only makes those results possible.

## Review claims re-checked on 2026-10-25

- **[verified]** `src/app/buy/text-suggest.tsx` renders two fields, `request` and `area`; `settle` in `src/domain/suggestions/suggest.ts` asks for an area unless the buyer names a shop or writes an area in their own words.
- **[verified]** `GET /api/v1/outlets/out_vrlbnc3zylbrr6g2drovaiqkfu/menu` on Render returns Test Shop with Kopi C available at S$1.80 and Mee siam and Kaya toast set unavailable.
- **[verified]** `ModelProposal` carries `itemIds` and no quantities, so the in-app assistant cannot turn "two iced teas" into a basket today.
- **[verified]** The committed client in `clients/typescript/` was generated from the `424ae44` document and still accepts a price of 0, as the [S14 review fixes](00-status.md#s14-review-fixes-2026-10-19) record.
- **[verified]** S13 recorded one Claude Code run from discovery to a human PayPal sandbox payment ([record](00-status.md#s13-agent-handoff-over-mcp-2026-10-14)); the generated client played no part in it.
- **[verified]** S11 ships closed after three evaluations; round 3 recorded five wrong-filled entries against a limit of two ([record](00-status.md#s11-menu-photo-import-with-direct-vision-2026-10-15)).
- **[unknown]** The APIMatic award criteria beyond the official rules, and whether this project qualifies.

## Pushback before the slices

1. **The cheapest score gain is not a slice.**
   The S15 usability study is still not run, and it is the only planned evidence for Potential Impact and Design.
   Every slice below is ordered so it never delays the 2-8 Nov sessions.
2. **One UI change must land before the study or not at all.**
   S21 changes the text path that testers use.
   If it lands mid-study, the five results describe two different products, and the sample splits.
   So S21 either finishes by 1 Nov or is cut, and the study runs on the current UI.
3. **The menu photo experiment is a long shot.**
   Three pre-registered rounds failed, mostly on rotated and low-resolution photos.
   S22 is last and first in the cut order; it returns no AI-drafting claim unless a fresh pre-registered round passes.
4. **Sponsor usage must be real usage.**
   S20 is an external client that consumes the generated SDK.
   No internal database read is routed through Envoi's own HTTP API to add APIMatic calls, and the hosted app never imports the client.
5. **A generated SDK cannot authorize spending.**
   S20 keeps every S13 restriction: the agent proposes a basket, Envoi prices it again, and a human approves in PayPal sandbox.

## Proposed build order

| Order | Slice | What you can see when it is done | Depends on | Gates reopened | Target window |
| --- | --- | --- | --- | --- | --- |
| 1 | S19 Agent route in the OpenAPI document and a regenerated client | The generated TypeScript client lists shops, reads a menu and creates a one-time purchase link with an agent token, and the contract check covers all three. | S13, S14 | 3 | 27 Oct |
| 2 | S21 Order from one sentence | On `/buy`, one box takes "two iced teas at Test Shop"; Envoi fills the basket with quantities, asks which tea when two fit, says when an item is unavailable, and the buyer still reviews and approves. | S4, S7 | 1, 3 | 28 Oct-1 Nov |
| 3 | S20 Reference buyer agent on the generated SDK | A command-line agent turns a buyer's sentence into a basket through the generated client, hands back a link, and a human pays it in PayPal sandbox; a trace shows every SDK call. | S19 | 2, 3 | 2-6 Nov |
| 4 | S22 Menu photo experiment, round 4 | A pre-registered round on old hard cases and fresh unseen photos either passes and opens a measured import, or fails and the import stays closed. | S11 | 1, 2, 3 | 7-11 Nov, only on go |

S20 runs during the usability window because it changes nothing a tester sees.
S15 stays open throughout and closes last; its remaining work items are unchanged.
Submission cutoff is 13 Nov 2026 04:00 SGT ([research](research.md#hackathon-dates-and-deliverables)).

## Gate reopenings this plan needs

One combined reopening is proposed, so you review all of it once, on 25-26 Oct.
**Gates 1, 2 and 3 re-approved by the user on 2026-10-25** ("I approve Gate 1.", "I approve Gate 2.", "I approve Gate 3."): [Gate 1](01-product.md), [Gate 2 amendment](02-architecture.md#continuation-amendment-2026-10-25) and [Gate 3 reopening](03-program-design.md#reopening-2026-10-25-continuation-slices-s19-s22); record in [`00-status.md`](00-status.md#reopening-2026-10-25-continuation-slices-s19-s22). Gate 4 is drafted after Gate 3 is re-approved.

- **Gate 1:** S21 changes buyer journey step 1 (one box, area optional when the shop is known) and adds a basket filled from the sentence; one new mockup, `mockups/buyer-one-box.html`.
  S22 moves menu photo import from "good to have" back into the plan as a measured experiment, still claiming nothing until it passes.
  S20 may need one sentence naming Envoi's own reference agent under "Another agent can discover the same participating merchant"; **[hypothesis]** that the existing sentence already covers it.
- **Gate 2:** S20 adds a component: an external reference client that runs on the operator's machine with an agent token and calls OpenAI there.
  The provider stays OpenAI, as Gate 2 pins it; the hosted app gains no model call.
  S22 adds a merchant rotate and crop step before the browser shrink; blank-not-zero for unreadable prices already exists.
- **Gate 3:** every slice adds contracts, files and named tests.
  S19 widens delta D6: the OpenAPI document covers the public read routes plus `POST /api/v1/purchase-requests` with the agent bearer.
  S21 adds `quantity` to `ModelProposal` and a basket outcome to `Suggestion`.
- **Gate 4:** the four slices, their tests, this order and the cut order below.

## Slices

### S19 Agent route in the OpenAPI document and a regenerated client

Branch: `envoi/slice-19-sdk-agent-route`.

**Visible result.**
`tests/e2e/apimatic-client.ts` uses the regenerated client to list shops, read Test Shop's menu, create a purchase request with an agent token and receive a link; a second call with no token gets the typed 401.

**Builds.**
`POST /api/v1/purchase-requests` and its agent bearer scheme added to `openapi/envoi-public.yaml`; the client regenerated by APIMatic from that document and committed unchanged; a hand-written `clients/README.md` that names APIMatic as the generator and lists which files are hand-written.
The route itself exists since S13 and does not change.

**Tests.**
Named tests 1 and 3 (test 2 retired on 2026-10-25) of the [Gate 3 reopening](03-program-design.md#reopening-2026-10-25-continuation-slices-s19-s22), each with its own mutation; for example, renaming `expiresAt` in the route fails test 1.

**Evidence.**
The APIMatic CLI version; the diff of the regenerated client against the old one; the contract run on a local production build and read-only plus one link creation on Render.

**Falsifiers.**
- The generator still turns booleans into string literals or cannot express the bearer scheme: keep the old client, record the bug, and S20 uses MCP for the write step and the SDK for reads only.

**Authorizations to request at start.**
Starting S19 by ID; the APIMatic upload of the document (repository content to a third party); push, merge and deploy.

### S21 Order from one sentence

Branch: `envoi/slice-21-one-box-order`.

**Visible result.**
1. `/buy` shows one box, "What would you like, and where?", with the area field gone; a shop named in the sentence, a scanned shop or an open shop page supplies the place.
2. "Two Kopi C at Test Shop" opens Test Shop with 2 Kopi C in the basket and the Review button ready; nothing is paid or reviewed without the buyer's tap.
3. "Two iced teas at Test Shop", with Iced lemon tea and Iced milk tea published, asks "Which iced tea?" with both as buttons.
4. "Kaya toast at Test Shop" says "Kaya toast set is unavailable at Test Shop today" and offers the menu.
5. A model failure or budget refusal still falls back to manual selection.

**Builds.**
`quantity` (1-20) per item in `ModelProposal`; a `basket` kind in `Suggestion` that `settle` builds only from published, available, priced items; a `choose` clarification carrying registry item ids; the one-box form in `text-suggest.tsx`; the shop page reading a prefilled basket from the suggestion response, never from the URL.
Prices still come only from the registry, and the review still prices again.

**Tests.**
Gate 3 tests `model cannot invent a price` and `model tool budget is enforced` re-run unchanged.

Named tests 4-12 of the [Gate 3 reopening](03-program-design.md#reopening-2026-10-25-continuation-slices-s19-s22), each with its own mutation; for example, dropping the availability filter fails test 4.

**Model evaluation (R5), pre-registered.**
Before the first model call, a fixture set of at least 20 sentences, each with its expected basket, clarification or unavailable answer, and the pass threshold are written into `00-status.md`.
Every candidate result is reported, including failures; the S4 model is re-run first.

**Demo data, done by you in the merchant screens, not code.**
Test Shop gains at least two similar available items (for example Iced lemon tea and Iced milk tea) so the ambiguity case is real, and stays labeled a demo fixture.

**Evidence.**
Screens at 390 px and 1280 px for all five results on a local production build and on Render; the evaluation results; one sentence-to-paid PayPal sandbox purchase on Render.

**Falsifiers.**
- No model meets the pre-registered threshold: keep the current two-field form, make no basket claim, and record it.
- Not done by 1 Nov: cut S21, so the study runs on the current UI (pushback 2).

**Authorizations to request at start.**
Starting S21 by ID; OpenAI evaluation spend within your limit; push, merge and deploy.

### S20 Reference buyer agent on the generated SDK

Branch: `envoi/slice-20-reference-agent`.

**Visible result.**
`npm run agent -- "Two iced teas from Test Shop"` in a terminal prints the agent's question when two teas fit, takes the buyer's answer, and prints a one-time link; the buyer opens it on a phone, sees Envoi's own price and pays in PayPal sandbox; the merchant sees the order on `/merchant/orders`.
The same command with "Kaya toast from Test Shop" says it is unavailable, and with "Kopi from Nowhere Shop" says the shop is not on Envoi; neither creates a link.

**Builds.**
`clients/buyer-agent/`: a small tool loop over OpenAI through the pinned `ai` and `@ai-sdk/openai`, whose three tools call only the regenerated client (`listOutlets`, `getMenu`, `createPurchaseRequest`); a trace writer that records each SDK call, its request, its status and the returned ids into `evidence/`; the agent token read from the environment, never logged.
The model proposes ids and quantities; the client refuses any id the last `getMenu` did not return before it calls the SDK.
The hosted app does not import the client.

**Tests.**
Named tests 13-16 of the [Gate 3 reopening](03-program-design.md#reopening-2026-10-25-continuation-slices-s19-s22), each with its own mutation; for example, calling `fetch` directly in one tool fails test 13.

**Evaluation, pre-registered.**
The S21 sentence set plus the unknown-shop case, written into `00-status.md` before the first call, with the expected tool sequence and outcome for each.

**Evidence.**
Three real traces on Render (paid, unavailable, unknown shop) and one ambiguity trace; the PayPal sandbox capture id and the merchant order; the role split stated plainly: APIMatic generated the client, the model interprets the sentence, Envoi validates and prices, PayPal approves and pays.

**Falsifiers.**
- The regenerated client cannot create the request (S19 falsifier): the agent uses MCP for that step and the trace says so.
- The agent creates a link for a basket the buyer did not ask for in any evaluation case: stop and fix before any demo.

**Authorizations to request at start.**
Starting S20 by ID; adding the agent's script and any new direct dependency (an install); OpenAI spend within your limit; issuing a new agent token (you run it); push and merge.

### S22 Menu photo experiment, round 4

Branch: `envoi/slice-22-photo-round-4`.

Starts only on a go decision on 6 Nov, after S21 and S20, and only if the photos below exist.

**Visible result.**
Either a recorded pass, with a merchant photo becoming a draft that the merchant corrects and confirms faster than entering it by hand, or a recorded fail and imports still closed.

**Builds, only if the round passes.**
Orientation correction in the merchant's browser before upload, a crop or retake step, and abstention: an unreadable cell stays blank and is marked, never guessed.

**Evaluation, pre-registered before any call.**
- The demo merchant's own test photo, with written permission for processing, and its correct names, portions and prices established before any model call.
- All round 3 hard cases, kept in the set, plus at least three fresh unseen photos; no failure is removed after the fact.
- Pass needs the S11 threshold on the whole set, and a timed comparison: correcting the draft takes less time than manual entry of the same menu.

**Falsifiers.**
- The round fails or correction takes longer than manual entry: imports stay closed, and no AI-drafting claim is made.

**Authorizations to request at start.**
Starting S22 by ID; sending the consented photos to OpenAI; evaluation spend; `MENU_IMPORTS_ENABLED` stays false until a later, separate approval.

## Work outside the slices

These need your hands or your contacts, not code.

| Item | Criterion | Why | When |
| --- | --- | --- | --- |
| Run the S15 usability study as declared | Impact, Design | It is the only planned buyer evidence; the target is never reshaped afterwards. | 2-8 Nov |
| Talk to two or three real hawker or kopitiam owners | Impact | Fees, PYUSD and willingness to enroll are untested; record their words as [user-reported]. | 26 Oct-8 Nov |
| Add similar available items to Test Shop | Design | One available item cannot show an ambiguity or a basket. | before S21's evidence |
| Decide on cold start during judging | Design | Render Free takes about 28 s on an idle first visit ([record](00-status.md#s15-judged-release-2026-10-20)); Gate 2 says Render is never pre-warmed and wake time counts in the usability measurement, so a keep-warm ping would be a Gate 2 hosting change; this reopening leaves it out. | your call, separately |
| Ask APIMatic whether this use qualifies | Implementation | Prize qualification and plugin-use conditions are [unknown]. | now |

## Cut order

1. **S22**: cut first; menu photos stay deferred, as now.
2. **S21**: cut if not done by 1 Nov, so the study is not split.
3. **S20**: cut last among the new slices; if cut, S19's regenerated client and contract still ship.

Never cut: the S15 usability study, every existing payment, approval and recipient guard, and the human approval of every payment.

## Least confident decisions

1. **S21 before S20.** The review ranks the external agent first, but only S21 changes what testers and judges touch, and it must land before 2 Nov; S20 can run during the study.
2. **Widening the OpenAPI document to one write route (S19).** It lets the SDK carry the whole agent journey; the alternative keeps MCP for the write step and the SDK for reads.
3. **A command-line reference agent, not a hosted chat page.** A hosted page would route Envoi's own reads through its own API, which the review warns against; the cost is that judges see it only in the video and the repository.
4. **OpenAI for the reference agent.** It keeps Gate 2's provider and your credits; another model would be a Gate 2 provider change.
5. **S22 at all.** Three rounds failed; it stays only because a pass would cut merchant setup effort, and it is first to go.

## What approving this would cover

Approving this plan would accept the slice order, the cut order and the gate reopenings it lists, so those reopenings can be drafted.
It would start no slice and authorize no APIMatic upload, OpenAI call, photo processing, install, token issue, migration, push, merge or deploy.
