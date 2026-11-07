# Fourth build plan: Envoi (draft)

Status: **draft, 2026-11-07 (Asia/Singapore), not approved.**
This plan is supporting material.
It changes no gate, starts no slice and authorizes no install, model call, migration, merge, push, deploy, Neon write, Render change or payment.
`00-status.md` stays the authority for gate and slice state, and approved gate documents win over this file.
Gates 1 to 4 were re-approved for it on 2026-11-07, and the gate documents hold the approved detail. No slice is started.

The user's words, 2026-11-07: "include merchant signup as one slice for the fourth build plan. Sandbox buyer is fine as its just a tester."
Then: "Go ahead and draft the fourth build pen with the recommended defaults. But I don't think we have time to do real life interviews. But I do believe that this PMF is strong, as a Singaporean, it's something that I've seen. So I can vouch for this."
Then: "why not we just use the paypal MCP server instead since its better? and also for s43 merchant signs up, it is still subjected to Admin approval".

Labels: **[verified]** is supported by a cited record or check, **[vendor claim]** is advertised by a provider, **[user-reported]** is the user's own observation, **[hypothesis]** is our judgment, **[unknown]** is not established.

## 1. Thesis

**Proposed headline, for Gate 1:** "Scan the stall's SGQR. Pay with the PayPal you already have."

- **The buyer.** A UK, US or Australian visitor in Singapore, at a stall where their card does not work.
  Those three markets were about 2.6 million of 16.9 million visitors in 2025 [verified: STB figures as reported; US and UK from the user's pasted review].
- **The merchant.** A Singapore shop that enrolls with Envoi and its own PayPal account, so Envoi never holds the money.
- **The second market.** US shops, where foreign visitors can pay by PayPal or PYUSD and read a translated menu. US yield stays on the existing rewards card.
- **The gap.** Chinese visitors have Alipay+ and Weixin at stalls that enabled them. Western visitors have no equivalent wallet at those stalls [hypothesis; Wise is the exception below].
- **Evidence for demand.** The user has seen this gap first-hand as a Singaporean [user-reported, 2026-11-07].
  No interview or study will run, by the user's decision.
  The submission may state this as the founder's own observation, and must not present it as measured demand.

## 2. Facts every document, screen and video line must respect

| Topic | Rule |
| --- | --- |
| SGQR | PayPal is not on SGQR. Envoi identifies an enrolled shop from the sticker and pays that shop's PayPal. An unenrolled sticker stays unpayable. |
| Entry | A phone camera does not open Envoi from an SGQR code [hypothesis: the sticker holds payment data, not an Envoi link]. The tourist opens Envoi's scanner, and a counter poster tells them to. |
| Fees | Never say cheaper than cards. A tourist's PayPal payment in Singapore costs 4.40% + S$0.50, which is S$0.70 on S$4.50, or 15.5% [re-read on PayPal's own page on 2026-11-07; see the [S44 record](00-status.md#s44-the-tourist-pitch-2026-11-07)]. |
| Merchant pitch | Extra tourist sales, no new hardware, and money in the shop's own PayPal. The sales are a claim to test, not a result. |
| PYUSD | Optional. Singapore consumers cannot use it through PayPal, selling inside PayPal costs 3% from a non-USD currency, and cash-out stays unsolved. |
| Competitor | Wise says customers outside Singapore can pay PayNow QR codes at businesses [vendor claim]. Its coverage far exceeds Envoi's. Envoi's edge is no new app, plus dish help and the stall handoff [hypothesis]. |
| PayPal World | Not offered to Singapore merchants [user's pasted review]. Never shown as working in Envoi. |
| Yield | US only. No Singapore yield claim. |

## 3. Decisions recorded, by the user's "recommended defaults", 2026-11-07

| Decision | Default accepted |
| --- | --- |
| Count unenrolled scans by a keyed hash | Yes. This changes the rule that a scan writes nothing. |
| Amount mode for a stall with no menu | No. Roadmap only, because prices stay server-side. |
| S43 email verification | None in the test environment, stated on the form. |
| S43 approval | Admin approval is still required before a shop can publish or sell, by the user's later decision. It replaces the earlier default of publishing unapproved. |
| S43 PayPal seller id | Submitted by the merchant for the admin's review; the admin assigns it. |
| PayPal agent tools | PayPal's hosted MCP server, by the user's decision, not the installed Toolkit. |
| Real-life interviews | Replaced by the user's first-hand observation, as section 1 limits it. |
| Sandbox buyer | A tester brings one. No work. |

## 4. Before the first slice

These change no product behaviour, and each still needs its own go-ahead where marked.

| # | Item | Owner |
| --- | --- | --- |
| B1 | Scan the Git history for secrets, then make the repository public | Builder scans; **user approves publication** |
| B2 | Commit the `README.md`, `render.yaml` and `00-status.md` fixes | **User approves commit and push** |
| B3 | Give judge merchant and buyer test logins in the Devpost testing notes only | User |
| B4 | Rewrite `video-script.md` for this thesis; it also wrongly says crypto through PayPal is not built | Builder, after Gate 1 |
| B5 | Paste the AG Grid and Render sponsor sections, because Devpost blocks automated reading | User |
| B6 | Ask PayPal about the QR rates, as worded in section 8 | User |

## 5. Slices

Slice rules are those in [`04-slices.md`](04-slices.md#rules-for-every-slice).
Named tests and mutations get their numbers at Gate 3; the last used test number is 61 [verified: S34 accept button record].
Migrations take the next free number when built; `0031` is the latest today [verified: `drizzle/`].

### S44 The tourist pitch

Branch: `envoi/slice-44-tourist-pitch`.

- **Visible result.** The landing page leads with the new headline. "I run a shop" opens a new `/for-shops` page, with the pitch and a fee calculator, before any sign-in.
- **Builds.** `src/app/page.tsx` copy; `/for-shops`; the calculator from reviewed rate constants, each with its source and date; developer wording on `/buy/ask` collapsed under "How this was checked".
- **Tests.** The calculator's exact results for S$4.50, S$15 and S$50, domestic and international; no screen says "cheaper"; every rate holds its date, off screen by the user's 2026-11-07 review. `tests/unit/landing-page.test.ts` is revised through a recorded Gate 3 change.
- **Falsifier.** A rate cannot be read from PayPal's own page: that rate shows as unknown, not as a number.
- **Authorizations.** Start, then merge, push and deploy.

### S45 Merchant copilot on PayPal's MCP server

Branch: `envoi/slice-45-paypal-mcp-copilot`.

- **Visible result.** A merchant asks "What did I earn this week?" or "Why is this order stuck?" and gets an answer drawn from sandbox PayPal data, showing which PayPal calls it made. It can propose a refund, and only the merchant's tap sends it.
- **First step, before any product code: an access check outside the repository.**
  - PayPal documents `mcp.sandbox.paypal.com` with SSE and Streamable HTTP, and a Bearer token from client credentials [vendor claim]. Which path works with Envoi's MCP client is [unknown].
  - A public issue reports every sandbox tool failing with `Unsupported cache mode: default` [unverified report]. Whether it still happens is [unknown].
  - Whether a token from Envoi's app can read or refund a captured payment whose payee is a shop's own seller account is [unknown].
- **Allowed tools.** `get_order`, `list_transactions`, `list_disputes` and `get_dispute`, filtered by Envoi's own allow-list after the server lists its tools. Revised 2026-11-07 by the first check: `get_merchant_insights` is unsupported in sandbox, and the copilot runs only for one labeled demo seller on that seller's own credentials; see [Gate 2](02-architecture.md#flow-copilot-turn).
- **Never given to the model.** `pay_order`, `create_order`, `create_refund` and every other write tool.
- **Refunds.** Sent by Envoi's existing PayPal write client, only from the merchant's own confirmation.
- **Builds.** One server-side agent turn with the existing tool-call and time budgets; token refresh; results filtered to the signed-in merchant's outlet; a refund confirmation screen; a refund recorded beside the capture without rewriting Paid.
- **Tests.** `the copilot cannot reach a tool outside its allow-list`; `a model request cannot send a refund`; `a refund needs the signed-in merchant's confirmation`; `one merchant's question reads no other merchant's order`; `PayPal text is data, not instructions`; `a refund leaves the Paid record intact`; `an expired PayPal token is refreshed once`.
- **Evaluation.** Pre-registered fixed questions on sandbox data before any paid run, with zero invented amounts as the threshold.
- **Falsifiers.**
  - PayPal's sandbox server cannot serve Envoi: stop and ask. Direct REST reads are built only if the user agrees, and the submission then makes no claim to use PayPal's agent tools.
  - The platform cannot read a seller's data: the demo uses one labeled sandbox seller's own credentials, which adds environment names to Gate 2.
  - Any route lets the model move money: the slice does not ship.
- **Authorizations.** Start, the OpenAI spend, and merge, push and deploy.

### S46 Tourist Sales Desk on AG Grid Community

Branch: `envoi/slice-46-sales-desk`.

- **Visible result.** The merchant's home shows paid sales, PayPal fees and net received, with a totals row, a sales-by-rail table, charts and a CSV button, all on free licences.
- **Builds.**
  - PayPal's fee and net read from each capture, and a migration to store them. Envoi stores only the gross today [verified: `src/lib/db/schema.ts`]. Whether sandbox returns the fee fields is [unknown] and is checked first.
  - The payer's country only if PayPal returns it, shown as "PayPal account from". An order is called foreign only when that country differs from the shop's. Envoi otherwise cannot tell who is a tourist.
  - `orders-grid.tsx`: fee and net columns, `PinnedRowModule` totals and API CSV export.
  - A second grid of totals computed on the server, because grouping, aggregation and pivoting are Enterprise [verified: AG Grid comparison page].
  - AG Charts Community, free in production [vendor claim], as a new pinned dependency.
  - Ask your orders extended to sorting and saved views, through Envoi's own strict schema, with no Enterprise module.
- **Tests.** `a missing fee shows as unknown, never zero`; `totals count paid orders only`; `the model's answer can change only filters, sort and view`; `an order is called foreign only from PayPal's country`.
- **Evaluation.** The S35 sentences rerun with the new schema, plus new sort and view cases, pre-registered.
- **Falsifier.** Sandbox returns no fee: the demo labels fees as unavailable in sandbox and the calculator carries the story; no fee is invented.
- **Fixtures.** Enough labeled sandbox orders to make the grid readable, created by a labeled seed.
- **Authorizations.** Start, migration on Neon, the OpenAI spend, the seed on Neon, and merge, push and deploy.

### S47 The tourist digest

Branch: `envoi/slice-47-digest`.

- **Visible result.** A short weekly summary on the Desk, in the owner's chosen language: English, 中文, Melayu or தமிழ், labeled as AI.
- **Builds.** Code computes every figure, and the model writes around placeholders only.
- **Tests.** `a digest holding a figure the code did not compute is refused`; `no sales language is invented on an empty week`.
- **Falsifier.** The check cannot keep figures exact: the digest does not ship.
- **Authorizations.** Start, the OpenAI spend, and merge, push and deploy.

### S48 Stall demand

Branch: `envoi/slice-48-stall-demand`.

- **Visible result.** A tourist who scans an unenrolled stall sees a card to show the stall, in the same four languages: a visitor wanted to pay you with PayPal, with a QR to `/for-shops`. When that stall later enrolls with the same sticker, setup shows how many visitors scanned it.
- **Builds.** A keyed hash of the sticker's identifier and a weekly count, with no name, sticker text or scanner id stored; a rate limit bucket; a reviewed static card.
- **Deviation from the consolidated list.** That list had AI draft a message to the stall. Without a stored name there is nobody to send it to, and the card needs no model. So this slice uses reviewed copy and no spend [hypothesis].
- **Tests.** `an unenrolled scan stores no name or sticker text`; `the hash cannot be read back without the key`; `one session cannot inflate a count past its limit`; `the card appears only for a no-match scan`.
- **Gate change.** `resolve-sgqr` today writes nothing, and its comment says so [verified]. Gate 2's rule that the sticker is never stored needs a recorded amendment for the hash.
- **Falsifiers.** Any stored field can identify a scanner: the slice does not ship. A count is shown as sales or demand proof: wrong; it reads "scans".
- **Authorizations.** Start, one new environment name for the key, migration on Neon, and merge, push and deploy.

### S49 Demo polish

Branch: `envoi/slice-49-demo-polish`.

- **Visible result.** A printable counter poster, "Visitors: scan to pay with PayPal"; Show the stall presented as the handoff to the stall; the public list without "Test Shop" and "Judge Demo Cafe", unless the demo needs them.
- **Builds.** A poster view from the existing shop QR; copy changes; `hide-outlet` on Neon through the existing command.
- **Tests.** `the poster labels the shop as a test shop while it is one`; `a hidden shop stays reachable by its own link`.
- **Evidence.** One SGQR scan to Paid at a Singapore fixture shop, using a US sandbox buyer, recorded for the video.
- **Authorizations.** Start, the Neon write, the sandbox purchase, and merge, push and deploy.

### S50 Render Starter and the Tourist-ready Workflow

Branch: `envoi/slice-50-render-workflow`.

- **Visible result.** Render no longer sleeps, and when a merchant publishes, a Workflow prepares English explanations and the supported translations, so a tourist's first tap is instant.
- **Builds.** `plan: starter` recorded in `render.yaml`; one Workflow flow with a retried step per language, using Render's TypeScript SDK; a trigger on publish.
- **Must stay true.** A failed run changes nothing for the buyer: the existing on-demand translation still works.
- **Tests.** `a failed run leaves publication and on-demand translation working`; `a repeated run makes no duplicate translation`.
- **Cost.** $7 a month for Starter, plus Workflow compute of about $1 or less a month at demo volume [hypothesis].
- **Falsifier.** Workflows needs a card or plan the user will not add: keep Starter and cut the Workflow, and make no Workflows claim.
- **Authorizations.** Start, the Render plan change and spend, and merge, push and deploy.

### S43 Merchant sign-up

Branch: `envoi/slice-43-merchant-signup`.

A stranger can apply without the operator making an account, and an admin still approves every shop before it can publish or sell.

| Step | Today [verified] | After S43 |
| --- | --- | --- |
| Account | `disableSignUp: true`; only `create-merchant` makes one | Self-service sign-up |
| Right to create a shop | `approve-membership` first | One pending shop per account, with no earlier approval |
| PayPal seller | `assign-paypal-destination` by the operator | The merchant submits an id; the operator still assigns it |
| Publication | `approve-enrollment`, plus shop details, menu confirmation and a destination | Unchanged |

- **Visible result.** A new person creates an account and a pending shop on `/merchant/setup`, drafts a menu by hand, submits a sandbox seller id and sees "Waiting for approval". After the admin approves, the shop publishes and a tester with a sandbox buyer can pay it.
- **Builds.** The sign-up form; Better Auth sign-up on, behind a kill switch, with `onLinkAccount` still creating no membership; a pending shop; a stored seller id for review; a waiting state; a sign-up rate limit; a test label on every self-created shop.
- **Admin.** The operator approves through the existing terminal commands, and no admin screen is built [hypothesis: enough for the deadline]. Someone must run them when a judge applies, so the judge merchant stays the demo path.
- **Must stay true.** A pending shop has no public page and takes no payment. A signed-up account reaches nothing it does not own. Web import and the copilot stay off until approval, so strangers have no model or Kernel spend.
- **Tests.** `a stranger can sign up and create one pending shop`, replacing `public signup is refused` through a recorded Gate 3 change; `a pending shop cannot publish or take a payment`; `an approved shop can publish`; `a signed-up account reaches no other merchant's outlet or orders`; `sign-up over its limit creates no account`; `a buyer session that signs up keeps its receipts and gains no membership`; `a second self-created shop is refused`; `a pending shop reaches no web import or copilot`; `a self-created shop shows its test label on the buyer's screens`.
- **Evidence.** One new account on Render from sign-up, through admin approval, to a Paid receipt with sandbox money, at 390 px and 1280 px.
- **Falsifiers.** Any of these stops the slice: cross-merchant access, payment before approval, an unlabeled self-created shop, or any model or Kernel spend by an unapproved account.
- **Authorizations.** Start, migration on Neon, the operator approval on Neon, the sandbox purchase, and merge, push and deploy.

## 6. Order, dates and cuts

| Order | Slice | Target [hypothesis] | Cut position |
| --- | --- | --- | --- |
| 1 | S44 The tourist pitch | 8 Nov | never |
| 2 | S45 Merchant copilot on PayPal's MCP server | 8 to 9 Nov | never, unless its access check fails |
| 3 | S46 Tourist Sales Desk | 9 to 10 Nov | never |
| 4 | S48 Stall demand | 10 Nov | 4 |
| 5 | S49 Demo polish | 11 Nov | never |
| 6 | S47 The tourist digest | 11 Nov | 3 |
| 7 | S50 Render Workflow | 12 Nov | 2, but Starter alone stays |
| 8 | S43 Merchant sign-up | 12 Nov | 1 |

- Freeze 12 Nov, with the video after it and the cutoff unchanged at 13 Nov 04:00 SGT.
- Eight slices in five days is tight [hypothesis], so the freeze beats the list: an unfinished slice is cut, not rushed.
- S45's access check is first in the build because it can invalidate the largest slice.
- Any code change after the final Ask Envoi to Paid run needs that run again [verified: S34 accept button record], so it runs last, on the final build.
- Roadmap only, labeled as such: a licensed settlement partner paying the stall's PayNow, the only route that would make any SGQR payable, and which would reopen the "no PayNow execution" rule.

## 7. Approvals and spend still to request

| Item | Proposed |
| --- | --- |
| Gates 1 to 4 reopened for this plan | Requested once this draft is reviewed |
| Repository made public, after the secret scan | Your decision |
| Render | About $8 a month: $7 Starter plus Workflow compute |
| OpenAI cap across S45, S46 and S47 | US$5, with its own ledger and meter |
| AG Charts Community and Render's SDK | Installed only inside their slices, if authorized |
| Commit, merge, push and deploy on passing checks | Per slice |

## 8. Questions only PayPal can answer

Ask the hackathon contacts:

> Your US fee page lists a lower rate for QR code payments, including through a third-party integrator, so if a tourist scans a shop's QR in our app and pays through normal PayPal Checkout, does the shop pay that QR rate or the standard rate, and does Singapore have a QR rate at all?

Added 2026-11-07, from the S44 review:

> Is the micropayment rate open to a Singapore food stall selling physical goods? Your help article speaks of digital goods. Does a payment through normal PayPal Checkout at a counter count for Seller Protection, given your terms name a goods and services QR code?

The answer changes the fee calculator and the merchant pitch. It blocks no slice: the standard rate stands until PayPal says otherwise.

## 9. Gate changes this plan needs

| Gate | Change |
| --- | --- |
| 1 | New thesis, headline and landing copy; `/for-shops`; copilot; Desk; digest; stall demand card; poster; sign-up, replacing "There is still no public sign-up"; one plain HTML mockup per new screen |
| 2 | PayPal MCP boundary and allow-list; refund flow; fee and country data; sticker hash amendment; Workflow; sign-up, membership, destination and enrollment flows; new environment names |
| 3 | Named tests, guards, migrations, evaluations, and the recorded revisions of `public signup is refused` and the landing test |
| 4 | These slices, in this order, with these cuts and test assignments |

Mockups to draft: `for-shops.html`, `merchant-copilot.html`, `merchant-desk.html`, `buyer-unenrolled-scan.html`, `merchant-poster.html`, `merchant-signup.html`.

## 10. What this plan does not claim

- Nothing here is built, tested or measured.
- The user's observation of the gap is first-hand and is not a measure of demand, adoption or willingness to pay.
- No merchant has asked for this, and no prize effect is claimed. AG Grid's and Render's sponsor criteria are [unknown] until the user pastes them.
- PayPal's MCP server, Workflows, AG Charts and PayPal capture fields are not established as working here until each slice's first check passes.
