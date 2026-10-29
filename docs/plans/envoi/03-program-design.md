# Program Design: Envoi

**Reopened 2026-10-10; revised 2026-10-11, revised again after the user's review the same day, revised a third time the same day for fixes L and M after Gate 2 was reopened, and RE-APPROVED by the user on 2026-10-11** ("Yes approve commit the branch and push and merge to main").
**Reopened 2026-10-12 for one change only and RE-APPROVED by the user the same day** ("I approve both pls publish the branches and commit all the changes to main so that we can proceed with the first slice"): PayPal start and completion now check `PAYMENTS_ENABLED` and refuse with a new error code, `payments_disabled`; see [Reopening 2026-10-12](#reopening-2026-10-12-paypal-payments-kill-switch).
**Reopened 2026-10-15 for one change only, approved by the user in advance:** menu photos are English only, so Chinese text accuracy is no longer an R5 falsifier; see [Reopening 2026-10-15](#reopening-2026-10-15-english-only-menu-photos).
**Reopened 2026-10-18 for one change and RE-APPROVED by the user the same day** ("Yea sure i approve the gates then make the relevant changes and push to main thnaks"): the Phantom Browse link names the PYUSD rail, and `/buy` opened from it creates the PYUSD review itself; see [Reopening 2026-10-18](#reopening-2026-10-18-phantom-landing-opens-the-pyusd-review).
**Reopened again 2026-10-18 for one change and RE-APPROVED by the user the same day** ("I approve Gate 3 for the verifying-landing change. Build finding 1 on envoi/slice-17-review-fixes."): a verifying landing anywhere in the post-expiry window decides the attempt, so a newer failing transaction carrying the same reference can no longer turn a correct payment into a mismatch; see [Reopening 2026-10-18: verifying landing wins](#reopening-2026-10-18-a-verifying-landing-wins-the-window-scan).
**Reopened 2026-10-24 for the shop QR and order archive, after Gates 1 and 2 were re-approved the same day, and RE-APPROVED by the user the same day ("I approve Gate 3."):** see [Reopening 2026-10-24](#reopening-2026-10-24-shop-qr-and-order-archive).
**Reopened 2026-10-25 for the continuation slices S19-S22, after Gates 1 and 2 were re-approved the same day, and RE-APPROVED by the user the same day ("I approve Gate 3."):** see [Reopening 2026-10-25](#reopening-2026-10-25-continuation-slices-s19-s22).
**Reopened 2026-10-29 for web menu import and re-approved the same day ("Approve all four"):** see [Reopening 2026-10-29](#reopening-2026-10-29-web-menu-import).
**Reopened 2026-10-29 for the second build plan, after Gates 1 and 2 were re-approved the same day, and RE-APPROVED by the user the same day ("Approve Gate 3"):** see [Reopening 2026-10-29: second build plan](#reopening-2026-10-29-second-build-plan).
Approval accepts these contracts as a proposal; it establishes no runtime, account, model, wallet or usability evidence and authorizes no implementation or Gate 4 approval.
The user removed Zapier because it is paid and reopened Gates 1, 2 and 3.
Gate 1 was re-approved on 2026-10-10 and Gate 2 on 2026-10-11.
Gate 2 was reopened again on 2026-10-11 for two PYUSD double-payment fixes and re-approved the same day, the user having approved the fixes in advance.
This revision replaces only the contracts that depend on the re-approved Gate 2 amendment: the direct OpenAI vision import and the independently gated PYUSD devnet rail.
Every other contract below stays as approved on 2026-10-07.
See [Revision 2026-10-11](#revision-2026-10-11-direct-vision-and-pyusd), [`00-status.md`](00-status.md#reopening-2026-10-10-zapier-removed) and [`handoff.md`](handoff.md#gate-3-handover-2026-10-11).

Gate 3 program design, 2026-10-07 (Asia/Singapore). **APPROVED by the user 2026-10-07** ("gate 3 is approved"), together with a separate authorization to commit these planning documents and push `main`. Authorities: [approved Gate 1 product](01-product.md) and [approved Gate 2 architecture](02-architecture.md). Approval accepts the contracts below and the disposition of the eight Gate 2 review findings; it establishes no runtime, account, integration or usability evidence, and it does not authorize implementation or Gate 4. A separate, narrowly scoped authorization on the same day covered the R11 flag flip, its redeploy and a read-only schema inspection, all now complete. This document contains contracts only: file map, types and signatures without bodies, call stacks, state transitions, race rules, capacity budgets and named failure tests. No application implementation, no installed application packages and no approved slices exist.

## Reopening 2026-10-29: second build plan

Drafted 2026-10-29 for the [second build plan](01-product.md#second-build-plan-proposed-2026-10-29) ("Approve Gate 1") and its [Gate 2 amendment](02-architecture.md#second-build-plan-amendment-2026-10-29) ("Approve Gate 2"), with the six mockups listed in Gate 1's Screens; **APPROVED 2026-10-29** ("Approve Gate 3").
Approval accepts these contracts as a proposal; it establishes no runtime, model, PayPal, APIMatic or evaluation evidence and authorizes no Gate 4 change, slice, install, migration, upload, model call, merge, push or deploy.
Slice ids S25 to S31 are proposed here so each file and test has a home; Gate 4 sets their order and may rename them.

- **Proposed slices:** S25 Ask Envoi in the site (with the AI-off copy and the two iced teas); S26 the connected run (evidence only, plus the web-import fixture shop's PayPal sandbox destination); S27 US shops and currency-explicit money; S28 the PayPal PYUSD rewards card; S29 the menu explained and translated; S30 draft review aids; S31 PayPal approval over the review page.
- **Version pins:** nothing is installed. PayPal's JavaScript SDK is loaded as a script from PayPal at run time, not as a package; the assistant uses the pinned `ai` and `@ai-sdk/openai`; the regenerated client keeps its `zod` range.
- **Environment names:** `ASSISTANT_AGENT_TOKEN` (server only, optional; the assistant is off without it) and `AI_MENU_TRANSLATION_MODEL` (optional; translation is off without it) in `src/env.ts` and `.env.example`; no value is committed. `APP_BASE_URL` already exists and is the assistant's base URL. `PAYPAL_CLIENT_ID` already exists and is passed to the review page, never the secret.
- **Files:**

| File | Slice | Change |
| --- | --- | --- |
| `src/integrations/assistant/agent.ts`, `tools.ts`, `trace.ts` | S25 | New home of the S20 agent: instructions, the three tools, the turn gate and the trace, moved unchanged in behaviour from `clients/buyer-agent/`. `runAssistantTurn` below. |
| `clients/buyer-agent/agent.ts` | S25 | Keeps only the terminal `main`, importing the moved module; `tools.ts` and `trace.ts` there are deleted. |
| `src/app/api/v1/buyer/assistant/route.ts` | S25 | New Node route `POST`: buyer session, counted body of at most 16 KiB read within 5 s, `admit(db, "buyer_assistant", ...)` before any model call. |
| `src/lib/ratelimit.ts` | S25, S29 | `ASSISTANT_LIMITS` (per buyer 20 per 10 minutes, global 150 per hour) and `TRANSLATION_LIMITS` (per buyer 30 per 10 minutes, global 120 per hour) [hypothesis: starting values, changed only by a Gate 3 wording update]. |
| `src/app/buy/ask/page.tsx`, `ask-envoi.tsx` | S25 | The Ask Envoi screen in the mockup's words: conversation, the steps panel, Review and pay. Linked from `/buy` only while the assistant is on. |
| `src/app/buy/page.tsx` | S25 | With text suggestions off, the sticker card's heading reads "Scan the sticker" with no "Or". |
| `src/operator/cli.ts` | S25 | New idempotent command `add-demo-iced-teas`: adds Iced lemon tea (S$2.20) and Iced milk tea (S$2.50) to the demo fixture Test Shop through the existing draft, confirm and publish domain functions, never by direct table writes. |
| `src/lib/money.ts` | S27 | Currency-explicit money below; the SGD-only names go. |
| every file naming `SgdCents`, `sgd_cents` or a `formatSgd` call (about 62, found by `rg`) | S27 | Renamed to the currency-neutral names below, the currency carried beside every amount. PYUSD code keeps SGD by calling `requireSgd`. |
| `drizzle/0026_currency_and_country.sql` | S27 | `outlets.country` (`SG` or `US`, not null, default `SG`, check); every `*_sgd_cents` column renamed to `*_minor`; `purchases.currency` (`SGD` or `USD`, not null, default `SGD`, check); a trigger refusing a change of `outlets.country` once any revision of that outlet has been published. No grant changes. |
| `src/domain/outlets/merchant.ts`, `src/app/api/v1/merchant/outlets/[id]/route.ts` | S27 | The merchant sets `country` before first publication; a later change answers the new code `country_locked` (409). |
| `src/integrations/paypal/orders.ts`, `map.ts`, `verify.ts` | S27 | Orders use the purchase's currency; a captured or webhook currency unlike the purchase's is a verification failure, never paid. |
| `src/domain/pyusd/*` | S27 | Preparation refuses a purchase whose currency is not SGD, with the new unavailable reason `not_sgd_shop`. |
| `src/domain/sgqr/resolve.ts` | S27 | Resolves only outlets with `country = 'SG'`. |
| `openapi/envoi-public.yaml`, `clients/typescript/`, `src/app/mcp/route.ts` | S27 | `unitSgdCents` becomes `unitMinor` with `currency` on the outlet and menu; the client is regenerated by APIMatic and committed unchanged; the MCP tools' outputs change the same way. |
| `src/app/merchant/setup/country.tsx` | S27 | The country choice in the mockup's words, before the SGQR step, which is shown for SG only. |
| `src/domain/rewards/paypal-pyusd.ts` | S28 | New; the reviewed constant and `rewardsCard` below. |
| `src/app/merchant/setup/rewards-card.tsx` | S28 | New; the card in the mockup's words, rendered from the server. |
| `drizzle/0027_menu_translations.sql` | S29 | `menu_translations` (`menu_revision_id` referencing `menu_revisions`, `language`, `items` jsonb, `model`, `created_at`; unique on revision and language); the web role may select and insert, never update or delete. |
| `src/integrations/ai/menu-translate.ts` | S29 | New; the one tool-free text call and `MENU_TRANSLATION_PROMPT_VERSION`. |
| `src/domain/menu/translate.ts` | S29 | New; `keepSafeTranslations` and `getOrCreateTranslation` below. |
| `src/app/api/v1/buyer/menu-translations/route.ts` | S29 | New Node route `POST`: buyer session, counted body of at most 1 KiB, `admit(db, "menu_translation", ...)`. |
| `src/app/buy/shop-basket.tsx` | S29 | Translated names and explanations beside the original names, "AI translation" label and "Show the shop's original menu". |
| `src/domain/imports/verbatim.ts`, `request.ts` | S30 | `excerptFor` below; the web import's success answer gains `excerpts`. |
| `src/app/merchant/setup/menu-grid.tsx`, `menu-editor.tsx` | S30 | The needs-review filter, Next problem and the excerpt column, using AG Grid Community modules only. |
| `src/domain/payments/attempts.ts`, `src/app/api/v1/purchases/[id]/paypal/start/route.ts` | S31 | `StartResult` gains `orderId`. |
| `src/app/review/[purchaseId]/paypal-buttons.tsx`, `continue-to-paypal.tsx` | S31 | New buttons component; the existing redirect link stays as the fallback when the script fails or the buttons report an error. |

- **Types and signatures:**

```ts
// src/integrations/assistant/agent.ts (S25)
type AssistantTurn = { role: "buyer" | "assistant"; text: string };          // text only, 1-280 characters
const MAX_ASSISTANT_TURNS = 8;
type AssistantStep = TraceEntry;                                              // operation, status, outletId, itemIds, expiresAt, ms
type AssistantTurnResult =
  | { kind: "reply"; text: string; steps: AssistantStep[] }
  | { kind: "link"; text: string; steps: AssistantStep[]; link: CreatedLink }
  | { kind: "stopped"; reason: "tool_calls" | "time"; steps: AssistantStep[] }
  | { kind: "failed"; steps: AssistantStep[] };
type AssistantConfig = { baseUrl: string; agentToken: string; openaiApiKey: string; model: string; envoiFetch?: typeof fetch; openaiFetch?: typeof fetch; now?: () => number };
// One buyer turn. The earlier turns are text; no tool result is replayed, so the model re-reads the menu
// in the turn that proposes a basket, and the unread-item refusal holds whatever the browser sends.
function runAssistantTurn(config: AssistantConfig, turns: readonly AssistantTurn[]): Promise<AssistantTurnResult>;
// Route answer: { reply, steps, link: { url, expiresAt } | null }; the link never appears in reply or steps.

// src/lib/money.ts (S27)
type Currency = "SGD" | "USD";
type Country = "SG" | "US";
const CURRENCY_BY_COUNTRY: Record<Country, Currency> = { SG: "SGD", US: "USD" };
type Money = { readonly currency: Currency; readonly minor: number };       // integer minor units, no float path
function money(currency: Currency, minor: number): Money;                   // RangeError on a non-safe integer
function multiply(value: Money, quantity: number): Money;
function sum(currency: Currency, values: readonly Money[]): Money;          // CurrencyMismatchError on any other currency
function sameAmount(a: Money, b: Money): boolean;                           // CurrencyMismatchError when currencies differ
function fromDecimalString(currency: Currency, value: string): Money | null;
function toDecimalString(value: Money): string;                             // provider form, "11.25"
function formatMoney(value: Money): string;                                  // "S$4.40", "US$11.25"
function requireSgd(value: Money): Money;                                    // PYUSD entry points only; CurrencyMismatchError otherwise

// src/domain/rewards/paypal-pyusd.ts (S28)
const PAYPAL_PYUSD_REWARDS = {
  advertisedAnnualRateBasisPoints: 400,                                     // [vendor claim], variable, PayPal's
  eligibleCountry: "US",
  checkedOn: "2026-10-29",
  sourceUrl: "https://www.paypal.com/us/business/accept-crypto-payments",
} as const;
const OUTLET_TIME_ZONE: Record<Country, string> = { SG: "Asia/Singapore", US: "America/New_York" };
type RewardsCard = { country: Country; paidThisMonth: Money; eligible: boolean; illustration: Money | null };
function rewardsCard(db: Pick<Db, "select">, outletId: string, now: Date): Promise<RewardsCard>;
function illustrateOneYear(paid: Money, basisPoints: number): Money;        // floor(paid.minor * basisPoints / 10_000)

// src/domain/menu/translate.ts (S29)
const LANGUAGE_SUBTAG = /^[a-z]{2,3}$/;                                      // from navigator.language, lower-cased primary subtag
type TranslatedItem = { itemId: string; name: string; explanation: string | null }; // name <= 80, explanation <= 160 characters
// Drops an item whose id is not on the revision, whose text is over its bound, or whose text holds a digit or a
// currency sign ($, S$, US$, ¥, €, £, 元) that the original name does not hold.
function keepSafeTranslations(original: readonly { id: string; name: string }[], proposed: readonly TranslatedItem[]): TranslatedItem[];
type TranslationResult =
  | { kind: "ok"; menuRevisionId: string; language: string; items: TranslatedItem[] }
  | { kind: "not_found" } | { kind: "unavailable" };
// Reads (revision, language); on a miss makes one model call, keeps the safe items and inserts with
// on conflict do nothing, then reads again, so two concurrent misses store one row.
function getOrCreateTranslation(db: Db, outletId: string, language: string, now: Date): Promise<TranslationResult>;

// src/domain/imports/verbatim.ts (S30)
function excerptFor(pageText: string, name: string, price: Money | null): string | null; // at most 120 characters of the page around the name

// src/domain/payments/attempts.ts (S31)
type StartResult = { attemptId: string; approvalUrl: string; orderId: string };
```

- **Call stacks:**
  - Ask Envoi: `ask-envoi.tsx` sends the turns, then the route checks the session, reads the body, validates turns (count, length, roles `buyer` and `assistant` only, no other key), admits, checks the three settings, then `runAssistantTurn`; tools call the generated client at `APP_BASE_URL`; the purchase request's link is captured by `onLink`; the route answers with reply, steps and link. The browser opens the link, and `/approve/[handoffToken]` redeems it as today.
  - Translation: `shop-basket.tsx` sends the outlet id and `navigator.language`'s primary subtag, then the route checks session, body and subtag, admits, then `getOrCreateTranslation`; the screen draws prices, availability and original names from the published menu it already holds and only adds the translated text.
  - US purchase: review and pricing read the outlet's country and currency; the purchase stores its currency; `paypal/start` creates the order in that currency; capture and webhook verification compare currencies before any paid state.
  - Rewards: the merchant setup server page calls `rewardsCard` and renders `rewards-card.tsx`; nothing runs in the browser.
  - In-page approval: `paypal-buttons.tsx` loads `https://www.paypal.com/sdk/js` with `client-id`, `currency` and `intent=capture`; `createOrder` posts to `paypal/start` and returns `orderId`; `onApprove` posts to `paypal/complete`; `onCancel` uses the existing cancel route; `onError` shows the redirect link.
- **Error codes:** one new code, `country_locked` (409). The translation and assistant routes reuse `validation_failed`, `rate_limited`, `provider_unreachable` and `not_found`; `not_sgd_shop` is a new PYUSD unavailable reason, not a code.
- **Evaluation protocols, each written into `00-status.md` before any model call:**
  - Ask Envoi: the S21 25-sentence set and the "two iced teas" sentence, through the route on a local production build; pass at 24 of 25, plus the iced tea question asked rather than answered; every result reported.
  - Translation: every published fixture menu, in Chinese, Japanese, Korean, German and English (English gets explanations only); pass at zero displayed prices changed and zero translated items not on the menu, the threshold set before the run; the builder reads every explanation and reports, without a pass mark, any that is wrong about what the dish is.
- **Named tests (35, all new in the slice that builds them):**
  - S25:
    1. `the assistant is off unless the key, the model and the agent token are set`.
    2. `the assistant is refused by its limiter before any model call`.
    3. `the assistant accepts text turns only`: a tool role, an extra key, a ninth turn or a 281-character turn is refused with no model call.
    4. `the assistant's link never reaches the model, its reply or its steps`: a needle self-test plants a marker link and proves the scanner finds it on each serialized surface first.
    5. `the assistant's steps come from the trace, not from model text`: a model reply that describes a fake call adds no step.
    6. `the assistant reaches Envoi only through the generated client`: a static check, proved by a planted `fetch` in the tools module.
    7. `the terminal agent and the site run one agent module`: a static check that `clients/buyer-agent/` holds no tool or instruction text of its own.
    8. `the buyer page reads correctly with text suggestions off`.
    9. `the demo iced teas are added once and published through the menu rules`.
    The S20 tests re-run unchanged against the moved module.
  - S27:
    10. `money of two currencies cannot be summed or compared`.
    11. `an outlet's country cannot change after its first publication`: the domain check and the database trigger are each mutated separately.
    12. `a US purchase creates a USD PayPal order`.
    13. `a capture in another currency never marks a purchase paid`: through the return, reconcile, webhook and maintenance paths.
    14. `PYUSD preparation refuses a purchase that is not in SGD`.
    15. `SGQR resolution never returns a US outlet`.
    16. `public menu answers carry the currency and match the OpenAPI document`.
    17. `the regenerated client reads a USD menu`.
    18. `the currency migration keeps every amount and marks existing outlets SG`.
    19. `the MCP tools answer with the currency beside every price`.
    Every existing payment, PYUSD and pricing test re-runs on the renamed code; a renamed test keeps its old name in its description.
  - S28:
    20. `the rewards card counts confirmed captures this month in the outlet's time zone`.
    21. `the rewards illustration appears for US outlets only and rounds down`.
    22. `the rewards card makes no network call`.
  - S29:
    23. `a translation language must be a primary language subtag`.
    24. `a cached translation makes no model call`.
    25. `a translated item not on the menu revision is dropped`.
    26. `a translation holding a digit or currency sign the original lacks is dropped`.
    27. `a translation never changes a displayed price, availability or original name`.
    28. `a new menu revision gets new translations`.
    29. `two concurrent misses store one translation`.
    30. `the translation route is refused by its limiter before any model call`.
  - S30:
    31. `needs review and Next problem reach every row that still needs the merchant`.
    32. `page excerpts never reach the database, a log or a trace`: needle self-test as in S24 test 11.
  - S31:
    33. `PayPal start returns the order id with the approval link`.
    34. `the PayPal buttons set no amount, payee or item`: a static check, proved by a planted amount field.
    35. `the redirect path still completes a payment when the buttons do not load`.
  Each guard in tests 1-35 gets its own mutation, recorded in its slice.
- **Least confident decisions:**
  1. The assistant calls its own public API over HTTP at `APP_BASE_URL` rather than through an in-process `fetch`; this is what makes the generated client real on the live path, at the cost of a round trip through Render's edge per call.
  2. The public API renames `unitSgdCents` instead of adding beside it. No outside client is known, so a clean rename now costs less than two fields forever, but it breaks any copy of the old client.
  3. Text-only history means the model re-reads the menu in the turn that proposes; more tool calls, but no forged tool result can widen what it may propose.
  4. The rewards rate is a constant with a checked date, not a fetch; it can go stale, and the card shows the date so a reader can see how old it is.
  5. PayPal's SDK is a script tag, not a package, so no version pin exists for it; PayPal serves whatever version it serves.
  6. Page excerpts live in browser memory only, so they disappear on reload; the alternative, storing them, would break Gate 2's rule that page text is never stored.
  7. English-speaking visitors get explanations but no translation; the explanation is the useful part for "Kopi C siew dai".
  8. The limiter numbers are starting guesses.
- **Unchanged:** auth, roles, the scan rules for SG outlets, maintenance, the photo and web import boundaries other than the excerpt answer, and every named test not listed as renamed; these 35 are additions counted in Gate 4.

## Reopening 2026-10-29: web menu import

Drafted 2026-10-29 for the Gate 1 reopening and the [Gate 2 web menu import amendment](02-architecture.md#web-menu-import-amendment-2026-10-29) of the same day; **APPROVED 2026-10-29** ("Approve all four"), with mockup [`merchant-web-import.html`](mockups/merchant-web-import.html).
Approval would accept these contracts as a proposal; it establishes no Kernel, AG Grid, model or page evidence and authorizes no Gate 4 change, slice, sign-up, install, Kernel session, OpenAI call or deploy.

- **Version pins:** two runtime dependencies are added, each pinned exactly when S24 installs them, under the existing rule of a release at least two weeks old, and recorded in [Version pins](#version-pins) as a wording update on install: `@onkernel/sdk` [vendor claim: the name of Kernel's TypeScript SDK; to be confirmed against the account's documentation], and `ag-grid-community` with `ag-grid-react` at one shared version. Before the AG Grid install its licence is read and recorded; only the Community edition is allowed, never Enterprise. Nothing else changes.
- **Environment names:** `KERNEL_API_KEY` (server only), `WEB_IMPORTS_ENABLED` (`"true"` or `"false"`, unset reads false) and `AI_WEB_MENU_MODEL` in `src/env.ts` and `.env.example`; no value is committed.
- **Files:**

| File | Slice | Change |
| --- | --- | --- |
| `src/integrations/browser/kernel.ts` | S24 | New; the only module that imports the Kernel SDK. `readPageText` below. |
| `src/integrations/ai/menu-web.ts` | S24 | New; the one tool-free text call, `MENU_WEB_PROMPT_VERSION`, reusing `MenuVisionOutput` as its schema. |
| `src/domain/imports/web-url.ts` | S24 | New; `checkMenuPageUrl`. |
| `src/domain/imports/verbatim.ts` | S24 | New; `pagePriceTokens`, `hasPrintedPrice` and `keepPrintedOnly`. |
| `src/domain/imports/consent.ts` | S24 | Adds `WEB_MENU_CONSENT_TEXT` and `WEB_MENU_CONSENT_VERSION`, derived the same way as the photo consent. |
| `src/domain/imports/types.ts` | S24 | `ImportSource`, the new outcomes and rejection below; a `MENU_SPEND_POLICY.modelBounds` entry for `AI_WEB_MENU_MODEL`, added only after the evaluation chooses it. |
| `src/domain/imports/request.ts` | S24 | `runWebImport` below, beside `runMenuImport`; `commitImport` and `closeImportFailed` unchanged. |
| `src/domain/menu/types.ts` | S24 | `priceBasis` gains `"not_on_page"`. |
| `src/app/api/v1/merchant/outlets/[id]/menu-imports/web/route.ts` | S24 | New Node route `POST`, same session, membership and same-origin checks as the photo route. |
| `src/app/merchant/setup/menu-web-import.tsx` | S24 | New; the link field, the ownership tick with the consent text, and the three answers in the mockup's words. Rendered only while `WEB_IMPORTS_ENABLED` is true. |
| `src/app/merchant/setup/menu-grid.tsx`, `menu-editor.tsx` | S24 | The AG Grid table replaces the editor's item list; save and confirm still call the existing routes. |
| `drizzle/0025_web_menu_import.sql` | S24 | `menu_imports.source` (`photo` or `web_page`, default `photo`, check constraint) and `menu_imports.source_host` (nullable text, at most 253 characters). No new grant: the web role already writes `menu_imports`. |
| `public/fixtures/menus/*.html` | S24 | Labeled demo fixture menu pages for the evaluation and the demo, each saying "Demo fixture page" at its top. |

- **Types and signatures:**

```ts
type ImportSource = "photo" | "web_page";

// ImportOutcome gains:
| "page_refused"      // Kernel reached the host but the page needs a sign-in or answered an error status
| "page_timeout"      // no visible text within PAGE_READ_BOUNDS.timeoutMs
| "page_unreachable"  // DNS, TLS or connection failure, or a Kernel session that could not start
| "picture_menu"      // the text holds no SGD-like price, or the link opened a PDF (reason pdf_menu, added 2026-10-29); closed with no model call

// ImportRejection gains:
| "web_imports_disabled"

type MenuPageUrlCheck = { ok: true; url: URL; host: string } | { ok: false; reason: "not_https" | "has_credentials" | "ip_or_local_host" | "bad_port" | "too_long" | "malformed" };
function checkMenuPageUrl(input: string): MenuPageUrlCheck;

const PAGE_READ_BOUNDS = { timeoutMs: 20_000, maxTextBytes: 65_536 } as const;
type PageRead =
  | { kind: "ok"; text: string; finalHost: string }
  | { kind: "refused" | "timeout" | "unreachable"; error: SafeErrorRecord };
// One session: headless, stealth false, no proxy, no profile, no CAPTCHA solving, one navigation, no link following;
// the session is deleted in a finally block on every path. Text beyond maxTextBytes is cut, never sent whole.
function readPageText(url: URL, signal: AbortSignal): Promise<PageRead>;

// A price token is a run of digits with at most one decimal point and at most two decimals, with an optional
// leading "$" or "S$", taken from the page text; "4.90" and "4.9" match each other, "49" does not match "4.9".
function pagePriceTokens(text: string): Set<number>; // SGD cents
function hasPrintedPrice(text: string): boolean;
// After validateVisionDraft: a price whose cents are not in pagePriceTokens becomes blank with basis "not_on_page";
// an item whose name, case- and whitespace-folded, is not a substring of the folded page text is dropped and counted.
function keepPrintedOnly(draft: Extract<VisionDraftValidation, { ok: true }>, pageText: string): { draft: Extract<VisionDraftValidation, { ok: true }>; droppedNames: number };

function runWebImport(db: Db, request: Request, principal: OutletMember): Promise<Response>; // body: { url, consentVersion, baseRevisionId }
```

- **Order inside `runWebImport`:** the flag, then the consent version, then `checkMenuPageUrl`, then the existing admission (membership, caps, spend reservation), then `readPageText`, then `hasPrintedPrice`, then the model call, then `validateVisionDraft`, then `keepPrintedOnly`, then `commitImport`. Each refusal before admission writes nothing; each failure after it closes the import row with its outcome and releases the unspent reservation as the photo path does.
- **Route answers:** the photo route's existing codes, no new one: success as `runMenuImport` answers it, with the draft counts and `droppedNames`; `admission_rejected` with reason `web_imports_disabled` while the switch is off, or with the existing admission reasons; `consent_required` with `WEB_MENU_CONSENT_VERSION`; `validation_failed` with the URL check reason; `import_rejected` with outcome `page_refused`, `page_unreachable` or `picture_menu` (with reason `pdf_menu` when the browser reports a PDF document, added 2026-10-29 by the user's decision "Add a PDF answer"); `provider_unreachable` for `page_timeout` and the model failures; the session, membership and same-origin refusals of the photo route. The page text and the full URL never appear in a response, a log, a `SafeErrorRecord` or the database; the row keeps `source = "web_page"` and `source_host`.
- **Grid rules:** the grid edits name, portion, price and availability in browser state and saves through the existing draft save route; a blank price cell shows its basis in words ("The price was not printed as text on your page" for `not_on_page`); the existing server rule that a blank price blocks confirmation is unchanged, and the Confirm button mirrors it. The grid is keyboard operable and usable at 390 px.
- **Evaluation protocol, pre-registered in `00-status.md` before any model call:** at least six labeled fixture pages written to cover a plain list, a two-column table, variants with portions, a price with no decimals, a page with a picture-only menu and a page carrying an instruction aimed at the model; plus at least two real public menu pages with the owner's permission, written or verbal, recorded with its date and without personal details; the expected items for each; a pass threshold of zero wrong filled prices and at least 90% of expected priced items drafted with their price, across all pages together; every result reported, none removed after the fact. Fixture pages are labeled as fixtures in every result. A pass permits asking the user to turn `WEB_IMPORTS_ENABLED` on; it does not turn it on.
- **Named tests (12, all new in S24):**
  1. `a menu page link must be public https`: each `MenuPageUrlCheck` reason refuses before admission, with no Kernel or model call.
  2. `web import with its switch off reaches neither Kernel nor the model`.
  3. `web import needs the current web consent version`.
  4. `web import counts toward the photo import caps and spend ceiling`: a web import and a photo import share the per-outlet daily cap and the reservation.
  5. `the Kernel session is deleted on every path`: ok, refused, timeout, unreachable and abort each end with one delete call.
  6. `the Kernel session asks for no stealth, proxy, profile or CAPTCHA solving`: the create request is asserted field by field.
  7. `a page with no printed price makes no model call` and closes as `picture_menu`.
  8. `a drafted price not printed on the page stays blank`: basis `not_on_page`; "4.9" on the page keeps 4.90, "49" on the page blanks 4.90.
  9. `a drafted name not on the page is left out`.
  10. `a web draft lands unconfirmed and publishes nothing`: the published revision and its confirmation are untouched after a completed web import.
  11. `page text and the full URL never reach a log, response or row`: a needle self-test plants a marker in the page text and the URL path and proves the scanner finds it on each serialized surface first.
  12. `only the browser integration imports the Kernel SDK`: a static check in the style of the PYUSD boundary checks, proved by a planted import elsewhere.
  Gate 3 tests `model cannot invent a price` and the S11 import tests re-run unchanged. Each guard in tests 1-12 gets its own mutation, recorded in S24.
- **Unchanged:** the photo route, `MENU_IMPORTS_ENABLED`, every buyer route, error code, clock, state transition and role grant, and the 92 named tests and 231 cases; these 12 are additions counted in Gate 4's S24 section.

## Reopening 2026-10-25: continuation slices S19-S22

Drafted 2026-10-25 and re-approved by the user the same day ("I approve Gate 3."); Gates 1 and 2 were re-approved on 2026-10-25 ("I approve Gate 1.", "I approve Gate 2.") for the [continuation amendment](02-architecture.md#continuation-amendment-2026-10-25), with mockup [`buyer-one-box.html`](mockups/buyer-one-box.html).
Approval accepts these contracts as a proposal; it establishes no runtime, model, agent or photo evidence and authorizes no Gate 4 change, slice, install, APIMatic upload, OpenAI call or deploy.

- **Version pins:** none change and nothing is installed. The reference agent uses the pinned `ai` and `@ai-sdk/openai` and the generated client's own `zod` range, which the pinned `zod` satisfies; it runs through the existing `tsx`.
- **Files:**

| File | Slice | Change |
| --- | --- | --- |
| `openapi/envoi-public.yaml` | S19 | Adds `POST /api/v1/purchase-requests` with an `agentBearer` security scheme, its request body (`outletId`, `lines` of `menuItemId` and `quantity`) and its 201, 400 `validation_failed`, 401 `unauthorized` and 404 `not_found` answers, all closed objects (corrected 2026-10-25, see below). Widens delta D6 from "public read routes only" to "public read routes and the agent's purchase request route". |
| `clients/typescript/` | S19 | Regenerated by APIMatic from that document and committed unchanged. |
| `clients/README.md` | S19 | Hand-written: names APIMatic as the generator, the CLI version and the document commit, and lists which files under `clients/` are hand-written. |
| `tests/e2e/apimatic-client.ts` | S19 | Adds the purchase request call with a token from the environment, and the no-token 401. |
| `src/domain/suggestions/types.ts`, `suggest.ts` | S21 | The types below; `settle` builds the basket, choice and unavailable answers. |
| `src/integrations/ai/openai.ts` | S21 | The structured output schema gains the quantities and the choice; tools, budget and `T_AI_BUDGET` unchanged. |
| `src/app/api/v1/buyer/suggestions/route.ts` | S21 | Accepts the optional `outletId`. |
| `src/app/buy/text-suggest.tsx`, the shop page's basket | S21 | One box, the four answers in the mockup's words, the basket prefilled from the response held in memory. |
| `clients/buyer-agent/agent.ts`, `tools.ts`, `trace.ts` | S20 | The reference agent; `package.json` gains the script `agent`. |
| the menu photo import component on `/merchant/setup` | S22 | Quarter-turn rotate and crop before the existing shrink; built only if round 4 passes. |

- **Types and signatures (S21):**

```ts
type SuggestionRequest = { text: string; area?: string; outletId?: string };

// ModelProposal gains:
kind: "outlets" | "items" | "basket" | "choose" | "clarification" | "no_match";
lines: { itemId: string; quantity: number }[]; // "basket": one outlet, quantity an integer the server checks
choices: string[];                              // "choose": item ids that fit one phrase

const MAX_SUGGESTED_QUANTITY = 20;

// Suggestion gains:
| { kind: "basket"; outletId: string; outlet: PublishedOutletSummary; lines: { item: PublishedItemSummary; quantity: number }[] }
| { kind: "choose"; outletId: string; outlet: PublishedOutletSummary; quantity: number; matches: PublishedItemSummary[] }
| { kind: "unavailable_item"; outletId: string; outlet: PublishedOutletSummary; items: { id: string; name: string }[] }
```

- **Settle rules (S21), in order:**
  1. The outlet is in scope when the buyer named it, stated an area that holds it, or sent its `outletId`; otherwise the answer is the area clarification, as today.
  2. `outletId` must be a published outlet, or the request answers as if it were absent; it is never trusted for anything but scope.
  3. A basket line survives only if its item is on that outlet's published menu with a price and `available !== false`, and its quantity is an integer from 1 to `MAX_SUGGESTED_QUANTITY`.
  4. A proposed item that is on the menu but unavailable turns the answer into `unavailable_item`, naming it; the model's quantity for it is dropped.
  5. A quantity outside 1-20 turns the answer into a clarification, never a clamped basket.
  6. `choose` keeps only published, priced, available ids; one survivor becomes a basket of that item, none becomes `no_match`.
  7. Prices shown come from the registry. Nothing is written: no review, purchase, hold or audit row is created by a suggestion.
- **Reference agent contract (S20):**
  - Reads `ENVOI_BASE_URL`, `ENVOI_AGENT_TOKEN`, `OPENAI_API_KEY` and `AI_MODEL` from the person's environment; `ENVOI_BASE_URL` must be `https`, or `http://localhost`.
  - The model's tools are `list_shops`, `read_menu` and `propose_basket`; each is one call of the generated client, and no tool calls `fetch` itself.
  - `propose_basket` refuses, without a client call, any item id the last `read_menu` of that outlet did not return, and any quantity outside 1-20; its body carries ids and quantities only.
  - At most six tool calls and 60 seconds per buyer turn; then the agent stops and says so.
  - The trace is one JSON line per client call: operation, HTTP status, outlet and item ids, purchase request expiry, milliseconds; never a token, key, link token or model prompt.
  - The printed link is shown to the person only, never written to the trace.
- **Round 4 protocol (S22):** written into `00-status.md` before any call: the photo set with every round 3 photo kept and at least three fresh unseen ones, the demo merchant's photo with the owner's permission, written or verbal (verbal recorded with its date and the user's words, amended 2026-10-28), the expected names, portions and prices for each, the S11 threshold unchanged, and the timed comparison of correcting the draft against typing the same menu. A pass changes no flag.
- **Authorization:** unchanged. The suggestion route stays a buyer-session route; the agent route stays agent-token only; the reference agent gains no scope.
- **Named tests (15, all new in the slice that builds them; test 2 retired 2026-10-25, see below):**
  - S19:
    1. `agent purchase request matches its OpenAPI document`: created, validation, unauthorized and not-found answers validate against the document.
    2. Retired 2026-10-25: `regenerated client refuses a zero price` (see the S19 reopening below).
    3. `generated client reaches no receipt or payment route`: no operation's path is under `/purchases`.
  - S21:
    4. `a basket holds only published available priced items`.
    5. `an unavailable item is named and never added`.
    6. `a quantity outside 1 to 20 asks again`.
    7. `two fitting items ask which one`.
    8. `one surviving choice becomes a basket`.
    9. `an outletId puts that shop in scope and nothing else`: an unpublished or unknown `outletId` answers as if absent.
    10. `a shop named in the sentence needs no area`.
    11. `a suggestion writes nothing`: no review, purchase or audit row after a basket answer.
    12. `the prefilled basket never reaches a URL`: the shop page's address after a basket answer holds no item id or quantity.
  - S20:
    13. `agent tools call only the generated client`.
    14. `agent refuses an item id or quantity the menu did not allow`.
    15. `agent never sends an amount`.
    16. `agent trace holds no token, key or link`: a needle self-test plants each and proves the scanner finds it in a serialized trace first.
  Gate 3 tests `model cannot invent a price` and `model tool budget is enforced` re-run unchanged in S21.
  Each guard in tests 1 and 3-16 gets its own mutation, recorded in its slice.
  S22 adds no named test unless the round passes; the import screen's tests then come with its own Gate 1 and Gate 3 change.
- **Unchanged:** every other route, error code, clock, state transition, role grant and the 92 named tests and 231 cases; these 15 are additions counted in Gate 4's sections for S19-S21.
- **Wording correction, 2026-10-25, by the user's decision** ("Correct the Gate 3 answer list for POST /api/v1/purchase-requests to 201, 400 validation_failed, 401 unauthorized and 404 not_found as a wording correction, re-pin, and push to main before S19 starts."): the approved text listed a 409 refusal and a 429 `rate_limited` answer, but the route has no rate limiter and, on the `paypal` rail, `priceBasket` refuses a basket only with 400 `validation_failed` or 404 `not_found`. The answer list and test 1 now describe the existing route; no route, code, test count or decision changes.
- **Wording correction, 2026-10-25, by the user's decision** ("Correct the Gate 3 request body wording for POST /api/v1/purchase-requests from itemId to menuItemId as a wording correction, re-pin gate4_check.py, commit and push to main."): the approved text named the line field `itemId`, but the route and the MCP `create_purchase_request` tool share one schema, `purchaseRequestShape` in `src/domain/handoffs/input.ts`, whose line field is `menuItemId`. The request body now names `menuItemId`; no route, code, test count or decision changes.
- **Reopened 2026-10-25 during S19, by the user's decision** (asked whether to retire named test 2, the user chose "Retire test 2 (Recommended)"): S19's one APIMatic upload showed that the generator validates structure only.
  Its generated `src/core/validation/schema.ts` says value constraints such as `minLength`, `pattern` or enum membership "are the service's to enforce", and the regenerated client still decodes a `unitSgdCents` of 0 [verified 2026-10-25 by a fake-fetch unit test failing on an AssertionError].
  So test 2 cannot pass on a client committed unchanged and is retired; no wrapper is added under `clients/`.
  A zero price stays refused by the `menu_items_price_check` database constraint, the document's `minimum` of 1 and the S14 contract validator row "zero cents"; the named tests drop from 16 to 15, and tests 3-16 keep their numbers.

## Reopening 2026-10-24: shop QR and order archive

- **Authority:** Gate 1 re-approved on 2026-10-24 ("I approve Gate 1.") and Gate 2 re-approved the same day ("I approve Gate 2.") for the [shop QR and order archive amendment](02-architecture.md#shop-qr-and-order-archive-amendment-2026-10-24); mockups [`merchant-shop-qr.html`](mockups/merchant-shop-qr.html) and [`merchant-orders-delete.html`](mockups/merchant-orders-delete.html).
- **Version pin:** `zxing-wasm@3.1.3` becomes a direct, exact dependency.
  It is already installed at that version through `barcode-detector@3.2.2`, so the lockfile resolves the same package; the import of its `writer` entry must not rely on a transitive dependency.
  Its writer wasm is copied unchanged to `public/vendor/zxing_writer-3.1.3.wasm` and served from this site, never the library's default CDN, like the reader since S9.
- **Files:**

| File | Change |
| --- | --- |
| `drizzle/0024_order_archive.sql` | Adds nullable `merchant_archived_at`, `merchant_archived_by_user_id` (references `user`) and `merchant_archived_state` to `purchases`, with a check that the three are all null or all set; grants the web role column-level `UPDATE` on the three; a trigger refuses any update that changes a set `merchant_archived_at` for every role except the migration role. |
| `src/lib/db/schema.ts` | The three columns. |
| `src/domain/purchases/orders.ts` | `archiveOrder`; `listOutletOrders` leaves out hidden orders and returns `archivedCount`. |
| `src/app/api/v1/merchant/orders/[id]/archive/route.ts` | `POST`, same-origin and session checks as acknowledge. |
| `src/app/merchant/orders/orders-view.tsx`, `order-copy.ts` | Delete on every order, the confirmation dialog and the archived count, in the mockup's words. |
| `src/lib/browser/qr.ts` | `drawShopQr(url)`, writer module prepared with `locateFile` pointing at the vendored writer wasm. |
| `src/app/merchant/setup/shop-qr.tsx`, `workspace.tsx` | The QR card in the sticker section's right column; the approval chip moves under the UEN; a placeholder while unpublished. |
| `src/operator/cli.ts` | `unarchive-order <purchaseId>` and `export-archived-orders [outletId]`. |
| `.gitignore` | `/archive/`. |

- **Types and signatures:**

```ts
type ArchiveOutcome = { order: MerchantOrder; changed: boolean };
// Membership of the order's outlet, as acknowledgeOrder checks it; another outlet's order answers not_found.
// Sets the three columns once, storing the state at that moment, with an audit row "order_archived"; a repeat
// returns changed: false and writes nothing. Never writes any other column.
function archiveOrder(db: Db, input: { purchaseId: string; userId: string; now: Date }): Promise<ArchiveOutcome | AppError>;

// OutletOrders gains:
archivedCount: number; // orders of this outlet hidden from the list
// An order is hidden when merchant_archived_at is set, unless its state is now "paid" and
// merchant_archived_state was not "paid": that order is listed again, marked Paid.
// A hidden order is not a valid `before` cursor (validation_failed, reason unknown_before).

type ArchivedOrderReceipt = {
  kind: "envoi_archived_order"; exportedAt: string;
  purchaseId: string; outlet: { id: string; name: string; isDemoFixture: boolean };
  lines: StoredLine[]; totalSgdCents: number; currency: string; rail: string | null; state: PurchaseState;
  payment: MerchantOrder["payment"]; pyusd: MerchantOrder["pyusd"];
  acknowledgedAt: string | null; archivedAt: string; archivedByUserId: string; archivedState: PurchaseState;
};
```

- **Route:** `POST /api/v1/merchant/orders/{id}/archive`, no body.
  401 `unauthorized` without a merchant session, 403 `forbidden_origin` on a foreign `Origin`, 404 `not_found` for a missing order or another outlet's, 200 `{ order, changed }`.
  Every order state may be archived, as Gate 1 approved ("all orders, acknowledged or not").
- **Operator commands,** run with `MIGRATION_DATABASE_URL` like every operator act (D1):
  - `unarchive-order <purchaseId>` clears the three columns with an operator-visible audit row `order_unarchived`; an order that is not archived changes nothing.
  - `export-archived-orders [outletId]` reads in a `READ ONLY` transaction and writes `archive/orders/<purchaseId>.json`, one `ArchivedOrderReceipt` each, creating the folder; it overwrites a file of the same name and prints the count.
    The receipt carries no buyer user id, session, email, token, secret or QR payload.
- **Shop QR:** `shop-qr.tsx` renders only for a published outlet, drawing `${location.origin}/buy?outlet=<outletId>`; the origin is the deployed `APP_BASE_URL`, which `/mcp` already checks `Host` against.
  Download saves `envoi-shop-qr-<outletId>.png` from the drawn image; Copy writes the link to the clipboard.
  No server code, route or column.
- **Authorization:** archive joins the same live-membership check as acknowledge; an agent token, a buyer session or another merchant cannot archive.
  No buyer route reads the archive columns, so a receipt is unchanged.
- **Named tests (12, all new in the slice that builds them):**
  1. `archive hides an order and keeps its record`: the row and its attempts are unchanged apart from the three columns.
  2. `archive works on every order state`: paid acknowledged, paid unacknowledged, pending, uncertain and unpaid closed.
  3. `archive repeat changes nothing`.
  4. `another outlet's order cannot be archived`: 404 and no write.
  5. `an agent token or buyer session cannot archive`.
  6. `an order archived before it was paid comes back as Paid`.
  7. `a paid order archived stays hidden`.
  8. `archived count matches the hidden orders`.
  9. `the web role cannot clear an archive`: a direct `UPDATE` setting `merchant_archived_at` to null is refused by the trigger.
  10. `maintenance still reconciles an archived uncertain order`.
  11. `export writes one receipt per archived order without buyer identity`: a needle self-test plants a buyer user id and email and proves the scanner finds them in a serialized receipt before scanning the real export.
  12. `the QR writer is served from this site and is the pinned package's file`: SHA-256 equality with `node_modules/zxing-wasm/dist/writer/zxing_writer.wasm`.
  Each guard in tests 3-7, 9 and 11 gets its own mutation, recorded in the slice.
- **Unchanged:** every other route, error code, clock, state transition and the 92 named tests and 231 cases; these 12 are additions counted in Gate 4's slice for this work.

## Reopening 2026-10-18: a verifying landing wins the window scan

- **Finding (S17 review, 2026-10-18, finding 1):** the window scan reads the merchant account's history newest first and applied the first candidate it decided.
  When the wallet response was lost (no hint), a correct transfer followed by a newer successful transaction carrying the same memo text but failing verification ended `mismatch`, with the purchase `uncertain` and the buyer's correct transfer recorded as an extra transfer.
  The operator's only exit from `mismatch` is closing it unpaid, so a buyer who paid correctly could end unpaid.
  The memo text is public once the buyer's transfer lands, so anyone can send such a transaction before the scan starts.
  Reproduced on local PostgreSQL over the FIXTURE fake chain; Gate 2 already says "A matching transfer confirms the original attempt", so only this design is wrong and Gate 2 stays as approved.
- **Change:** while the attempt is still `expired_scanning`, a candidate that is ours, successful and fails verification no longer moves the attempt when it is read.
  The scan keeps the oldest such candidate in its coverage as `pendingMismatch` and records any newer one as an extra transfer.
  A verifying candidate binds whenever nothing is bound, wherever it sits in the window, and the pending candidate then becomes an extra transfer.
  Only when the complete scan bound nothing does the pending candidate move the attempt to `mismatch` and the purchase to `uncertain`, with the operator alert; release stays impossible while one is pending, because an incomplete scan never releases and a complete one with a pending candidate marks the mismatch instead.
  A hint is unchanged: it is the buyer's own wallet response, read before any scan, and a third party cannot submit one.
- **Wording fix in the same change (S17 review finding 7):** the case `a confirmed or mismatched attempt is still scanned after expiry` said `decideRecoveryStep` yields `done` for both, while the call stack yields `operator` for `mismatch`; the case now says what the call stack says, and the code already does.
- **Contracts touched:** `ScanCoverage` gains `pendingMismatch`; `RecoveryStep` gains `mark_mismatch`; the `mismatch` outcome of `CandidateOutcome` carries the candidate as an `ExtraTransfer`; the classification prose, the `expired_scanning -> mismatch` transition, the [PYUSD recovery call stack](#pyusd-recovery-added-2026-10-11) and the two case texts above.
  No route, table, migration (coverage is stored in the existing `pyusd_scan` column), error code, clock, named-test or case count changes.
  The regression test for this finding is a review-fix test recorded in `00-status.md`, like the S16 review fixes, so no count in Gate 4 changes and Gate 4 stays closed.
- **Approval:** the user asked on 2026-10-18 to "Reopen Gate 3 for finding 1 and draft the change for my approval first", and re-approved Gate 3 for it the same day: "I approve Gate 3 for the verifying-landing change. Build finding 1 on envoi/slice-17-review-fixes."
  This authorizes building finding 1 on that branch; it does not authorize pushing, merging or deploying.

## Reopening 2026-10-18: Phantom landing opens the PYUSD review

- **Finding:** on 2026-10-18 the user ran R14 on an iPhone: "Open in Phantom" kept the basket, but Phantom's browser opened the shop page, then a PayPal review, so the buyer had to review again and switch to PYUSD before the Pay button.
  The user's words: "i dont like how i have to review twice. The last page should be the only page that shows up after i click open in phantom".
- **Change:** the Browse link's Envoi URL adds `rail=pyusd`, and `/buy` opened with `rail=pyusd` and a basket asks for that PYUSD review itself through the ordinary `POST /purchases` and shows it, so the first page in Phantom's browser is the PYUSD review with its Pay button.
  The buyer still confirms that review there, by paying; nothing is prepared, signed or sent without that tap.
  A refused review (an item gone, a locked basket, PYUSD off or the shop without a PYUSD destination) leaves the buyer on `/buy` with the basket filled in and the refusal's message.
  The link still carries no purchase id, session, price, payee or personal data, needs no new route, and each use still creates only a fresh unexecuted review.
- **Contracts touched:** the `phantom-browse.ts` row of the [file map](#browser-wallet-modules-added-2026-10-11), the [PYUSD call stack](#call-stacks)'s phone link and the `/buy` landing beside it, and the case `Phantom link carries only public outlet and item ids`, renamed `Phantom link carries only public outlet and item ids and the rail` with `rail=pyusd` added to what it asserts.
  No type, state, clock, route, error code, named-test or case count changes; the landing's own test is a slice test, recorded where it is built.
- **Gate 2:** its phone path names the rail and the landing in the same words; see [`02-architecture.md`](02-architecture.md#phone-path-and-independent-access-gate).
- **Approval:** the user asked for this reopening on 2026-10-18 ("yes that would be great thanks") and re-approved Gates 2, 3 and 4 the same day ("Yea sure i approve the gates then make the relevant changes and push to main thnaks").

## Reopening 2026-10-15: English-only menu photos

- **Decision:** on 2026-10-15, during S11, the user decided that menu photo import covers English menus only for this hackathon: "Chnange the approved plan as well. Just english will do for this hackathon." For a line printed in English and Chinese: "ignore the chinese and only extract the english".
- **Change:** Chinese text accuracy leaves the R5 falsifiers in [least confident decisions](#least-confident-decisions); rotated and small-price text accuracy and vision latency stay.
  No contract, type, call stack, clock, test name or test count changes; the vision prompt's wording is a slice detail under `MENU_VISION_PROMPT_VERSION`.
- **Approval:** the user reopened Gates 2, 3 and 4 for removing the Chinese requirement only and approved it in advance on 2026-10-15 ("i approve the changes to remove chinese").

## Reopening 2026-10-12: TypeScript pin after the S1 boot check

- **Finding:** the S1 boot check, the falsifier this gate names for its version pins, failed on `typescript@7.0.2`: `typescript-eslint@8.71.1`, required by `eslint-config-next@16.4.0`, supports only `typescript >=4.8.4 <6.1.0`.
- **Change:** the pin becomes `typescript@6.0.3`, and the resolved S1 package set, five supporting packages and the PostgreSQL 18 test image are recorded under [Version pins](#version-pins).
  No contract, type, call stack, test name or test count changes.
- **Approval:** the user reopened Gate 3 for this change and approved it in advance on 2026-10-12 ("for this change gate 3( i pre approve it)").

## Reopening 2026-10-12: PayPal payments kill switch

Gate 2 names `PAYMENTS_ENABLED` as a web setting, but the 2026-10-11 contracts checked it only for PYUSD, so turning it off left PayPal able to start and capture.
Gate 4's review found the gap, recorded as delta D10, and on 2026-10-12 the user decided: "Add the check to paypal/start and paypal/complete, add an error code such as payments_disabled, and add a named test with its own mutation. One small Gate 3 reopening before S2."
This reopening changes only the four places below; every other contract stays as re-approved on 2026-10-11, and Gate 2 is not reopened, because it already names the setting.

- **Error code:** `payments_disabled` joins `ErrorCode`.
  It is not retryable and not operator-visible, and it changes no stored state.
- **Eligibility:** for a PayPal purchase, `assertPaymentEligible` refuses with `payments_disabled` while `PAYMENTS_ENABLED` is false.
  PYUSD keeps its existing answer, `pyusd_unavailable` with `payments_disabled` in `details.reason`.
- **Call stacks:** `paypal/start` and `paypal/complete` both reach the check through `assertPaymentEligible`, so `paypal/start` claims no attempt slot and creates no order, and `paypal/complete` takes no lease and dispatches no capture.
  Reads stay open: `reconcile`, the webhook, receipt polling and maintenance never check the flag, so a capture already dispatched still converges, and an approved order left uncaptured reads as abandoned once `T_REVIEW` passes.
- **Test:** the named test is `payments kill switch refuses PayPal start and completion`, with its own mutation.
  As with the D1 operator acts, Gate 4 places it, as a named addition in S2, the slice that builds both routes, so the test plan counts below do not change.

## Revision 2026-10-11: direct vision and PYUSD

Authority: the [re-approved Gate 2 amendment](02-architecture.md), including its five review changes, and the [Gate 3 handover](handoff.md#gate-3-handover-2026-10-11).
This revision is a proposal, re-approved by the user on 2026-10-11; the 2026-10-07 approval did not cover it.

- **Removed:** the image source row and its `bytea` storage, both capability principals, the image proxy and Zapier result routes, Zapier dispatch and its hook URL name, `T_IMAGE_ACCESS`, `T_SOURCE_SWEEP`, the `expire_imports` and `sweep_sources` tasks, import status and cancel routes, and the import dependency on the maintenance heartbeat and capacity reading.
- **Added for the import:** a counted Node upload route, in-memory photo checks, serialized admission with daily caps and a spend reservation, the tool-free vision call with explicit `store: false`, model-output bounds, allowlisted error records, expiry derived on read and draft reload after a lost response.
- **Added for PYUSD:** pinned devnet constants and an identity check, the wallet challenge, the merchant rate, preparation with a `confirmed` blockhash, verification of the transfer's meaning, complete-history recovery, the shared RPC limiter, the Phantom Browse phone link and PayPal isolation.
- **Updated to match:** errors, clocks, state machines, the authorization matrix, call stacks, races, capacity budgets, maintenance tasks, residual risks, least confident decisions and the test plan, plus a [test delta](#test-delta-for-the-gate-4-revision) that Gate 4 must apply.
- **Revised after the user's 2026-10-11 review (fixes A to K):**
  - A: the basket lock now holds exactly while money can still move, derived on read; a PayPal attempt that never dispatched a capture reads `abandoned` once `T_REVIEW` passes, because capture dispatch requires the review deadline; a PYUSD `mismatch` gets one exit, an audited operator resolution that closes it unpaid.
  - B: `commitImport` rechecks the actor's membership, as Gate 2 flow step 5 says.
  - C: verification checks the transfer's mint account and decimals byte explicitly, as Gate 2 step 5 says.
  - D: Lighthouse leaves the runtime identity check, which is genesis, mint owner and decimals only, as Gate 2's enable condition says; the one-off devnet recheck stays in research.
  - E: the model clock is `T_MENU_MODEL`, Gate 2's name.
  - F: no PYUSD RPC read runs inside a database transaction, including preparation's block-height read.
  - G: a spend reservation counts zero only when its attempt closed before the model call was dispatched, proven by a dispatch mark committed before the call.
  - H: a later signature hint is verified when every earlier one was `not_ours` or `failed_landing`, up to three hints per attempt and within the read debounce.
  - I: the purchase and PYUSD attempt machines agree: a PYUSD purchase is paid only from `pending_payment`.
  - J: a stale sentence about the provisioning files and R11 is corrected.
  - K: tests are batched into table-driven groups, with an exact mapping from every previous name; the counts are stated under [Test plan](#test-plan).
  - The user also reviewed six least confident calls; the verdicts are noted under [Least confident choices](#least-confident-choices-in-the-2026-10-11-revision) and recorded in [`00-status.md`](00-status.md#approval-history).
- **Revised after Gate 2 was reopened and re-approved on 2026-10-11 (fixes L and M):**
  the review of fixes A-K found two ways one PYUSD purchase could be paid twice, and the user reopened Gate 2 for both and approved the fixes in advance.
  - L: preparation releases the unsigned bytes exactly once and never stores them, and the browser asks the wallet once per release, because Phantom may add different priority-fee and Lighthouse instructions each time it signs, so two signings of one prepared message can both land.
  - M: after expiry, the window scan runs to completion for every released attempt, including a confirmed or mismatched one, and records any other successful transaction carrying the reference as an extra transfer; the purchase stays paid, and the extra transfer is shown to the buyer, the merchant and the operator, with any refund arranged outside Envoi.
- **Unchanged:** the OpenAI provider and the `@ai-sdk/openai` pin, PayPal recovery, scan, MCP, hosting, auth, R11 containment and the R12 region acceptance.
- **Correction made in passing:** row 6 of the findings table named the maintenance boundary risk "R6", while that risk is R3 in every other place; the row now says R3.
  No decision changed.

**Fixes A-K change no Gate 2 decision.**
**Fixes L and M do: Gate 2 step 4 re-released the same unsigned bytes, which is unsafe when the wallet augments each signing, and its scan did not look for a second landing after confirmation.**
Gate 2 was reopened for both and re-approved on 2026-10-11; see its [step 4](02-architecture.md#preparation-wallet-broadcast-and-verification) and [recovery](02-architecture.md#lost-response-recovery-and-rpc).
Gate 2 rules this revision makes exact rather than changes:

1. Lighthouse "assertion" instructions exclude its two memory instructions, discriminators 0 and 1, which create or close an account.
2. "Recorded" spend bounds are reviewed code constants, so no environment name is added.
3. "Reserve worst-case input/output spend" keeps every reservation whose model call was dispatched, and counts zero only for an attempt that provably closed before dispatch.
4. "`PYUSD_ENABLED` gates the adapter" stops new PYUSD actions only, so recovery of prepared attempts continues while the flag is off.
5. "No new attempt or rail switch while an external effect is possible" becomes a basket lock that ignores the rail, holds exactly while money can still move, is derived on read, is checked at review creation and at both execution starts, and is per buyer session.
6. "Reconciliation does not capture an order the buyer abandoned" becomes a compare-and-set: capture is dispatched only while the review is inside `T_REVIEW`, so an approved order whose buyer never returns closes unpaid once `T_REVIEW` passes.
7. "Mismatched evidence remains uncertain and operator-visible, never paid" gets one exit: an out-of-band, audited operator resolution that closes the attempt unpaid, never paid, built by Gate 4 under delta D1.

Gate 2 rules the earlier draft had narrowed, restored after the review: the import commit rechecks membership (Gate 2 flow step 5), verification checks the pinned mint and decimals explicitly (step 5 of the PYUSD flow), the enable identity is genesis, mint owner and decimals only, and the model clock uses Gate 2's name `T_MENU_MODEL`.

Evidence gathered for this revision is recorded in [`research.md`](research.md#gate-3-revision-reads-2026-10-11): dated registry reads, the pinned AI SDK type definitions, the Lighthouse instruction source at a pinned commit and two read-only devnet reads.
No package was installed, no OpenAI call was made and no wallet, faucet or transaction was used.

## What this gate resolves

Gate 2 approval left eight review findings open. This gate independently re-checked the vendor claims those findings depend on, against primary sources on 2026-10-07. Four findings are now **resolved by a design contract**, three are **resolved with a named residual risk that must be disclosed rather than hidden**, and one is **partly outside Gate 3's reach** and is dispositioned to a specific later proof.

This gate also surfaced a provisioned Neon project that contradicted an approved Gate 2 decision, and the user resolved both resulting questions on 2026-10-07: **in-app Better Auth** stands, so Gate 2 is not reopened, and the **`aws-us-east-2` region is accepted** subject to a Slice 1 latency measurement.

Three cross-check results changed a Gate 2 assumption:

- **[verified]** Neon Free fails *"operations that increase storage (inserts, updates, and deletes)"* once the 1 GB storage limit is reached, and its history window is a *"6-hour limit"* in which *"Change history is a log of write operations"*. Consequence: a logical `DELETE` neither reclaims space immediately nor works at all once storage is exhausted. Gate 2 assumed cleanup-on-close was the primary control. It is not reliable. Access denial must therefore be a **read-only** decision, and capacity must be bounded at **admission**, not at deletion. [Neon plans](https://neon.com/docs/introduction/plans)
- **[verified]** Better Auth's anonymous plugin states *"The anonymous user is deleted by default when the account is linked to a new authentication method"*, with `disableDeleteAnonymousUser` to turn that off. Gate 2 assumed database sessions simply survive. They do, but a link event would by default delete the row that owns every buyer purchase. Receipts would silently become orphans. [Anonymous plugin](https://better-auth.com/docs/plugins/anonymous)
- **[verified]** PayPal idempotency documents no fixed retention window (*"see the reference for your API"*) and warns that for simultaneous identical keys *"PayPal processes the first request and might fail the second request"*. Consequence: same-key replay is the correct recovery for a lost response, and **concurrent** same-key requests are unsafe. Capture must be serialized behind a lease, not merely behind a stored request id. [Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)

Also **[verified]**: GitHub Free includes *"2,000"* Actions minutes monthly, *"GitHub Actions usage is free for self-hosted runners and for public repositories that use standard GitHub-hosted runners"*, and *"If your account does not have a valid payment method on file, usage is blocked once you use up your quota."* The zero-spend control is therefore structural, not a configuration hope. [Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)

## Disposition of the eight unresolved review findings

| # | Finding | Evidence found | Resolution or disposition |
| --- | --- | --- | --- |
| 1 | Free-capacity budgets, bounded polling, complete Actions job overhead, shared quotas, zero-spend controls | **[verified]** 2,000 private minutes/month; public standard runners free; usage blocked with no payment method. **[vendor claim]** Neon 1 GB storage, 100 CU-hours/project, 5 GB transfer, 5-minute scale-to-zero. **[vendor claim]** Render Free 750 shared instance hours, sleep after 15 minutes. | **Resolved** in [Capacity budgets](#capacity-budgets) below: a monthly figure for every shared quota, an admission-based storage budget, a bounded polling contract, and an Actions cadence that starts at every 6 hours and moves to hourly only after quota is confirmed or the repository is public. Zero-spend is enforced by having no payment method on file plus a $0 spending limit. Residual **[unknown]**: actual CU-to-wall-clock conversion at the chosen Neon compute size; must be measured in Slice 1. **Revised 2026-10-11:** the storage budget no longer carries image bytes or history churn, and OpenAI spend, decoder memory and devnet RPC budgets are added. |
| 2 | Cleanup/recovery when database storage exhaustion blocks `DELETE` | **[verified]** inserts, updates and deletes all fail at the storage limit; 6-hour history retains written bytes after logical deletion. | **Resolved, revised 2026-10-11.** No image bytes are stored, so no image access must close and no source delete exists; each import writes one small bytes-free row. The read-only principle survives: an abandoned import reads as expired from its deadline, with no write and no task. If generic storage exhaustion is reached anyway, no in-application recovery exists: the operator runbook is console-side (shorten the history window to truncate it, then delete). Whether truncation is immediate is **[unknown]** and untested; this is residual risk R2, narrowed, in [Least confident decisions](#least-confident-decisions). *Superseded 2026-10-07 contract: read-path image denial and rolling-window image-byte admission.* |
| 3 | Logical checkout identity across duplicate requests and replacement reviews | Design gap, no external dependency. | **Resolved** by `CheckoutKey`: a deterministic hash over buyer session, outlet, menu revision, destination, rail, currency and canonical lines, with a unique partial index on one open review per key, `supersedes_purchase_id` for replacements, and an explicit rule that a replacement is legal only from a terminal unpaid state. See [Checkout identity](#checkout-identity) and [Races](#races). |
| 4 | Image capability access versus merchant-session/membership requirements | Design gap, no external dependency. | **Resolved by removal, 2026-10-11.** The direct vision call needs no provider fetch, so both capability principals, their routes and their tokens are gone. Every import read or write requires a merchant session and outlet membership. See [Authorization](#authorization). *Superseded 2026-10-07 contract: two disjoint principal kinds with a session-free image capability.* |
| 5 | Anonymous deletion/linking, durable receipt ownership, payment-record retention | **[verified]** Better Auth deletes the anonymous user on link by default. | **Resolved**: `disableDeleteAnonymousUser: true`, plus an `onLinkAccount` hook that refuses to create any membership. Purchases keep `buyer_user_id` as the owner of record; linking changes nothing about ownership. Retention: purchases, attempts, provider events and audit rows are retained for the whole demo (small, no bytes, no QR payloads, no prompts, no bearer values). Expired Better Auth session rows are purged by maintenance. Receipt loss on cookie clearing is disclosed in the UI, not silently repaired. |
| 6 | Maintenance's code-level versus credential-enforced PayPal authority | **[unknown]**: PayPal's public reference pages reachable in this pass list Orders v2 operations without exposing scope strings, so whether a read-only Orders scope exists could not be verified from a primary source. | **Partly resolved, honestly dispositioned.** The boundary is enforced by construction: maintenance receives a `PayPalReadClient` type that has no `create`/`capture` member, imports only `orders-read.ts`, and a CI test asserts the built maintenance bundle cannot reach the capture module or endpoint path. That is a real, fail-capable guard, but it is **code-level**, not credential-enforced. If provisioning reveals a read-only Orders scope, a second REST app credential is added as defence in depth; until then the residual risk is disclosed as R3 and must appear in submission materials, not be omitted. |
| 7 | Unsupported prior-art and SGQR claims | Bounded search: one public repository reviewed on 2026-10-07; no primary SGQR scheme specification; the "99% of payers" figure is a third-party market claim. | **Resolved by relabeling.** `research.md` is amended in this gate so the agent-surface gap reads as a **[hypothesis]** from a named bounded search rather than an established fact, and the SGQR parser contract returns unrecognized tags explicitly instead of dropping or guessing them. No uniqueness or decode-accuracy claim survives into submission material without a primary source. |
| 8 | Inconsistent timing definitions | Design gap, no external dependency. | **Resolved** by [Named clocks](#named-clocks): one name per clock, its start event, duration, enforcer and expiry consequence. Every other document must use these names. Expiry of any clock is never evidence that a dispatched payment failed, and no clock guarantees physical erasure. **Revised 2026-10-11:** the image clocks are removed; request, model, upload, wallet-challenge, rate-age and RPC clocks are added, plus one block-height bound that is not a clock. |

## Provisioned state discovered during this gate

Planning documents said nothing was provisioned. That is now false, and this gate records the actual state instead of the assumption. While Gate 3 preparation ran, a concurrent session provisioned Neon at the user's direction and left its files untracked in this shared worktree; the user later instructed that they be committed, and they are now tracked in commit `f8caf7d`. **No secret value was read into this document, and none may be committed.** `git status` confirms `.env.local` and `.neon` are matched by `.gitignore` (`.env`, `.env.*`, `.neon`, `node_modules/`) and are in no commit.

| Fact | Value | Consequence |
| --- | --- | --- |
| Neon project | `holy-boat-19447545` (Envoi), org `org-wispy-flower-08821549` | The free-tier database now exists, so the Gate 2 falsifier "free capacity is unavailable" is partly discharged for Neon only. Remaining quota is still **[unknown]** until read from the console. |
| Branch | `production` (`br-fancy-sea-b4xb78sw`) | One branch of the Free plan's 10-branch limit is used. Migrations will run against this branch; there is no separate test branch yet. |
| Region | `aws-us-east-2` | **[verified]** not Singapore. Gate 2 left co-location unverified; it is now known to be US East. Buyers and merchants in Singapore pay trans-Pacific latency on every query, on top of the Render cold start, inside the approved three-minute metric. Residual risk R12. |
| Postgres and Neon Auth | enabled on the branch before `neon deploy` | `neon.ts` declares `auth: true`, which is **Neon Managed Better Auth**, a platform-operated auth service. |
| Installed packages | `@neon/config` 1.8.4, `@neon/env` 1.5.1 in `package.json`, plus `package-lock.json` and `node_modules/` | These are provisioning tooling only. No application, framework or test dependency is installed. The pins in this document are additive. |
| Render | not provisioned | Application hosting remains unproven; the approved host is still Render Free. |

### Discrepancy resolved by user decision: in-app auth wins

Approved Gate 2 states Better Auth is *"a library in our app, not another hosted service"*, with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as our configuration. The provisioned `neon.ts` sets `auth: true`, which is the opposite: auth operated by Neon.

**Decision, 2026-10-07: the user chose Option A, in-app Better Auth.** Gate 2 is not reopened; the approved auth decision stands. The conflict is not cosmetic, which is why it was escalated rather than resolved silently: the finding 5 resolution depends on a specific library knob, `disableDeleteAnonymousUser: true`, plus an `onLinkAccount` hook that creates no membership. Whether Neon Managed Better Auth exposes the anonymous plugin, that flag or that hook is **[unknown]**, and if it does not, receipt ownership cannot be guaranteed as promised here. Whether managed auth is available on the Free plan is also **[unknown]**, and the commented-out AI Gateway line in `neon.ts` (*"Upgrade to a paid plan"*) shows some Neon features are not.

| Option | What it means | Outcome |
| --- | --- | --- |
| **A: in-app Better Auth** | `better-auth@1.7.7` with the Drizzle adapter, exactly as designed here. | **Selected by the user, 2026-10-07.** We own session storage, the secret, the migration and the finding 5 knobs. No Gate 2 reopening. |
| B: Neon Managed Better Auth | Keep `auth: true` and delegate sessions to the platform. | Rejected. Would have reopened Gate 2 and required proving free-plan access and the anonymous-plugin surface first. |

**Follow-up action, executed 2026-10-07 under a separate user authorization.** The user authorized flipping the flag, redeploying and then inspecting the database read-only. `neon.ts` is now `auth: false` with a short explaining comment. `neon deploy --update-existing --no-env-pull` reported `No changes`, saying the branch already matched the policy, and `Utilized services: Postgres`, while `neon neon-auth status` still reports the Auth service enabled. **The `auth` field is therefore not the on/off switch for the branch-level service**; its actual meaning is **[unknown]**.

The inspection then settled the question that mattered, and it removed the hazard rather than the service. A read-only session (`default_transaction_read_only=on`, confirmed in-session) found that **all nine Neon Auth tables live in a dedicated `neon_auth` schema** (`account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`) and that **`public` contains zero tables**. There is no collision with the Better Auth tables this design places in `public`. Managed auth stays enabled but inert and isolated, and **nothing was disabled**. The command that would remove it, `neon neon-auth disable`, was deliberately not run and is not authorized.

**Two containment rules become mandatory as a result.** Never build against or query the `neon_auth` schema, and pin Better Auth's Drizzle adapter explicitly to `public` so that no unqualified `user`, `session`, `account` or `verification` reference can resolve into the other schema through a search path. Whether the idle service costs anything on the Free plan is **[unknown]**.

The same discipline applies to region. **[verified]** The provisioned project is in `aws-us-east-2`, not Singapore. **Decision, 2026-10-07: the user accepts the region as is.** The honest form of that acceptance is a measurement, not an assumption: a named Slice 1 test measures a real Singapore cold first visit and records the latency, and relocation is revisited only if the approved three-minute metric fails because of it. Relocating later is possible but costs more once the database holds real data, and recreating the project is a provisioning action that this gate does not authorize.

## Version pins

Versions below were read from the npm registry on 2026-10-07 with `npm view <pkg> version`. **No package was installed and no lockfile was created.** Compatibility between these majors is **[unknown]** until the Slice 1 boot check runs.

| Package | Proposed pin | Role |
| --- | --- | --- |
| `next` | `16.4.2` | App Router, Node runtime on Render Free. Raised from `16.4.0` on 2026-10-29 by the user's instruction, with `eslint-config-next`, for advisories affecting `<=16.4.0`; `16.4.2` is the newest release at least two weeks old. |
| `react`, `react-dom` | `19.3.0` | UI |
| `typescript` | `6.0.3` | Type checking; also builds the maintenance runner. Pinned at `7.0.2` until the S1 boot check; see the resolved set below. |
| `drizzle-orm` | `0.45.3` | Queries and row types |
| `drizzle-kit` | `0.31.11` | Migration generation |
| `postgres` | `3.4.9` | postgres.js driver, pooled for web and direct for maintenance/migrations |
| `better-auth` | `1.7.7` | Sessions, anonymous buyers, allowlisted merchant accounts |
| `zod` | `4.6.5` | Every boundary schema: env, request bodies, provider payloads |
| `ai` | `7.0.130` | Vercel AI SDK structured suggestions |
| `@ai-sdk/openai` | `4.0.86` | Single configured provider; exact model from `AI_MODEL` |
| `@modelcontextprotocol/sdk` | `1.32.1` | Streamable HTTP `/mcp` |
| `barcode-detector` | `3.2.2` | Browser camera/paste QR decode with a wasm fallback |
| `sharp` | `0.35.5` | Server-side image decode, normalization and metadata stripping |
| `vitest`, `@vitest/coverage-v8` | `5.0.3` | Unit and integration tests |
| `@playwright/test` | `1.63.0` | Browser journey tests at 390px and 1280px |
| `tailwindcss` | `4.3.3` | Styling |
| `eslint` | `10.12.0` | Lint |
| `tsx` | `4.23.15` | Local maintenance runs only; CI uses the compiled build |

**Added 2026-10-11 for PYUSD.**
These were read from the npm registry on 2026-10-11 at 11:12 UTC with plain HTTPS reads of each package's registry document, because npm is not installed on this Mac.
No package was installed and no lockfile changed.
The 2026-10-07 pins above are unchanged; `ai` and `@ai-sdk/openai` keep their pins although newer patch releases now exist.

| Package | Proposed pin | Published | Role |
| --- | --- | --- | --- |
| `@solana/kit` | `8.4.0` | 2026-09-28 | Read-only RPC client over a custom bounded transport, message compilation, codecs, addresses and Ed25519 signature verification. Peer `typescript >=5.4.0`; engines `node >=20.18.0`. |
| `@solana-program/token-2022` | `0.19.0` | 2026-09-21 | `TransferChecked` builder, mint and token-account decoders, associated-account derivation and instruction identification. Peers `@solana/kit ^8.3.0` and `@solana/sysvars ^8.0.0`; the `@solana/zk-sdk` peer is optional and is not added. |
| `@solana-program/memo` | `0.15.0` | 2026-09-21 | Memo instruction builder, with its program address overridden to the pinned memo program below. |
| `@wallet-standard/app` | `1.1.1` | 2026-06-03 | Browser wallet discovery. Engines `node >=22`. |
| `@solana/wallet-standard-features` | `1.5.0` | 2026-09-10 | Types for `solana:signAndSendTransaction` and `solana:signMessage`. Engines `node >=22`. |

Deliberately not added: `@solana/wallet-standard-chains`, because the chain is one reviewed constant; `@solana-program/compute-budget`, because verification needs only its program address; and `lighthouse-sdk`, whose latest release, `2.1.0` from 2025-05-12, peers `@solana/kit ^2.1.0` and cannot share Kit 8.
Lighthouse instructions are therefore identified by reviewed discriminator constants taken from its source at a pinned commit.

**Boot gate (Slice 1 falsifier):** if `better-auth@1.7.7`, `drizzle-orm@0.45.3` or `drizzle-kit@0.31.11` do not work against `next@16.4.0` / `typescript@7.0.2`, downgrade to the newest mutually supported majors and record the resolved set here. Do not patch around an incompatible auth library; a session bug is a receipt-ownership bug.
The same boot check applies to the PYUSD pins when the first PYUSD slice installs them: they must typecheck under the resolved `typescript@6.0.3`, resolve the `@solana/sysvars` peer through `@solana/kit@8.4.0` without a second copy, and build in the browser and Node bundles.

**Resolved set after the S1 boot check, 2026-10-12 [verified].**
The boot gate fired on one pin: `typescript@7.0.2`.
`eslint-config-next@16.4.0` pulls in `typescript-eslint@8.71.1`, whose peer range is `typescript >=4.8.4 <6.1.0`, and which throws `typescript-eslint does not support TS 7.0.` at load.
The pin is therefore downgraded to `typescript@6.0.3`, the newest release inside that range, and later slices typecheck under 6.0.3, including the PYUSD boot check above.
No other pin changed, and the auth library is unchanged.
Installed exactly, as read back from `package-lock.json`: `next@16.4.0`, `react@19.3.0`, `react-dom@19.3.0`, `typescript@6.0.3`, `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`, `postgres@3.4.9`, `better-auth@1.7.7`, `zod@4.6.5`, `vitest@5.0.3`, `@vitest/coverage-v8@5.0.3`, `tailwindcss@4.3.3`, `eslint@10.12.0` and `tsx@4.23.15`.
Five supporting packages this table did not list are required to build, lint and typecheck the S1 files and are pinned exactly: `eslint-config-next@16.4.0`, `@tailwindcss/postcss@4.3.3`, `@types/node@24.19.2`, `@types/react@19.3.0` and `@types/react-dom@19.3.0`.
`@playwright/test` is not installed in S1: its screens were checked in a real browser, and delta D4 keeps CI free of browser downloads.
`npm audit` reports two advisories, both in build-time tooling that no request path imports: the `esbuild` development-server advisory under `drizzle-kit` (moderate; `npm audit --omit=dev` still lists it because `better-auth` declares `drizzle-kit` as a peer), and `braces` under `eslint-config-next` (high).
The only fix npm offers is a breaking downgrade of `drizzle-kit`, so both are recorded rather than forced.
Neon production reports PostgreSQL 18.6, so the local test cluster and the CI service image are on 18 (delta D3).

`pg_advisory_lock`, prepared statements, `LISTEN/NOTIFY` and temporary tables are unsafe through transaction pooling, so leases use row-level `UPDATE ... WHERE ... RETURNING` and migrations plus any session-state work use `MIGRATION_DATABASE_URL`/`MAINTENANCE_DATABASE_URL` (direct). **[vendor claim]** Neon documents pooled versus direct differences; **[unknown]** for this account.

## Files

Four files already exist from the concurrent provisioning session: `.gitignore`, `neon.ts`, `package.json` and `package-lock.json`, plus `node_modules/` and the ignored `.env.local` and `.neon`.
Everything else below is proposed and does not exist.
`docs/plans/PAYPAL_PLAN.md` and the six mockups are preserved untouched.
**Corrected 2026-10-11 (wording only):** the four provisioning files are tracked since commit `f8caf7d`, and R11 is resolved: `neon.ts` is at `auth: false` after the separately authorized follow-up, and the read-only inspection disproved the collision hazard.
This gate does not stage, move or edit them; the R11 containment rules below still bind.

### Repository root

| Path | Why it lives there |
| --- | --- |
| `package.json` | **Exists and tracked.** Currently holds only `@neon/config` and `@neon/env`. Grows the app scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `runner:build`, `runner:start`. |
| `package-lock.json` | **Exists and tracked** from provisioning. Extends as the app pins are installed; the resolved versions then become the authoritative record against the pins above. |
| `.gitignore` | **Exists and tracked.** Covers `.env`, `.env.*`, `.neon`, `node_modules/`, plus build output and test artifacts: `.next/`, `dist/`, `.maintenance-build/`, `coverage/`, `playwright-report/`, `test-results/`, `.vitest/`, `*.tsbuildinfo`. The earlier gap is closed. |
| `neon.ts` | **Exists and tracked** at `auth: false`, committed in `f8caf7d`. Verified not to control the branch-level Auth service, which remains enabled in its own `neon_auth` schema. |
| `neondb` schema state | **Verified 2026-10-07 by read-only inspection:** `public` contains zero tables; all nine Neon Auth tables sit in `neon_auth`. Better Auth must be pinned to `public`. |
| `tsconfig.json` | Next.js web config, `strict`, no `any` at boundaries. |
| `config/tsconfig.runner.json` | Separate NodeNext build of the maintenance entrypoint only, so CI can prove what maintenance can reach. |
| `config/drizzle.config.ts` | Migration generation against `MIGRATION_DATABASE_URL`. |
| `next.config.ts` | Node runtime, framework image optimizer unused, security headers, no-referrer on approval pages. **Revised 2026-10-11:** no `src/proxy.ts` or `middleware.ts` exists; if one is ever added, its matcher must exclude the menu-import route so no proxy clones the upload body. |
| `render.yaml` | Proposed Render Free web service. Not applied; provisioning is not authorized. |
| `config/vitest.config.ts`, `playwright.config.ts` | Test runners. **Moved 2026-10-22:** the configs that their tools accept by `--config` or `-p` live in `config/`, so the root holds only files a tool requires there. |
| `.github/workflows/ci.yml` | Typecheck, lint, unit and integration tests on push. |
| `.github/workflows/maintenance.yml` | Proposed hourly runner. **Creation is not authorized by this gate.** |
| `.env.example` | Names only, never values. Must equal the union of names in `src/env.ts`. Must not duplicate the real `.env.local`, which stays ignored. **Revised 2026-10-11:** includes `AI_MENU_MODEL`, `MENU_IMPORTS_ENABLED`, `SOLANA_RPC_URL` and `PYUSD_ENABLED`; the Zapier hook name is removed. |

### Configuration, libraries and guards

| Path | Why it lives there |
| --- | --- |
| `src/env.ts` | Single Zod-parsed view of `process.env`; boot fails on a missing or live-environment value. Every other module imports config from here only. |
| `src/lib/db/schema.ts` | All Drizzle tables in one place so constraints are reviewable together. |
| `src/lib/db/web.ts`, `src/lib/db/runner.ts`, `src/lib/db/migrate.ts` | Three least-privileged connection factories with different roles. |
| `src/lib/auth.ts` | Better Auth instance: Drizzle adapter, anonymous plugin with `disableDeleteAnonymousUser: true`, `onLinkAccount` refusing membership creation, public signup disabled. |
| `src/lib/auth-context.ts` | Every principal guard. No route performs its own session logic. |
| `src/lib/errors.ts` | `AppError` union and the only mapping to HTTP status. |
| `src/lib/http/respond.ts` | JSON envelope, cache headers, `no-store` for private responses. |
| `src/lib/http/bounded-body.ts` | **Added 2026-10-11.** Counted, time-bounded request-body reader; the only way a route reads an upload body. |
| `src/lib/http/origin.ts` | **Added 2026-10-11.** Same-origin check for browser mutations against `APP_BASE_URL`, never the `Host` header. |
| `src/lib/ids.ts` | Identifiers, 256-bit agent handoff tokens and 128-bit PYUSD memo references, plus hashing for storage. |
| `src/lib/money.ts` | Integer minor-unit SGD arithmetic. No float path exists. |
| `src/lib/time.ts` | The named clocks and an injectable `now` for deterministic tests. |
| `src/lib/log.ts` | Redacting logger: QR payloads, bearer values, prompts, image bytes, base64 and data URLs, and privileged provider bodies never reach a sink. **Revised 2026-10-11:** errors are logged only as allowlisted `SafeErrorRecord`s, never as error objects. |
| `src/lib/ratelimit.ts` | Database-backed limiter for public routes, wallet challenges and the shared Solana RPC budget. |

### Domain modules (no HTTP, no provider SDK)

| Path | Why it lives there |
| --- | --- |
| `src/domain/outlets/types.ts`, `search.ts`, `publish.ts` | Published-outlet reads and the publication precondition transaction. |
| `src/domain/sgqr/decode.ts`, `validate.ts` | EMVCo TLV decode into recognized/unrecognized tags, then allowlisted identifier resolution to zero, one or many outlets. |
| `src/domain/menu/types.ts`, `draft.ts`, `confirm.ts` | Revision/item completeness, non-clobbering suggestion merge, confirmation and invalidation. |
| `src/domain/imports/types.ts`, `consent.ts`, `admission.ts`, `upload.ts`, `lifecycle.ts`, `validate-result.ts` | **Revised 2026-10-11.** Limits and outcomes, the versioned consent, serialized admission with daily caps and a spend reservation, in-memory photo-part parsing, commit, close and derive-on-read, and model-output bounds. No image bytes outlive the request. |
| `src/domain/purchases/checkout-key.ts`, `price.ts`, `review.ts`, `state.ts`, `reconcile.ts` | Logical checkout identity and, since 2026-10-11, the rail-independent basket lock derived on read; server pricing, review creation/replacement, the transition table, the derived purchase view and provider-read decisions. |
| `src/domain/pyusd/constants.ts` | **Added 2026-10-11.** Reviewed devnet constants and the proof switch. No environment variable can override them. |
| `src/domain/pyusd/identity.ts`, `mint.ts` | **Added 2026-10-11.** Genesis, mint owner-program and decimals identity check, exactly Gate 2's enable condition; fee-horizon and extension eligibility. |
| `src/domain/pyusd/rate.ts` | **Added 2026-10-11.** Exact rate parsing, upward integer conversion and age on read. |
| `src/domain/pyusd/challenge.ts` | **Added 2026-10-11.** SIWS-format challenge bytes, single-use Ed25519 verification and destination recording. |
| `src/domain/pyusd/attempts.ts`, `state.ts` | **Added 2026-10-11.** Preparation, the lock, the PYUSD attempt transition table and signature binding. |
| `src/domain/pyusd/verify.ts` | **Added 2026-10-11.** Pure verification of a finalized landed transaction by meaning. No RPC. |
| `src/domain/pyusd/recovery.ts` | **Added 2026-10-11.** Expiry, scan coverage and release decisions; since fix M, candidate classification and extra transfers. No RPC. |
| `src/domain/payments/attempts.ts`, `state.ts` | One active attempt per purchase, operation keys, dispatch legality, attempt lifecycle. |
| `src/domain/suggestions/types.ts`, `suggest.ts` | AI tool schemas and bounded suggestion results. |
| `src/domain/handoffs/types.ts`, `redeem.ts` | Agent purchase-request tokens and single redemption. |
| `src/domain/maintenance/due.ts`, `tasks.ts` | Due-work claiming with leases and the exhaustive finite task list. |
| `src/domain/audit/events.ts` | Append-only audit writes performed inside the business transaction. |

### Integrations (only modules allowed to touch an external SDK or HTTP client)

| Path | Why it lives there |
| --- | --- |
| `src/integrations/paypal/client.ts` | OAuth token, host allowlist from config, request-id injection, timeout and retry classification. |
| `src/integrations/paypal/orders.ts` | Write client: create, read, capture. |
| `src/integrations/paypal/orders-read.ts` | Read-only client type consumed by maintenance. |
| `src/integrations/paypal/verify.ts` | Webhook signature verification and event dedupe. |
| `src/integrations/paypal/map.ts` | Provider payload to domain evidence, with explicit mismatch reasons. |
| `src/integrations/ai/openai.ts` | AI SDK provider, model, tool budget and structured-output schema. |
| `src/integrations/ai/menu-vision.ts` | **Added 2026-10-11.** The one tool-free vision call: `AI_MENU_MODEL`, explicit `store: false`, strict schema, no retries, bounded output and an abort signal. Uses the same provider and pin as `openai.ts`. |
| `src/integrations/image/normalize.ts` | **Added 2026-10-11.** The only module that imports `sharp`: header dimension check, decode, orientation, metadata strip and JPEG re-encode, in memory. |
| `src/integrations/solana/rpc.ts`, `limiter.ts` | **Added 2026-10-11.** Read-only devnet client over a bounded transport, and the shared database RPC limiter. No send, airdrop or signing method exists. |
| `src/integrations/solana/build.ts`, `decode.ts` | **Added 2026-10-11.** Unsigned transfer construction from pinned constants; landed-transaction and account decoding into domain shapes. |

The Zapier dispatch module is removed by the 2026-10-11 revision.

### HTTP surface

| Path | Purpose |
| --- | --- |
| `src/app/api/auth/[...all]/route.ts` | Better Auth routes, outside `/api/v1`. |
| `src/app/api/v1/outlets/route.ts`, `outlets/[id]/menu/route.ts` | Public paginated reads. |
| `src/app/api/v1/outlets/resolve-sgqr/route.ts` | Bounded QR payload to zero, one or many outlets. |
| `src/app/api/v1/buyer/suggestions/route.ts` | Buyer-session text suggestion. |
| `src/app/api/v1/purchases/route.ts`, `purchases/[id]/route.ts` | Create a review; owning-session or merchant read. |
| `src/app/api/v1/purchases/[id]/paypal/start/route.ts`, `paypal/complete/route.ts` | Execution and post-approval completion. |
| `src/app/api/v1/purchases/[id]/cancel/route.ts`, `reconcile/route.ts` | Close an unexecuted review; request a bounded provider read. |
| `src/app/api/v1/merchant/outlets/route.ts`, `merchant/outlets/[id]/route.ts` | Create and edit an unpublished outlet. |
| `src/app/api/v1/merchant/outlets/[id]/destinations/paypal/route.ts` | Select an operator-prepared connection. |
| `src/app/api/v1/merchant/outlets/[id]/menu-imports/route.ts` | **Revised 2026-10-11.** Synchronous Node route handler: membership, origin, consent, admission, counted upload, vision draft and merge in one request. No import status or cancel route exists. |
| `src/app/api/v1/merchant/outlets/[id]/menu-draft/route.ts`, `confirm/route.ts`, `publish/route.ts` | Manual correction with revision conflict checks, confirmation, publication. Since 2026-10-11, `GET menu-draft` also returns the latest import outcome, derived on read. |
| `src/app/api/v1/merchant/outlets/[id]/destinations/pyusd/challenge/route.ts`, `destinations/pyusd/route.ts` | **Added 2026-10-11.** Issue a wallet challenge; verify the signed proof and the merchant token account. |
| `src/app/api/v1/merchant/outlets/[id]/pyusd-rate/route.ts` | **Added 2026-10-11.** Append or re-confirm the shop's rate. |
| `src/app/api/v1/purchases/[id]/pyusd/prepare/route.ts`, `pyusd/submitted/route.ts` | **Added 2026-10-11.** Persist, lock and then release unsigned bytes; record a signature hint. The shared `reconcile` route serves both rails. |
| `src/app/api/v1/merchant/outlets/[id]/orders/route.ts`, `merchant/orders/[id]/acknowledge/route.ts` | Membership-scoped orders and separate acknowledgment. |
| `src/app/api/v1/purchase-requests/route.ts`, `purchase-requests/redeem/route.ts` | Agent request and single redemption. |
| `src/app/api/v1/integrations/paypal/webhook/route.ts` | Verified, deduplicated event inbox. |
| `src/app/api/v1/health/route.ts`, `health/operator/route.ts` | Public readiness; operator view of heartbeat, overdue work and capacity. Refines Gate 2's single `GET /health`. Since 2026-10-11 the operator view also shows import outcomes, latency, spend reservations and decoder memory, RPC throttling, and held or mismatched PYUSD attempts with their scan coverage. |
| `src/app/mcp/route.ts` | Streamable HTTP MCP, `POST` only, three scoped tools. |
| `src/app/buy/page.tsx`, `review/[purchaseId]/page.tsx`, `receipt/[purchaseId]/page.tsx` | Buyer screens. |
| `src/app/merchant/setup/page.tsx`, `merchant/orders/page.tsx` | Merchant screens. |
| `src/app/approve/[handoffToken]/page.tsx` | Agent handoff landing. |
| `src/app/paypal/return/page.tsx`, `paypal/cancel/page.tsx` | Landing pages that read persisted state only; no capture from a `GET`. |

The image proxy and the Zapier result routes are removed by the 2026-10-11 revision.

### Browser wallet modules (added 2026-10-11)

| Path | Why it lives there |
| --- | --- |
| `src/lib/wallet/standard.ts` | Browser-only wallet discovery: keeps only wallets whose chains include `solana:devnet` and that offer the needed feature. |
| `src/lib/wallet/phantom-browse.ts` | Builds the Phantom Browse link from public outlet and item ids and the rail `pyusd` only (rail added 2026-10-18). |
| `src/app/review/[purchaseId]/pyusd-pay.tsx` | Client component: prepare, hand the exact bytes to the wallet once through a one-shot holder (fix L), post the signature hint; on a phone with no wallet, the Phantom link instead of a pay button. |
| `src/app/merchant/setup/pyusd-wallet.tsx` | Client component: request a challenge, have the wallet sign the exact bytes, submit the proof; set the rate. |

### Maintenance and tests

| Path | Why it lives there |
| --- | --- |
| `src/maintenance/run.ts` | Entrypoint: heartbeat, claim leases, run tasks in fixed order, write a report, exit non-zero on operator-visible failure. |
| `tests/unit/**`, `tests/integration/**`, `tests/e2e/**` | Named tests from the test plan. |
| `tests/fixtures/**` | Visibly labeled demo fixtures; every fixture response and screenshot carries its label. Since 2026-10-11 this includes synthetic OpenAI responses, synthetic landed devnet transactions and generated test photos; none is presented as a real import or payment. |

## Types and signatures

Declarations only. No bodies.

### Errors and money

```ts
export type ErrorCode =
  | "validation_failed" | "unauthorized" | "forbidden_membership" | "forbidden_origin" | "not_found"
  | "review_expired" | "review_invalidated" | "checkout_conflict" | "revision_conflict"
  | "execution_locked" | "capture_already_dispatched" | "payment_uncertain" | "payments_disabled"
  | "consent_required" | "import_rejected" | "import_expired" | "import_base_revision_changed"
  | "admission_rejected"
  | "pyusd_unavailable" | "rate_expired" | "wallet_proof_rejected" | "wallet_attempt_locked"
  | "provider_unreachable" | "provider_mismatch" | "rate_limited";

export type AppError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  operatorVisible: boolean;
  details?: Record<string, string | number | boolean>;
};

export function httpOk<T>(body: T, init?: ResponseInit): Response;
export function httpErr(err: AppError): Response;

export type SgdCents = number & { readonly __brand: "SgdCents" };
export function sgdFromCents(cents: number): SgdCents;
export function sgdFromDecimalString(value: string): SgdCents | null;
export function multiplySgd(unit: SgdCents, quantity: number): SgdCents;
export function sumSgd(values: readonly SgdCents[]): SgdCents;
export function formatSgd(value: SgdCents): string;
```

`sgdFromDecimalString` returns `null` for an unreadable or ambiguous price. It never returns `0` for unknown.

**Revised 2026-10-11:** `import_closed`, `capacity_pressure` and `maintenance_stale` are removed, because no import can be canceled and no import depends on maintenance or a capacity reading.
`forbidden_origin`, `consent_required`, `import_rejected` and the four PYUSD codes are added.
`admission_rejected` carries an `ImportRejection` in `details`.
`import_rejected` carries the specific `BoundedRead`, `PhotoPart` or `NormalizedPhoto` reason in `details.reason`, and `pyusd_unavailable` names its cause there too: `rail_disabled`, `payments_disabled`, a `PyusdIdentity` reason or a `MintEligibility` reason.
Each named test asserts that specific reason, not only the code.
**Added 2026-10-12:** `payments_disabled` is PayPal's refusal while `PAYMENTS_ENABLED` is false; see [Reopening 2026-10-12](#reopening-2026-10-12-paypal-payments-kill-switch).

### Clocks

```ts
export type ClockName =
  | "T_REVIEW" | "T_HANDOFF"
  | "T_LEASE" | "T_MAINT_RUN" | "T_MAINT_INTERVAL" | "T_MAINT_OVERDUE"
  | "T_AI_BUDGET" | "T_PROVIDER_READ_DEBOUNCE"
  | "T_MENU_REQUEST" | "T_MENU_UPLOAD_READ" | "T_MENU_MODEL"
  | "T_WALLET_CHALLENGE" | "T_RATE_AGE"
  | "T_RPC_WINDOW" | "T_RPC_CALL" | "T_RPC_SLOT_LEASE";

export function deadlineOf(clock: ClockName, startedAt: Date): Date;
export function isExpired(clock: ClockName, startedAt: Date, now: Date): boolean;
export function remainingMs(clock: ClockName, startedAt: Date, now: Date): number;
export type Now = () => Date;

export const MENU_COMMIT_RESERVE_MS: 5_000;
export function menuModelBudgetMs(admittedAt: Date, now: Date): number; // min(T_MENU_MODEL, remaining T_MENU_REQUEST - reserve), never below 0
export function utcDayStart(now: Date): Date;                           // admission-day boundary; never the Singapore day
```

`T_DB_IDLE` and `T_RENDER_IDLE` are provider-controlled and deliberately **not** in `ClockName`: no application code may depend on or reset them.
**Revised 2026-10-11:** `T_IMAGE_ACCESS` and `T_SOURCE_SWEEP` are removed.
The PYUSD blockhash bound is a block height, not a time, so it is deliberately not a `ClockName` either.
The model clock carries Gate 2's name, `T_MENU_MODEL`; an earlier draft of this revision called it `T_MENU_MODEL_MAX`, which broke the one-name-per-clock rule.

### SGQR

```ts
export type TlvTag = { tagId: string; length: number; value: string };

export type SgqrDecode =
  | { kind: "not_emvco" }
  | { kind: "decoded"; recognized: SgqrField[]; unrecognized: TlvTag[]; checksumValid: boolean };

export type SupportedScheme = "paynow_uen" | "paynow_proxy";
export type SgqrField = { scheme: SupportedScheme; identifier: string; label: string };

export function decodeEmvcoTlv(payload: string): SgqrDecode;

export type SgqrResolution =
  | { kind: "no_match" }
  | { kind: "single"; outlet: PublishedOutletSummary }
  | { kind: "ambiguous"; candidates: OutletDistinguisher[] }
  | { kind: "unsupported_payload"; unrecognizedCount: number };

export function resolveSgqr(db: Db, decoded: SgqrDecode): Promise<SgqrResolution>;
```

`decodeEmvcoTlv` never invents a field, never drops an unrecognized tag silently, and its input is never logged or persisted. A resolution is identity only: no destination, no rail and no enrollment can be derived from it.

### Menu and imports

```ts
export type MenuItemDraft = {
  id: string;
  name: string;
  portion: string | null;
  priceSgdCents: SgdCents | null;
  availability: "available" | "unavailable" | "unknown";
  source: "merchant" | "import_suggestion";
};

export type MenuCompleteness =
  | { complete: true; itemCount: number }
  | { complete: false; incompleteItemIds: string[]; reason: "missing_price" | "missing_name" | "missing_availability" };

export function assessMenuCompleteness(items: readonly MenuItemDraft[]): MenuCompleteness;

export type DraftMerge =
  | { applied: true; addedItemIds: string[]; preservedMerchantEditIds: string[] }
  | { applied: false; reason: "base_revision_changed" | "confirmed_revision" };

export function mergeImportSuggestions(
  current: readonly MenuItemDraft[],
  suggestions: readonly DraftItemSuggestion[],
  baseRevisionId: string,
  currentRevisionId: string,
): DraftMerge;

export type DraftItemSuggestion = {
  name: string;                      // "" when unreadable; completeness then blocks confirmation
  portion: string | null;
  priceSgdCents: SgdCents | null;
  priceBasis: "explicit" | "ambiguous" | "blank" | "other_currency" | "duplicate_variant";
};
```

The types above are unchanged from 2026-10-07 except `priceBasis`, which gains two values.
**Revised 2026-10-11:** the image admission, source row, Zapier validation and source-deleting close are removed and replaced by the request-memory import below.

```ts
// src/domain/imports/consent.ts
export const MENU_CONSENT_VERSION: string;   // changes whenever the short text or its details change
export const MENU_CONSENT_TEXT: { short: readonly string[]; details: readonly string[] }; // Gate 2 wording, one version for both

// src/domain/imports/types.ts
export const MENU_IMPORT_LIMITS: {
  readonly maxBodyBytes: 2_621_440;    // 2.5 MiB whole multipart body, counted while streaming
  readonly maxPhotoBytes: 2_097_152;   // 2 MiB JPEG part
  readonly maxEdgePixels: 2_048;
  readonly maxRows: 100;
  readonly maxTextChars: 120;          // per name or portion
  readonly maxResultBytes: 131_072;    // 128 KiB serialized validated result
};

export type AdmissionLimits = { outletInFlight: number; globalInFlight: number; outletDaily: number; globalDaily: number };
export const DEFAULT_ADMISSION_LIMITS: AdmissionLimits; // 1, 1, 10, 50; tests inject other values to isolate one guard

export type MenuModelBounds = {
  model: string;                           // must equal AI_MENU_MODEL
  inputUsdMicrosPerMillionTokens: number;
  outputUsdMicrosPerMillionTokens: number;
  maxInputTokens: number;                  // reviewed worst case for one shrunk photo plus the prompt
  maxOutputTokens: number;                 // also sent as the call's maxOutputTokens
};

export const MENU_SPEND_POLICY: {
  readonly dailyCeilingUsdMicros: number | null;    // null until the user records a ceiling; null fails closed
  readonly modelBounds: readonly MenuModelBounds[]; // empty until a vision model is evaluated; no match fails closed
};

export function reserveUsdMicros(bounds: MenuModelBounds): number; // integer ceiling of worst-case input plus output cost

export type ImportRejection =
  | "imports_disabled" | "consent_required"
  | "in_flight_outlet" | "in_flight_global" | "daily_cap_outlet" | "daily_cap_global"
  | "spend_ceiling_unset" | "model_bounds_missing" | "model_bounds_exceeded" | "spend_ceiling_reached";

export type ImportAdmission =
  | { ok: true; importId: string; admittedAt: Date; deadlineAt: Date; reservedUsdMicros: number }
  | { ok: false; reason: ImportRejection };

export function admitMenuImport(db: Db, input: {
  outletId: string;
  actorUserId: string;
  consentVersion: string;      // the route has already checked it equals MENU_CONSENT_VERSION
  baseRevisionId: string;
  model: string;               // AI_MENU_MODEL
  limits: AdmissionLimits;
  policy: typeof MENU_SPEND_POLICY;
  now: Date;
}): Promise<ImportAdmission>;
```

`admitMenuImport` runs in one transaction that first locks the singleton `menu_import_admission` row, so every check sees one consistent view.
In order, it requires: reviewed bounds for `AI_MENU_MODEL` and a recorded ceiling; no attempt of the current model configuration whose actual spend exceeded its reservation; no live attempt for the outlet and none globally, where live means open and before its deadline; fewer admitted attempts in the current UTC day than each daily cap, counting every outcome; and the day's reservations plus the new one within the ceiling.
It then inserts the open row with `deadline_at = now + T_MENU_REQUEST` and the reservation.
**Revised 2026-10-11 after review:** a reservation is held unless its attempt provably never dispatched the model call.
The day's total counts the reservation of every row that records a model dispatch or is still live, and counts zero for a row that is closed or past its deadline with no dispatch mark.
Because `markModelDispatched` commits before the call and writes only while the attempt is open and before its deadline, a row without the mark never reached OpenAI, so `rejected_upload` and `rejected_photo` attempts free their reservation and record zero actual spend.
A reservation whose call was dispatched is never released, even after an abort, because an aborted call may still be billed.
The daily attempt caps still count every admitted attempt, whatever its outcome.
The route checks `MENU_IMPORTS_ENABLED` and the consent version before calling it, and reads no body byte until it succeeds.

```ts
export type ImportOutcome =
  | "in_flight" | "completed" | "conflict_base_revision" | "conflict_confirmed" | "membership_revoked"
  | "rejected_upload" | "rejected_photo" | "model_failed" | "model_timeout" | "output_invalid"
  | "aborted" | "expired";

export type MenuImportRow = {
  id: string; outletId: string; actorUserId: string; baseRevisionId: string;
  consentVersion: string; modelConfigVersion: string;   // hash of model, bounds entry, prompt and schema versions
  admittedAt: Date; deadlineAt: Date; modelDispatchedAt: Date | null; closedAt: Date | null;   // dispatch mark added 2026-10-11 after review
  closedOutcome: Exclude<ImportOutcome, "in_flight" | "expired"> | null;
  reservedUsdMicros: number; actualUsdMicros: number | null;
  inputTokens: number | null; outputTokens: number | null;
  rowsDrafted: number | null; rowsBlankPrice: number | null;
  resultFingerprint: string | null;                     // SHA-256 of the validated result, never of the image
  latencyMs: number | null; peakRssBytes: number | null;
};

export function deriveImportOutcome(row: MenuImportRow, now: Date): ImportOutcome; // pure; open and past deadlineAt reads "expired"

// src/lib/http/bounded-body.ts
export type BoundedRead =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too_large" | "timeout" | "aborted" };
export function readCountedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number, timeoutMs: number, signal: AbortSignal): Promise<BoundedRead>;

// src/domain/imports/upload.ts
export type PhotoPart =
  | { ok: true; jpeg: Uint8Array }
  | { ok: false; reason: "not_multipart" | "part_count" | "missing_photo" | "part_too_large" };
export function parseSinglePhotoPart(bytes: Uint8Array, contentType: string | null): Promise<PhotoPart>;

// src/integrations/image/normalize.ts
export type NormalizedPhoto =
  | { ok: true; jpeg: Uint8Array; width: number; height: number }
  | { ok: false; reason: "not_jpeg" | "too_many_pixels" | "decode_failed" };
export function normalizeMenuJpeg(jpeg: Uint8Array): Promise<NormalizedPhoto>;
```

`readCountedBody` pulls chunks and stops at `maxBytes` or the time bound; it never trusts `Content-Length`.
`parseSinglePhotoPart` parses the counted bytes in memory and accepts exactly one part named `photo`, of at most 2 MiB; the part's declared type is ignored, because only decoded content decides.
`normalizeMenuJpeg` reads the dimensions from the JPEG header before decoding any pixel, refuses anything that is not JPEG or is wider or taller than 2,048 pixels, then decodes once, applies orientation, drops all metadata and re-encodes JPEG without enlarging.
None of the three writes a file.
Consent version and base revision travel in the `Envoi-Consent-Version` and `Envoi-Base-Revision` request headers, so the route can check them before reading the body.

```ts
// src/integrations/ai/menu-vision.ts
export const MENU_VISION_PROMPT_VERSION: string;

export const MenuVisionOutput: z.ZodType<{
  items: Array<{
    name: string | null;
    portion: string | null;
    priceText: string | null;                      // the printed number only, or null when unreadable
    currency: "sgd_or_unmarked" | "other" | null;
  }>;
}>;

export type VisionCall =
  | { kind: "ok"; raw: unknown; inputTokens: number | null; outputTokens: number | null }
  | { kind: "timeout" }
  | { kind: "aborted" }
  | { kind: "provider_error"; error: SafeErrorRecord };

export function draftMenuFromPhoto(input: {
  jpeg: Uint8Array;
  model: string;               // AI_MENU_MODEL, never AI_MODEL
  bounds: MenuModelBounds;
  budgetMs: number;            // menuModelBudgetMs(admittedAt, now)
  signal: AbortSignal;         // the request's signal, so a disconnect aborts the call
}): Promise<VisionCall>;
```

`draftMenuFromPhoto` makes exactly one `generateText` call with `output: Output.object({ schema: MenuVisionOutput })`, because `generateObject` is deprecated in the pinned `ai@7.0.130`.
Its provider options are exactly `{ store: false, strictJsonSchema: true }`; the image part sets `imageDetail: "high"`; `maxRetries` is 0; `maxOutputTokens` comes from the reviewed bounds; and the abort signal combines the request signal with `budgetMs`.
There are no tools, no files API upload, no conversation state and no second attempt.
**[vendor claim]** These option names come from the pinned packages' type definitions, read on 2026-10-11; their behavior on the selected account and model is **[unknown]**.

```ts
// src/domain/imports/validate-result.ts
export type VisionDraftValidation =
  | { ok: true; items: DraftItemSuggestion[]; fingerprint: string; blankPriceCount: number }
  | { ok: false; reason: "malformed" | "empty" | "too_many_rows" | "text_too_long" | "oversize" };

export function validateVisionDraft(raw: unknown): VisionDraftValidation;

// src/domain/imports/lifecycle.ts
export type ImportUsage = { inputTokens: number | null; outputTokens: number | null; latencyMs: number; peakRssBytes: number | null };

export type ImportCommit =
  | { committed: true; merge: Extract<DraftMerge, { applied: true }> }
  | { committed: false; outcome: "expired" | "membership_revoked" | "conflict_base_revision" | "conflict_confirmed" };

export function markModelDispatched(db: Db, importId: string, now: Date): Promise<{ marked: boolean }>; // short committed write before the call; only while open and before deadline_at; false => no call
export function commitImport(db: Db, importId: string, draft: Extract<VisionDraftValidation, { ok: true }>, usage: ImportUsage, now: Date): Promise<ImportCommit>;
export function closeImportFailed(db: Db, importId: string, outcome: "rejected_upload" | "rejected_photo" | "model_failed" | "model_timeout" | "output_invalid" | "aborted", usage: ImportUsage | null, now: Date): Promise<{ closed: boolean }>;
export function recordImportUsage(db: Db, importId: string, usage: ImportUsage): Promise<void>; // never changes an outcome

// src/lib/log.ts
export type SafeErrorRecord = {
  name: string;                // error class name from an allowlist, otherwise "Error"
  status: number | null;       // HTTP status when the error carries one
  retryable: boolean | null;
  provider: "openai" | "paypal" | "solana_rpc" | "internal";
};
export function toSafeErrorRecord(err: unknown, provider: SafeErrorRecord["provider"]): SafeErrorRecord;
```

`validateVisionDraft` rejects the whole result only for malformed or empty output or a broken bound, and drops rows whose fields are all null.
Item problems stay per item: a price that is unreadable, zero, negative, over two decimals or not plain digits stays blank as `ambiguous` or `blank`; a price marked in another currency stays blank as `other_currency`; and two rows with the same name and portion both keep blank prices as `duplicate_variant`, so the merchant resolves them.
**Changed from the 2026-10-07 Zapier contract,** which rejected the whole result for a duplicate variant or a non-SGD price.
`commitImport` locks the attempt and the draft revision, writes only while the attempt is open and `now < deadline_at`, requires the actor to still hold the outlet's membership and the base revision to be current and unconfirmed, then merges, closes the attempt and audits in one transaction.
The membership recheck, restored on 2026-10-11 after review, is the one Gate 2 flow step 5 names: "attempt/deadline/membership/base revision".
A late, unauthorized or conflicting commit merges nothing; a revoked membership closes the attempt `membership_revoked` and answers `forbidden_membership`.
`closeImportFailed` is best effort: if it cannot write, the attempt still reads as expired after its deadline.
`toSafeErrorRecord` never reads `message`, `cause`, `url`, `requestBodyValues`, `responseHeaders`, `responseBody` or `data`, which is where the AI SDK can carry the base64 photo, and the logger accepts only this record for errors.

### Checkout identity

```ts
export type RailId = "paypal" | "pyusd";
export type PurchaseLine = { menuItemId: string; quantity: number };

export type CheckoutKeyInput = {
  buyerUserId: string;
  outletId: string;
  menuRevisionId: string;
  destinationId: string;
  rail: RailId;
  currency: "SGD";
  lines: readonly PurchaseLine[];
  pyusdRateVersionId: string | null;   // added 2026-10-11: required for "pyusd", null for "paypal"
};

export type CheckoutKey = string & { readonly __brand: "CheckoutKey" };
export function computeCheckoutKey(input: CheckoutKeyInput): CheckoutKey;

// added 2026-10-11; trigger revised after review the same day
export type BasketLockKey = string & { readonly __brand: "BasketLockKey" };
export function computeBasketLockKey(input: { buyerUserId: string; outletId: string; lines: readonly PurchaseLine[] }): BasketLockKey;

export type BasketLockReason =
  | "paypal_capture_in_flight"   // a PayPal attempt in capture_dispatched or capture_unknown
  | "paypal_review_window"       // a PayPal attempt in created, create_unknown, order_created or externally_approved while its review is inside T_REVIEW
  | "pyusd_attempt_open"         // a PYUSD attempt in any state other than confirmed or closed_unpaid
  | "purchase_uncertain";        // a purchase in uncertain

export type PurchaseLockView = {
  purchaseState: PurchaseState;
  reviewExpiresAt: Date;
  paypalAttempt: AttemptState | null;
  pyusdAttempt: PyusdAttemptState | null;
};

export function moneyCanStillMove(view: PurchaseLockView, now: Date): BasketLockReason | null; // pure; derived on read
export function findBasketLock(db: Db, input: {
  key: BasketLockKey;
  exceptPurchaseId: string | null;     // the purchase being started is not its own lock
  lockRows: boolean;                   // true inside an execution start: FOR UPDATE on every same-key purchase of the buyer, in id order
  now: Date;
}): Promise<{ purchaseId: string; reason: BasketLockReason } | null>;
```

`computeCheckoutKey` sorts lines by `menuItemId`, rejects a quantity outside `1..20`, and hashes the canonical JSON with SHA-256. Two requests that differ in any priced or routed input produce different keys, which is the point: a changed menu revision is a different checkout, never a mutated one.
Since 2026-10-11 the PYUSD rate version is one of those priced inputs.

`computeBasketLockKey` deliberately leaves out the rail, destination, menu revision and rate.
**Revised 2026-10-11 after review:** the lock holds exactly while money can still move for a purchase with the same key, and `moneyCanStillMove` derives that on every read, with no stored lock and no maintenance dependency.
Money can still move while a PayPal attempt is in `capture_dispatched` or `capture_unknown`; while a PayPal attempt is in `created`, `create_unknown`, `order_created` or `externally_approved` and its review is still inside `T_REVIEW`; while a PYUSD attempt is in any state other than `confirmed` or `closed_unpaid`; and while the purchase is `uncertain`.
A PayPal attempt that never dispatched a capture stops locking when `T_REVIEW` passes, because capture is dispatched only by a compare-and-set that requires the review deadline to be in the future, so after that moment no capture can ever be sent for it.
The earlier draft locked on any `pending_payment` purchase, which a PayPal buyer enters at order creation, before money can move, and so locked a basket forever after an abandoned approval.
`createReview` refuses `execution_locked` while `findBasketLock` finds a lock, on either rail.
Both execution starts, `paypal/start` and the second `pyusd/prepare` transaction, call it again with `lockRows: true`, so two reviews of one basket that were opened before either started cannot both start payment.
This makes Gate 2's "no new attempt or rail switch while an external effect is possible" enforceable now that a second rail exists.
The lock is per buyer session, so it cannot stop the Phantom-browser path, which starts a new anonymous session, from paying a basket already paid in another browser.

### Purchases, attempts and provider decisions

```ts
export type PurchaseState =
  | "review_open" | "review_expired" | "review_invalidated" | "superseded"
  | "pending_payment" | "paid" | "unpaid_closed" | "uncertain";

export type AttemptState =
  | "created" | "order_created" | "externally_approved"
  | "capture_dispatched" | "capture_confirmed" | "capture_failed"
  | "create_unknown" | "capture_unknown" | "abandoned";

export type PurchaseTransition = { from: PurchaseState; to: PurchaseState; reason: string };
export function canTransitionPurchase(t: PurchaseTransition): boolean;
export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean;

// added 2026-10-11 after review: PayPal abandonment is derived on read
export type PurchaseView = { state: PurchaseState; paypalAttempt: AttemptState | null; pyusdAttempt: PyusdAttemptState | null; lock: BasketLockReason | null;
  extraTransfers: readonly ExtraTransfer[] };   // fix M: shown beside a paid state, never changing it
export function derivePurchaseView(purchase: PurchaseRow, attempt: PaymentAttemptRow | PyusdAttempt | null, now: Date): PurchaseView; // pure
export function applyDerivedTransitions(db: Db, purchaseId: string, now: Date): Promise<void>; // next touch: stores what the view reads, by compare-and-set

export type PricedLine = { menuItemId: string; name: string; quantity: number; unitSgdCents: SgdCents; lineSgdCents: SgdCents };

export type CostProvenance = {
  payerFee: { amountSgdCents: SgdCents | null; payer: "buyer" | "merchant" | "unknown"; basis: string; quotedAt: Date | null };
  merchantFee: { amountSgdCents: SgdCents | null; basis: string };
  fx: { known: false };
};

export type PyusdQuote = { rateVersionId: string; atomicPerSgd: bigint; rateConfirmedAt: Date; atomicAmount: bigint; basis: "merchant_rate" }; // added 2026-10-11

export type PriceQuote =
  | { ok: true; lines: PricedLine[]; totalSgdCents: SgdCents; currency: "SGD"; menuRevisionId: string; destinationId: string; provenance: CostProvenance; pricedAt: Date; pyusd: PyusdQuote | null }
  | { ok: false; error: AppError };

export function priceBasket(db: Db, input: {
  outletId: string;
  lines: readonly PurchaseLine[];
  rail: RailId;
  now: Date;
}): Promise<PriceQuote>;

export type ReviewCreation =
  | { kind: "created"; purchaseId: string; expiresAt: Date }
  | { kind: "existing_open_review"; purchaseId: string; expiresAt: Date }
  | { kind: "conflict"; error: AppError };

export function createReview(db: Db, principal: BuyerPrincipal, quote: PriceQuote & { ok: true }, now: Date): Promise<ReviewCreation>;

export type PaymentEligibility =
  | { eligible: true; purchaseId: string; attemptId: string }
  | { eligible: false; error: AppError };

export function assertPaymentEligible(db: Db, purchaseId: string, principal: BuyerPrincipal, now: Date): Promise<PaymentEligibility>;

export type ExpectedPurchase = {
  purchaseId: string;
  outletId: string;
  payeeId: string;
  totalSgdCents: SgdCents;
  currency: "SGD";
  lines: readonly PricedLine[];
  correlationId: string;
};

export type CaptureDecision =
  | { decision: "confirmed"; evidence: CaptureEvidence }
  | { decision: "uncertain"; reason: "missing_capture_id" | "amount_mismatch" | "payee_mismatch" | "currency_mismatch" | "basket_mismatch" | "status_not_complete" }
  | { decision: "failed"; reason: string };

export type CaptureEvidence = {
  orderId: string;
  captureId: string;
  grossSgdCents: SgdCents;
  currency: "SGD";
  payeeId: string;
  verifiedAt: Date;
};

export function decideCaptureOutcome(order: PayPalOrder, expected: ExpectedPurchase): CaptureDecision;
export function decideCreateRecovery(attempt: PaymentAttemptRow, now: Date): "replay_same_key" | "safe_to_recreate" | "block_uncertain";
```

`decideCreateRecovery` encodes the argument that makes a lost create safe: capture requires an order id Envoi never received, and the buyer never received an approval link, so no external effect is possible. It returns `safe_to_recreate` only when the attempt has never held an order id.

**Added 2026-10-11 after review.**
`derivePurchaseView` reads a PayPal attempt in `created`, `create_unknown`, `order_created` or `externally_approved` whose review has passed `T_REVIEW` as `abandoned`, and its `pending_payment` purchase as `unpaid_closed`.
That is safe because no capture was dispatched and none can be any more, so the approval at PayPal can never move money; Gate 2 already forbids capturing an order the buyer abandoned.
`applyDerivedTransitions` stores those two transitions at the next touch: any route that loads the purchase, the basket-lock lookup, and maintenance's best-effort `close_expired_reviews`.
No buyer-visible state and no lock decision waits for that write, so neither the six-hourly cadence nor the unauthorized maintenance workflow can strand a basket.
`capture_dispatched` and `capture_unknown` never read as abandoned.

**Added 2026-10-11.**
For `rail: "pyusd"`, `priceBasket` requires `PYUSD_ENABLED`, a PYUSD destination with verified key control, and a shop rate not past `T_RATE_AGE`; it fills `PyusdQuote` with `pyusdAtomicFor`.
`CostProvenance.fx` stays `{ known: false }`, because the shop's own rate is not a market quote.
`assertPaymentEligible` additionally rechecks, for PYUSD, that the review's rate version is still the shop's current version and is not past `T_RATE_AGE`, that `PAYMENTS_ENABLED` is true, and that no other attempt exists for the purchase.
`PYUSD_ENABLED` is checked only by `requirePyusdEnabled`, so each flag has exactly one deciding check per call site.
**Added 2026-10-12:** for PayPal, `assertPaymentEligible` also requires `PAYMENTS_ENABLED` and otherwise answers `payments_disabled`, so `PAYMENTS_ENABLED` too has its one deciding check there, on both rails.

### PayPal clients

```ts
export type PayPalWriteClient = {
  createOrder(input: CreateOrderInput, requestId: string): Promise<ProviderResult<CreatedOrder>>;
  readOrder(orderId: string): Promise<ProviderResult<PayPalOrder>>;
  captureOrder(orderId: string, requestId: string): Promise<ProviderResult<CapturedOrder>>;
};

export type PayPalReadClient = Pick<PayPalWriteClient, "readOrder">;

export function createPayPalWriteClient(cfg: PayPalConfig): PayPalWriteClient;
export function createPayPalReadClient(cfg: PayPalConfig): PayPalReadClient;

export type ProviderResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "http_error"; status: number; retryable: boolean }
  | { kind: "network_error"; retryable: true }
  | { kind: "timeout"; responseReceived: false };

export function verifyPayPalWebhookEvent(cfg: PayPalConfig, req: Request): Promise<
  { verified: true; eventId: string; resourceType: string; knownOrderId: string | null } | { verified: false; reason: string }
>;
```

`PayPalReadClient` is a distinct exported type, not a runtime flag. Maintenance code cannot call `captureOrder` without changing an import that a CI test detects.

### PYUSD (added 2026-10-11)

```ts
// src/domain/pyusd/constants.ts; reviewed code constants, never environment values
export const PYUSD_DEVNET: {
  readonly chain: "solana:devnet";
  readonly genesisHash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  readonly mint: "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM";
  readonly tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";   // Token-2022
  readonly decimals: 6;
  readonly memoProgram: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";    // non-upgradeable memo program
  readonly computeBudgetProgram: "ComputeBudget111111111111111111111111111111";
  readonly lighthouseProgram: "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
  readonly lighthouseAssertionDiscriminators: readonly number[];          // 2..17 at Lighthouse commit 4c57947; 0 and 1 are memory instructions
  readonly reviewedMintExtensions: readonly string[];                     // exactly the eight observed on 2026-10-10
  readonly innerToken2022Allowed: readonly ("GetAccountDataSize" | "AmountToUiAmount" | "UiAmountToAmount")[];
};

export const PYUSD_PROOFS: {
  readonly automaticUnpaidRelease: false;   // set true only by a reviewed change after the wallet blockhash-preservation and history-coverage proofs are recorded in 00-status.md
};

// src/integrations/solana/rpc.ts; read-only by construction
export type RpcResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "rate_limited" } | { kind: "unavailable" } | { kind: "too_large" } | { kind: "local_budget_exhausted" };

export type SolanaReadClient = {
  getGenesisHash(): Promise<RpcResult<string>>;
  getAccounts(addresses: readonly Address[], commitment: "confirmed" | "finalized"): Promise<RpcResult<(EncodedAccount | null)[]>>;
  getLatestBlockhashConfirmed(): Promise<RpcResult<{ blockhash: string; lastValidBlockHeight: bigint; slot: bigint }>>;
  getBlockHeight(commitment: "confirmed" | "finalized"): Promise<RpcResult<bigint>>;
  getEpochInfo(): Promise<RpcResult<{ epoch: bigint; absoluteSlot: bigint }>>;
  getEpochSchedule(): Promise<RpcResult<EpochSchedule>>;
  getTransactionFinalized(signature: string): Promise<RpcResult<LandedTransaction | null>>;
  getSignaturesFinalized(address: Address, before: string | null, limit: 1000): Promise<RpcResult<SignatureEntry[]>>;
};
export function createSolanaReadClient(cfg: { rpcUrl: string }, limiter: RpcLimiter): SolanaReadClient;

// src/integrations/solana/limiter.ts
export const RPC_BUDGET: {
  readonly windowMs: 10_000; readonly globalPerWindow: 20; readonly perMethodPerWindow: 10;
  readonly maxConcurrent: 2; readonly callTimeoutMs: 10_000; readonly slotLeaseMs: 15_000;
  readonly maxResponseBytes: 1_048_576; readonly backoffBaseMs: 1_000; readonly backoffMaxMs: 30_000;
};
export type RpcLimiter = {
  acquire(method: string): Promise<{ ok: true; release(): Promise<void> } | { ok: false; retryAfterMs: number }>;
  reportRateLimited(): Promise<void>;   // sets a shared backoff with full jitter
};
export function createDatabaseRpcLimiter(db: Db, now: Now): RpcLimiter;

// src/domain/pyusd/identity.ts, mint.ts
export type PyusdIdentity =
  | { ok: true; epoch: bigint }
  | { ok: false; reason: "rpc_unconfigured" | "rpc_unavailable" | "genesis_mismatch" | "mint_program_mismatch" | "mint_decimals_mismatch" };
export function checkPyusdIdentity(rpc: SolanaReadClient | null): Promise<PyusdIdentity>; // genesis, mint owner program and decimals only; the enable flag is checked separately, so recovery still runs while new actions are off
export function requirePyusdEnabled(env: Env): AppError | null;                       // PYUSD_ENABLED; guards PYUSD pricing, challenge, proof, rate and preparation only

export type FeeSchedule = { epoch: bigint; basisPoints: number; maximumFee: bigint };
export type FeeEvidence = { preparedEpoch: bigint; older: FeeSchedule; newer: FeeSchedule };
export type MintEligibility =
  | { ok: true; fee: FeeEvidence }
  | { ok: false; reason: "fee_rate_nonzero" | "max_fee_nonzero" | "fee_next_epoch_nonzero" | "transfer_hook_active" | "unreviewed_extension" | "mint_unreadable" };
export function assessMintForTransfer(mint: DecodedMint, currentEpoch: bigint): MintEligibility;
export function feeAtEpoch(fee: Pick<FeeEvidence, "older" | "newer">, epoch: bigint): FeeSchedule;

export type TokenAccountCheck =
  | { ok: true; address: Address; amount: bigint }
  | { ok: false; reason: "missing" | "not_token_2022_account" | "frozen" };
export function checkPyusdTokenAccount(rpc: SolanaReadClient, owner: Address): Promise<TokenAccountCheck>; // derives the associated account; never takes an address from input

// src/domain/pyusd/rate.ts
export const PYUSD_RATE_BOUNDS: { readonly minAtomicPerSgd: 1n; readonly maxAtomicPerSgd: 10_000_000n }; // 0.000001 to 10 PYUSD per S$1
export type PyusdRate = { versionId: string; outletId: string; atomicPerSgd: bigint; confirmedAt: Date };
export function parsePyusdPerSgd(text: string): { ok: true; atomicPerSgd: bigint } | { ok: false; reason: "not_plain_six_place_decimal" | "out_of_bounds" }; // one strict pattern, then bounds; never Number()
export function isRateExpired(rate: PyusdRate, now: Date): boolean;           // now >= confirmedAt + T_RATE_AGE
export function pyusdAtomicFor(sgdCents: SgdCents, atomicPerSgd: bigint): bigint; // ceil(cents * rate / 100) in BigInt only
export function formatPyusdPerSgd(atomicPerSgd: bigint): string;              // exact six-decimal string, no float

// src/domain/pyusd/challenge.ts
export type WalletChallenge = {
  id: string; outletId: string; memberUserId: string; wallet: Address;
  message: Uint8Array;               // exact UTF-8 bytes the wallet signs; saved verbatim
  nonceHash: string; issuedAt: Date; expiresAt: Date; consumedAt: Date | null;
};
export function buildChallengeMessage(input: { domain: string; uri: string; wallet: Address; outletId: string; nonce: string; issuedAt: Date; expiresAt: Date }): Uint8Array;
export function issueWalletChallenge(db: Db, principal: MerchantPrincipal, outletId: string, wallet: Address, now: Date): Promise<{ challengeId: string; message: Uint8Array; expiresAt: Date } | { error: AppError }>;

export type WalletProof =
  | { ok: true; destinationId: string }
  | { ok: false; reason: "challenge_unknown" | "challenge_expired" | "challenge_used" | "challenge_other_outlet" | "signature_invalid" | "token_account_missing" | "token_account_not_token_2022" | "token_account_frozen" | "rail_unavailable" };
export function verifyWalletProof(db: Db, rpc: SolanaReadClient, principal: MerchantPrincipal, outletId: string, input: { challengeId: string; signature: Uint8Array }, now: Date): Promise<WalletProof>;
```

The challenge follows the SIWS message fields: domain and URI from `APP_BASE_URL`, the wallet address, a statement naming the destination-enrollment purpose and the outlet, `Version: 1`, `Chain ID: devnet`, a 128-bit nonce, `Issued At`, `Expiration Time` at `T_WALLET_CHALLENGE`, and resources repeating the purpose and outlet.
The browser has the wallet sign these exact bytes with `solana:signMessage`; `solana:signIn` is not used, because the wallet would build its own text.
The proof request carries no wallet address and no token account: the key comes from the saved challenge, and the receiving account is derived.
A verified proof records key control only.
The destination counts as active for publication and payment only while `PYUSD_ENABLED` is true and the outlet's operator-approved enrollment exists.

```ts
// src/domain/pyusd/attempts.ts, state.ts
export type PyusdAttemptState =
  | "prepared"            // saved and locked; unsigned bytes may have left
  | "confirmed"           // a finalized transfer passed verification and is bound
  | "mismatch"            // a successful finalized transaction carrying this reference failed verification; only an audited operator resolution ends it
  | "expired_scanning"    // finalized height passed lastValidBlockHeight; history scan in progress
  | "held_no_match"       // complete scan found nothing, but automatic unpaid release is not enabled
  | "closed_unpaid";      // complete scan found nothing and release is enabled; terminal unpaid

export type ScanCoverage = {
  startedAtFinalizedHeight: bigint;
  newestSignature: string | null;         // top boundary, fixed when the scan starts after expiry
  beforeCursor: string | null;            // resume point; advances only after every candidate on its page is decided
  reachedBeforePreparation: boolean;      // a fully processed page held a signature older than preparationSlot
  pagesRead: number;
  candidatesChecked: number;
  lastGap: "rate_limited" | "null_transaction" | "rpc_unavailable" | "too_large" | "page_cap" | "identity_changed" | null;
  pendingMismatch: ExtraTransfer | null;  // reopened 2026-10-18: the oldest ours-successful-failing candidate seen while nothing is bound; decides mismatch only if the complete scan binds nothing
};

export const PYUSD_HINT_CAP: 3;   // signature hints stored per attempt; later ones are audited only (added 2026-10-11 after review)
export type SignatureHint = {
  signature: string; receivedAt: Date;
  decision: "unread" | "not_found" | "not_ours" | "failed_landing" | "confirmed" | "uncertain";
};

export type PyusdAttempt = {
  id: string; purchaseId: string; state: PyusdAttemptState;
  buyerWallet: Address; sourceTokenAccount: Address; destinationTokenAccount: Address;
  atomicAmount: bigint; rateVersionId: string;
  reference: string;                      // 128-bit random, base58; the only memo content
  messageFingerprint: string;             // SHA-256 of the compiled message; evidence, not a matching rule; fix L: the bytes themselves are never stored
  blockhash: string; lastValidBlockHeight: bigint; preparationSlot: bigint;
  fee: FeeEvidence;
  hints: readonly SignatureHint[];        // at most PYUSD_HINT_CAP, appended by compare-and-set on the count
  finalizedSignature: string | null;
  scan: ScanCoverage | null;              // one window scan per attempt after expiry, whatever its state (fix M)
  extraTransfers: readonly ExtraTransfer[];
  nextCheckAt: Date; leaseExpiresAt: Date | null;
};

// fix M, added 2026-10-11 after Gate 2 was reopened; rows of pyusd_extra_transfers, UNIQUE (attempt_id, signature)
export type ExtraTransfer = {
  signature: string; slot: bigint;
  destinationDelta: bigint | null;        // from transaction metadata; null when the metadata is incomplete
  verification: "verified" | VerificationFailure;
  foundAt: Date;
  refundReference: string | null;         // recorded out of band by the operator act of delta D1; changes no payment state
};

export type Preparation =
  | { kind: "prepared"; attemptId: string; transactionBase64: string; chain: "solana:devnet" }   // the only response that carries bytes, sent once
  | { kind: "locked"; attemptId: string; state: PyusdAttemptState }
  | { kind: "refused"; error: AppError };

export function preparePyusdPayment(db: Db, rpc: SolanaReadClient, principal: BuyerPrincipal, purchaseId: string, buyerWallet: Address, now: Date): Promise<Preparation>;
export function canTransitionPyusdAttempt(from: PyusdAttemptState, to: PyusdAttemptState): boolean;

// src/integrations/solana/build.ts
export function buildUnsignedTransfer(input: {
  buyerWallet: Address; source: Address; destination: Address;
  atomicAmount: bigint; reference: string;
  blockhash: { blockhash: string; lastValidBlockHeight: bigint };
}): { wireBase64: string; messageFingerprint: string };
```

`buildUnsignedTransfer` compiles a version 0 message with no address lookup tables and the buyer as fee payer.
Its instructions are, in order, one memo carrying only the reference under the pinned memo program and one Token-2022 `TransferChecked` from the buyer's associated account to the merchant's, with the buyer as authority, the exact amount and 6 decimals.
It adds no compute-budget, account-creation, authority, delegate or durable-nonce instruction, and leaves the signature slot empty.
The memo comes first so a merchant account that requires incoming memos still accepts the transfer.
**Revised 2026-10-11 when Gate 2 was reopened (fix L):** the bytes leave the server once, in the response to the call that saved the attempt, and are never stored.
For a purchase that already has an attempt, `preparePyusdPayment` returns `locked` with the attempt's state, for any wallet, and never the bytes, a refreshed blockhash or a second transaction.
The earlier rule returned the saved bytes again while they were valid, on the reasoning that the same bytes cannot make a second transfer; that holds only for a wallet that signs the same message the same way, and Phantom documents adding priority-fee and Lighthouse instructions when it signs, which **[hypothesis]** can differ between two signings.
A lost response therefore leaves the attempt locked until its window is scanned, and the buyer sees "checking payment".
**Revised 2026-10-11 after review:** no PYUSD RPC read runs inside a database transaction.
Preparation reads every chain fact first and only then opens the one short transaction that locks, rechecks and inserts.

```ts
// src/domain/pyusd/verify.ts; pure, no RPC
export type TokenBalance = { accountIndex: number; mint: string; owner: string | null; programId: string | null; amount: bigint };
export type CompiledInstruction = { programIndex: number; accountIndexes: readonly number[]; data: Uint8Array };

export type LandedTransaction = {
  signature: string; slot: bigint; version: "legacy" | 0 | "unsupported";
  numRequiredSignatures: number;
  accountKeys: readonly Address[] | null;            // static keys, then loaded writable and readonly; null when unresolvable
  recentBlockhash: string;
  outer: readonly CompiledInstruction[];
  inner: readonly CompiledInstruction[] | null;      // null when metadata omits inner instructions
  meta: { err: unknown | null; preTokenBalances: TokenBalance[] | null; postTokenBalances: TokenBalance[] | null } | null;
};

export type VerificationFailure =
  | "metadata_incomplete" | "account_keys_unresolved"
  | "blockhash_mismatch" | "extra_signer" | "fee_payer_mismatch"
  | "transfer_count" | "mint_mismatch" | "decimals_mismatch" | "source_mismatch" | "destination_mismatch" | "amount_mismatch"
  | "memo_count" | "fee_nonzero_at_execution" | "balance_delta_mismatch"
  | "outer_instruction_not_allowlisted" | "lighthouse_not_assertion"
  | "inner_program_not_allowlisted" | "inner_instruction_not_allowlisted";

export type VerificationResult =
  | { decision: "confirmed"; evidence: PyusdEvidence }
  | { decision: "not_ours" }            // no pinned-memo instruction whose data equals this attempt's reference
  | { decision: "failed_landing" }      // ours, executed with an error: no transfer happened under this signature
  | { decision: "uncertain"; reason: VerificationFailure };

export type PyusdEvidence = { signature: string; slot: bigint; atomicAmount: bigint; destinationTokenAccount: Address; verifiedAt: Date };

export function verifyPyusdTransfer(tx: LandedTransaction, attempt: PyusdAttempt, feeAtExecution: FeeSchedule, now: Date): VerificationResult;
```

`verifyPyusdTransfer` first decides whether the transaction is ours (a pinned-memo instruction whose data equals the reference), then requires complete metadata and resolvable keys, then treats an execution error as `failed_landing`.
Only after that does it apply every meaning rule from Gate 2: the saved blockhash; one required signature, held by the buyer as fee payer; exactly one Token-2022 `TransferChecked` whose mint account equals the pinned mint, whose decimals byte equals 6, and which moves the exact amount from the saved source to the saved destination; exactly one memo; zero fee in the execution epoch; a destination balance delta in the metadata equal to the amount; every other outer instruction a ComputeBudget instruction or a Lighthouse instruction whose first data byte is an assertion discriminator; and inner instructions only from the Token-2022, memo, ComputeBudget and Lighthouse programs, with Token-2022 inner kinds limited to the three read-only ones and Lighthouse inner kinds to assertions.
**Restored 2026-10-11 after review:** the mint and decimals checks are explicit, as Gate 2 step 5 requires ("with the pinned program/mint/decimals").
Token-2022 would also fail a `TransferChecked` whose mint or decimals disagree with the accounts, but verification does not rely on that.

```ts
// src/domain/pyusd/recovery.ts; pure, no RPC
export type SignatureEntry = { signature: string; slot: bigint; failed: boolean };

export type RecoveryStep =
  | { action: "verify_hints_then_wait" }
  | { action: "start_scan" }
  | { action: "continue_scan"; before: string | null }
  | { action: "close_unpaid" }
  | { action: "hold"; reason: "automatic_release_not_enabled" }
  | { action: "mark_mismatch" }          // reopened 2026-10-18: complete scan, nothing bound, a pending mismatch candidate
  | { action: "operator"; reason: "mismatch" }
  | { action: "done" };                  // fix M: the window scan is complete and the state needs nothing more

export type CandidateOutcome =          // fix M
  | { kind: "bind"; evidence: PyusdEvidence }                // nothing bound yet, and this one verifies
  | { kind: "mismatch"; transfer: ExtraTransfer }            // nothing bound yet, ours, successful, fails verification; held as pendingMismatch until the scan completes (reopened 2026-10-18)
  | { kind: "extra"; transfer: ExtraTransfer }               // ours and successful, while another landing is bound or in mismatch
  | { kind: "skip" };                                        // not ours, a failed landing, or the bound signature itself

export function decideRecoveryStep(attempt: PyusdAttempt, finalizedBlockHeight: bigint, proofs: typeof PYUSD_PROOFS): RecoveryStep;
export function classifyScanCandidate(attempt: PyusdAttempt, tx: LandedTransaction, result: VerificationResult, now: Date): CandidateOutcome;
export function applyScanOutcome(db: Db, attemptId: string, outcome: CandidateOutcome, now: Date): Promise<void>; // compare-and-set; an extra never changes the purchase
export function applyScanPage(coverage: ScanCoverage, page: readonly SignatureEntry[], preparationSlot: bigint): { candidates: string[]; pageReachesBeforePreparation: boolean; lastSignature: string | null };
export function isScanComplete(coverage: ScanCoverage): boolean; // reachedBeforePreparation, which only a fully decided page can set
```

A scan starts only after the finalized block height exceeds `lastValidBlockHeight`, so its fixed top boundary covers every slot in which the transaction could have landed.
**Revised 2026-10-11 when Gate 2 was reopened (fix M):** every released attempt gets this window scan, including one already `confirmed` by a hint or in `mismatch`, and a scan does not stop when a candidate binds.
`classifyScanCandidate` binds the first verifying landing when nothing is bound, and records every other successful landing that carries the reference as an extra transfer, whether or not it verifies.
**Revised 2026-10-18 ([reopening](#reopening-2026-10-18-a-verifying-landing-wins-the-window-scan)):** the history is read newest first, so "first" means the first one the scan reaches, and a failing landing never decides the attempt while a verifying one may still be found.
While nothing is bound and the attempt is `expired_scanning`, a `mismatch` outcome is held as the coverage's `pendingMismatch` (the oldest one; any newer one is recorded as an extra transfer); a later `bind` turns the pending candidate into an extra transfer, and only a complete scan that bound nothing moves the attempt to `mismatch`, through `mark_mismatch`.
An extra transfer never changes the attempt or purchase state or the bound evidence; the receipt, the merchant's order view and the operator health view show it, and any refund is arranged outside Envoi.
Because the window is fixed when the scan starts, the check ends; a transfer built later from a new blockhash with the same memo text is not Envoi's released transaction and is not watched.
Candidates are all successful signatures at or after `preparationSlot`; a failed transaction moves no tokens, so it can be skipped.
The RPC's memo summary is deliberately not used as a filter: a transfer that landed with an unexpected extra memo could be summarized without the reference and skipped, and closing that attempt unpaid would invite a second payment.
A page counts toward coverage only when every candidate on it is decided; any gap leaves the cursor where it was.
A devnet reset or a changed mint, detected as a genesis, mint-owner or decimals mismatch, stops every scan with `identity_changed`; an unreachable RPC records `rpc_unavailable` instead.
Lighthouse is not part of this check: a transaction using a missing program fails and is never paid, so its absence cannot make a payment look valid, and Gate 2's enable condition is genesis, mint owner and decimals only.
The one-off read-only Lighthouse recheck that Gate 2 assigned to Gate 3 is recorded in [`research.md`](research.md#gate-3-revision-reads-2026-10-11).

### Suggestions and handoffs

```ts
export type SuggestionRequest = { text: string; area?: string };

export type Suggestion =
  | { kind: "outlets"; matches: PublishedOutletSummary[] }
  | { kind: "items"; outletId: string; matches: PublishedItemSummary[] }
  | { kind: "clarification"; question: string; missing: ("area" | "item" | "outlet")[] }
  | { kind: "no_match" }
  | { kind: "budget_exceeded" };

export function suggestFromText(db: Db, principal: BuyerPrincipal, req: SuggestionRequest, now: Date): Promise<Suggestion>;
```

Tools exposed to the model are read-only: `search_outlets`, `get_published_menu`, `list_item_names`. At most three tool calls, `T_AI_BUDGET` of 30 seconds, and no tool returns a price that the purchase path will trust. Pricing always re-reads the confirmed revision server-side.

```ts
export type HandoffCreation = { handoffToken: string; url: string; expiresAt: Date };
export function createPurchaseRequest(db: Db, agent: AgentPrincipal, input: SuggestionRequest & { lines?: PurchaseLine[] }): Promise<HandoffCreation>;

export type HandoffRedemption =
  | { kind: "redeemed"; purchaseId: string }
  | { kind: "expired" } | { kind: "already_redeemed" } | { kind: "invalid" };
export function redeemPurchaseRequest(db: Db, principal: BuyerPrincipal, token: string, now: Date): Promise<HandoffRedemption>;
```

Redemption creates a fresh server-priced review. It never carries an amount from the agent.

### Maintenance

```ts
export type TaskName =
  | "heartbeat" | "record_capacity"
  | "reconcile_attempts" | "reconcile_pyusd_attempts"
  | "close_expired_reviews" | "purge_expired_sessions";

export type ClaimedWork = { id: string; kind: TaskName; dueAt: Date };

export type TaskOutcome =
  | { status: "ok"; processed: number }
  | { status: "partial"; processed: number; blockedReason: string }
  | { status: "failed"; reason: string; operatorVisible: true };

export type MaintenanceTask = {
  name: TaskName;
  timeoutMs: number;
  claim(db: Db, now: Date, limit: number): Promise<ClaimedWork[]>;
  run(db: Db, work: ClaimedWork, deps: MaintenanceDeps): Promise<TaskOutcome>;
};

export type MaintenanceDeps = { paypal: PayPalReadClient; solana: SolanaReadClient | null; now: Now; log: RedactingLogger };
export const MAINTENANCE_TASKS: readonly MaintenanceTask[];
export async function runMaintenance(deps: MaintenanceDeps): Promise<MaintenanceReport>;
```

`MaintenanceDeps` has no write client. That is the whole enforcement argument for finding 6, and `MAINTENANCE_TASKS` is exhaustive: adding a task requires editing this file, which the review diff makes visible.
**Revised 2026-10-11:** `expire_imports` and `sweep_sources` are removed, because no image or import task exists.
`reconcile_pyusd_attempts` is added; it receives `SolanaReadClient`, which has no send, airdrop or signing method, and is `null` when `SOLANA_RPC_URL` is unset.
`reconcile_attempts` stays PayPal-only, and its module imports nothing from Solana.

## Named clocks

One name per clock. Every other document must use these names.

| Clock | Starts at | Duration | Enforced by | On expiry |
| --- | --- | --- | --- | --- |
| `T_REVIEW` | review creation | 5 minutes | read, `paypal/start`, `paypal/complete`, and since 2026-10-11 `pyusd/prepare`, the capture-dispatch compare-and-set and the basket lock, all derived on read | purchase becomes `review_expired`. Not proof a dispatched payment failed. Since 2026-10-11 a PayPal attempt that never dispatched a capture reads `abandoned` and its purchase `unpaid_closed`, and stops locking its basket. Once a PYUSD attempt is prepared, `T_REVIEW` no longer applies to it. |
| `T_MAINT_OVERDUE` | last successful heartbeat | 90 minutes | operator health view (revised 2026-10-11) | operator alert only; no import or payment admission depends on it |
| `T_MENU_REQUEST` | import admission | 90 seconds | `commitImport` writes only while `now < deadline_at`; readers use `deriveImportOutcome` | late result merged nowhere; the attempt reads as expired with no write and no task |
| `T_MENU_UPLOAD_READ` | import admission | 30 seconds, never past `T_MENU_REQUEST` | `readCountedBody` | upload aborted; attempt closes `rejected_upload` |
| `T_MENU_MODEL` | model call start | at most 60 seconds, and never more than the remaining `T_MENU_REQUEST` minus the 5-second commit reserve | abort signal on the one vision call | `model_timeout`; abort is not proof OpenAI stopped processing or billing |
| `T_WALLET_CHALLENGE` | challenge issue | 5 minutes | proof transaction | challenge unusable; request a new one |
| `T_RATE_AGE` | rate confirmation | 30 days | PYUSD pricing and preparation, computed on read | PYUSD unavailable at that shop; open PYUSD reviews cannot prepare; prepared attempts unaffected |
| `T_RPC_WINDOW` | limiter window start | 10 seconds | shared database RPC limiter | budget refills |
| `T_RPC_CALL` | RPC request start | 10 seconds | bounded RPC transport | call counts as unavailable; never evidence of absence |
| `T_RPC_SLOT_LEASE` | concurrency slot claim | 15 seconds | limiter slot rows | a slot left by a crash becomes reclaimable |
| `T_MAINT_INTERVAL` | schedule | hourly at minute 17, every 6 hours before quota confirmation | GitHub Actions | best effort; schedules can be delayed or dropped |
| `T_MAINT_RUN` | job start | 2 minutes | Actions `timeout-minutes` | job killed; leases expire and are reclaimable |
| `T_LEASE` | work claim | 5 minutes | due-work queries | another runner may claim; no duplicate external effect because maintenance performs none |
| `T_HANDOFF` | agent request creation | 10 minutes | redeem route | token unusable; a new request is required |
| `T_AI_BUDGET` | suggestion request start | 30 seconds | AI adapter | `budget_exceeded`; manual selection offered |
| `T_PROVIDER_READ_DEBOUNCE` | last provider read | 30 seconds | status and reconcile routes, and since 2026-10-11 `pyusd/submitted`, per attempt, for hint and reconcile reads | stored state returned without a new provider call |

Two rules apply to every clock. Expiry is never evidence about an external effect that may already have happened. No clock promises physical erasure.

**Removed 2026-10-11:** `T_IMAGE_ACCESS` and `T_SOURCE_SWEEP`, with the image proxy and source sweep they timed.
The daily import caps and spend ceiling use the UTC calendar day from `utcDayStart`, which is a calendar boundary rather than a clock.

**Block-height bound, not a clock.**
A prepared PYUSD attempt is bounded by its saved `lastValidBlockHeight`.
The bound has passed only when the **finalized** block height exceeds it; a confirmed height, wall time or a wallet error proves nothing.
Only then may the history scan start.

## State transitions

### Purchase

```
review_open -> review_expired          (T_REVIEW, no attempt ever dispatched)
review_open -> review_invalidated      (published revision or destination changed)
review_open -> superseded              (a new review for the same CheckoutKey replaced it)
review_open -> pending_payment         (paypal/start created an attempt, or pyusd/prepare saved a PYUSD attempt)
pending_payment -> paid                (decideCaptureOutcome = confirmed, or verifyPyusdTransfer = confirmed)
pending_payment -> uncertain           (capture_dispatched with unknown or mismatched outcome, or a PYUSD attempt in mismatch or held_no_match)
pending_payment -> unpaid_closed       (cancel with no dispatched capture and no PYUSD attempt; verified failed/canceled; a PayPal attempt abandoned
                                        because T_REVIEW passed with no capture dispatched, derived on read and stored at the next touch;
                                        or a PYUSD attempt closed_unpaid)
uncertain -> paid                      (a later provider read confirms the same PayPal capture)
uncertain -> unpaid_closed             (a later provider read establishes a verified PayPal non-payment; a held PYUSD attempt closes unpaid
                                        once release is enabled; or an audited operator resolution closes a PYUSD mismatch)
paid -> paid                           (terminal; a refund/dispute adds separate status, never rewrites this; since fix M, so does an extra
                                        transfer found by the window scan)
```

Illegal and rejected by `canTransitionPurchase`: any transition out of `paid` to an unpaid state; any transition into `paid` that is not sourced from `decideCaptureOutcome = confirmed` or, since 2026-10-11, `verifyPyusdTransfer = confirmed`; `review_expired -> pending_payment`; `superseded -> anything`.
A PYUSD purchase can be canceled only before preparation; afterwards cancel answers `payment_uncertain` and the buyer sees "checking payment".
**Revised 2026-10-11 after review:** a PYUSD purchase reaches `paid` only from `pending_payment`.
The earlier draft also allowed `uncertain -> paid` through "a later scan", but no PYUSD state leads from `mismatch` or `held_no_match` to `confirmed`, and Gate 2 says mismatched evidence is never paid, so the clause is removed and the two machines agree.

### Payment attempt

```
created -> order_created               (create response held an order id)
created -> create_unknown              (create dispatched, response lost)
create_unknown -> order_created        (same-key replay returned the prior result)
create_unknown -> abandoned            (replay confirms nothing landed; safe_to_recreate)
order_created -> externally_approved   (provider read shows buyer approval)
created | create_unknown | order_created | externally_approved -> abandoned
                                       (T_REVIEW passed with no capture dispatched; no external effect; derived on read, stored at the next touch)
externally_approved -> capture_dispatched  (lease held, capture request id persisted first, by a compare-and-set that requires the review
                                            deadline to be in the future)
capture_dispatched -> capture_confirmed
capture_dispatched -> capture_unknown
capture_unknown -> capture_confirmed   (same-key replay or provider read)
capture_unknown -> capture_failed      (provider read establishes a verified failure)
externally_approved -> capture_failed
```

`capture_unknown` never transitions to `abandoned` and never permits a new capture request id. That is the single most important illegal transition in the system.
**Revised 2026-10-11 after review:** the earlier draft gave `externally_approved` no exit, so a buyer who approved at PayPal and closed the tab left a purchase that locked its basket forever.
Abandonment from any state before `capture_dispatched` is safe only because dispatch requires the review deadline in the same compare-and-set: once `T_REVIEW` has passed, no capture can ever be sent, and `capture_dispatched` and `capture_unknown` never read as abandoned.

### PYUSD attempt (added 2026-10-11)

```
prepared -> confirmed                  (a hint or a scanned signature passes verifyPyusdTransfer and binds)
prepared -> mismatch                   (a successful finalized transaction carrying this reference fails verification)
prepared -> expired_scanning           (finalized block height > lastValidBlockHeight)
expired_scanning -> confirmed          (the scan finds a verified transfer)
expired_scanning -> mismatch           (the complete scan bound nothing and found a successful transaction with this reference that fails verification; revised 2026-10-18)
expired_scanning -> held_no_match      (complete scan, no match, automatic unpaid release not enabled)
expired_scanning -> closed_unpaid      (complete scan, no match, automatic unpaid release enabled)
held_no_match -> closed_unpaid         (automatic unpaid release enabled later; the recorded coverage is already complete)
mismatch -> closed_unpaid              (an out-of-band, audited operator resolution with recorded evidence; added 2026-10-11 after review)
```

`prepared`, `expired_scanning`, `held_no_match` and `mismatch` keep the purchase and its basket locked; only `confirmed` and `closed_unpaid` end the lock.
**Revised 2026-10-11 when Gate 2 was reopened (fix M):** the window scan runs after expiry whatever the state, so `confirmed` and `mismatch` attempts are still scanned to completion, and the scan never moves either state.
It only records extra transfers, each a successful landing carrying the reference other than the bound or mismatching one; an extra transfer is a separate status beside a paid or uncertain purchase and never a transition.
A `confirmed` attempt still ends the basket lock at once, because a new purchase of the same basket has its own reference and cannot be confused with the old attempt's landings.
`mismatch` has no automatic exit: it is operator-visible, and the system never moves it on its own.
Its one exit is an out-of-band, audited operator resolution that records the operator, the reason and the evidence, such as an out-of-band refund reference or proof that no tokens reached the merchant, and closes the attempt unpaid; the receipt then shows that operator resolution rather than claiming no transfer happened.
Since fix M the resolution also requires the attempt's window scan to be complete, so every landing that may need a refund is known before the attempt closes.
There is no `mismatch -> confirmed`, because Gate 2 says mismatched evidence is never paid; accepting such a transfer would need a Gate 2 amendment.
The resolution is not built in this gate: Gate 4 places it with the operator CLI of delta D1.
No transition re-prepares, refreshes the blockhash or submits anything, and a wallet error or a missing hint changes no state.

### Menu import (revised 2026-10-11)

```
open -> completed                      (commit inside T_MENU_REQUEST merged the validated draft)
open -> conflict_base_revision         (commit found a newer draft revision; nothing merged)
open -> conflict_confirmed             (commit found a confirmed draft; nothing merged)
open -> membership_revoked             (commit found the actor no longer holds the outlet membership; nothing merged; added 2026-10-11 after review)
open -> rejected_upload | rejected_photo | model_failed | model_timeout | output_invalid | aborted   (best-effort close; nothing merged)
open, read after deadline_at -> expired   (derived on read by deriveImportOutcome; no write and no task)
```

A late result is rejected with `import_expired`, and a changed base revision with `import_base_revision_changed`.
There is no cancel, status-poll or automatic re-analysis path; a fresh merchant action under the current consent starts another attempt, and admission counts it.
*Removed 2026-10-11:* the `accepted`, `dispatched`, `canceled`, `source_deleted` and `source_delete_blocked` states of the image-row machine.

## Authorization

| Principal | Obtained by | May | May never |
| --- | --- | --- | --- |
| `anonymous` (buyer) | Better Auth anonymous sign-in, HttpOnly cookie | read published outlets/menus, create and own reviews, start and complete their own payment, read their own receipt; since 2026-10-11, prepare PYUSD for their own review and post a signature hint for their own attempt | any merchant route; read another buyer's purchase; supply a price, payee or rail; supply an amount, RPC URL, token account or rate; prepare from another session's review |
| `merchant` | permanent pre-provisioned account **plus** an operator-approved `merchant_memberships` row for that outlet | edit their outlet, upload a menu photo for a synchronous draft, reload the draft and the latest import outcome, correct and confirm a menu, publish when preconditions hold, view and acknowledge their orders; since 2026-10-11, request a wallet challenge, prove a wallet they control, and set or re-confirm the PYUSD rate | act on an outlet without a membership row; approve their own enrollment; connect an arbitrary pasted merchant id; make a PYUSD wallet active without the outlet's operator-approved enrollment |
| `operator` | allowlisted flag on a permanent account | approve enrollments, prepare destination connections, read the operator health view, including held and mismatched PYUSD attempts; since 2026-10-11, resolve a PYUSD mismatch as unpaid, out of band and audited, through the operator act Gate 4 places in delta D1, and, since fix M, read extra transfers and record an out-of-band refund reference against one through the same act | capture or create a payment on a buyer's behalf; sign or submit a transaction; mark a mismatched PYUSD attempt paid; move tokens or mark an extra transfer refunded without a recorded out-of-band reference |
| `agent-token` | out-of-band scoped demo token, stored hashed | `search_outlets`, `get_menu`, `create_purchase_request` over MCP | capture, transfer, menu writes, receipt reads, private registry data |
| `maintenance` | Actions secret `MAINTENANCE_DATABASE_URL` plus read-only provider config and, when PYUSD is configured, `SOLANA_RPC_URL` | claim due work, read provider orders, read devnet chain state, advance PYUSD scan coverage and attempt states, record extra transfers, write heartbeat and audit | create or capture an order, sign, submit or rebroadcast a transaction, request an airdrop, re-analyze an image, replace a payment, migrate, keep the app awake |

Two rules make this table enforceable rather than descriptive. Every route begins with exactly one `require*` guard from `src/lib/auth-context.ts`, and a route that needs two principals does not exist. Guest-to-merchant escalation is blocked at two layers: `onLinkAccount` creates no membership, and `requireOutletMembership` reads the membership row rather than any property of the user record.

**Revised 2026-10-11: there are no capability principals.**
The image proxy and the result callback are gone, so every import read and write is merchant-session and membership scoped, and browser mutations also pass `assertSameOrigin`.
Two inputs look like credentials and are deliberately not principals: a wallet signature over a challenge is evidence of key control, never a session or a role; and a submitted transaction signature is a hint the server verifies, never a command.
*Removed:* `capability:import-image` and `capability:import-result`, with their compensating controls.

## Call stacks

### Buyer text purchase to confirmed receipt

```
POST /api/v1/buyer/suggestions
  requireBuyerSession -> suggestFromText -> ai/openai.suggest (T_AI_BUDGET, <=3 read tools)
    -> outlets.search -> menu.publishedItems -> Suggestion

POST /api/v1/purchases
  requireBuyerSession -> priceBasket (reads the confirmed revision, never client prices)
    -> computeBasketLockKey -> findBasketLock (since 2026-10-11; derived on read): execution_locked while
       money can still move for a same-basket purchase of this buyer, on either rail
    -> computeCheckoutKey -> createReview
      -> INSERT purchases ON CONFLICT (buyer, checkout_key) WHERE review_open -> existing_open_review
      -> audit_events in the same transaction

POST /api/v1/purchases/{id}/paypal/start
  requireBuyerSession -> SELECT ... FOR UPDATE purchases (since 2026-10-11: every purchase of this buyer with
    the same basket lock key, this one included, in id order)
    -> assertPaymentEligible (owner, T_REVIEW, revision still published, destination still active,
         and since 2026-10-12 PAYMENTS_ENABLED => payments_disabled, no attempt and no order)
    -> findBasketLock over the others (since 2026-10-11) => execution_locked, no attempt
    -> attempts.claimSlot (unique partial index: one non-terminal attempt per purchase)
    -> persist create_request_id
    -> paypal/orders.createOrder (host allowlist, payee from the destination row, amounts from the snapshot)
    -> attempt order_created | create_unknown
  returns the approval link; the human approves at PayPal

POST /api/v1/purchases/{id}/paypal/complete
  requireBuyerSession -> assertPaymentEligible (rechecks T_REVIEW and versions, and since 2026-10-12
    PAYMENTS_ENABLED => payments_disabled, no lease and no capture)
    -> paypal/orders.readOrder -> verify order id, status, payee, amount, currency, correlation
    -> mismatch => payment_uncertain, operator alert, stop
    -> acquire attempt lease -> persist capture_request_id -> capture_dispatched
       (since 2026-10-11 one compare-and-set: WHERE state = externally_approved AND the review deadline > now;
        no row => no capture is sent, and the purchase reads review_expired or abandoned)
    -> paypal/orders.captureOrder -> decideCaptureOutcome
      confirmed => purchase paid + CaptureEvidence
      uncertain => capture_unknown + purchase uncertain
GET /receipt/{purchaseId}  polls stored state only, at most every T_PROVIDER_READ_DEBOUNCE
GET /api/v1/purchases/{id} and the receipt (since 2026-10-11): derivePurchaseView, so an attempt before
  capture_dispatched whose review passed T_REVIEW reads abandoned and its purchase unpaid_closed;
  applyDerivedTransitions stores both at this touch, best effort, with no maintenance dependency
POST /api/v1/integrations/paypal/webhook
  verifyPayPalWebhookEvent -> INSERT provider_events ON CONFLICT (event_id) DO NOTHING
    -> if new and the order is known: enqueue a due read. Event content alone never marks paid.
```

### Menu photo import (revised 2026-10-11)

```
browser: decode the selected photo, apply orientation, shrink without enlarging to <= 2,048 px per side,
  re-encode one JPEG <= 2 MiB; the original stays in this tab only; no localStorage or IndexedDB copy
  a photo that cannot be decoded or fitted stops here and offers another photo or manual entry

POST /api/v1/merchant/outlets/{id}/menu-imports      (Node route handler; no proxy matcher covers it)
  headers Envoi-Consent-Version, Envoi-Base-Revision; body multipart with one part "photo"
  requireOutletMembership -> assertSameOrigin -> MENU_IMPORTS_ENABLED
    -> consent version == MENU_CONSENT_VERSION, else 409 consent_required and no row
    -> admitMenuImport: BEGIN, lock menu_import_admission row
         bounds and ceiling recorded, no over-reservation, outlet and global live attempts,
         outlet and global UTC-day counts, the day's held reservations (dispatched or still live) + new <= ceiling
         INSERT menu_imports(open, deadline_at = now + T_MENU_REQUEST, reserved) + audit, COMMIT
       refused => 409 or 429 with the ImportRejection; not one body byte has been read
    -> readCountedBody(<= 2.5 MiB, <= T_MENU_UPLOAD_READ, request.signal)     request memory only
    -> parseSinglePhotoPart (one "photo" part, <= 2 MiB; declared type ignored)
    -> normalizeMenuJpeg (header dimensions <= 2,048 before decode; JPEG only; orient; strip metadata; re-encode)
       a reject here closes rejected_upload or rejected_photo with no dispatch mark, so its reservation counts zero
    -> markModelDispatched (since 2026-10-11: short committed write while open and before deadline_at;
         not marked => no call, close aborted; from here the reservation is never released)
    -> draftMenuFromPhoto (AI_MENU_MODEL; store false; strict schema; no tools; maxRetries 0;
         maxOutputTokens from reviewed bounds; abort = request.signal or menuModelBudgetMs)
    -> validateVisionDraft (row, text and size bounds; per-item blank prices; duplicates flagged)
    -> commitImport: BEGIN, lock attempt and draft revision
         attempt open and now < deadline_at, actor still holds the outlet membership (restored 2026-10-11),
         base revision current and unconfirmed
         mergeImportSuggestions (merchant edits preserved) -> close completed with counts, usage,
         fingerprint, latency and peak RSS -> audit, COMMIT
       late => nothing merged, reads expired; membership revoked => close membership_revoked, 403 forbidden_membership;
       conflict => close with the conflict outcome, nothing merged
    -> 200 with the outcome and draft summary; no image bytes in any response
  any failure => closeImportFailed(outcome) best effort; log only toSafeErrorRecord(err, "openai")
  buffers fall out of scope with the request; nothing is written to disk, the database or a log

GET /api/v1/merchant/outlets/{id}/menu-draft
  requireOutletMembership -> draft + deriveImportOutcome(latest attempt, now)       read only
  a lost response is recovered here: completed stays visible; a live attempt blocks a retry until its deadline
```

*Removed 2026-10-11:* the image-capability `GET`, the Zapier result `POST`, Zapier dispatch and the source-row delete.

```
PUT /api/v1/merchant/outlets/{id}/menu-draft
  requireOutletMembership -> revision conflict check -> upsert items -> confirmation invalidated

POST /api/v1/merchant/outlets/{id}/confirm -> assessMenuCompleteness -> record confirmed revision
POST /api/v1/merchant/outlets/{id}/publish
  requireOutletMembership -> BEGIN: recheck enrollment + outlet confirmation + menu confirmation
    + active accepted destination -> switch published pointer atomically -> audit -> COMMIT
```

### Buyer scan

```
browser: barcode-detector decodes locally, or paste supplies the payload
POST /api/v1/outlets/resolve-sgqr
  requireBuyerSession -> decodeEmvcoTlv -> resolveSgqr
    no_match        => "not on Envoi", offer text search. Never enrolls.
    ambiguous       => OutletDistinguisher list, buyer chooses one
    single          => PublishedOutletSummary, then the same purchase path as text
  raw payload is discarded after parsing and never logged
```

### PYUSD merchant wallet and rate (added 2026-10-11)

```
POST /api/v1/merchant/outlets/{id}/destinations/pyusd/challenge     body { walletAddress }
  requireOutletMembership -> assertSameOrigin -> requirePyusdEnabled -> ratelimit (10 per outlet per hour)
    -> buildChallengeMessage (domain and URI from APP_BASE_URL, never the Host header; devnet; purpose and outlet; nonce; expiry)
    -> INSERT wallet_challenges (exact bytes, nonce hash UNIQUE, expires_at) -> { challengeId, message }
browser: wallet.features["solana:signMessage"].signMessage({ account, message }) -> signature bytes
PUT /api/v1/merchant/outlets/{id}/destinations/pyusd                body { challengeId, signature }
  requireOutletMembership -> assertSameOrigin -> requirePyusdEnabled
    -> load challenge: same outlet, not expired, not consumed
    -> Ed25519 verify(saved bytes, signature, challenge wallet)
    -> checkPyusdIdentity -> checkPyusdTokenAccount(challenge wallet): derived address exists, is Token-2022, is not frozen
    -> BEGIN: UPDATE wallet_challenges SET consumed_at WHERE id AND consumed_at IS NULL AND expires_at > now RETURNING
       upsert payment_destinations (rail pyusd, wallet, token account, key control verified, version + 1) -> audit -> COMMIT
  creates no membership and no enrollment; open PYUSD reviews pinned to the old destination version fail at preparation

PUT /api/v1/merchant/outlets/{id}/pyusd-rate                        body { pyusdPerSgd: "0.742115" }   (illustrative value)
  requireOutletMembership -> assertSameOrigin -> requirePyusdEnabled
    -> parsePyusdPerSgd (exact decimal, at most 6 places, within PYUSD_RATE_BOUNDS)
    -> INSERT pyusd_rates (new version, confirmed_at = now) -> audit
  re-confirming an unchanged value also creates a version; open PYUSD reviews on the old version fail at preparation
```

### PYUSD purchase (added 2026-10-11)

```
POST /api/v1/purchases                                              rail "pyusd"
  requireBuyerSession -> computeBasketLockKey -> findBasketLock (derived on read): execution_locked while money can
    still move for a same-basket purchase of this buyer, on either rail (revised 2026-10-11 after review)
    -> priceBasket (confirmed revision; verified PYUSD destination; PYUSD_ENABLED; rate not past T_RATE_AGE)
       -> pyusdAtomicFor (ceil, BigInt) -> computeCheckoutKey (includes the rate version) -> createReview

POST /api/v1/purchases/{id}/pyusd/prepare                           body { walletAddress }
  (revised 2026-10-11 after review: no RPC call runs inside a database transaction)
  requireBuyerSession -> assertSameOrigin -> requirePyusdEnabled
    -> plain read of the purchase and its attempt, no row lock:
         any attempt, for any wallet => locked with the attempt's state, no bytes and no RPC call
           (revised 2026-10-11 when Gate 2 was reopened, fix L: the bytes are released once and never stored)
    -> assertPaymentEligible (owner, T_REVIEW, published revision, destination version, rate version and age,
         PAYMENTS_ENABLED) as a read-only pre-check
    -> read-only RPC through the shared limiter, outside any transaction:
         checkPyusdIdentity (genesis, mint owner program and decimals)
         mint at finalized -> assessMintForTransfer (bps and maximum fee zero for this and the next epoch; hook null; reviewed extensions)
         checkPyusdTokenAccount(merchant) again: exists, Token-2022, not frozen, since the account can change after the proof
         checkPyusdTokenAccount(buyer): Token-2022, not frozen, amount >= atomicAmount (a missing account has amount 0)
         getLatestBlockhashConfirmed -> blockhash, lastValidBlockHeight, slot
         buildUnsignedTransfer (memo with the new reference, then TransferChecked; version 0; no compute budget)
    -> BEGIN: SELECT ... FOR UPDATE every purchase of this buyer with the same basket lock key, this one included, in id order
         recheck no attempt, unchanged eligibility, and findBasketLock over the others => execution_locked
         INSERT payment_attempts (rail pyusd, prepared, fingerprint and all evidence but never the bytes, reference UNIQUE);
         purchase -> pending_payment; audit (no bytes)
       COMMIT
    -> only now respond { attemptId, transactionBase64, chain: "solana:devnet" }, built in memory and then dropped
  a lost response leaves a locked attempt that recovery resolves; a repeat call returns locked and never the bytes

browser (pyusd-pay.tsx)
  wallets = getWallets() with chains including solana:devnet and the solana:signAndSendTransaction feature
  none on a phone => an "Open in Phantom" link from buildPhantomBrowseLink, naming rail pyusd; never a pay button
  none on a desktop => no pay button; explain that a devnet wallet is needed
  -> a one-shot holder gives the exact bytes to one call and drops them (fix L):
     signAndSendTransaction({ account, chain: "solana:devnet", transaction: exact bytes })
  -> signature bytes -> base58 -> POST pyusd/submitted
  a wallet error or rejection after preparation is shown as "checking payment", never as canceled, and the wallet is never asked again;
  a fresh review is possible only after recovery closes the attempt

POST /api/v1/purchases/{id}/pyusd/submitted                         body { attemptId, signature }
  requireBuyerSession -> assertSameOrigin -> owner
    -> append the hint by compare-and-set on the hint count while the attempt is not terminal and holds fewer than
       PYUSD_HINT_CAP; a repeated hint changes nothing; past the cap the hint is audited only (revised 2026-10-11 after review)
    -> the readable hint is the oldest one still unread or not_found, and only while every older hint is decided
       not_ours or failed_landing; a hint behind an undecided one waits
    -> debounced by T_PROVIDER_READ_DEBOUNCE per attempt, outside any transaction: getTransactionFinalized(readable hint)
         null => hint not_found; read again after the debounce
         verifyPyusdTransfer: confirmed => bind finalizedSignature (UNIQUE), attempt confirmed, purchase paid, evidence, audit
                              not_ours => hint decided not_ours in audit; the next hint becomes readable
                              failed_landing => hint decided failed_landing; the next hint becomes readable
                              uncertain => attempt mismatch, purchase uncertain, operator-visible
         every state change is a compare-and-set in one short transaction after the read
GET /receipt/{purchaseId}  polls stored state within the approved polling bounds; while an attempt is prepared, or its window
  scan is not yet complete, each poll may call the debounced reconcile route, so at most one provider read happens per
  T_PROVIDER_READ_DEBOUNCE; a paid receipt lists any extra transfer (fix M)
```

The phone link is `https://phantom.com/ul/browse/<encoded APP_BASE_URL/buy?outlet=<id>&items=<itemId:qty,...>&rail=pyusd>?ref=<encoded APP_BASE_URL>` (rail added 2026-10-18).
It carries no purchase id, session, price, payee or personal data; inside Phantom's browser the buyer gets a new anonymous session, and `/buy` with `rail=pyusd` and a basket asks once, on landing, for a PYUSD review of that basket through the ordinary `POST /purchases` and shows it; the buyer confirms it there by paying.
A refused review leaves `/buy` showing the basket and the refusal's message; without `rail=pyusd`, `/buy` only pre-fills the basket, as before.
The original browser's review is never prepared and simply expires.

### PYUSD recovery (added 2026-10-11)

```
POST /api/v1/purchases/{id}/reconcile (rail pyusd), and maintenance reconcile_pyusd_attempts
  claim the attempt lease (T_LEASE) -> checkPyusdIdentity (genesis, mint owner program and decimals):
    a mismatch records lastGap identity_changed and stops; an unreachable RPC records rpc_unavailable and stops
  -> decideRecoveryStep(attempt, finalized block height):
     prepared, height <= lastValidBlockHeight  => verify the readable hint, if any; otherwise wait
     prepared, height > lastValidBlockHeight   => verify the readable hint first; then expired_scanning with the top boundary fixed now
     confirmed or mismatch, height > lastValidBlockHeight, scan incomplete => start or continue the window scan (fix M)
     window scan complete => done for confirmed; operator for mismatch; mark_mismatch for a pending mismatch; held or closed as below for no match
     expired_scanning, or a scanning confirmed or mismatch attempt => getSignaturesFinalized(merchant token account, before = cursor, 1000)
         at most 3 pages and 20 candidate fetches per claim
         applyScanPage -> candidates: successful signatures at or after preparationSlot
         each candidate other than the bound signature -> getTransactionFinalized -> verifyPyusdTransfer -> classifyScanCandidate
            bind            => attempt confirmed, purchase paid; a pending mismatch becomes an extra transfer; the scan continues (fix M)
            mismatch        => while expired_scanning: kept as pendingMismatch (a newer pending one becomes an extra transfer);
                               no state change yet; release is impossible while one is pending; the scan continues (revised 2026-10-18)
            extra           => applyScanOutcome records the extra transfer once, operator alert; no state changes (fix M)
            skip            => continue
         429, null transaction, unavailable, oversized, page cap or identity change => record lastGap, keep the cursor, stop
         a page advances the cursor only after all its candidates are decided
         reachedBeforePreparation => complete:
            still expired_scanning with a pendingMismatch => attempt mismatch, purchase uncertain, operator alert (revised 2026-10-18)
            still expired_scanning (nothing bound, no pending mismatch) =>
              PYUSD_PROOFS.automaticUnpaidRelease ? closed_unpaid, purchase unpaid_closed, basket unlocked
                                                  : held_no_match, purchase uncertain, operator alert
            confirmed or mismatch => the extra-transfer check is complete; no state changes
  -> persist coverage and state with compare-and-set; release the lease
PYUSD_ENABLED false stops only new PYUSD actions; this recovery path still runs for prepared attempts.
```

### Maintenance run

```
.github/workflows/maintenance.yml -> node .maintenance-build/src/maintenance/run.js
  connect MAINTENANCE_DATABASE_URL (direct) -> heartbeat
  -> record_capacity (pg_database_size plus Neon-reported usage where reachable)
  -> reconcile_attempts (PayPalReadClient only; imports no Solana module)
  -> reconcile_pyusd_attempts (SolanaReadClient only, when SOLANA_RPC_URL is set; shared database RPC limiter;
       at most 2 attempts per run, each within the per-claim page and fetch caps)
  -> close_expired_reviews -> purge_expired_sessions
  -> write maintenance_runs report -> exit non-zero if any outcome is operator-visible
```

**Revised 2026-10-11:** `expire_imports` and `sweep_sources` are removed; imports never depend on this run.

## Races

| Race | Contract |
| --- | --- |
| Two tabs create the same basket | Unique partial index on `(buyer_user_id, checkout_key) WHERE state = 'review_open'`. The loser receives `existing_open_review` with the same purchase id. No second review exists. |
| Double click on "continue to PayPal" | `SELECT ... FOR UPDATE` on the purchase plus a unique partial index on `payment_attempts(purchase_id) WHERE state NOT IN ('abandoned','capture_failed','capture_confirmed')`. Repeated clicks return the same attempt and the same approval link. |
| Lost create response | `decideCreateRecovery`. First replay the identical `PayPal-Request-Id`, because PayPal *"returns the latest status of the previous request that used that same header"*. Only if the attempt never held an order id is recreation safe, and it uses a new key. **[verified]** |
| Two concurrent requests with the same key | Forbidden. PayPal *"processes the first request and might fail the second request"*, so capture runs only for a lease holder. `T_LEASE` is 5 minutes and `T_MAINT_RUN` is 2, so a lease cannot outlive a killed job indefinitely. **[verified]** |
| Lost capture response | Persist `capture_dispatched` **before** the call. On loss, replay the same capture key from the lease holder. If still inconclusive: `capture_unknown`, purchase `uncertain`, operator alert. Never a new capture key, never a replacement payment, never a rail switch. |
| Cancel races capture | Cancel is legal only when no attempt is in `capture_dispatched` or later. Otherwise the response is `payment_uncertain` and the buyer sees "checking payment", not "canceled". |
| Menu published while a review is open | Reviews pin `menu_revision_id`. Eligibility re-reads the published pointer inside the execution transaction, so a stale review fails with `review_invalidated` at the moment it matters, not only when a job notices. |
| Destination disconnected mid-review | Same mechanism via the pinned `destination_id`. An already captured payment keeps its original evidence. |
| Duplicate or out-of-order webhook | Unique `provider_events(event_id)`; a duplicate inserts nothing and changes nothing. An unknown order is quarantined. No callback can downgrade `paid`. |
| Two maintenance runs overlap | Leases claimed with `UPDATE ... WHERE lease_expires_at < now() RETURNING`. Because maintenance performs no external write, an overlap costs work, not money. |
| Two imports at once (added 2026-10-11) | `admitMenuImport` locks the singleton admission row, so both in-flight checks and both daily counts see one view. The loser gets `in_flight_outlet` or `in_flight_global` and no row. |
| Lost import response, merchant retries | The merchant reloads `GET menu-draft` first. A completed import is visible; a still-live attempt refuses a new admission until its deadline; after the deadline it reads expired and admission proceeds. A disconnect is not proof nothing committed. |
| Import commit races a merchant edit or confirmation | `commitImport` locks the draft revision row and requires the base revision to be current and unconfirmed. Otherwise it closes with a conflict outcome and merges nothing. |
| Model result after the deadline | `commitImport` writes only while `now < deadline_at`; a late result merges nothing and the attempt reads expired. Usage is still recorded. |
| Two tabs prepare PYUSD for one purchase | `SELECT ... FOR UPDATE` on the purchase plus the one-active-attempt partial index, whose terminal set now includes `confirmed` and `closed_unpaid`. The second call gets `locked` and no bytes (fix L). |
| Preparation response lost | The attempt commits before any byte leaves. A repeat call returns `locked`, never the bytes or a new blockhash; the bytes were never stored, so the attempt waits for expiry and its window scan (fix L). |
| Buyer rejects in the wallet, then retries | The browser never asks the wallet again and the server never releases the bytes again (fix L). Recovery only: no new review for the basket on either rail until the attempt ends. |
| One release signed twice (added with fixes L and M) | Envoi's code never offers a second signing: the bytes leave the server once and the browser holds them for one wallet call. If a faulty or modified client still lands two transfers before expiry, the window scan binds one and records the other as an extra transfer. |
| A second landing after a hint confirmed the attempt (added with fix M) | The window scan still runs for the confirmed attempt after expiry, records the second landing as an extra transfer and leaves the purchase `paid`. |
| Rate, destination or menu changes during an open PYUSD review | Preparation rechecks every pinned version inside its locked transaction and fails `review_invalidated`. Prepared attempts keep their saved amount and destination. |
| Eligibility changes between the two preparation transactions | The second transaction rechecks eligibility and that no attempt exists before it inserts. |
| Hint route and maintenance verify the same signature | `finalizedSignature` is unique and state changes are compare-and-set; the loser re-reads. |
| Web reconcile and maintenance scan the same attempt | The attempt lease allows one claimer; coverage is written with compare-and-set, so a stale claimer cannot move the cursor back or forward. |
| Two merchant tabs submit one wallet challenge | `UPDATE ... WHERE consumed_at IS NULL RETURNING`; one wins and the other gets `challenge_used`. |
| A payment that can still move money and a new review on the other rail | The basket lock key ignores the rail, so `createReview` refuses with `execution_locked` while `moneyCanStillMove` holds for a same-basket purchase. Revised after review: the lock no longer follows `pending_payment`. |
| Two reviews of one basket, opened before either started, then both started (added after review) | Each execution start locks every same-basket purchase of the buyer in id order before it rechecks the lock and inserts, so the second start waits, sees the first attempt and refuses `execution_locked`. |
| Buyer approves at PayPal and closes the tab (added after review) | Once `T_REVIEW` passes with no capture dispatched, the attempt reads `abandoned` and the purchase `unpaid_closed` on read, and the basket unlocks; the next touch stores both. Maintenance's `close_expired_reviews` is cleanup only. |
| `T_REVIEW` passes while `paypal/complete` is between its eligibility check and dispatch (added after review) | Dispatch is a compare-and-set that requires `externally_approved` and an unexpired review deadline, and abandonment is a compare-and-set from a pre-capture state; exactly one wins, and a lost dispatch sends no capture. |
| Membership revoked while an import is in flight (added after review) | `commitImport` rechecks the membership inside its transaction; a revocation committed first makes it close `membership_revoked` and merge nothing. |
| Devnet resets during recovery | The identity check fails, coverage records `identity_changed`, and nothing is released. |
| Web and runner compete for the RPC budget | One database limiter serves both; a refused acquisition means "not now" and is never absence evidence. |

*Removed 2026-10-11:* the late Zapier result and storage-exhaustion-during-close rows, whose mechanisms no longer exist.

## Capacity budgets

All figures are **[hypothesis]** arithmetic over **[verified]** or **[vendor claim]** limits. None is a measured result.

| Quota | Documented limit | Envoi budget | Guard |
| --- | --- | --- | --- |
| GitHub Actions minutes (private repo) | **[verified]** 2,000/month; public standard runners free; usage blocked with no payment method on file | every 6 hours = about 180 runs = about 180 minutes = 9%. Move to hourly (about 720 minutes = 36%) only after remaining quota is confirmed or the repository is public, which the official rules require for submission anyway | no payment method on file, plus a $0 spending limit; the workflow is disabled until the cadence decision is recorded. Since 2026-10-11, PYUSD reconciliation adds at most about 54 RPC calls a run, at least 27 seconds at the shared budget, inside `T_MAINT_RUN` |
| Neon storage (revised 2026-10-11) | **[verified]** 1 GB/project; history window 6 hours; inserts, updates and deletes fail at the limit | domain data 50 MB, audit and events 20 MB, import metadata under 2 MB/month (at most 50 bytes-free rows a day), PYUSD challenges, rates, attempts, coverage and extra transfers under 5 MB; at the full RPC budget, limiter row writes could hold on the order of 20 MB in the 6-hour history window by arithmetic, and real use is far lower; about 900 MB headroom | no image bytes exist; `record_capacity` reports usage and alerts the operator at 70%; no import or payment admission depends on that reading (R2) |
| Neon compute | **[vendor claim]** 100 CU-hours/project/month; mandatory scale-to-zero after 5 minutes | 720 maintenance wakes at about 10 s each is about 2 wall-clock hours; buyer sessions budgeted at 200 sessions x 3 minutes is about 10 wall-clock hours | no polling loop anywhere; browser polling only while an attempt is non-terminal, at most every 2 s for at most 60 s per page view. **[unknown]** exact CU conversion; measure in Slice 1 |
| Neon transfer | **[vendor claim]** 5 GB/project/month | revised 2026-10-11: no image bytes cross the database; JSON polling dominates | negligible against quota; monitored by `record_capacity` |
| Render Free instance hours | **[vendor claim]** 750 shared/month; sleep after 15 minutes idle | 744 hours in a month, so exactly one always-listening free service | one web service only; a second free service would halve availability below the month |
| Cold start | **[vendor claim]** about a minute to wake | counted inside the approved three-minute buyer metric | a genuinely idle first visit is measured; no silent pre-warming |
| OpenAI API spend (added 2026-10-11) | **[verified]** per-token billing; the pricing page names no free tier | the daily ceiling is **[unknown]** until the user records it; at most 50 reserved attempts a day | admission fails closed while the ceiling or the model's reviewed bounds are missing; a reservation whose model call was dispatched is never released, and only an attempt closed before dispatch counts zero; usage above a reservation stops imports |
| Render Free memory and CPU for imports (added 2026-10-11) | **[vendor claim]** 512 MB and 0.1 CPU | one import at a time; per import at most a 2.5 MiB body, a 2 MiB part, a re-encoded JPEG of about 2 MiB, a base64 copy of about 2.7 MiB and one decoded frame of about 17 MB as RGBA by arithmetic; `sharp` overhead **[unknown]** | one global in-flight import; dimensions read from the header before decoding; peak RSS sampled per import and shown to the operator (R6) |
| Public devnet RPC (added 2026-10-11) | **[verified]** published 100 requests/10 s/IP, 40/10 s/IP per method, 40 concurrent | 20 calls/10 s, 10/10 s per method and 2 concurrent across web and runner; per maintenance claim at most 3 pages and 20 transaction reads; about 4 reads per preparation, and since fix M about 4 more per attempt for its window scan after expiry when the merchant account is quiet | shared database limiter with jittered backoff; Render's shared outbound IP may consume the same allowance **[unknown]** |

`pg_database_size(current_database())` does not include Neon's history/instant-restore storage, so `record_capacity` records both that value and, where reachable, the provider-reported usage.
If provider usage cannot be read programmatically, the operator reads the console weekly.
**Revised 2026-10-11:** the 70% figure is now an operator alert, not an import admission threshold, because imports store no bytes and must not depend on a maintenance reading.
This limitation is stated rather than smoothed over.

## Test plan

Every test must be able to fail. Each guard gets its own mutation proof, because a fault caught by two tests proves nothing about either one.

**Batching, revised 2026-10-11 after review.**
The user asked for fewer named tests and less test compute without weakening one guard, one mutation.

- Guards that share a fixture, a module and a future slice run as one table-driven test, called a group.
  Each row of a group is one guard: it is reported as its own case, asserts its specific failure reason and lists its own mutation, and removing that one guard fails exactly its own row.
- A group never spans two slices or the PayPal, PYUSD and import boundary.
  Every section names its slice unit; the PYUSD groups assume the roadmap's two PYUSD slices, a purchase slice and then a recovery slice, so Gate 4 can assign each group whole.
  If Gate 4 splits a unit differently, it regroups by case, which the delta mapping makes mechanical.
- A guard that is observable only through another guard stays a standalone test, so that a mutation of the other guard fails no row but its own.
  Where a slice finds that one mutation fails two rows, it narrows the fixture or moves one row out as a standalone test and records that, and never weakens either row.
- Pure-logic groups run with no database.
  Database groups share one PostgreSQL setup per test file and run each case inside a transaction that is rolled back, with the route's own transactions as savepoints; the schema and constraints are real, and nothing mocks the database.
  A guard whose proof needs two committed connections, such as a concurrency race, stays a standalone test that commits uniquely keyed rows and deletes them afterwards.
- Counts: 92 named tests, which are 71 standalone tests and 21 groups, and 231 cases.
  A case is one table row; a standalone test is one row, and only the approved `publication requires all four preconditions` lists four mutations in its row.

### Pricing and checkout identity (unchanged from 2026-10-07; the Gate 4 draft assignment stands)

| Test | Asserts | Mutation |
| --- | --- | --- |
| `prices come only from the confirmed revision` | a client-supplied price field is ignored and the server total is used | make `priceBasket` read a body field; test fails |
| `unknown price never becomes zero` | an item with `priceSgdCents: null` blocks review creation with `validation_failed` | default null to 0; test fails |
| `same basket twice returns the same review` | two concurrent creates yield one purchase id | drop the partial unique index; test fails |
| `a changed menu revision is a new checkout` | a different `menuRevisionId` produces a different `CheckoutKey` | remove the revision from the hash input; test fails |
| `replacement only from a terminal unpaid state` | replacing a `pending_payment` purchase is rejected with `execution_locked` | allow replacement from any state; test fails |

### Payment safety (unchanged from 2026-10-07; the Gate 4 draft assignment stands)

| Test | Asserts | Mutation |
| --- | --- | --- |
| `capture requires an owned lease` | a second concurrent completion returns the in-flight state and issues no capture | remove the lease check; test fails |
| `lost create response replays the same key` | recovery issues an identical `PayPal-Request-Id`, not a new one | generate a fresh id; test fails |
| `create_unknown without an order id is recreatable` | `decideCreateRecovery` returns `safe_to_recreate` only when no order id was ever stored | return it unconditionally; test fails |
| `capture_unknown never becomes abandoned` | the transition is rejected | allow it; test fails |
| `amount mismatch quarantines` | a provider total one cent above the snapshot yields `uncertain`, not `paid` | relax to a tolerance; test fails |
| `payee mismatch quarantines` | a different seller id yields `uncertain` plus an operator-visible audit row | drop the payee comparison; test fails |
| `duplicate webhook changes nothing` | the second event with the same id inserts no row and triggers no transition | remove the unique constraint; test fails |
| `unverified webhook signature is rejected` | a forged body yields 400 and no state change | skip verification; test fails |
| `webhook content alone cannot mark paid` | a `PAYMENT.CAPTURE.COMPLETED` event with no successful provider read leaves the purchase not `paid` | trust the event; test fails |
| `GET return page cannot capture` | landing on `/paypal/return` with arbitrary query values performs no provider write | add a capture on `GET`; test fails |
| `cancel after dispatch reports uncertain` | the response is `payment_uncertain` and the purchase stays `pending_payment` or `uncertain` | allow `unpaid_closed`; test fails |
| `expired review cannot start a payment` | `T_REVIEW` expiry yields `review_expired` | skip the clock check; test fails |
| `maintenance cannot capture` | the compiled maintenance bundle contains no reference to the capture module or endpoint path | add `orders.ts` to the runner build; test fails |

### Basket lock and PayPal abandonment (added 2026-10-11, revised after review; shared purchase and PayPal code, placed by Gate 4)

These touch code that PayPal and PYUSD share, so none is grouped.
The lock tests most likely land with the first PYUSD slice and the abandonment tests with the PayPal slices; Gate 4 decides.

| Test | Asserts | Mutation |
| --- | --- | --- |
| `an unresolved payment blocks the same basket on the other rail` | while a PayPal purchase is `uncertain`, a PYUSD review for the same outlet and lines is refused with `execution_locked`, and the reverse | key the lock by rail; test fails |
| `an abandoned PayPal order does not lock its basket` | a PayPal attempt left in `order_created` past `T_REVIEW` reads `abandoned`, its purchase reads `unpaid_closed`, and a new review of the same basket is created on either rail, with no maintenance run | lock on any `pending_payment` purchase; test fails |
| `an approved PayPal order that never returns closes unpaid` | an attempt in `externally_approved` whose buyer never returns reads `abandoned` once `T_REVIEW` passes, its purchase reads `unpaid_closed` with no capture request sent, and the next touch stores both transitions | give `externally_approved` no exit; test fails |
| `capture is never dispatched once the review has expired` | with an injected clock that crosses the review deadline between the completion route's eligibility check and its dispatch write, the compare-and-set writes nothing and no capture request is sent | drop the deadline predicate from the dispatch compare-and-set; test fails |
| `two open reviews of one basket cannot both start payment` | with a PayPal review and a PYUSD review of the same basket both open, and both execution transactions held after their first lock by an injected barrier, exactly one attempt is saved and the other start answers `execution_locked` | check the basket lock only at review creation, or check it without first locking the buyer's same-basket purchases; either mutation fails the test |

### Menu import: route refusals and upload bounds (import slice)

**Group `import route refusals read no body`**, 4 cases.
The menu-import route handler against PostgreSQL, rolled back per case; the request body is a stream that counts its pulls.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `import route rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` before admission, with no attempt row and zero body pulls | skip `assertSameOrigin`; this case fails |
| `imports refuse while disabled` | with `MENU_IMPORTS_ENABLED` false the route answers `admission_rejected` with `imports_disabled`, writes no row and pulls no body | ignore the flag; this case fails |
| `stale consent version is refused before admission` | an old `Envoi-Consent-Version` yields 409 `consent_required`, no row and zero body pulls | skip the version comparison; this case fails |
| `refused admission reads no image bytes` | with a live import already open for the outlet, admission refuses with `in_flight_outlet` and the body has been pulled zero times | read the body after the consent check but before admission; this case fails |

**Group `import upload and photo rejects`**, 8 cases.
The menu-import route handler against PostgreSQL, rolled back per case; the OpenAI fake fails the case if it is ever called.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `import body is counted, not trusted from Content-Length` | a chunked body over 2.5 MiB with a false or missing `Content-Length` stops being read within one chunk of the limit and yields `import_rejected` with `too_large`; the attempt closes `rejected_upload` | read with `request.arrayBuffer()` and check the size afterwards; the pulled-byte count exceeds the bound and this case fails |
| `slow upload stops at its read bound` | a body still arriving at `T_MENU_UPLOAD_READ` on an injected clock is abandoned with `timeout` and `rejected_upload` | remove the read timer; this case fails |
| `non-multipart body is refused` | a raw JPEG body yields `not_multipart` and `rejected_upload` | accept a raw body; this case fails |
| `second photo part is refused` | a body with a second part yields `part_count` and `rejected_upload` | accept extra parts; this case fails |
| `body without a photo part is refused` | a body whose only part has another name yields `missing_photo` and `rejected_upload` | accept a part of any name; this case fails |
| `JPEG over 2 MiB is refused inside a legal body` | a 2.3 MiB JPEG within 2,048 pixels per side, in a body under 2.5 MiB, yields `part_too_large` and `rejected_upload` | drop the part-size check, leaving only the body limit; this case fails |
| `non-JPEG content is refused even when labeled JPEG` | PNG bytes declared `image/jpeg` yield `not_jpeg` and `rejected_photo` | skip the decoded-format check; this case fails |
| `JPEG over 2,048 pixels per side is refused before decode` | a 2,049 x 100 JPEG yields `too_many_pixels` and `rejected_photo`, and the pixel-decode spy is never called | drop the header dimension check; this case fails |

**Group `import route static checks`**, 3 cases.
A static check over the route sources and the repository root; no database.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `no proxy matcher covers the import route` | a build check fails if `src/proxy.ts` or `middleware.ts` exists with a matcher that includes the menu-import path | add a catch-all proxy file; this case fails |
| `menu-import handler begins with its membership guard` | `requireOutletMembership` is the first statement of the menu-import handler | remove the guard from that handler; this case fails |
| `menu-draft handler begins with its membership guard` | `requireOutletMembership` is the first statement of the menu-draft handler | remove the guard from that handler; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `re-encoded photo carries no metadata` | a photo with EXIF GPS, XMP and a comment reaches the model fake with none of them and correctly oriented | send the uploaded bytes unchanged; test fails |
| `import writes nothing to disk` | with an empty dedicated temporary directory and file-write spies, a successful and a failing import create no file anywhere | spool the upload to a temporary file; test fails |

### Menu import: admission and spend (import slice)

**Group `menu import admission`**, 12 cases.
`admitMenuImport` against PostgreSQL, rolled back per case; limits and the spend policy are injected so each case isolates one guard, for example by raising the global in-flight limit to 2 for the outlet case.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `second live import for an outlet is refused` | with the global limit raised for isolation, a second admission for one outlet before the first deadline yields `in_flight_outlet` | drop the outlet in-flight predicate; this case fails |
| `second live import anywhere is refused` | a live import for outlet A makes an admission for outlet B yield `in_flight_global` | drop the global in-flight predicate; this case fails |
| `eleventh import for an outlet in a UTC day is refused` | with the global daily cap raised for isolation and ten completed attempts at midday UTC, the eleventh admission for the outlet yields `daily_cap_outlet` | drop the outlet daily count; this case fails |
| `fifty-first import in a UTC day is refused` | across outlets, the fifty-first admission yields `daily_cap_global` | drop the global daily count; this case fails |
| `failed and aborted attempts count toward daily caps` | ten failed or aborted attempts for one outlet exhaust its daily cap | count only completed attempts; this case fails |
| `daily caps reset at UTC midnight` | an admission at 07:59 SGT counts in the earlier UTC day and one at 08:00 SGT starts a new day | compute the day in Asia/Singapore; this case fails |
| `an expired open import does not block the next admission` | an open row past its deadline, never closed, does not count as live | count stored open rows as live; this case fails |
| `imports fail closed until a spend ceiling is recorded` | with `dailyCeilingUsdMicros: null` every admission yields `spend_ceiling_unset` | treat a null ceiling as unlimited; this case fails |
| `unreviewed menu model is refused` | an `AI_MENU_MODEL` with no reviewed bounds entry yields `model_bounds_missing` | fall back to default bounds; this case fails |
| `reservation beyond the daily ceiling is refused` | when the day's held reservations of live attempts plus a new one exceed the ceiling, admission yields `spend_ceiling_reached` | compare only recorded actual spend; this case fails |
| `usage above its reservation stops further imports` | once an attempt records actual spend above its reservation, the next admission yields `model_bounds_exceeded` | ignore recorded usage at admission; this case fails |
| `an attempt closed before the model call releases its reservation` | an attempt closed `rejected_photo` with no dispatch mark counts zero, so an admission that fits only without it is admitted | count every reservation whatever its dispatch mark; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `concurrent admissions admit one` | two simultaneous admissions produce exactly one open row | remove the singleton row lock; test fails |
| `aborted attempt keeps its spend reservation` | after an aborted call whose dispatch was recorded, the day's held reservations still include that attempt, so an admission that fits only without it yields `spend_ceiling_reached` | release a reservation whenever its attempt closes, ignoring the dispatch mark; test fails |
| `model dispatch is recorded before the call` | when the OpenAI fake receives the request, a second connection already sees the attempt's committed `model_dispatched_at` | write the dispatch mark after the call returns, or inside a transaction still open during the call; test fails |

### Menu import: vision call and leak boundary (import slice)

OpenAI HTTP is faked at the provider's fetch boundary, and every fake response is a labeled fixture.

**Group `menu vision request`**, 8 cases.
The menu-import route handler against PostgreSQL, rolled back per case, with the fake fetch capturing the one request.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `menu vision request sets store false` | the request body captured at the fake fetch boundary contains `"store": false` | omit the provider option; this case fails |
| `menu vision request carries no tools` | the captured request body has no `tools` field | register a read tool on the call; this case fails |
| `menu vision call is never retried` | a fake 500 response produces exactly one HTTP request and `model_failed` | leave `maxRetries` at the SDK default; this case fails |
| `menu vision schema is strict with required nullable fields` | the captured schema is strict, lists every property as required and allows null for each unknown value | make `priceText` optional; this case fails |
| `menu vision output is capped at the reviewed token bound` | the captured output-token limit equals the reviewed bounds entry | omit `maxOutputTokens`; this case fails |
| `menu vision uses AI_MENU_MODEL, not AI_MODEL` | with the two names set to different values, the captured request names the `AI_MENU_MODEL` value | read `AI_MODEL`; this case fails |
| `model budget keeps the commit reserve` | after a 40-second upload on an injected clock, the model abort fires at 45 seconds, and never later than 60 seconds | use a fixed 60-second budget; this case fails |
| `client disconnect aborts the model call` | aborting the request signal aborts the in-flight fake call and closes the attempt `aborted` | stop passing the request signal; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `image bytes never reach logs, responses or audit` | the scanner's self-test first detects a planted needle as raw base64, as a data URL and as a JSON-escaped string in the actual serialized log format; then a fake `APICallError` carrying the needle in its body values, response body, message and cause runs through the route, and the serialized logs, the HTTP response and the audit rows contain no needle | log the whole error object; test fails |
| `import tables have no image column` | schema introspection finds no `bytea` column and no image, hash, URL or data column in `menu_imports` or `audit_events` | add an `image_sha256` column; test fails |
| `an abandoned import reads as expired with no write` | in a read-only transaction, `GET menu-draft` reports an open row past its deadline as `expired` | trust the stored state; test fails |
| `draft reload reports the latest import outcome` | after a commit whose response was dropped, `GET menu-draft` returns `completed` with the merged rows | return the draft without the import outcome; test fails |

### Menu import: draft validation, merge and commit (import slice)

Five of these cases keep names approved on 2026-10-07; the planned merge of S11 and S12 already requires Gate 4 to reassign them.

**Group `vision draft validation`**, 8 cases.
`validateVisionDraft` on fixture model outputs; pure, no database.
A failed validation cannot reach `commitImport`, whose input type accepts only a successful one.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `malformed result is an error not a repair` | schema-violating model output yields `malformed`, never a repaired or empty item list | coerce schema-violating output to an empty item list; this case fails |
| `blank price stays blank` | unreadable price text such as "market price" keeps `priceSgdCents: null` | default a null price to 0; this case fails |
| `more than 100 draft rows is refused` | 101 rows yield `output_invalid` with `too_many_rows` | drop the row cap; this case fails |
| `draft text over 120 characters is refused` | a 121-character name yields `text_too_long` | drop the text cap; this case fails |
| `draft result over 128 KiB is refused` | a result whose validated serialization exceeds 128 KiB yields `oversize` | drop the size cap; this case fails |
| `non-SGD price stays blank` | a price marked in another currency yields `priceSgdCents: null` and `other_currency` | accept the printed number; this case fails |
| `zero or malformed price text stays blank` | "0", "-1", "3.505" and "1e3" each yield `priceBasis: "ambiguous"` | parse with `parseFloat`; this case fails |
| `duplicate variants are flagged for the merchant` | two rows with the same name and portion both keep null prices marked `duplicate_variant` | keep the first row's price; this case fails |

**Group `import commit merges nothing unless every recheck passes`**, 4 cases.
`commitImport` against PostgreSQL, rolled back per case.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `late result is rejected` | a model result committing after `T_MENU_REQUEST` yields `import_expired`, outcome `expired` and no draft change | accept it; this case fails |
| `base revision change is rejected` | a result for a superseded revision yields `import_base_revision_changed`, outcome `conflict_base_revision` and no draft change | drop the comparison; this case fails |
| `confirmed menu is never overwritten` | a model result committing after confirmation yields `conflict_confirmed` and changes nothing | allow the write; this case fails |
| `membership removed during an import merges nothing` | with the actor's membership revoked after admission, the commit yields `forbidden_membership`, outcome `membership_revoked` and no draft change | drop the membership recheck from `commitImport`; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `merchant edits survive a merge` | a merchant-corrected name and price are unchanged after a merge | overwrite from suggestions; test fails |

### Scan, suggestions and authorization (unchanged from 2026-10-07; the Gate 4 draft assignment stands)

`raw QR payload is not logged` moved here from the removed image section; its name, assertion and mutation are unchanged.

| Test | Asserts | Mutation |
| --- | --- | --- |
| `raw QR payload is not logged` | an injected self-test proves the redaction scanner detects a planted payload in the actual serialized log output, including escaped and forward-slash path variants | remove redaction; test fails |
| `unrecognized tags are surfaced not guessed` | an unknown tag appears in `unrecognized` and no field is invented | drop unknown tags; test fails |
| `unenrolled sticker yields no purchase` | `no_match` and no enrollment row is created | auto-create an outlet; test fails |
| `shared identifier asks which outlet` | `ambiguous` with distinguishers, no proximity inference | pick the first match; test fails |
| `scan grants no destination and no rail` | a resolution contains neither a payee nor a rail | add them; test fails |
| `model cannot invent a price` | a suggestion containing an unregistered item id is dropped | trust the model output; test fails |
| `model tool budget is enforced` | the fourth tool call aborts with `budget_exceeded` | remove the counter; test fails |
| `anonymous buyer cannot reach a merchant route` | 403 with `forbidden_membership` | check only authentication; test fails |
| `linking an anonymous account creates no membership` | after `onLinkAccount`, merchant routes still return 403 | create a membership on link; test fails |
| `linking preserves purchase ownership` | with `disableDeleteAnonymousUser: true`, the pre-link receipt is still readable after link | leave the default deletion on; test fails |
| `auth configuration matches the approved gate` | a config check fails while `neon.ts` sets `auth: true` and no recorded Gate 2 amendment exists | flip the flag; test fails |
| `no secret reaches the committed tree` | an injected self-test plants a connection string, a bearer value and a Windows path in the staged surface and proves the scanner detects each, including escaped-JSON and forward-slash variants | remove a detection rule; the self-test fails |
| `membership is per outlet` | a member of outlet A gets 403 on outlet B | check any membership; test fails |
| `agent token cannot read a receipt` | 403 on `GET /purchases/{id}` | accept the agent principal; test fails |
| `handoff redeems once` | the second redemption yields `already_redeemed` | remove the constraint; test fails |
| `handoff carries no amount` | redemption re-prices server-side and ignores any agent-supplied total | accept the agent total; test fails |

### Publication and free-capacity behaviour (unchanged from 2026-10-07; the Gate 4 draft assignment stands)

| Test | Asserts | Mutation |
| --- | --- | --- |
| `publication requires all four preconditions` | enrollment, outlet confirmation, menu confirmation and an active destination each independently block | remove any one; four separate mutations, four failures |
| `incomplete menu blocks confirmation` | `assessMenuCompleteness` returns the offending item ids | treat unknown availability as available; test fails |
| `editing a published menu creates an unpublished revision` | buyers still read the previously confirmed revision | mutate in place; test fails |
| `maintenance run is finite` | the runner exits, writes a heartbeat and holds no connection after `T_MAINT_RUN` | add a poll loop; test fails |
| `overlapping runs claim disjoint work` | two concurrent claimers get different rows | remove the lease predicate; test fails |
| `polling stops at a terminal state` | a receipt page issues no further requests after `paid` | keep polling; test fails |
| `region latency is measured, not assumed` | a Slice 1 measurement records the real round-trip time from a Singapore client to `aws-us-east-2` on a genuinely cold first visit, and the recorded value is compared against the three-minute budget | skip the measurement and assert the metric passes; the evidence is absent and the claim fails |

If the region measurement shows trans-Pacific round trips consuming a material share of the three-minute budget, relocation to a Singapore region must be revisited as a provisioning decision rather than absorbed silently.

### PYUSD identity, configuration and isolation (PYUSD purchase slice)

**Group `PYUSD identity check`**, 3 cases.
`checkPyusdIdentity` over a fake RPC client; no database.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `wrong genesis hash disables PYUSD` | an RPC reporting the mainnet genesis hash yields `genesis_mismatch` | skip the genesis comparison; this case fails |
| `mint under another token program disables PYUSD` | a mint account owned by the original token program yields `mint_program_mismatch` | skip the mint owner-program check; this case fails |
| `mint with other decimals disables PYUSD` | a mint reporting 9 decimals yields `mint_decimals_mismatch` | skip the decimals check; this case fails |

**Group `PYUSD static boundary checks`**, 7 cases.
Static analysis of the built server and runner bundles, the import graph and the route sources; no database.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `PayPal code imports no Solana module` | the import graph from PayPal routes, `src/integrations/paypal/**` and `reconcile_attempts` reaches no `@solana/*`, `@solana-program/*` or `src/integrations/solana/**` module | import a Solana helper into a PayPal module; this case fails |
| `server never sends a transaction` | the built server and runner bundles contain no `sendTransaction`, `sendRawTransaction` or `requestAirdrop` method name, and `SolanaReadClient` has no such member | add a `sendTransaction` call to the RPC client; this case fails |
| `wallet challenge handler begins with its membership guard` | `requireOutletMembership` is the first statement of the challenge handler | remove the guard from that handler; this case fails |
| `wallet proof handler begins with its membership guard` | `requireOutletMembership` is the first statement of the proof handler | remove the guard from that handler; this case fails |
| `rate handler begins with its membership guard` | `requireOutletMembership` is the first statement of the rate handler | remove the guard from that handler; this case fails |
| `preparation handler begins with its buyer guard` | `requireBuyerSession` is the first statement of the preparation handler | remove the guard from that handler; this case fails |
| `signature hint handler begins with its buyer guard` | `requireBuyerSession` is the first statement of the hint handler | remove the guard from that handler; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `only two settings configure the PYUSD rail` | the environment schema accepts `SOLANA_RPC_URL` and `PYUSD_ENABLED` for this rail and rejects a `PYUSD_MINT` or `SOLANA_CLUSTER` value at boot | add an optional mint override; test fails |
| `PYUSD failure leaves PayPal working` | with the RPC unreachable, and separately with a genesis mismatch, the app boots and the labeled PayPal fixture journey still starts and completes | initialize PYUSD at boot and throw on failure; test fails |
| `a PYUSD-only shop cannot publish while PYUSD is disabled` | an outlet whose only verified destination is PYUSD cannot publish while `PYUSD_ENABLED` is false | count a disabled rail's destination as active; test fails |

### PYUSD merchant wallet and rate (PYUSD purchase slice)

**Group `merchant PYUSD routes`**, 17 cases.
The challenge, proof and rate route handlers against PostgreSQL, rolled back per case, over a fake RPC transport; every row except its own runs with the rail enabled, a same-origin request and a matching devnet identity.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `wallet challenge refuses while the rail is disabled` | with `PYUSD_ENABLED` false the challenge route answers `pyusd_unavailable` with `rail_disabled` and writes no challenge | remove `requirePyusdEnabled` from the challenge route; this case fails |
| `wallet proof refuses while the rail is disabled` | with `PYUSD_ENABLED` false the proof route answers `pyusd_unavailable` with `rail_disabled` and records no destination | remove `requirePyusdEnabled` from the proof route; this case fails |
| `rate change refuses while the rail is disabled` | with `PYUSD_ENABLED` false the rate route answers `pyusd_unavailable` with `rail_disabled` and writes no rate version | remove `requirePyusdEnabled` from the rate route; this case fails |
| `wallet challenge rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` and no challenge | remove `assertSameOrigin` from the challenge route; this case fails |
| `wallet proof rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` and no destination | remove `assertSameOrigin` from the proof route; this case fails |
| `rate change rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` and no rate version | remove `assertSameOrigin` from the rate route; this case fails |
| `wallet proof refuses on an identity mismatch` | an RPC reporting the mainnet genesis makes the proof answer `pyusd_unavailable` with `genesis_mismatch` and record no destination | skip the identity check in the proof route; this case fails |
| `wallet challenge names Envoi's configured domain and devnet` | with a forged `Host` header, the challenge still names the `APP_BASE_URL` host and `Chain ID: devnet` | build the domain from the `Host` header; this case fails |
| `wallet challenges are rate limited per outlet` | the eleventh challenge for one outlet within an hour yields `rate_limited` | remove the challenge limiter; this case fails |
| `invalid wallet signature is refused` | a signature that does not verify under the challenge's wallet yields `signature_invalid` | skip Ed25519 verification; this case fails |
| `wallet challenge expires after five minutes` | a valid signature submitted at `T_WALLET_CHALLENGE` yields `challenge_expired` | skip the expiry check; this case fails |
| `wallet challenge for another outlet is refused` | a challenge issued for outlet A and submitted on outlet B's route by a member of both yields `challenge_other_outlet` | ignore the challenge's outlet; this case fails |
| `merchant token account is derived, never supplied` | a token-account address added to the proof body is ignored, and the derived associated account is the one checked and stored | accept a token account from the body; this case fails |
| `missing merchant token account is refused` | a wallet with no PYUSD associated account yields `token_account_missing` | skip the existence check; this case fails |
| `merchant token account under another program is refused` | a system-owned account at the derived address yields `token_account_not_token_2022` | skip the program-owner check on the token account; this case fails |
| `frozen merchant token account is refused` | a frozen derived account yields `token_account_frozen` | skip the frozen-state check; this case fails |
| `wallet proof creates no membership or enrollment` | after a valid proof, no membership or enrollment row is created or changed | approve the enrollment on proof; this case fails |

**Group `rate parsing, bounds and conversion`**, 4 cases.
`src/domain/pyusd/rate.ts` on literal inputs; pure, no database.
The bounds fixture is chosen so that its exact product is divisible by 100, so rounding cannot decide it.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `PYUSD amount rounds up to the next atomic unit` | 350 cents at an illustrative 742,115 atomic units per S$1 gives 2,597,403, not 2,597,402 | use floor division; this case fails |
| `rate arithmetic is exact at its bounds` | the largest allowed basket total at the maximum rate equals the exact BigInt result | multiply as JavaScript numbers; this case fails |
| `rate text must be a plain decimal with at most six places` | "-1", "1e3", " 0.7" and "0.7421151" are each refused | parse with `Number()` and round; this case fails |
| `rate outside its bounds is refused` | "0", "0.000000" and "10.000001" are each refused | drop the bounds check; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `wallet proof verifies the saved challenge bytes` | a signature over an altered message, submitted with that altered text, is refused | verify against message text taken from the request; test fails |
| `wallet challenge is single-use` | two concurrent proofs for one challenge record one destination, and the other yields `challenge_used` | drop the `consumed_at IS NULL` predicate; test fails |
| `a changed PYUSD rate is a new checkout` | inputs that differ only in `pyusdRateVersionId` produce different `CheckoutKey`s | leave the rate version out of the hash; test fails |
| `rate change never alters a prepared attempt` | after a new rate version, a prepared attempt keeps its amount and still verifies | re-price open attempts on a rate change; test fails |

### PYUSD pricing and preparation (PYUSD purchase slice)

Solana RPC is faked at the bounded transport, and every fake response is a labeled fixture.

**Group `PYUSD pricing`**, 2 cases.
`priceBasket` with rail `pyusd` against PostgreSQL, rolled back per case.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `PYUSD pricing refuses while the rail is disabled` | with `PYUSD_ENABLED` false, PYUSD pricing answers `pyusd_unavailable` with `rail_disabled` and creates no review | remove `requirePyusdEnabled` from PYUSD pricing; this case fails |
| `rate older than 30 days makes PYUSD unavailable` | a rate confirmed exactly `T_RATE_AGE` ago yields `rate_expired` at pricing, and one a millisecond younger prices | skip the age check at pricing; this case fails |

**Group `mint eligibility for a transfer`**, 5 cases.
`assessMintForTransfer` on decoded mint fixtures; pure, no database.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `non-zero transfer fee rate refuses preparation` | a current schedule with basis points above zero yields `fee_rate_nonzero` | skip the basis-point check; this case fails |
| `non-zero maximum fee refuses preparation` | a current schedule with zero basis points and a non-zero maximum fee yields `max_fee_nonzero` | skip the maximum-fee check; this case fails |
| `non-zero fee in the next epoch refuses preparation` | a zero current schedule with a non-zero newer schedule effective next epoch yields `fee_next_epoch_nonzero` | check only the current epoch; this case fails |
| `active transfer hook refuses preparation` | a transfer-hook extension with a non-null program yields `transfer_hook_active` | ignore the hook program; this case fails |
| `unreviewed mint extension refuses preparation` | a mint carrying an extension outside the eight reviewed ones, such as pausable, yields `unreviewed_extension` | ignore unknown extensions; this case fails |

**Group `PYUSD preparation`**, 15 cases.
The preparation route handler against PostgreSQL, rolled back per case with its transaction as a savepoint, over a fake RPC transport.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `preparation refuses while the rail is disabled` | with `PYUSD_ENABLED` false, preparation of a review priced while the flag was on answers `pyusd_unavailable` with `rail_disabled` and saves no attempt | remove `requirePyusdEnabled` from preparation; this case fails |
| `preparation rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` and no attempt | remove `assertSameOrigin` from preparation; this case fails |
| `preparation requires the owning buyer` | another anonymous session gets 404 and no attempt | drop the owner predicate on preparation; this case fails |
| `payments kill switch refuses PYUSD preparation` | with `PAYMENTS_ENABLED` false, preparation answers `pyusd_unavailable` with `payments_disabled` and saves no attempt | skip the kill-switch check in PYUSD eligibility; this case fails |
| `stale review cannot prepare PYUSD` | a review past `T_REVIEW` yields `review_expired` at preparation | skip the `T_REVIEW` check in PYUSD eligibility; this case fails |
| `preparation refuses on an identity mismatch` | an RPC reporting the mainnet genesis makes preparation answer `pyusd_unavailable` with `genesis_mismatch` and save no attempt | skip the identity check in preparation; this case fails |
| `preparation refuses an ineligible mint` | a mint with a non-zero current fee rate makes preparation answer `pyusd_unavailable` with `fee_rate_nonzero` and save no attempt | skip `assessMintForTransfer` in preparation; this case fails |
| `rate change invalidates an unexecuted PYUSD review at preparation` | a review pinned to an older rate version fails preparation with `review_invalidated` | skip the rate-version recheck; this case fails |
| `rate expiry between review and preparation refuses preparation` | a review priced one minute before the rate reaches `T_RATE_AGE` fails preparation after it does | check the age only at pricing; this case fails |
| `buyer without enough PYUSD cannot prepare` | a buyer whose associated account is missing, or holds one atomic unit less than the amount, is refused with no attempt | skip the buyer balance check; this case fails |
| `frozen buyer token account cannot prepare` | a frozen buyer account is refused with no attempt | skip the buyer frozen check; this case fails |
| `merchant token account is rechecked at preparation` | a merchant account frozen after its proof refuses preparation with no attempt | skip the merchant account check in preparation; this case fails |
| `no unsigned bytes leave before the attempt is saved` | when the attempt insert fails, the response carries no transaction | build and return the bytes before the commit; this case fails |
| `a prepared purchase never releases bytes again` | a second preparation call for the same wallet, and one naming another wallet, each return `locked` with the attempt state and no transaction | return the transaction again for an existing attempt; this case fails |
| `released transaction bytes are never stored` | after a successful preparation, a scan of the attempt row, its audit row and the purchase row finds no copy of the returned transaction as base64, base64url or hex, and the same scan finds the bytes when the case plants them in the attempt row | save the wire bytes on the attempt; this case fails |

**Group `PYUSD attempt constraints`**, 2 cases.
Direct inserts against the real schema in PostgreSQL, rolled back per case.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `memo reference is unique per attempt` | inserting a second attempt with an existing reference violates a unique constraint | drop the reference unique index; this case fails |
| `a finalized signature binds to one attempt` | binding one signature to a second attempt violates a unique constraint | drop the signature unique index; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `prepared transaction is exactly a memo and one TransferChecked` | the decoded message is version 0 with no lookup tables, the buyer as fee payer, a memo equal to the reference, then one Token-2022 `TransferChecked` for the exact amount and 6 decimals, and nothing else | add a compute-unit price instruction; test fails. Swapping to `Transfer` or dropping the memo each fail the same test |
| `cancel after PYUSD preparation reports checking` | cancel on a purchase with a prepared attempt yields `payment_uncertain` and the purchase stays `pending_payment` | allow `unpaid_closed`; test fails |

### PYUSD wallet handoff, hints and receipt (PYUSD purchase slice)

**Group `browser wallet handoff`**, 4 cases.
The browser wallet modules with a fake Wallet Standard registry; no database and no network.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `wallet is asked for solana:devnet` | the fake Wallet Standard wallet receives `chain: "solana:devnet"` and the exact prepared bytes | omit the chain; this case fails |
| `wallet without devnet sign-and-send is not offered` | a wallet lacking `solana:devnet` or the sign-and-send feature is not listed | skip the capability filter; this case fails |
| `Phantom link carries only public outlet and item ids and the rail` | the decoded link targets `APP_BASE_URL/buy` with exactly the outlet id, the item-quantity pairs and `rail=pyusd`, and no purchase id, session, price or payee | add the purchase id to the link; this case fails |
| `the wallet is asked once per released transaction` | after one `signAndSendTransaction` call that resolves, rejects or throws, a second pay action makes no wallet call and the page shows "checking payment" | keep the bytes after the wallet call; this case fails |

**Group `signature hints and reconcile before expiry`**, 8 cases.
The hint and reconcile route handlers against PostgreSQL, rolled back per case, over a fake RPC transport whose block height stays below the attempt's bound.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `signature hint rejects a foreign Origin` | a foreign `Origin` yields 403 `forbidden_origin` and no hint is saved | remove `assertSameOrigin` from the hint route; this case fails |
| `signature hint requires the owning buyer` | another anonymous session gets 404 and no hint is saved | drop the owner predicate on the hint route; this case fails |
| `submitted signature is only a hint` | posting a signature changes no purchase state until a finalized read verifies it | mark the purchase paid on the hint; this case fails |
| `user-triggered PYUSD reads are debounced` | two reconcile calls within `T_PROVIDER_READ_DEBOUNCE` cause one RPC read | skip the debounce; this case fails |
| `a failed landing leaves the attempt prepared` | a hint naming a failed transaction that carries our reference is decided `failed_landing` and changes no attempt or purchase state | treat a failed landing as a mismatch; this case fails |
| `a later hint is verified when the first is not ours` | after a first hint decided `not_ours`, a second hint naming the real transfer is read once the debounce allows and confirms the attempt | audit every hint after the first without reading it; this case fails |
| `hints beyond the per-attempt cap are not read` | with three hints decided `not_ours`, a fourth is audited only and causes no RPC read | drop the hint cap; this case fails |
| `disabled rail still reconciles prepared attempts` | with `PYUSD_ENABLED` false, a prepared attempt's hint is still read and verified, and the attempt can become `confirmed` | gate hint verification and reconcile on the flag; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `phone without a wallet gets the Phantom link, not a pay button` | at 390px with a mobile user agent and no wallet, the review shows the link and no pay button | show the pay button whenever PYUSD is selected; test fails |
| `PYUSD receipt says transferred and finalized on devnet` | a confirmed receipt says "Transferred and finalized on Solana devnet" with the signature, recipient and amount, and never "kept", "settled" or an SGD settlement | change the copy to "received"; test fails |
| `a PYUSD mismatch can close only unpaid` | `canTransitionPyusdAttempt` allows `mismatch -> closed_unpaid`, the operator exit, and refuses `mismatch -> confirmed` | allow `mismatch -> confirmed`; test fails |

### PYUSD verification by meaning (PYUSD purchase slice)

**Group `PYUSD verification by meaning`**, 22 cases.
`verifyPyusdTransfer` on synthetic landed transactions, each changing one thing in one Phantom-shaped valid fixture; pure, no database.
The mint and decimals fixtures are marked successful although Token-2022 would refuse them on chain, so each isolates its own rule.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `ComputeBudget and Lighthouse assertions are accepted` | the valid fixture, with a compute-unit price and a Lighthouse token-account assertion added, is `confirmed` | reject every instruction beyond the two prepared ones; this case fails |
| `failed transaction is never paid` | the fixture with an execution error is `failed_landing` | ignore `meta.err`; this case fails |
| `other blockhash leaves the transfer uncertain` | a different recent blockhash yields `blockhash_mismatch` | skip the blockhash comparison; this case fails |
| `second signer leaves the transfer uncertain` | two required signatures yield `extra_signer` | skip the signer count; this case fails |
| `another fee payer leaves the transfer uncertain` | a first account key other than the buyer yields `fee_payer_mismatch` | skip the fee-payer comparison; this case fails |
| `zero or two TransferChecked leave the transfer uncertain` | none, or two, yield `transfer_count` | use the first transfer found; this case fails |
| `transfer of another mint is not paid` | a `TransferChecked` whose mint account is not the pinned mint yields `mint_mismatch` | skip the mint comparison; this case fails |
| `transfer with other decimals is not paid` | a `TransferChecked` whose decimals byte is 9 yields `decimals_mismatch` | skip the decimals comparison; this case fails |
| `transfer from another source is not paid` | a different source account yields `source_mismatch` | skip the source comparison; this case fails |
| `transfer to another destination is not paid` | a different destination yields `destination_mismatch` | skip the destination comparison; this case fails |
| `amount off by one atomic unit is not paid` | one unit more and one unit less each yield `amount_mismatch` | accept any amount at least the expected one; this case fails |
| `duplicate memo leaves the transfer uncertain` | a second pinned memo beside ours yields `memo_count` | accept any memo count; this case fails |
| `memo without the reference is not ours` | a memo with other text yields `not_ours` and never `confirmed` | skip the memo content comparison; this case fails |
| `fee at the execution epoch must be zero` | an isolating fixture with an exact balance delta but a non-zero schedule for the execution epoch yields `fee_nonzero_at_execution` | skip the execution-epoch fee check; this case fails |
| `destination delta must equal the amount` | an isolating fixture with a zero fee schedule but metadata balances one unit short yields `balance_delta_mismatch` | skip the balance-delta check; this case fails |
| `incomplete metadata leaves the transfer uncertain` | missing token balances or inner instructions yield `metadata_incomplete` | treat missing metadata as empty; this case fails |
| `an added non-allowlisted instruction leaves the transfer uncertain` | an extra System transfer yields `outer_instruction_not_allowlisted` | allow any outer program; this case fails |
| `outer Lighthouse memory instruction is not allowlisted` | an outer Lighthouse instruction with discriminator 0 yields `lighthouse_not_assertion` | allow every outer Lighthouse instruction; this case fails |
| `inner Lighthouse memory instruction is not allowlisted` | an inner Lighthouse instruction with discriminator 0 yields `lighthouse_not_assertion` | allow every inner Lighthouse instruction; this case fails |
| `inner instruction from another program leaves the transfer uncertain` | an inner System instruction yields `inner_program_not_allowlisted` | skip the inner program check; this case fails |
| `inner instruction that moves tokens or changes authority leaves it uncertain` | inner Token-2022 `Transfer` and `SetAuthority` each yield `inner_instruction_not_allowlisted` | allow any inner Token-2022 instruction; this case fails |
| `unresolvable account keys leave the transfer uncertain` | an unsupported version or missing loaded addresses yield `account_keys_unresolved` | resolve static keys only; this case fails |

### PYUSD RPC transport and budget (PYUSD purchase slice)

**Group `bounded RPC transport`**, 4 cases.
`createSolanaReadClient` over a fake transport; no database.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `preparation uses a confirmed blockhash` | the blockhash read is sent at `confirmed` commitment | request a finalized blockhash; this case fails |
| `verification reads at finalized commitment` | every transaction and signature read is sent at `finalized` commitment | read at `confirmed`; this case fails |
| `oversized RPC response is refused` | a response over 1 MiB is cut off and returns `too_large` | read the response unbounded; this case fails |
| `RPC call stops at its timeout` | a fake RPC that never answers is abandoned at `T_RPC_CALL` and returns `unavailable` | remove the call timeout; this case fails |

**Group `shared RPC limiter`**, 5 cases.
`createDatabaseRpcLimiter` against PostgreSQL, rolled back per case; two limiter instances share the case's connection and stand in for the web app and the runner.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `RPC calls stop at 20 per 10 seconds across web and runner` | two limiter clients on one database together get 20 acquisitions in a window | count per process; this case fails |
| `one RPC method stops at 10 per 10 seconds` | the eleventh acquisition for one method in a window is refused while another method still succeeds | drop the per-method count; this case fails |
| `at most two RPC requests run at once` | a third concurrent acquisition is refused until a slot frees | drop the slot rows; this case fails |
| `RPC 429 backs off every caller` | after a reported 429, both limiter instances are refused for the jittered backoff | retry immediately; this case fails |
| `abandoned RPC slot is reclaimed after its lease` | a slot whose holder crashed becomes available after `T_RPC_SLOT_LEASE` | never expire slot leases; this case fails |

### PYUSD recovery (PYUSD recovery slice)

**Group `PYUSD recovery over a fake chain`**, 15 cases.
The shared reconcile path against PostgreSQL, rolled back per case, over a fake RPC transport with injected confirmed and finalized heights.
Two cases added for fix M call the outcome writer or insert directly, so they do not depend on candidate classification.

| Case | Asserts | Mutation |
| --- | --- | --- |
| `release waits for finalized height past the saved bound` | with confirmed height above `lastValidBlockHeight` and finalized height equal to it, the attempt stays `prepared` | compare the confirmed height, or use `>=`; this case fails |
| `scan starts only after expiry is final` | with the confirmed and finalized heights both at or below the bound, no signature page is requested | start scanning on the first reconcile; this case fails |
| `scan that never reaches before preparation is incomplete` | pages that end with every signature at or after `preparationSlot` leave the attempt `expired_scanning` | treat the end of pages as complete; this case fails |
| `scan stops at the page cap without releasing` | stopping at the 3-page cap records `page_cap` and leaves the attempt locked | treat the page cap as the end of history; this case fails |
| `scan stops at the fetch cap without releasing` | stopping at the 20-fetch cap records `page_cap` and leaves the attempt locked | treat the fetch cap as the end of history; this case fails |
| `scan resumes from its saved cursor` | the next claim requests the page before the persisted cursor | restart from the newest signature; this case fails |
| `429 or null transaction keeps the attempt locked` | a rate-limited page, a null candidate transaction or a candidate read that timed out as `unavailable` leaves the cursor and state unchanged | skip the undecided candidate and advance; this case fails |
| `a successful transaction with our reference that fails verification blocks release` | once the window scan completes with no verifying landing, such a candidate moves the attempt to `mismatch` and the purchase to `uncertain` (revised 2026-10-18) | treat it as not ours and continue; this case fails |
| `automatic unpaid release stays off until its proofs are recorded` | a complete empty scan ends in `held_no_match` while `PYUSD_PROOFS.automaticUnpaidRelease` is false | default the switch to true; this case fails |
| `a complete empty scan closes the attempt once release is enabled` | with the switch true, a complete empty scan ends in `closed_unpaid`, the purchase `unpaid_closed` and the basket unlocked | never release; this case fails |
| `devnet reset stops verification and scanning` | a genesis mismatch during recovery records `identity_changed` and changes no state | skip the identity check in recovery; this case fails |
| `a confirmed or mismatched attempt is still scanned after expiry` | a hint-confirmed attempt and a mismatched attempt whose finalized height passes the bound each get a window scan that runs to completion, after which `decideRecoveryStep` yields `done` for the confirmed attempt and `operator` for the mismatched one (revised 2026-10-18 to match the call stack) | yield `done` for `confirmed` or `mismatch` before the window scan completes; this case fails |
| `the scan continues after a transfer binds` | an expired attempt whose window holds the verified transfer and older signatures binds it and still reaches before `preparationSlot` | stop the scan when a candidate binds; this case fails |
| `an extra transfer keeps the purchase paid and alerts the operator` | applying an `extra` outcome to a confirmed attempt records the transfer with its destination delta, leaves the purchase `paid` and the bound evidence unchanged, and lists it in the operator health view | move the purchase to `uncertain` on an extra transfer; this case fails |
| `an extra transfer is recorded once per attempt` | inserting the same attempt and signature into the extra-transfer table twice violates a unique constraint, so a resumed scan cannot record one twice | drop the unique index; this case fails |

Standalone tests:

| Test | Asserts | Mutation |
| --- | --- | --- |
| `web and runner cannot scan one attempt at once` | a web reconcile and a runner claim on one expired attempt advance its coverage once | skip the lease claim in the web reconcile path; test fails |
| `a second reference landing is an extra transfer` | `classifyScanCandidate` returns `extra` with the destination delta for a successful transaction carrying the reference while another signature is bound, whether or not it verifies, and `skip` for the bound signature itself | classify every candidate as `skip` once a signature is bound; test fails |
| `PYUSD receipt shows a detected extra transfer` | a paid receipt with one extra transfer says an extra transfer of that amount was detected on Solana devnet and that any refund is arranged with the shop outside Envoi, and never says it was refunded or that Envoi will refund it | hide extra transfers on a paid receipt; test fails |

Integration tests run against a real PostgreSQL instance with the real schema and real constraints, because the guarantees above are index and transaction guarantees. A mocked database would prove none of them. Provider HTTP is faked at the `PayPalWriteClient` boundary, and every faked response is labeled as a fixture in test output and evidence.
Since 2026-10-11, OpenAI HTTP is faked at the provider's fetch boundary and Solana RPC at the bounded transport, under the same labeling rule; landed-transaction fixtures are synthetic unless a slice records real devnet evidence for them.

## Test delta for the Gate 4 revision

**Rewritten 2026-10-11 after review, replacing the earlier draft's list, and revised the same day for fixes L and M after Gate 2 was reopened.**
The unapproved Gate 4 draft assigns each of the 54 Gate 3 test names approved on 2026-10-07 exactly once.
The earlier draft of this revision kept 47 of them, removed 7 and added 145 names, for 192 named tests.
This version batches them: 92 named tests, which are 71 standalone tests and 21 groups, and 231 cases.
`04-slices.md` is not edited by this gate, so its assignment check will fail until Gate 4 applies this delta.

- **Previous names:** 199, which are the 54 approved on 2026-10-07 and the 145 drafted additions.
- **Removed (10):** the 7 image-boundary names the earlier draft removed, all assigned to S11 in the Gate 4 draft, `Lighthouse program must be an executable devnet program`, removed with Lighthouse from the runtime identity check, and two preparation names fix L makes redundant, `expired bytes are never released again` and `a second wallet cannot prepare a locked purchase`.
- **Kept as standalone tests with the same name (63):** 42 approved and 21 drafted names.
- **Grouped (126):** 5 approved and 121 drafted names now run as rows of a group.
  116 keep their name as the case name, 2 are renamed, and 8 names that covered several call sites or cases split into 29 rows.
- **Added (21 cases):** 13 rows in groups and 8 standalone tests, each tied to the review fix that needs it.
- **Totals:** 92 named tests and 231 cases, against 192 named tests in the earlier draft.
  By slice unit: the 2026-10-07 core keeps 41 named tests and 41 cases; the basket lock and PayPal abandonment have 5 and 5; the import slice has 17 and 57; the PYUSD purchase slice has 25 and 110; and the PYUSD recovery slice has 4 and 18.

Every previous name maps below to where it now runs; a group case is written as the group, an arrow and the case.
Every case in the test plan appears exactly once in the "Now" column of these two tables.

| Previous name | From | Now |
| --- | --- | --- |
| `prices come only from the confirmed revision` | 2026-10-07 | standalone `prices come only from the confirmed revision` |
| `unknown price never becomes zero` | 2026-10-07 | standalone `unknown price never becomes zero` |
| `same basket twice returns the same review` | 2026-10-07 | standalone `same basket twice returns the same review` |
| `a changed menu revision is a new checkout` | 2026-10-07 | standalone `a changed menu revision is a new checkout` |
| `replacement only from a terminal unpaid state` | 2026-10-07 | standalone `replacement only from a terminal unpaid state` |
| `capture requires an owned lease` | 2026-10-07 | standalone `capture requires an owned lease` |
| `lost create response replays the same key` | 2026-10-07 | standalone `lost create response replays the same key` |
| `create_unknown without an order id is recreatable` | 2026-10-07 | standalone `create_unknown without an order id is recreatable` |
| `capture_unknown never becomes abandoned` | 2026-10-07 | standalone `capture_unknown never becomes abandoned` |
| `amount mismatch quarantines` | 2026-10-07 | standalone `amount mismatch quarantines` |
| `payee mismatch quarantines` | 2026-10-07 | standalone `payee mismatch quarantines` |
| `duplicate webhook changes nothing` | 2026-10-07 | standalone `duplicate webhook changes nothing` |
| `unverified webhook signature is rejected` | 2026-10-07 | standalone `unverified webhook signature is rejected` |
| `webhook content alone cannot mark paid` | 2026-10-07 | standalone `webhook content alone cannot mark paid` |
| `GET return page cannot capture` | 2026-10-07 | standalone `GET return page cannot capture` |
| `cancel after dispatch reports uncertain` | 2026-10-07 | standalone `cancel after dispatch reports uncertain` |
| `expired review cannot start a payment` | 2026-10-07 | standalone `expired review cannot start a payment` |
| `maintenance cannot capture` | 2026-10-07 | standalone `maintenance cannot capture` |
| `expiry denies a fetch with no write` | 2026-10-07 | removed |
| `closed import denies a fetch` | 2026-10-07 | removed |
| `guessed token is denied` | 2026-10-07 | removed |
| `blocked delete is reported not thrown` | 2026-10-07 | removed |
| `admission refuses churn` | 2026-10-07 | removed |
| `stale heartbeat blocks imports` | 2026-10-07 | removed |
| `malformed result is an error not a repair` | 2026-10-07 | `vision draft validation` -> `malformed result is an error not a repair` |
| `late result is rejected` | 2026-10-07 | `import commit merges nothing unless every recheck passes` -> `late result is rejected` |
| `base revision change is rejected` | 2026-10-07 | `import commit merges nothing unless every recheck passes` -> `base revision change is rejected` |
| `merchant edits survive a merge` | 2026-10-07 | standalone `merchant edits survive a merge` |
| `confirmed menu is never overwritten` | 2026-10-07 | `import commit merges nothing unless every recheck passes` -> `confirmed menu is never overwritten` |
| `blank price stays blank` | 2026-10-07 | `vision draft validation` -> `blank price stays blank` |
| `raw QR payload is not logged` | 2026-10-07 | standalone `raw QR payload is not logged` |
| `capability URL is not logged` | 2026-10-07 | removed |
| `unrecognized tags are surfaced not guessed` | 2026-10-07 | standalone `unrecognized tags are surfaced not guessed` |
| `unenrolled sticker yields no purchase` | 2026-10-07 | standalone `unenrolled sticker yields no purchase` |
| `shared identifier asks which outlet` | 2026-10-07 | standalone `shared identifier asks which outlet` |
| `scan grants no destination and no rail` | 2026-10-07 | standalone `scan grants no destination and no rail` |
| `model cannot invent a price` | 2026-10-07 | standalone `model cannot invent a price` |
| `model tool budget is enforced` | 2026-10-07 | standalone `model tool budget is enforced` |
| `anonymous buyer cannot reach a merchant route` | 2026-10-07 | standalone `anonymous buyer cannot reach a merchant route` |
| `linking an anonymous account creates no membership` | 2026-10-07 | standalone `linking an anonymous account creates no membership` |
| `linking preserves purchase ownership` | 2026-10-07 | standalone `linking preserves purchase ownership` |
| `auth configuration matches the approved gate` | 2026-10-07 | standalone `auth configuration matches the approved gate` |
| `no secret reaches the committed tree` | 2026-10-07 | standalone `no secret reaches the committed tree` |
| `membership is per outlet` | 2026-10-07 | standalone `membership is per outlet` |
| `agent token cannot read a receipt` | 2026-10-07 | standalone `agent token cannot read a receipt` |
| `handoff redeems once` | 2026-10-07 | standalone `handoff redeems once` |
| `handoff carries no amount` | 2026-10-07 | standalone `handoff carries no amount` |
| `publication requires all four preconditions` | 2026-10-07 | standalone `publication requires all four preconditions` |
| `incomplete menu blocks confirmation` | 2026-10-07 | standalone `incomplete menu blocks confirmation` |
| `editing a published menu creates an unpublished revision` | 2026-10-07 | standalone `editing a published menu creates an unpublished revision` |
| `maintenance run is finite` | 2026-10-07 | standalone `maintenance run is finite` |
| `overlapping runs claim disjoint work` | 2026-10-07 | standalone `overlapping runs claim disjoint work` |
| `polling stops at a terminal state` | 2026-10-07 | standalone `polling stops at a terminal state` |
| `region latency is measured, not assumed` | 2026-10-07 | standalone `region latency is measured, not assumed` |
| `import body is counted, not trusted from Content-Length` | draft | `import upload and photo rejects` -> `import body is counted, not trusted from Content-Length` |
| `slow upload stops at its read bound` | draft | `import upload and photo rejects` -> `slow upload stops at its read bound` |
| `only one photo part is accepted` | draft | `import upload and photo rejects` -> `non-multipart body is refused`; `import upload and photo rejects` -> `second photo part is refused`; `import upload and photo rejects` -> `body without a photo part is refused` |
| `non-JPEG content is refused even when labeled JPEG` | draft | `import upload and photo rejects` -> `non-JPEG content is refused even when labeled JPEG` |
| `JPEG over 2 MiB is refused inside a legal body` | draft | `import upload and photo rejects` -> `JPEG over 2 MiB is refused inside a legal body` |
| `JPEG over 2,048 pixels per side is refused before decode` | draft | `import upload and photo rejects` -> `JPEG over 2,048 pixels per side is refused before decode` |
| `re-encoded photo carries no metadata` | draft | standalone `re-encoded photo carries no metadata` |
| `import route rejects a foreign Origin` | draft | `import route refusals read no body` -> `import route rejects a foreign Origin` |
| `no proxy matcher covers the import route` | draft | `import route static checks` -> `no proxy matcher covers the import route` |
| `import writes nothing to disk` | draft | standalone `import writes nothing to disk` |
| `imports refuse while disabled` | draft | `import route refusals read no body` -> `imports refuse while disabled` |
| `stale consent version is refused before admission` | draft | `import route refusals read no body` -> `stale consent version is refused before admission` |
| `second live import for an outlet is refused` | draft | `menu import admission` -> `second live import for an outlet is refused` |
| `second live import anywhere is refused` | draft | `menu import admission` -> `second live import anywhere is refused` |
| `eleventh import for an outlet in a UTC day is refused` | draft | `menu import admission` -> `eleventh import for an outlet in a UTC day is refused` |
| `fifty-first import in a UTC day is refused` | draft | `menu import admission` -> `fifty-first import in a UTC day is refused` |
| `failed and aborted attempts count toward daily caps` | draft | `menu import admission` -> `failed and aborted attempts count toward daily caps` |
| `daily caps reset at UTC midnight` | draft | `menu import admission` -> `daily caps reset at UTC midnight` |
| `concurrent admissions admit one` | draft | standalone `concurrent admissions admit one` |
| `refused admission reads no image bytes` | draft | `import route refusals read no body` -> `refused admission reads no image bytes` |
| `imports fail closed until a spend ceiling is recorded` | draft | `menu import admission` -> `imports fail closed until a spend ceiling is recorded` |
| `unreviewed menu model is refused` | draft | `menu import admission` -> `unreviewed menu model is refused` |
| `reservation beyond the daily ceiling is refused` | draft | `menu import admission` -> `reservation beyond the daily ceiling is refused` |
| `aborted attempt keeps its spend reservation` | draft | standalone `aborted attempt keeps its spend reservation` |
| `usage above its reservation stops further imports` | draft | `menu import admission` -> `usage above its reservation stops further imports` |
| `an expired open import does not block the next admission` | draft | `menu import admission` -> `an expired open import does not block the next admission` |
| `menu vision request sets store false` | draft | `menu vision request` -> `menu vision request sets store false` |
| `menu vision request carries no tools` | draft | `menu vision request` -> `menu vision request carries no tools` |
| `menu vision call is never retried` | draft | `menu vision request` -> `menu vision call is never retried` |
| `menu vision schema is strict with required nullable fields` | draft | `menu vision request` -> `menu vision schema is strict with required nullable fields` |
| `menu vision output is capped at the reviewed token bound` | draft | `menu vision request` -> `menu vision output is capped at the reviewed token bound` |
| `menu vision uses AI_MENU_MODEL, not AI_MODEL` | draft | `menu vision request` -> `menu vision uses AI_MENU_MODEL, not AI_MODEL` |
| `model budget keeps the commit reserve` | draft | `menu vision request` -> `model budget keeps the commit reserve` |
| `client disconnect aborts the model call` | draft | `menu vision request` -> `client disconnect aborts the model call` |
| `image bytes never reach logs, responses or audit` | draft | standalone `image bytes never reach logs, responses or audit` |
| `import tables have no image column` | draft | standalone `import tables have no image column` |
| `an abandoned import reads as expired with no write` | draft | standalone `an abandoned import reads as expired with no write` |
| `draft reload reports the latest import outcome` | draft | standalone `draft reload reports the latest import outcome` |
| `more than 100 draft rows is refused` | draft | `vision draft validation` -> `more than 100 draft rows is refused` |
| `draft text over 120 characters is refused` | draft | `vision draft validation` -> `draft text over 120 characters is refused` |
| `draft result over 128 KiB is refused` | draft | `vision draft validation` -> `draft result over 128 KiB is refused` |
| `non-SGD price stays blank` | draft | `vision draft validation` -> `non-SGD price stays blank` |
| `zero or malformed price text stays blank` | draft | `vision draft validation` -> `zero or malformed price text stays blank` |
| `duplicate variants are flagged for the merchant` | draft | `vision draft validation` -> `duplicate variants are flagged for the merchant` |
| `wrong genesis hash disables PYUSD` | draft | `PYUSD identity check` -> `wrong genesis hash disables PYUSD`; `merchant PYUSD routes` -> `wallet proof refuses on an identity mismatch`; `PYUSD preparation` -> `preparation refuses on an identity mismatch` |
| `mint under another token program disables PYUSD` | draft | `PYUSD identity check` -> `mint under another token program disables PYUSD` |
| `mint with other decimals disables PYUSD` | draft | `PYUSD identity check` -> `mint with other decimals disables PYUSD` |
| `Lighthouse program must be an executable devnet program` | draft | removed |
| `only two settings configure the PYUSD rail` | draft | standalone `only two settings configure the PYUSD rail` |
| `PYUSD failure leaves PayPal working` | draft | standalone `PYUSD failure leaves PayPal working` |
| `PayPal code imports no Solana module` | draft | `PYUSD static boundary checks` -> `PayPal code imports no Solana module` |
| `server never sends a transaction` | draft | `PYUSD static boundary checks` -> `server never sends a transaction` |
| `disabled rail refuses new PYUSD actions` | draft | `merchant PYUSD routes` -> `wallet challenge refuses while the rail is disabled`; `merchant PYUSD routes` -> `wallet proof refuses while the rail is disabled`; `merchant PYUSD routes` -> `rate change refuses while the rail is disabled`; `PYUSD pricing` -> `PYUSD pricing refuses while the rail is disabled`; `PYUSD preparation` -> `preparation refuses while the rail is disabled` |
| `disabled rail still reconciles prepared attempts` | draft | `signature hints and reconcile before expiry` -> `disabled rail still reconciles prepared attempts` |
| `payments kill switch refuses PYUSD preparation` | draft | `PYUSD preparation` -> `payments kill switch refuses PYUSD preparation` |
| `a PYUSD-only shop cannot publish while PYUSD is disabled` | draft | standalone `a PYUSD-only shop cannot publish while PYUSD is disabled` |
| `every new route begins with its guard` | draft | `import route static checks` -> `menu-import handler begins with its membership guard`; `import route static checks` -> `menu-draft handler begins with its membership guard`; `PYUSD static boundary checks` -> `wallet challenge handler begins with its membership guard`; `PYUSD static boundary checks` -> `wallet proof handler begins with its membership guard`; `PYUSD static boundary checks` -> `rate handler begins with its membership guard`; `PYUSD static boundary checks` -> `preparation handler begins with its buyer guard`; `PYUSD static boundary checks` -> `signature hint handler begins with its buyer guard` |
| `wallet challenge names Envoi's configured domain and devnet` | draft | `merchant PYUSD routes` -> `wallet challenge names Envoi's configured domain and devnet` |
| `wallet proof verifies the saved challenge bytes` | draft | standalone `wallet proof verifies the saved challenge bytes` |
| `invalid wallet signature is refused` | draft | `merchant PYUSD routes` -> `invalid wallet signature is refused` |
| `wallet challenge expires after five minutes` | draft | `merchant PYUSD routes` -> `wallet challenge expires after five minutes` |
| `wallet challenge is single-use` | draft | standalone `wallet challenge is single-use` |
| `wallet challenge for another outlet is refused` | draft | `merchant PYUSD routes` -> `wallet challenge for another outlet is refused` |
| `wallet proof creates no membership or enrollment` | draft | `merchant PYUSD routes` -> `wallet proof creates no membership or enrollment` |
| `wallet challenges are rate limited per outlet` | draft | `merchant PYUSD routes` -> `wallet challenges are rate limited per outlet` |
| `merchant token account is derived, never supplied` | draft | `merchant PYUSD routes` -> `merchant token account is derived, never supplied` |
| `missing merchant token account is refused` | draft | `merchant PYUSD routes` -> `missing merchant token account is refused` |
| `merchant token account under another program is refused` | draft | `merchant PYUSD routes` -> `merchant token account under another program is refused` |
| `frozen merchant token account is refused` | draft | `merchant PYUSD routes` -> `frozen merchant token account is refused` |
| `PYUSD amount rounds up to the next atomic unit` | draft | `rate parsing, bounds and conversion` -> `PYUSD amount rounds up to the next atomic unit` |
| `rate arithmetic is exact at its bounds` | draft | `rate parsing, bounds and conversion` -> `rate arithmetic is exact at its bounds` |
| `rate text must be a plain decimal with at most six places` | draft | `rate parsing, bounds and conversion` -> `rate text must be a plain decimal with at most six places` |
| `rate outside its bounds is refused` | draft | `rate parsing, bounds and conversion` -> `rate outside its bounds is refused` |
| `rate older than 30 days makes PYUSD unavailable` | draft | `PYUSD pricing` -> `rate older than 30 days makes PYUSD unavailable` |
| `a changed PYUSD rate is a new checkout` | draft | standalone `a changed PYUSD rate is a new checkout` |
| `rate change invalidates an unexecuted PYUSD review at preparation` | draft | `PYUSD preparation` -> `rate change invalidates an unexecuted PYUSD review at preparation` |
| `rate expiry between review and preparation refuses preparation` | draft | `PYUSD preparation` -> `rate expiry between review and preparation refuses preparation` |
| `rate change never alters a prepared attempt` | draft | standalone `rate change never alters a prepared attempt` |
| `no unsigned bytes leave before the attempt is saved` | draft | `PYUSD preparation` -> `no unsigned bytes leave before the attempt is saved` |
| `repeated preparation returns the same bytes` | draft | `PYUSD preparation` -> `a prepared purchase never releases bytes again` |
| `expired bytes are never released again` | draft | removed |
| `a second wallet cannot prepare a locked purchase` | draft | removed |
| `preparation uses a confirmed blockhash` | draft | `bounded RPC transport` -> `preparation uses a confirmed blockhash` |
| `prepared transaction is exactly a memo and one TransferChecked` | draft | standalone `prepared transaction is exactly a memo and one TransferChecked` |
| `memo reference is unique per attempt` | draft | `PYUSD attempt constraints` -> `memo reference is unique per attempt` |
| `non-zero transfer fee rate refuses preparation` | draft | `mint eligibility for a transfer` -> `non-zero transfer fee rate refuses preparation` |
| `non-zero maximum fee refuses preparation` | draft | `mint eligibility for a transfer` -> `non-zero maximum fee refuses preparation` |
| `non-zero fee in the next epoch refuses preparation` | draft | `mint eligibility for a transfer` -> `non-zero fee in the next epoch refuses preparation` |
| `active transfer hook refuses preparation` | draft | `mint eligibility for a transfer` -> `active transfer hook refuses preparation` |
| `unreviewed mint extension refuses preparation` | draft | `mint eligibility for a transfer` -> `unreviewed mint extension refuses preparation` |
| `buyer without enough PYUSD cannot prepare` | draft | `PYUSD preparation` -> `buyer without enough PYUSD cannot prepare` |
| `frozen buyer token account cannot prepare` | draft | `PYUSD preparation` -> `frozen buyer token account cannot prepare` |
| `merchant token account is rechecked at preparation` | draft | `PYUSD preparation` -> `merchant token account is rechecked at preparation` |
| `PYUSD routes reject a foreign Origin` | draft | `merchant PYUSD routes` -> `wallet challenge rejects a foreign Origin`; `merchant PYUSD routes` -> `wallet proof rejects a foreign Origin`; `merchant PYUSD routes` -> `rate change rejects a foreign Origin`; `PYUSD preparation` -> `preparation rejects a foreign Origin`; `signature hints and reconcile before expiry` -> `signature hint rejects a foreign Origin` |
| `stale review cannot prepare PYUSD` | draft | `PYUSD preparation` -> `stale review cannot prepare PYUSD` |
| `PYUSD routes require the owning buyer` | draft | `PYUSD preparation` -> `preparation requires the owning buyer`; `signature hints and reconcile before expiry` -> `signature hint requires the owning buyer` |
| `cancel after PYUSD preparation reports checking` | draft | standalone `cancel after PYUSD preparation reports checking` |
| `an unresolved payment blocks the same basket on the other rail` | draft | standalone `an unresolved payment blocks the same basket on the other rail` |
| `wallet is asked for solana:devnet` | draft | `browser wallet handoff` -> `wallet is asked for solana:devnet` |
| `wallet without devnet sign-and-send is not offered` | draft | `browser wallet handoff` -> `wallet without devnet sign-and-send is not offered` |
| `phone without a wallet gets the Phantom link, not a pay button` | draft | standalone `phone without a wallet gets the Phantom link, not a pay button` |
| `Phantom link carries only public outlet and item ids` | draft | `browser wallet handoff` -> `Phantom link carries only public outlet and item ids and the rail` |
| `submitted signature is only a hint` | draft | `signature hints and reconcile before expiry` -> `submitted signature is only a hint` |
| `PYUSD receipt says transferred and finalized on devnet` | draft | standalone `PYUSD receipt says transferred and finalized on devnet` |
| `ComputeBudget and Lighthouse assertions are accepted` | draft | `PYUSD verification by meaning` -> `ComputeBudget and Lighthouse assertions are accepted` |
| `failed transaction is never paid` | draft | `PYUSD verification by meaning` -> `failed transaction is never paid` |
| `other blockhash leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `other blockhash leaves the transfer uncertain` |
| `second signer leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `second signer leaves the transfer uncertain` |
| `another fee payer leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `another fee payer leaves the transfer uncertain` |
| `zero or two TransferChecked leave the transfer uncertain` | draft | `PYUSD verification by meaning` -> `zero or two TransferChecked leave the transfer uncertain` |
| `transfer from another source is not paid` | draft | `PYUSD verification by meaning` -> `transfer from another source is not paid` |
| `transfer to another destination is not paid` | draft | `PYUSD verification by meaning` -> `transfer to another destination is not paid` |
| `amount off by one atomic unit is not paid` | draft | `PYUSD verification by meaning` -> `amount off by one atomic unit is not paid` |
| `duplicate memo leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `duplicate memo leaves the transfer uncertain` |
| `memo without the reference is not ours` | draft | `PYUSD verification by meaning` -> `memo without the reference is not ours` |
| `fee at the execution epoch must be zero` | draft | `PYUSD verification by meaning` -> `fee at the execution epoch must be zero` |
| `destination delta must equal the amount` | draft | `PYUSD verification by meaning` -> `destination delta must equal the amount` |
| `incomplete metadata leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `incomplete metadata leaves the transfer uncertain` |
| `an added non-allowlisted instruction leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `an added non-allowlisted instruction leaves the transfer uncertain` |
| `Lighthouse memory instructions are not allowlisted` | draft | `PYUSD verification by meaning` -> `outer Lighthouse memory instruction is not allowlisted`; `PYUSD verification by meaning` -> `inner Lighthouse memory instruction is not allowlisted` |
| `inner instruction from another program leaves the transfer uncertain` | draft | `PYUSD verification by meaning` -> `inner instruction from another program leaves the transfer uncertain` |
| `inner instruction that moves tokens or changes authority leaves it uncertain` | draft | `PYUSD verification by meaning` -> `inner instruction that moves tokens or changes authority leaves it uncertain` |
| `verification reads at finalized commitment` | draft | `bounded RPC transport` -> `verification reads at finalized commitment` |
| `unresolvable account keys leave the transfer uncertain` | draft | `PYUSD verification by meaning` -> `unresolvable account keys leave the transfer uncertain` |
| `a finalized signature binds to one attempt` | draft | `PYUSD attempt constraints` -> `a finalized signature binds to one attempt` |
| `release waits for finalized height past the saved bound` | draft | `PYUSD recovery over a fake chain` -> `release waits for finalized height past the saved bound` |
| `scan starts only after expiry is final` | draft | `PYUSD recovery over a fake chain` -> `scan starts only after expiry is final` |
| `scan that never reaches before preparation is incomplete` | draft | `PYUSD recovery over a fake chain` -> `scan that never reaches before preparation is incomplete` |
| `capped scan never releases` | draft | `PYUSD recovery over a fake chain` -> `scan stops at the page cap without releasing`; `PYUSD recovery over a fake chain` -> `scan stops at the fetch cap without releasing` |
| `scan resumes from its saved cursor` | draft | `PYUSD recovery over a fake chain` -> `scan resumes from its saved cursor` |
| `429 or null transaction keeps the attempt locked` | draft | `PYUSD recovery over a fake chain` -> `429 or null transaction keeps the attempt locked` |
| `a successful transaction with our reference that fails verification blocks release` | draft | `PYUSD recovery over a fake chain` -> `a successful transaction with our reference that fails verification blocks release` |
| `a failed landing leaves the attempt prepared` | draft | `signature hints and reconcile before expiry` -> `a failed landing leaves the attempt prepared` |
| `automatic unpaid release stays off until its proofs are recorded` | draft | `PYUSD recovery over a fake chain` -> `automatic unpaid release stays off until its proofs are recorded` |
| `a complete empty scan closes the attempt once release is enabled` | draft | `PYUSD recovery over a fake chain` -> `a complete empty scan closes the attempt once release is enabled` |
| `devnet reset stops verification and scanning` | draft | `PYUSD recovery over a fake chain` -> `devnet reset stops verification and scanning` |
| `RPC calls stop at 20 per 10 seconds across web and runner` | draft | `shared RPC limiter` -> `RPC calls stop at 20 per 10 seconds across web and runner` |
| `one RPC method stops at 10 per 10 seconds` | draft | `shared RPC limiter` -> `one RPC method stops at 10 per 10 seconds` |
| `at most two RPC requests run at once` | draft | `shared RPC limiter` -> `at most two RPC requests run at once` |
| `RPC 429 backs off and changes no state` | draft | `shared RPC limiter` -> `RPC 429 backs off every caller` |
| `oversized RPC response is refused` | draft | `bounded RPC transport` -> `oversized RPC response is refused` |
| `user-triggered PYUSD reads are debounced` | draft | `signature hints and reconcile before expiry` -> `user-triggered PYUSD reads are debounced` |
| `RPC call stops at its timeout` | draft | `bounded RPC transport` -> `RPC call stops at its timeout` |
| `abandoned RPC slot is reclaimed after its lease` | draft | `shared RPC limiter` -> `abandoned RPC slot is reclaimed after its lease` |
| `web and runner cannot scan one attempt at once` | draft | standalone `web and runner cannot scan one attempt at once` |

Added cases:

| Fix | Now |
| --- | --- |
| A | standalone `an abandoned PayPal order does not lock its basket` |
| A | standalone `an approved PayPal order that never returns closes unpaid` |
| A | standalone `capture is never dispatched once the review has expired` |
| A | standalone `two open reviews of one basket cannot both start payment` |
| G | `menu import admission` -> `an attempt closed before the model call releases its reservation` |
| G | standalone `model dispatch is recorded before the call` |
| B | `import commit merges nothing unless every recheck passes` -> `membership removed during an import merges nothing` |
| K | `PYUSD preparation` -> `preparation refuses an ineligible mint` |
| L | `PYUSD preparation` -> `released transaction bytes are never stored` |
| L | `browser wallet handoff` -> `the wallet is asked once per released transaction` |
| H | `signature hints and reconcile before expiry` -> `a later hint is verified when the first is not ours` |
| H | `signature hints and reconcile before expiry` -> `hints beyond the per-attempt cap are not read` |
| A, I | standalone `a PYUSD mismatch can close only unpaid` |
| C | `PYUSD verification by meaning` -> `transfer of another mint is not paid` |
| C | `PYUSD verification by meaning` -> `transfer with other decimals is not paid` |
| M | `PYUSD recovery over a fake chain` -> `a confirmed or mismatched attempt is still scanned after expiry` |
| M | `PYUSD recovery over a fake chain` -> `the scan continues after a transfer binds` |
| M | `PYUSD recovery over a fake chain` -> `an extra transfer keeps the purchase paid and alerts the operator` |
| M | `PYUSD recovery over a fake chain` -> `an extra transfer is recorded once per attempt` |
| M | standalone `a second reference landing is an extra transfer` |
| M | standalone `PYUSD receipt shows a detected extra transfer` |

Same-name cases whose assertion or mutation wording changed (30), each now naming its specific reason or fixture: `import route rejects a foreign Origin`, `imports refuse while disabled`, `stale consent version is refused before admission`, `refused admission reads no image bytes`, `import body is counted, not trusted from Content-Length`, `slow upload stops at its read bound`, `JPEG over 2 MiB is refused inside a legal body`, `non-JPEG content is refused even when labeled JPEG`, `JPEG over 2,048 pixels per side is refused before decode`, `eleventh import for an outlet in a UTC day is refused`, `reservation beyond the daily ceiling is refused`, `aborted attempt keeps its spend reservation`, `malformed result is an error not a repair`, `blank price stays blank`, `zero or malformed price text stays blank`, `late result is rejected`, `base revision change is rejected`, `confirmed menu is never overwritten`, `wrong genesis hash disables PYUSD`, `mint under another token program disables PYUSD`, `mint with other decimals disables PYUSD`, `payments kill switch refuses PYUSD preparation`, `stale review cannot prepare PYUSD`, `a failed landing leaves the attempt prepared`, `disabled rail still reconciles prepared attempts`, `preparation uses a confirmed blockhash`, `verification reads at finalized commitment`, `RPC call stops at its timeout`, `scan starts only after expiry is final`, `429 or null transaction keeps the attempt locked`.
Three of them hand part of their old assertion to another check rather than drop it: `blank price stays blank` leaves the `ambiguous` basis to `zero or malformed price text stays blank`; `malformed result is an error not a repair` leaves the unchanged draft to `commitImport`, whose input type accepts only a successful validation; and `RPC call stops at its timeout` leaves the unchanged attempt state to `429 or null transaction keeps the attempt locked`, which now also covers a timed-out read.

Fix K marks `preparation refuses an ineligible mint`: the five mint-eligibility cases now test the pure function, so one route case keeps the preparation call site covered.

Fix L renames `repeated preparation returns the same bytes` to `a prepared purchase never releases bytes again`, which also covers a call naming another wallet.
`a second wallet cannot prepare a locked purchase` is removed because it now tests that same guard, and `expired bytes are never released again` is removed because no code path releases bytes twice, so its height check no longer exists.

**Placement hint for Gate 4, not a decision here:** each section above names its slice unit.
The import cases belong with the merged menu-import slice, the PYUSD purchase cases with the first PYUSD slice and the PYUSD recovery cases with the second.
`a PYUSD-only shop cannot publish while PYUSD is disabled` touches S7 code, and the five basket-lock and PayPal abandonment tests touch S2 and S3 code; they may need to land with the first PYUSD slice or with those PayPal slices.

## Gate 4 deltas D1-D7 reviewed

`04-slices.md` lists seven gaps it found in the 2026-10-07 Gate 3.
This revision resolves only what it touches and lists the rest unchanged.

| # | Status after this revision |
| --- | --- |
| D1 operator CLI | Not resolved here, but one operator act is now named. Held and mismatched PYUSD attempts are operator-visible in the health view. **Revised 2026-10-11 after review:** the PYUSD state machine names the only exit from `mismatch`, an out-of-band, audited operator resolution that records the operator, reason and evidence and moves `mismatch -> closed_unpaid`, never `confirmed`. Gate 4 places it as an operator CLI subcommand with its own contract and tests; this gate does not build it. Since fix M the resolution requires a complete window scan, and the same act records an out-of-band refund reference against an extra transfer, changing no payment state; Gate 4 names a test for each. |
| D2 Node version | Not touched. The new pins require Node 20.18 or later, and the Wallet Standard packages declare Node 22 or later, which the proposed Node 24 LTS satisfies. |
| D3 test database | Not touched. The new integration tests need the same disposable PostgreSQL, plus the labeled OpenAI and RPC fakes described in the test plan. |
| D4 CI minutes | Not touched. |
| D5 races and authorization without named tests | **Partly resolved:** every race and authorization rule added in this revision has a named test or case; the PayPal abandonment and two-start races added after review are tested by `capture is never dispatched once the review has expired` and `two open reviews of one basket cannot both start payment`. A membership revocation committed in the same instant as an import commit is covered only by the sequential case `membership removed during an import merges nothing`. The two races added with fixes L and M are tested by `a prepared purchase never releases bytes again`, `the wallet is asked once per released transaction`, `a second reference landing is an extra transfer` and `a confirmed or mismatched attempt is still scanned after expiry`. The 2026-10-07 gaps D5 lists for PayPal stay with Gate 4. |
| D6 OpenAPI | Not touched; the import route change does not affect the public read routes. |
| D7 database roles | Not resolved here. The web role will also need `menu_imports`, `menu_import_admission`, `wallet_challenges`, `pyusd_rates`, `pyusd_extra_transfers` and the RPC limiter rows; the maintenance role needs PYUSD attempt columns, `pyusd_extra_transfers` and the limiter rows. Grants stay in migrations, as D7 proposes. |

## Least confident decisions

1. **R1 TypeScript 7.0.2 with Next 16.4.0, Drizzle 0.45.3 and Better Auth 1.7.7.** All are current majors read from the registry today; their mutual compatibility is untested here. The Slice 1 boot check is the falsifier, and the fallback is to downgrade to the newest mutually supported set rather than to patch around it.
   **Resolved by the S1 boot check, 2026-10-12:** TypeScript 7.0.2 failed through `typescript-eslint`, and the pin is now `typescript@6.0.3`; the other pins held. See [Version pins](#version-pins).
2. **R2 Storage exhaustion has no in-application recovery.**
   Reclaiming bytes when `DELETE` itself fails is a console action whose immediacy is **[unknown]**.
   **Narrowed 2026-10-11:** no image bytes or image churn exist any more, so the risk is generic exhaustion, which still blocks purchase, payment evidence, auth and audit writes.
   The 70% reading is an operator alert, not an admission control; an abandoned import still reads as expired without any write.
3. **R3 Maintenance's PayPal boundary is code-level.** Finding 6 could not be verified as credential-enforceable. The build-graph test is a genuine guard against accidental reachability, and it is not a security boundary against a deliberately modified runner.
4. **R4 Hourly maintenance is not a deadline.**
   GitHub schedules can be delayed or dropped, so `reconcile_attempts` and, since 2026-10-11, `reconcile_pyusd_attempts` are best effort.
   Since the 2026-10-11 review, no buyer path waits for `close_expired_reviews`: PayPal abandonment and the basket lock are derived on read.
   Anything described to a judge as "within an hour" must instead be described as "checked at least hourly when the schedule runs".
5. **R5 The exact AI model is unselected.**
   Gate 2 deferred model choice to a Gate 3 task evaluation, and that evaluation needs an API key and spend that are not authorized.
   The contracts are model-agnostic; the evaluation moves to a named slice with pre-registered criteria, and `AI_MODEL` stays an environment name.
   **Extended 2026-10-11:** `AI_MENU_MODEL` needs its own pre-registered vision evaluation with image and strict-schema support and no published shutdown before 16 Dec 2026.
   Rotated and small-price text accuracy on English menus and vision latency are falsifiers (Chinese text left them on 2026-10-15), and the user has not chosen either model, the daily spend ceiling or the bounds, so imports stay closed until those are recorded.
6. **R6 `sharp` is a native dependency on a free ephemeral host.**
   Build time and binary availability on Render Free are unverified.
   If it fails, image normalization must move to a pure-JS decoder with a lower cap, which weakens the metadata-stripping claim and must be disclosed.
   **Expanded 2026-10-11:** decoder memory and CPU on 512 MB and 0.1 CPU join it.
   The browser shrink bounds server input at 2,048 pixels per side but is not a measurement, and browser decoding of large or HEIC phone photos is unmeasured too.
7. **R7 Churn-based admission may be too conservative or too lax.**
   The 100 MiB per rolling 6-hour window figure is arithmetic, not measurement.
   It could block a legitimate demo retry sequence, or under-protect if history accounting behaves differently than documented.
   **Superseded 2026-10-11 by R7a,** because no image bytes are admitted any more.
   - **R7a Admission and spend may be mis-sized.**
     One import at a time, 10 per outlet and 50 globally a UTC day, and a reserved worst-case spend are arithmetic.
     One global slot makes a second merchant wait up to 90 seconds; the daily caps could block a rehearsal; and a wrong token bound would make reservations meaningless, which is why usage above a reservation stops imports.
     Since the 2026-10-11 review an attempt closed before its model call frees its reservation; that release depends on the dispatch mark being committed before the call, which has its own test.
     None of these figures is a measured cost or a safe memory bound.
8. **R8 Browser polling on a sleeping app.** A 2-second poll for 60 seconds keeps Render awake and Neon out of scale-to-zero during an active payment, which is intended, but the interaction with the 750-hour monthly budget across several concurrent judges is unmeasured.
9. **R9 One package with two entrypoints.** Sharing `src/domain` between the web app and the compiled runner is what makes the maintenance boundary type-checkable, but it also means a Next.js dependency change can break the runner build. The separate `tsconfig.runner.json` is the mitigation and may not be sufficient.
10. **R10 `purchase_requests` as an agent surface is unexercised.** No supported MCP client has been run against Next.js 16 in this planning pass, so transport interoperability is **[unknown]** and could force a Gate 2 amendment if a different transport is required.
11. **R11 Managed auth was provisioned and contradicted approved Gate 2. Decided by the user on 2026-10-07: in-app Better Auth. Hazard disproven by inspection; not a blocker.** `neon.ts` is now `auth: false`, though `neon deploy` reported no changes and that field demonstrably does not control the branch-level service. A read-only schema inspection resolved the question that mattered: **all nine Neon Auth tables live in a dedicated `neon_auth` schema and `public` is empty**, so there is no table-name collision with the in-app Better Auth tables this design places in `public`. Managed auth remains enabled but inert and isolated; nothing was disabled. **Two containment rules are mandatory:** never build against `neon_auth`, and pin Better Auth's Drizzle adapter explicitly to `public` so no unqualified `user`, `session`, `account` or `verification` name can resolve into the other schema through a search path. Cost of the idle service on the Free plan is **[unknown]**.
12. **R12 The database is in `aws-us-east-2`. Accepted by the user on 2026-10-07, conditional on measurement.** The residual risk is that trans-Pacific round trips stack inside an approved three-minute metric that already absorbs a Render cold start. It is unmeasured, and relocation is more expensive once real data exists. The acceptance therefore holds only while the Slice 1 latency measurement passes; if the metric fails because of region latency, relocation must be revisited rather than explained away.
13. **R13 Wallet behaviour is unproven (added 2026-10-11).**
    Whether Phantom honours `solana:devnet`, displays this devnet mint and keeps the prepared blockhash, transfer and memo is **[unknown]**.
    If it refreshes the blockhash, the expiry release is unsafe: stop the rail and reopen Gate 2.
    If it adds Lighthouse memory instructions or anything else outside the allowlist, those payments stay uncertain, and widening the allowlist is a Gate 2 amendment, not a code change.
    The user's 2026-10-11 review kept the memory-instruction exclusion as written; whether Phantom adds them is tested at PYUSD enablement under this risk, not now.
14. **R14 The phone path is unproven (added 2026-10-11).**
    Whether the Browse link keeps its query on target phones and whether the wallet browser keeps its session through approval are **[unknown]**.
    Phone PYUSD stays unavailable until proven, and no session or purchase ever moves between browsers.
15. **R15 Test funds are unproven (added 2026-10-11).**
    Devnet SOL for fees and test PYUSD depend on faucets the user has not yet tried.
    Without them no PYUSD proof can run, and the rail stays disabled.
16. **R16 The mint's authorities can change its behaviour (added 2026-10-11).**
    Freeze, permanent-delegate, transfer-hook and fee authorities exist on the devnet mint.
    Preparation refuses on a non-zero fee horizon, an active hook or an unreviewed extension, but the permanent delegate can move tokens after a verified transfer, so receipts say "transferred and finalized", never "kept".
17. **R17 Public RPC limits and history completeness are not ours to control (added 2026-10-11).**
    Render's shared outbound IP may consume the same per-IP allowance, and devnet can prune history or reset.
    Incomplete history keeps payments locked rather than released, and automatic unpaid release stays off until its proofs are recorded, so a buyer who cancels in the wallet can stay locked until an operator acts.
    The lock covers only that buyer session's same basket on either rail; a different basket or a new session is unaffected.
    A `mismatch` ends only through the audited operator resolution of delta D1, and only as unpaid.
18. **R18 Verification happens after broadcast (added 2026-10-11).**
    Envoi never sees the signed transaction before the wallet sends it, so verification can withhold confirmation but cannot prevent or undo a wrong transfer.
    Since fix M, a second transfer from one release is detected and shown, not prevented on chain or undone; Envoi holds no keys, so any refund depends on the shop.

### Least confident choices in the 2026-10-11 revision

These are the calls in this revision most worth challenging now, while changing them costs a sentence.
The user reviewed six of them on 2026-10-11, items 4, 5, 6, 7, 10 and 13; their verdicts are noted on each item and recorded in [`00-status.md`](00-status.md#approval-history) as review decisions, not Gate 3 approval.

1. **Spend ceiling and model bounds as reviewed code constants.**
   This adds no environment name and makes every change a reviewed diff, but recording the user's decision needs a commit.
   The alternative, an operator-set database row, needs the Gate 4 operator CLI first.
2. **Consent version and base revision in headers, with a one-part multipart body.**
   This lets admission run before any body byte is read, as Gate 2 requires.
   A raw `image/jpeg` body would be simpler but departs from Gate 2's "multipart request" wording.
3. **One serialized admission row.**
   It makes the caps race-free with one lock.
   Its cost is that a second merchant anywhere waits for the first import, which follows from Gate 2's one global in-flight import.
4. **Per-item blanks instead of whole-result rejection.**
   A non-SGD price or a duplicate variant now blanks only that item, where the 2026-10-07 Zapier contract rejected the whole result.
   This follows Gate 2's "duplicate variants need resolution" but is a contract change worth confirming.
   **User review 2026-10-11: agreed, kept.**
5. **`PYUSD_ENABLED=false` still reconciles prepared attempts.**
   Gate 2 says the flag "gates the adapter"; reading it as "stops new PYUSD actions" keeps a payment that may have landed from going unverified.
   The stricter reading would leave such purchases locked until the flag returns.
   **User review 2026-10-11: agreed, kept.**
6. **The non-upgradeable memo program.**
   The pinned memo client builds for its newer upgradeable program by default; this design overrides it to `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, whose code cannot change, and allowlists only that one.
   Both were confirmed executable on devnet on 2026-10-11.
   **User review 2026-10-11: agreed, kept.**
7. **Lighthouse assertions by discriminator from a pinned commit.**
   No compatible Lighthouse client exists for Kit 8, so discriminators 2 to 17 are reviewed constants.
   A Lighthouse upgrade that renumbers instructions would make payments uncertain rather than wrongly confirmed.
   **User review 2026-10-11: kept as written, with memory instructions 0 and 1 excluded; whether Phantom adds them is tested at PYUSD enablement under R13, not now.**
8. **A database-backed RPC limiter.**
   It enforces one budget across Render and the runner exactly, at the cost of database writes per RPC call.
   A static split between the two processes would avoid those writes but could exceed the budget during a redeploy overlap.
9. **Scan completeness means reaching a signature older than the preparation slot, with no memo filter.**
   This is conservative and simple, but a merchant account with heavy traffic since preparation costs more pages and transaction reads, spread across claims by the caps.
10. **A rail-independent basket lock that holds only while money can still move.**
    **User review 2026-10-11: keep the idea, fix its trigger; revised accordingly.**
    It enforces Gate 2's "no new attempt or rail switch while an external effect is possible" for both rails, and also changes PayPal: an uncertain PayPal payment now blocks a PYUSD review for the same basket.
    The earlier draft locked on `pending_payment`, which a PayPal buyer enters at order creation, and gave `externally_approved` no exit, so a buyer who approved at PayPal and closed the tab could never review those items again.
    The lock is now derived on read from attempt states and `T_REVIEW`, with no maintenance dependency, and a PayPal attempt that never dispatched a capture reads `abandoned` once `T_REVIEW` passes.
    Two choices go slightly beyond the review's list and are worth confirming: `created` and `create_unknown` also lock inside `T_REVIEW`, because an order created by an in-flight request can still be approved and captured in that window; and both execution starts recheck the lock with the buyer's same-basket purchases locked, because two reviews opened before either started would otherwise both pay.
    The lock is per buyer session, so it cannot stop the Phantom-browser path, a new anonymous session, from paying a basket already paid in another browser.
    A buyer who wants a different basket is unaffected.
11. **Exact-bytes wallet challenge with `solana:signMessage`.**
    Server verification is exact, but Phantom's handling of a SIWS-format message through `signMessage` rather than `signIn` is **[unknown]**.
12. **Version 0 transaction, memo first.**
    Phantom's handling of version 0 versus legacy transactions on devnet is **[unknown]**; the choice is cheap to flip before the PYUSD slice.
13. **Batched tests: 92 named tests and 231 cases, down from 192 named tests.**
    **User review 2026-10-11: reduce named tests and compute by batching, without weakening one guard, one mutation; revised accordingly.**
    Every guard still has its own row and mutation; fixes A-K add 13 cases, and fixes L and M add 8 more and remove two cases whose guard no longer exists.
    The risk is that a slice discovers two rows of one group failing on the same mutation; the batching rules then move one row out rather than accept the overlap, which can raise the named count again.
    The PYUSD groups also assume the roadmap's two PYUSD slices; another split means regrouping by case.
    PYUSD is first in the cut order, so its 29 named tests and 128 cases go with it if it is cut.
14. **Release the unsigned bytes once, and detect rather than prevent a second landing (fixes L and M).**
    Gate 2 was reopened for both, and the user approved the fixes in advance on 2026-10-11.
    Releasing once means Envoi's own code can never offer a second signing, but a rejected or failed first wallet try now costs the buyer the wait until the blockhash expires and the window scan completes, about two minutes by **[hypothesis]** arithmetic, and an operator release while automatic unpaid release stays off.
    The alternative not taken is an Envoi-added Lighthouse assertion on the buyer's source balance, which would make a second landing fail on chain and allow a safe retry.
    It was not chosen because it adds an Envoi-authored instruction to a transaction Gate 2 keeps to a memo and one transfer, depends on Lighthouse behaviour this design does not pin, and fails whenever the buyer's balance moves before landing.
    Detection is the backstop for a faulty or modified client: an extra transfer is recorded and shown, never undone, and its refund depends on the shop.

## What this gate does not authorize

**Added 2026-10-12.**
Re-approving the reopening would accept only the PayPal kill-switch contract above.
It would not approve Gate 4, and it would not authorize implementation or any change to the flag on Render.

Approving Gate 3 accepts these contracts. It does not authorize implementation, package installation, account provisioning, workflow creation, deployment, a repository visibility change, real merchant images, real merchant enrollment, any payment outside a sandbox, or Gate 4 slice selection. The R11 flag flip, its redeploy and a read-only schema inspection were separately authorized and executed on 2026-10-07; that authorization did not extend to `neon neon-auth disable`, which remains unauthorized. Gate 3 approval does not establish that any vendor claim above behaves as documented for this account, and it does not reopen Gate 1 or Gate 2: no approved product behaviour or architecture decision is changed here. Two recorded claims are relabeled in `research.md` under finding 7, which is an evidence correction, not a decision change.

A discovery during implementation that changes an approved architecture decision reopens Gate 2 for approval before dependent work continues. A change to product behaviour reopens Gate 1.

**Added 2026-10-11.**
Approving this revision would accept the import and PYUSD contracts as a proposal only.
It would not authorize real merchant photos, any OpenAI call or evaluation spend, choosing `AI_MODEL` or `AI_MENU_MODEL`, recording a spend ceiling, wallet or faucet use, devnet transactions, enabling PYUSD, setting `PYUSD_PROOFS.automaticUnpaidRelease`, building or using the operator resolution of a PYUSD mismatch or the refund reference of an extra transfer, or editing `04-slices.md`.
The user's OpenAI data-sharing setting, daily spend ceiling, models and faucet access remain open and are not inferred from any approval.
The revision itself used only read-only registry, GitHub and devnet reads; it installed, provisioned, spent and committed nothing.
The revision after the user's review used no external read at all, and neither did fixes L and M, which follow Gate 2's reopening and re-approval on 2026-10-11.
