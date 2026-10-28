# Menu photo import: gap analysis and decision document

Written 2026-10-28 from the records at `main` `321cfcd`, after the S22 round 4 fail.
This is diagnosis, not implementation: no OpenAI call was made, no flag changed, no file under `src/` changed and no gate was reopened.
Claims are labeled as the repository's `AGENTS.md` requires: **[verified]** has a cited record or a measurement made here, **[vendor claim]** is advertised but not independently validated, **[hypothesis]** is our judgment, **[unknown]** is not established.
No recorded round is re-scored.
Where this document computes something from a saved output it is labeled "diagnostic, not a result", and a diagnostic never establishes a pass.

## Verdict

**No.** Menu photo import cannot realistically reach a shippable state before the 13 Nov 2026 04:00 SGT cutoff without squeezing S15, and the honest recommendation is to stop work on it before the cutoff.

The reasons, strongest first.

1. **A passing round 5 would still ship nothing.** The pre-registration states that a pass changes no flag, that `MENU_IMPORTS_ENABLED` stays false, and that the import screen needs its own Gate 1 and Gate 3 change ([`00-status.md`](00-status.md) "S22 round 4 pre-registration (R5), 2026-10-28", falsifier response) [verified]. Shipping therefore needs, in order: a Gate 1 reopening to allow a round 5, a Gate 3 change for whatever the round changes, a Gate 4 amendment, the round itself including an unrun timed comparison, then a second Gate 1 reopening for the import screen, a second Gate 3 change, a second Gate 4 amendment, and an implementation slice that builds the rotate and crop step and the screen, then a flag flip and a deploy. That is three gate approvals and one build slice after a pass that does not yet exist.
2. **The time does not exist.** S15, the judged release, is the only slice in the build order still open ([`00-status.md`](00-status.md) Slices list) [verified], the S15 usability study runs 2-8 Nov and is never cut ([`04-slices.md`](04-slices.md) "Continuation schedule and cuts (S19-S22)") [verified], and S22 is first in the cut order in that same section [verified]. The non-S15 days before the cutoff are 29 Oct to 1 Nov and 9 to 12 Nov, eight days that must also absorb finishing S15 itself.
3. **A round 5 pass is not even likely, let alone certain.** The recorded round 4 fail is four wrong filled prices against a limit of two [verified]. The diagnostic below finds that two of those four were right prices the scorer failed to match and two were real misreads, so even a perfect scorer leaves the model at exactly the limit of two with no margin (diagnostic, not a result). Round 3 also sits at exactly two real misreads (diagnostic, not a result). Nothing in four rounds measures run-to-run variance on the deciding metric, so the probability that a fresh round lands at two rather than three is **[unknown]**.
4. **The fix is overfitting unless fresh photos exist, and they do not.** Every photo in the round 4 set has now informed a diagnosis, so none of the ten can judge a fix. F1 to F4 were the only fresh unseen photos and they are spent [verified]. A round 5 needs a new set the user must photograph and obtain permission for, at a time when the user's hours are the scarce resource for S15.
5. **Nothing is being misrepresented today.** Gate 1 already defers the feature, the setup page already says menu photo import is not available in this release, and no AI-drafting claim is made ([`01-product.md`](01-product.md) "Cuts and non-goals") [verified]. Stopping costs no honesty and no disclosure.

**What is genuinely unknown**, stated separately from the verdict: whether `gpt-6.1-sol` with a corrected scorer, a stronger abstention instruction and photos at the pipeline's real resolution ceiling would pass a pre-registered round. The evidence here makes that plausible and makes it unproven, and it is a research question, not a shippable feature.

## Decision 2026-10-28

The user read this analysis and decided, in their own words: "Okay lets stop photo work and finish s15."

What that settled, recorded here because the verdict above was written before the decision.

- **Photo work stops before the 13 Nov cutoff.** Manual entry stays the only path, `MENU_IMPORTS_ENABLED` stays false, `AI_MENU_MODEL` stays unset and no AI-drafting claim is made, exactly as the S22 falsifier already required.
- **Gate 1 was re-approved on 2026-10-28** ("approve gate 1") for the paragraph allowing one further round, and that paragraph stays in `01-product.md` as an unused allowance. No round 5 ran, and no round 5 is scheduled.
- **The Gate 2, Gate 3 and Gate 4 drafts were withdrawn the same day.** They were never approved, so `02-architecture.md`, `03-program-design.md` and `04-slices.md` return to their approved text, the `gate4_check.py` pins return to the approved values, and S23 does not exist. The full substance of those drafts is preserved below so nothing has to be rediscovered.
- **Two intermediate decisions were superseded by the stop and are recorded for the history.** The user first chose to pursue a round 5, and chose F1 to F4 as its photo set after being shown twice that the set excludes E3, one of round 4's two real misreads, and that F1 and F2 produced the corrections under test. Neither decision was acted on beyond drafting.
- **The one piece of work worth reviving first, if photo import is ever reopened,** is the variance measurement, because it is cheap and it answers whether the deciding metric is stable at all: rounds 3 and 4 each landed at exactly two real misreads against a limit of two (diagnostic, not a result), and nothing has ever measured whether that number moves between calls. See G8.
- **The scorer collapse defect of G1 is real and is still in the harness.** It was proved by tracing the registered scorer against round 4's saved F2 rows, it needs no round to demonstrate, and it will misreport any future round until it is fixed. Fixing it is a Gate 3 change and was not approved.

## Diagnostic re-analysis of rounds 1 to 4


**Diagnostic, not a result.** The recorded scores stand exactly as recorded; the columns right of "wrong filled" are this document's analysis of the saved outputs, computed by the git-ignored `.maintenance-build/gap-classify.py`, which reimplements the harness's own `norm`, `dice` and alias-key derivation so the similarity used is the registered one.

A recorded wrong filled price is classified **real** when a matched row shows a price that differs from the expected one, **scorer miss** when an unmatched row's filled price equals the expected price of an unfound entry that the registered similarity puts at 0.6 or above against that row's name, and **unclear** otherwise.

| Round | Model | Required | Found | Correct | Wrong filled (recorded) | Real | Scorer miss | Unclear | Median | Recorded result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `gpt-6-luna` | 164 | 161 | 152 | 9 | 4 | 1 | 4 | 21.6 s | fail |
| 1 | `gpt-4o-mini` | 164 | 145 | 107 | 44 | 36 | 2 | 6 | 9.9 s | fail |
| 1 | `gpt-5.6-luna` | 164 | 158 | 147 | 20 | 11 | 4 | 5 | 16.3 s | fail |
| 1 | `gpt-5.4-nano` | 164 | 100 | 71 | 89 | 25 | 4 | 60 | 6.8 s | fail |
| 2 | `gpt-4.1-mini` | 164 | 154 | 118 | 45 | 36 | 7 | 2 | 8.8 s | fail |
| 2 | `gpt-5.4-mini` | 164 | 156 | 117 | 42 | 34 | 6 | 2 | 3.8 s | fail |
| 2 | `gpt-4.1` | 164 | 153 | 122 | 39 | 31 | 4 | 4 | 6.8 s | fail |
| 2 | `gpt-6.1-sol` | 164 | 153 | 148 | 11 | 0 | 11 | 0 | 21.9 s | fail |
| 2 | `gpt-5.6-terra` | 164 | 155 | 141 | 18 | 9 | 7 | 2 | 13.6 s | fail |
| 2 | `gpt-5.4` | 164 | 157 | 141 | 16 | 11 | 3 | 2 | 9.0 s | fail |
| 3 | `gpt-6.1-sol` | 164 | 163 | 156 | 5 | 2 | 1 | 2 | 21.6 s | fail |
| 4 | `gpt-6.1-sol` | 239 | 237 | 230 | 4 | 2 | 2 | 0 | 13.2 s | fail |

Reading the table needs three cautions.

Rounds 1 and 2 were scored with `nameOnlyWhenUnique` off and rounds 3 and 4 with it on, so the wrong-filled columns are not comparable across that boundary [verified from `scoreDraft`'s `options.nameOnlyWhenUnique` and the harness's `round >= 3` switch].
Round 4 used a different and larger photo set, 239 required entries against 164, and its E1 to E6 are re-made copies rather than the round 3 pixels ([`00-status.md`](00-status.md) round 4 pre-registration) [verified].
Every recorded figure in the first six columns reproduces exactly from the saved outputs, which this analysis checked while extracting [verified].

The one result that matters for the decision: for `gpt-6.1-sol`, the model's own price accuracy has been at or inside the limit of two in every round since round 2, and the recorded failures have been driven substantially by the scorer rather than by the model (diagnostic, not a result).

## G1 Scorer and expected-draft gaps

**Evidence.**
The registered scorer adds, to every matched row whose price differs from its entry's expected price, the count of every unmatched row carrying any filled price: `wrongFilled: results.reduce(...) + extras.filter((row) => row.priceSgdCents !== null).length` in [`s11-vision-eval.mts`](evidence/s11-vision-eval.mts) `scoreDraft` [verified].
So a row the matcher cannot align costs the same as an invented price, whatever price it carries.
Across all four rounds there are 141 filled unmatched rows, 93 of which carry a price equal to the expected price of some unfound entry in the same photo (diagnostic, not a result).
For `gpt-6.1-sol` the effect decides the outcome: 11 of 11 in round 2, 1 of 5 in round 3 and 2 of 4 in round 4 (diagnostic, not a result).

Round 4's two scorer misses are both cases where the merchant would have seen a correct price.
F2 returned `{"name": "EBI FRY", "portion": "3 PCS", "priceText": "4.9"}` and `{"name": "EBI FRY", "portion": "+MENTAIKO", "priceText": "5.9"}`, which is exactly the printed menu, and the second row was counted as a wrong filled price [verified from the saved raw output].
E5 returned `{"name": "Salmon Fillet w Lemon Sauce", "portion": "Choice of Fries / Rice / Pasta", "priceText": "14.90"}` at the right price and was counted as a wrong filled price [verified from the saved raw output].

**Root cause, two separate defects.**

The first is the round 3 fix overshooting, and it is demonstrable without any round data.
`portionOf` discards a row's portion when the row's bare name equals exactly one entry's first reading with parentheticals removed, unless the portion matches the size regex `^(s|m|l|small|medium|large|regular)$` [verified from source].
For F2 the entry `Ebi Fry (3 pcs)` reduces to the base name `ebi fry`, which is unique among the entry list, so both returned rows have their portions `3 PCS` and `+MENTAIKO` discarded and both collapse to the key `ebi fry`.
The plain entry then consumes the first row, the `+Mentaiko` entry scores only 0.571 against `ebi fry` and never matches, and the correct second row becomes a filled extra [verified by tracing `scoreDraft` against the saved rows].
The `Tamago` pair on the same photo scored correctly because `Tamago Original`'s base name is `tamago original`, not `tamago`, so no collapse happened [verified].
The defect fires precisely when removing a parenthetical creates a base name that a sibling variant shares as its prefix, which is a plain matcher bug rather than a judgment about any model's output.

The second is the similarity rule being intolerant of a one-character name difference once a printed section note occupies the portion.
The menu prints `Salmon Filet w Lemon Sauce` with one `l`, which this analysis confirmed by cropping the source photo [verified], so the expected draft is correct and the model spelled the name wrongly.
That is itself a prompt violation, since the instruction says to return the name "exactly as printed" [verified from `menu-vision.ts`], and the one-letter difference blocks the exact-equality test that would have dropped the section note from the portion.
The combined key then falls under the 0.8 similarity bar and the row becomes a filled extra carrying a correct price.

**Fix option, justified by the product rather than by the result.**
The product question is whether a merchant would see a wrong price, so the metric should describe the draft the merchant sees, not the matcher's success.
Change the rule to: a filled unmatched row counts as a wrong filled price only when no printed price cell on that photo carries that price for an item the row plausibly names; otherwise it counts against "found" and not against "wrong filled".
Separately, and independently of any round, never discard a portion when discarding it would make two rows of the same draft collapse to the same key, or when another entry's accepted readings begin with that base name.
Both changes make the metric say what the product rule already says, which is that an unreadable or ambiguous price stays blank and a wrong filled price is the error that can reach a buyer.

**How a fix would be tested without overfitting.**
The collapse defect can be proved structurally, with no round data and no re-score: a synthetic entry pair `Ebi Fry (3 pcs)` and `Ebi Fry (3 pcs) +Mentaiko` with two correct rows must score two found, two correct and zero wrong filled, and the current scorer must fail that case before the change and pass it after.
The same fail-capable shape already exists in the round 3 pre-registration, which checked that perfect drafts still score 164 of 164 before any call [verified].
The corrected metric itself can only be judged on a fresh photo set that no diagnosis has touched, because its threshold behaviour on rounds 1 to 4 is now known.
Applying any corrected scorer to a recorded round and reporting the number as a pass is forbidden and is not proposed.

**Cost and time [hypothesis].** Half a day of builder time for both changes and their fail-capable cases, no spend.

**Gates.** Gate 3, because the scorer and the round protocol are Gate 3 material, and Gate 4 for the slice that carries it. Gate 1 is untouched by the scorer itself.

## G2 Abstention

**Evidence.**
The prompt already instructs abstention: `priceText` is "only the printed price number for that entry ... or null when no price is printed or you cannot read it with certainty. Never estimate, round or compute a price." [verified from `src/integrations/ai/menu-vision.ts`].
The output schema is `{ name, portion, priceText, currency }`, every field nullable, with no field in which the model can express doubt about a price it did read [verified from source].
In round 4, across 239 required entries and ten photos, the model returned a null `priceText` only on the two E2 rows where no price is printed at all, and never once on a printed but hard cell (diagnostic, not a result, computed from the saved raw outputs).
On F1's Egg Fried Rice Pork Cutlet cell the print is `$8 9` with no visible decimal point, confirmed here by cropping the source photo [verified], and the model returned `6.9`, which is exactly the value printed on the row immediately above it [verified from the saved raw output].

**Root cause.**
Abstention is available but all-or-nothing, and nothing in the call makes it the cheaper option for the model.
A model that must choose between a number and a null will produce a number, because the instruction gives no operational test for "with certainty" and the schema gives no middle position.
The `6.9` on a cell printed `8 9` also looks like anchoring on the adjacent row rather than a digit confusion, which a confidence field would catch and a sharper photo might not **[hypothesis]**.
The product asymmetry is large and is not reflected anywhere in the call: a blank costs the merchant a few seconds of typing, while a wrong filled price can reach a published menu and a buyer's payment.

**Fix option.**
Add a required `priceConfidence: "clear" | "unsure"` to `MenuVisionOutput`, have `validateVisionDraft` blank any `unsure` price with a new basis, and bump the prompt version with an operational test the model can apply, such as requiring `unsure` when the decimal point is not visible, when the digits are smaller than the surrounding item names, or when the value repeats the adjacent row.
A two-pass design that asks a second call to flag uncertain prices is rejected: it doubles the spend and breaks the Gate 2 and Gate 3 rule of exactly one tool-free call with no retries [verified from [`03-program-design.md`](03-program-design.md) import contract].

**How a fix would be tested without overfitting.**
The known-ambiguous cells are now two, E3's Set B and F1's Pork Cutlet, and both informed this diagnosis, so neither can judge the fix.
A fresh set must be pre-registered with cells the builder marks as ambiguous before any call, and the test is that the model blanks them rather than that it reads them correctly.
Blanking a cell that is in fact legible is a cost to count and report, not a failure, and the pre-registration must say how many such blanks are acceptable before the round runs.

**Cost and time [hypothesis].** One day of builder time for the schema, validator, prompt and tests, plus about US$0.18 for a fourteen-photo round at round 4's measured rate of US$0.0128 a photo.

**Gates.** Gate 3 for `MenuVisionOutput`, `validateVisionDraft` and the prompt version, and Gate 4 for the slice. Gate 1 only if the merchant-visible wording about blanks changes.

## G3 Real misreads on clear photos

**Evidence.**
Round 4's two real misreads are E3 Set B read as S$40 against the printed S$49, and F1 Egg Fried Rice Pork Cutlet read as S$6.90 against the printed S$8.90 [verified from the saved outputs].
This analysis reproduced the evaluated image pipeline offline, with no network call, and the reproduced byte counts match the recorded `sent.bytes` exactly for E3, E5 and F1, so the reproduction is faithful [verified].
Every round 4 photo was sent at its source dimensions: the largest is F1 at 1,206 by 967 and the smallest is E3 at 600 by 799, so `browserShrink`'s scale factor was 1.000 for all ten and the 2,048 pixel ceiling never engaged [verified].
Measuring the ink bounding box of the two misread cells in their source pixels gives E3's `$49` at about 11 pixels tall and 23 wide, and F1's `$8 9` at about 10 pixels tall and 25 wide [verified].
Cropping the same Set B region from the twice-encoded JPEG actually sent and from the PNG source shows no visible difference at three times magnification, so the double JPEG encode is not the dominant cause [verified].

**Root cause.**
The cause is the source resolution of the test photos, not the shrink and not the JPEG quality.
The record's characterisation of E3 as "a clear upright photo" is accurate about the frame and misleading about the glyphs: the photo is upright and well lit, and the price it got wrong is eleven pixels tall.
The pipeline applies two lossy JPEG generations, `browserShrink` at quality 90 and `normalizeMenuJpeg` at quality 85 [verified from source], and that cost is real but secondary here.
Neither misread tells us whether the model can read the same board at the resolution the production path actually allows, because that was never tried.

**Fix option.**
Supply the evaluation photos at the pipeline's real ceiling, straight off a phone, so the 2,048 pixel allowance is used rather than left idle.
No code change is needed for that, which makes it the cheapest of all the options here.
If real merchant photos later turn out to be small, the product answer is a browser-side warning before upload rather than a model change, and that is a Gate 1 question.

**How a fix would be tested without overfitting.**
Photograph the same two menus again at full phone resolution together with fresh menus never used, and pre-register the expected drafts before any call.
Reading E3 and F1 correctly at higher resolution would support the resolution hypothesis, and reading them wrongly again would refute it and point back at the model.
Because both boards have now been diagnosed, their re-reads are a diagnostic of the cause and must not be counted toward a pass on their own.

**Cost and time [hypothesis].** An hour of the user's time to re-photograph, plus the round's spend; no builder code change.

**Gates.** None for the evaluation itself; Gate 1 if a minimum-resolution warning is added to the merchant screen.

## G4 Test set realism

**Evidence.**
E1 to E6 are screenshots of Google Images results, re-made on 2026-10-28 after the round 3 originals were lost, and F1 to F4 are the user's own photographs of Singapore menus ([`00-status.md`](00-status.md) round 4 pre-registration) [verified].
The ten cropped files measure 600 by 799 to 1,206 by 967, and the four fresh originals before cropping measure 1,206 by 1,487, 920 by 2,000, 920 by 2,000 and 1,055 by 1,310 as WebP, so even the user's own photographs reached the harness already downscaled and recompressed [verified].
A current phone camera produces several thousand pixels on the long edge, so none of these ten approaches a real merchant photo **[hypothesis]**.
E6 turned upright is byte for byte the same send as E4: both are 1,078 by 642 and 114,905 bytes [verified], so E4's menu is counted twice inside the 239 required entries and the rotate step was exercised by one synthetic case with no genuinely sideways photo [verified].
E1 carries a green block over part of a footnote and E2 and E4 keep part of a Google Lens icon, none covering a price ([`00-status.md`](00-status.md)) [verified].

**Root cause.**
The set was assembled from what was available under time pressure, and the loss of the round 3 originals forced re-made copies, which the pre-registration recorded honestly [verified].
Screenshots of thumbnails of photographs are two generations of loss away from the input the product will actually receive.

**Fix option.**
A representative set needs photographs taken directly on a phone at full resolution and transferred without recompression, at least one genuinely sideways photo for the rotate step, at least one in poor light and at least one with glare across a price, from menus the builder has never read, each with the owner's permission recorded with its date.
Ten such photos is a minimum and does not make the result generalisable; it makes it honest about what it covers.

**How a fix would be tested without overfitting.**
The set is the test, so the requirement is simply that the builder writes the expected drafts after the user supplies the photos and before any call, and that the user confirms the expected drafts, as the user did on 2026-10-28 [verified].
No photo may be dropped after a call, which the round 4 protocol already requires [verified].

**Cost and time [hypothesis].** Two to three hours of the user's time to photograph, obtain permission and transfer at full resolution, plus half a day of builder time to write and have the expected drafts confirmed.

**Gates.** Gate 3 for the photo-set rules in the round protocol, and Gate 4 for the slice's evidence list.

## G5 Threshold design

**Evidence.**
The threshold is "at most two wrong filled prices", an absolute count, applied unchanged from 164 required entries in rounds 1 to 3 to 239 in round 4 ([`00-status.md`](00-status.md) S11 pre-registration and round 4 pre-registration; `THRESHOLD.maxWrongFilledPrices` is 2 in the harness) [verified].
As a rate the bar therefore tightened from 1.22% of entries to 0.84% [verified arithmetic].
This is stated plainly because it is a design fact, and it did not decide round 4: at round 1's implied rate of 1.22%, 239 entries allow 2.91 wrong filled prices, so the recorded four still fails [verified arithmetic].

**Root cause.**
An absolute count was pre-registered once against a six-photo set and then reused against a ten-photo set, because the pre-registration reused the S11 threshold unchanged by design, as the Gate 3 round 4 protocol requires [verified].

**Fix option, and its honest label.**
**Any proposal to change this threshold now is informed by round 4's result and must be declared as such in writing before a round 5 runs.**
On the product rule, a count has a real justification: what matters is whether any wrong price reaches a published menu, and the merchant confirms a whole menu at once, so the relevant exposure is per confirmed menu rather than per entry.
A per-photo rule maps better onto the actual unit of work, because one import is one photo, and "at most one wrong filled price per photo, and zero on at least eight of ten" would be both stricter where it matters and insensitive to set size.
A pure rate is the weakest of the three on the product rule, because it lets a larger menu carry more wrong prices to a buyer.
The recommendation is to keep the count or move to the per-photo rule, not to move to a rate, and to decide it before and not after a round.

**How a fix would be tested without overfitting.**
A changed threshold is not tested, it is declared, so the only protection is that it is written and committed before any round 5 call, as rounds 1 to 4 all were [verified].

**Cost and time [hypothesis].** An hour of drafting; no spend.

**Gates.** Gate 3 for the threshold in the round protocol, Gate 4 for the slice, and Gate 1 because [`01-product.md`](01-product.md) states the round "passes only if it meets the earlier accuracy threshold" [verified], so changing the threshold changes an approved product sentence.

## G6 Review safeguard

**This is a Gate 1 product question for the user and is not decided here.**

**Evidence.**
The draft is never published without the merchant's review, and the import panel is headed "Draft from a menu photo" with the chip "AI draft: check every value" and closes with "Check every name and price, and choose availability for each item." [verified from `src/app/merchant/setup/menu-import.tsx`].
The only per-import signal about prices is a count: "N prices were unreadable or unclear and stay blank: fill them from your menu." [verified from source].
`priceBasis` is computed in the validator and used only to decide whether a price is blank; it appears nowhere in any component [verified by searching all of `src/`].
So a wrong price the model filled is visually identical to a correct one, and the merchant has no per-row reason to look harder at any particular cell.
A blank price already blocks confirmation, which the Gate 1 mockup check confirmed [verified from [`00-status.md`](00-status.md) 2026-10-15 deferral record].

**Root cause.**
The design asks the merchant to check everything equally, which is the same as asking them to check nothing in particular, and the information needed to direct their attention exists in the validator and is thrown away.

**Fix option.**
Mark every model-filled price distinctly in the editor until the merchant touches it, and if a confidence field is added under G2, mark the unsure ones more strongly.
Showing the photo beside the draft so the merchant can compare a row against its printed cell would help more than any wording change **[hypothesis]**.
Whether such a design makes a higher count of wrong filled prices acceptable is exactly the question only the user can answer, and the answer changes the threshold in G5.

**How a fix would be tested without overfitting.**
Not by a vision round at all: this is measured by whether a tester correcting a draft catches a planted wrong price, which belongs with the S15 usability method rather than with a model evaluation.
That is also the reason not to start it now, because S15 is the slice that is never cut and is already unfinished.

**Cost and time [hypothesis].** A day for the screen change plus usability time Envoi does not have before the cutoff.

**Gates.** Gate 1 first, because it changes what the merchant sees and what Envoi claims, then Gate 3 and Gate 4.

## G7 Candidates and prompt

**Evidence.**
Only `gpt-6.1-sol` has run since round 2, in rounds 3 and 4 [verified].
The prompt is unchanged since 2026-10-15: `MENU_VISION_PROMPT_VERSION` is `menu-vision-prompt-2026-10-15-english` and every round including round 4 records that version [verified from source and from the saved outputs' `promptVersion`].
The recorded candidate space is the ten models priced in the harness's `PRICES` table, all read from the key's model listing and from the official model and pricing pages on 2026-10-15 [verified from [`00-status.md`](00-status.md) rounds 1 and 2 pre-registrations].
Excluded then with reasons: the `gpt-5`, `gpt-5-mini`, `gpt-5-nano` and `o3` snapshots for a shutdown on 11 Dec 2026, and `o4-mini` and `gpt-4.1-nano` for a shutdown on 23 Oct 2026, which has now passed [verified from the record].
Models whose output price is above US$15 per million tokens were excluded by the user's own filter on 2026-10-15 and were never enumerated, so that part of the space is **[unknown]**.
Whether the listing has changed in the thirteen days since is **[unknown]**: `GET /v1/models` is outside this task's scope and needs the user's named permission, even though it calls no model and spends nothing.
Image input and strict structured output through the Responses API remain **[vendor claim]** for any model not actually run, as rounds 1 and 2 already recorded [verified].

**Root cause.**
The candidate list was fixed before the first call in October and has not been revisited, which was correct for pre-registration discipline and leaves the space stale thirteen days later.

**Fix option.**
Ask for permission to read the key's model listing, then re-apply the same rule rounds 1 and 2 used: models whose pages list image input and structured outputs, with no published shutdown before the judging window, ordered by price.
Changing the prompt and changing the model at the same time would make a round 5 uninterpretable, so if both change, the pre-registration must say which one the round is testing **[hypothesis]**.

**How a fix would be tested without overfitting.**
A new candidate has seen none of these photos, so a new candidate is the one change that a round on the existing set could legitimately judge, except that the expected drafts and their known-hard cells are now documented here, which biases the builder rather than the model.
The safe design remains fresh photos.

**Cost and time [hypothesis].** Minutes for the listing read, and a round's spend of roughly US$0.0128 a photo per candidate at round 4's measured rate.

**Gates.** Gate 3 for the candidate rule and the prompt version, Gate 4 for the slice.

## G8 Sample size and variance

**Evidence.**
Every round ran one call per photo and nothing was repeated by design [verified from the harness's single loop over photos].
The evaluation does contain one accidental repeat, and it is the only variance measurement that exists: E4 and E6 were byte-identical sends in round 4, both 1,078 by 642 and 114,905 bytes [verified].
On that identical input the two calls produced identical scores, 31 found, 31 correct and zero wrong filled, and identical prices on all 31 rows, but two of the 31 rows differed in text: one portion came back as `80g; Flavours: Kaya butter, Kaya Pistachio` and as `80g`, and one name as `Soft-boiled Eggs` and as `Soft-Boiled Eggs` [verified from the saved raw outputs].
Latency differed by 17%, 13.6 s against 16.0 s, and output tokens by 60, 1,067 against 1,127 [verified].

**Root cause.**
A pre-registered round was designed to show unfitness cheaply, which it did four times, and it was never designed to estimate the spread of a borderline pass.
That was a reasonable choice while candidates were failing by tens of wrong prices and is the wrong instrument now that the deciding margin is one or two.

**Fix option.**
Run three calls per photo and require the threshold on the worst of the three, reporting the spread.
This matters more than it looks, because the mechanism that turned F2's correct Ebi Fry row into a recorded wrong filled price was a portion-text difference, and the one variance measurement available shows portion text is exactly what is unstable between calls, even when every price is stable **[hypothesis]**.

**What a pass would and would not establish.**
A pass on one call per photo would establish that this model met the bar on one draw of those photos, scored by that scorer, on that day.
It would not establish that it meets the bar repeatably, that it meets it on other menus, that it meets it on real merchant photos, or that it is safe to open imports, and the pre-registration already says a pass changes no flag [verified].
With ten photos and one call each, the evidence boundary is ten drafts, and no claim beyond those ten drafts is supported.

**Cost and time [hypothesis].** Three times the spend, about US$0.39 for a ten-photo set and about US$0.54 for fourteen, plus roughly three times the run wall-clock at a 13.2 s median.

**Gates.** Gate 3 for the calls-per-photo rule in the round protocol, Gate 4 for the slice.

## G9 Timing comparison

**Evidence.**
The timed comparison is the round's second pass condition, and the round passes "only if correction takes less time than typing" ([`00-status.md`](00-status.md) round 4 pre-registration, "Timed comparison, the second pass condition") [verified].
It was never run, because the threshold failed first and the round fails whatever the timing shows [verified from the round 4 results record].
[`01-product.md`](01-product.md) carries the same condition as approved product scope: the round "passes only if it meets the earlier accuracy threshold and correcting the draft is faster than typing the same menu" [verified].

**Root cause.**
Not running it was the correct call under the pre-registered rule and it has a consequence the record should be read for: round 4 is an incomplete measurement, not a near miss.
Even on the most favourable reading of the diagnostic above, no pass could have been recorded from round 4, because one of its two pass conditions was never measured.

**Fix option.**
Budget the user's stopwatch time explicitly in any round 5 pre-registration, and run it in the pre-registered order, correction first so familiarity helps typing rather than correction [verified as already specified].
One trial each remains a prototype measurement and not a general claim, which the pre-registration already labels **[hypothesis]** [verified].

**How a fix would be tested without overfitting.**
The menu used for the timing must be one the user has not already typed or corrected, because typing a menu once makes the second measurement meaningless.
F3 is now unusable for this purpose if its draft has been read, so the timing needs its own fresh menu.

**Cost and time [hypothesis].** Thirty to sixty minutes of the user's time for one correction trial and one typing trial on a sixteen-entry menu, plus a disposable local database.

**Gates.** Gate 3 for the protocol and Gate 1 for the condition's wording, which already exists and does not change.

## Decisions only the user can make

1. Should Envoi stop work on menu photo import before 13 November and keep manual entry as the only path?
2. If not, do you reopen Gate 1 to allow a round 5, knowing the 2026-10-25 allowance for one more round is already spent on round 4?
3. Will you photograph and obtain permission for a fresh set of menus, at full phone resolution and never seen by the builder, for a round 5 to be judged on?
4. May the builder read the key's model listing with `GET /v1/models`, which calls no model and spends nothing?
5. Should the scorer collapse defect be fixed and proved on a synthetic case now, with no recorded round re-scored, so the defect is not carried into any later round?
6. Should the import screen mark every model-filled price for review, which is a Gate 1 product change and needs usability time Envoi does not have before the cutoff?
7. Should "at most two wrong filled prices" stay an absolute count, become a per-photo rule, or become a rate, knowing that any change now is informed by round 4's result?
8. How much of your own stopwatch time will you give the timed comparison, which is the round's unrun second pass condition?

## Draft gate changes if the user wants a round 5

**DRAFT AND UNAPPROVED, AND WITHDRAWN ON 2026-10-28.**
Nothing below is approved, reopens any gate, authorizes any OpenAI call or spend, or starts any slice.
These changes were drafted in the gate documents on 2026-10-28 on the user's words "Draft all four gates at once then let me see", then withdrawn the same day when the user chose to stop photo work and finish S15; see the [decision](#decision-2026-10-28) above.
They are kept here as the record of what a round 5 would have cost, so the work is not lost and so a later session does not have to rediscover it.
Gate 1's paragraph is the only part that was approved and it stays in `01-product.md` as an unused allowance.
If the user ever revives a round 5, each gate still needs its own explicit approval in its own order, Gate 1, Gate 2, Gate 3, then Gate 4.

**Gate 2, `02-architecture.md` continuation amendment, drafted and withdrawn.**
A "Menu photo round 5 (S23)" block beside the existing round 4 block: the vision request may ask the model to mark a price it cannot read with certainty, and a price so marked stays blank exactly as an unreadable price does, so the only new behaviour is more blanks and never a filled price the model doubts.
The call itself is unchanged, one foreground request with `store: false`, strict structured output, an AbortSignal, no tools, no files API upload and no automatic retries.
An evaluation may call the model more than once for the same photo to measure the spread between calls, while one import on the product path still makes exactly one call, so repeated calls are a property of the harness and never of a merchant's import.
Round 5 reuses the S11 consent, admission, spend, leak and request-memory boundaries unchanged, and `MENU_IMPORTS_ENABLED` stays false whatever the round shows.
New risk R21: a measured round whose corrections were derived from its own photos' failures cannot establish accuracy on menus the model has not seen, so its result is bounded evidence about those photos and any wider accuracy claim is refused.

**Gate 3, `03-program-design.md`, drafted and withdrawn.**
Draft change to `MenuVisionOutput`: add a required `priceConfidence: "clear" | "unsure"`, nullable like its siblings, and bump `MENU_VISION_PROMPT_VERSION` to a new dated English version carrying the operational abstention test.
Draft change to `validateVisionDraft`: an `unsure` price keeps a blank price with a new basis `model_unsure` alongside `ambiguous`, `blank`, `other_currency` and `duplicate_variant`, and the whole result is still refused only for malformed or empty output or a broken bound.
Draft abstention test for the prompt: the model returns `"unsure"` when the decimal point is not printed or not visible, when the digits are materially smaller or less sharp than the item names around them, or when the value it would return equals the price printed on the row immediately above or below.
Draft change to the scorer, first rule: never discard a portion when discarding it would make two rows of the same draft share one key, or when another entry's accepted readings begin with that row's bare name.
Draft change to the scorer, second rule: a filled row the matcher could not align at the registered 0.8 similarity counts as a wrong filled price only when no entry of that photo expects that price for an item whose accepted readings reach a Dice bigram similarity of 0.6 against the row.
Draft round 5 protocol: the photo set written down before any call, three calls per photo with the threshold applied to the worst draw, the S11 threshold otherwise unchanged, and the timed comparison on a menu the user has not already typed or corrected.
Draft named tests, each with its own mutation: `an unsure price stays blank`, `a confident price is unchanged`, `two variants keep their portions` on the synthetic `Ebi Fry` pair, and `a perfect draft scores no wrong filled price`.

**Gate 4, `04-slices.md`, drafted and withdrawn.**
Draft slice S23, menu photo experiment round 5, after S22 and outside the build-order table, cut before S22's own position.
Draft visible result: either a recorded pass where the worst of three drafts per photo meets the threshold and correcting a draft is timed faster than typing the same menu, or a recorded fail; in both cases imports stay closed and `MENU_IMPORTS_ENABLED` stays false.
Draft falsifiers: the worst draw of any photo misses the threshold, or correcting takes longer than typing, and separately that `priceConfidence` turns out not to separate the model's wrong prices from its right ones, which the round reports rather than hides.
Draft authorizations to request at start: starting S23 by ID, sending the consented photos to OpenAI again, the evaluation spend with a stated limit, and the user's stopwatch time.
Draft statement of what a pass buys: a recorded measurement only, because the import screen still needs its own Gate 1, Gate 3 and Gate 4 change and an implementation slice before any merchant can use it.

**Gate 1, `01-product.md` "Cuts and non-goals", drafted and APPROVED 2026-10-28.**
This is the one part that was approved, by the user's words "approve gate 1", and it stays in the document as an unused allowance.
It records that round 4 ran on 2026-10-28 and failed on wrong filled prices, and that one further pre-registered round may run with a corrected scorer, a way for the model to mark a price it cannot read with certainty, and more than one call per photo.
It states that such a round would run on photos the round 4 diagnosis has already read, so it cannot establish accuracy on menus the model has not seen.
It states that a pass opens nothing, because manual entry stays the only path, no AI-drafting claim is made, and the import screen still needs its own Gate 1 and Gate 3 change.

