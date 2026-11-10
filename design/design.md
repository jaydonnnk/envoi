# Envoi landing: design breakdown from the TAKEMOS screen recording

Status: reference breakdown only.
This file does not approve a gate, a slice, an install, or a landing rebuild.
The capture is a reference, never shipped output.
Rebuild clean in Envoi's stack if and when the gates authorize it.

## Source and method

- [verified] Source file: `Screen Recording 2026-11-09 at 10.14.50 PM.mov` in the workspace root.
- [verified] The clip is 12.1 seconds, 1570 x 924, H.264, about 58 fps.
- [verified] Fourteen frames were extracted locally with AVFoundation and read one by one.
- [verified] The recording shows a fictional fintech page branded TAKEMOS, not Envoi.
- [verified] A debug pill at the bottom of the recorded page reads `Scroll to scrub sequence - Frame N/240` and `Scroll to explore card zoom & flight`.
- [hypothesis] That pill is part of the demo harness that recorded the page, not part of the design to copy.
- [unknown] The original page's code, fonts, and asset files were not captured, so exact values below are visual estimates unless marked verified.

## What the recording shows, in order

### Beat 1: Hero at rest

- [verified] The top bar has a wordmark on the left, five text nav items, a language selector, and two lime buttons on the right.
- [verified] A small social-proof pill with stacked avatars sits above the headline and claims `30M customers`.
- [verified] The headline mixes an upright serif with italic serif words: `The Fast and Secure way to send money`.
- [verified] One lime call to action sits under the headline: `+ Get Started`.
- [verified] The lower half of the hero is a photorealistic green meadow with rolling hills and pink, yellow, and white flowers.
- [verified] Two overlapping purple payment cards sit in front of the meadow, one large in the foreground and one smaller behind it.
- [verified] The large card carries a gold chip, a contactless mark, a VISA Corporate lockup, and the TAKEMOS wordmark.

### Beat 2: Scroll-scrubbed card zoom and flight

- [verified] At sequence frame 11 of 240, a single small card stands planted in the grass in the centre of the meadow.
- [verified] At sequence frame 103 of 240, the same card is larger, higher, and facing the viewer.
- [verified] In the hero-at-rest frames, a second large card fills the lower centre of the screen and partly leaves the bottom edge.
- [verified] At sequence frames 172 and 176 of 240, the card is small again, up near the headline, washed out by a bright sun flare.
- [hypothesis] The full scrub therefore runs in three acts: the card rises out of the meadow, zooms toward and past the camera, then flies up and away into the light.
- [verified] The meadow, headline, nav, and call to action do not move while the card moves.
- [verified] Only the card layer changes across the sampled sequence frames.
- [hypothesis] The card motion is a pre-rendered image sequence scrubbed by scroll position, most likely drawn on a canvas, in the style of a product-film scroll page.
- [hypothesis] A 240-frame sequence at this size was probably rendered from a 3D scene or generated as video frames, not hand-animated in CSS.

### Beat 3: Specification section

- [verified] Scrolling past the hero reveals a warm off-white section with a centred serif headline: `Engineered for borderless global commerce`.
- [verified] A small uppercase pill above that headline reads `TAKENOS VISA CORPORATE SPECIFICATIONS`.
- [verified] The left column holds a sticky card visual, a status row, `Flip to Back` and `Freeze Card` buttons, and three specification chips.
- [verified] The specification chips claim weight, titanium material, and chip security level.
- [verified] The right column holds unequal feature cards for FX pricing, cashback with an interactive slider, dynamic CVV, wallet provisioning, and a wide lounge-access banner with a lime call to action.
- [verified] The page ends in a dark green footer with the wordmark, one line of positioning, a back-to-top link, and a copyright line.

## Design system extracted from the frames

Each full sentence sits on its own line in this file by project rule.

### Layout

- The hero is a full-viewport stage with text anchored top-left and the photographic scene anchored to the bottom half.
- The hero text block never overlaps the nav and only slightly overlaps the card at the largest zoom.
- The second section uses a centred headline, then an asymmetric two-column layout with a sticky visual on the left and stacked cards on the right.
- Corners are large and consistent, roughly 16 to 24 px on cards and the payment card itself.
- Spacing is generous and even, with section padding that looks close to 96 px on desktop.

### Type

- [hypothesis] Headlines use a high-contrast serif, with italic words swapped in for emphasis inside the same sentence.
- [hypothesis] Body and UI text use a neutral grotesque sans at small sizes with tight, dark-green colouring.
- The headline scale is roughly 56 to 68 px on desktop, with line height near 1.05.
- Emphasis is done by italic serif words, not by colour or weight changes.

### Colour, estimated from frames

- Page background: warm off-white, approximately `#F6F6F0`.
- Ink: very dark green, approximately `#10281C`.
- Accent: saturated lime, approximately `#BFEA3C`, used only on buttons and small icon chips.
- Card: deep purple with a lighter purple sheen band running vertically through the middle.
- Scene: saturated meadow greens with pink and yellow flower accents.
- Footer: the same dark green as the ink, with off-white text.
- These hex values are sampled by eye from compressed frames and must be re-measured before any token is locked.

### Components worth noting

- Avatar-stack social-proof pill.
- Lime primary button with a leading plus sign.
- Photorealistic scene plate that spans the full width and is cropped by the hero's bottom edge.
- Payment card as hero object, rendered with chip, contactless mark, network lockup, and brand.
- Sticky product visual with two small interactive buttons and three specification chips.
- Unequal feature cards with a small lime or dark-green icon chip, a bold title, two lines of copy, and a footer metric row.
- Wide banner card that spans the right column and carries the section's main call to action.

## Motion system, reverse-engineered

- One signature moment only: the pinned hero scrub.
- The hero stage stays fixed while a tall scroll track, probably 250 to 400 vh, maps scroll progress to sequence frames 0 to 240.
- Frame selection is a direct map: `frame = round(progress * 239)`.
- The canvas or image is drawn with a cover fit so the meadow plate never letterboxes.
- Scrolling back up reverses the sequence exactly, which the recording demonstrates several times.
- The specification section uses no visible scroll animation in the sampled frames; it arrives as a normal document section.
- [hypothesis] Any fade or rise on the specification cards is minor, because no mid-animation state was sampled there.
- Motion should animate transform and opacity only in a DOM rebuild, and must respect `prefers-reduced-motion`.

## What not to copy

- Do not copy the TAKEMOS name, the VISA and Mastercard marks, the purple card, or the meadow photograph.
- Do not copy the `30M customers` claim, the FX claim, the cashback claim, or the lounge claim.
- Envoi has no evidence for equivalent claims, and invented claims would fail Envoi's own product rules.
- Do not copy the purple-to-sheen card treatment as Envoi's identity; a purple gradient hero object is also the most recognised AI-generated tell.
- Do not copy the centred pill, headline, and dual-button hero formula one-for-one; Envoi's current hero is left-anchored and should stay that way.
- Do not ship the debug scrub pill.

## Translation to Envoi

### The hero object

Envoi sells no card, so the card has no honest equivalent.
The honest hero object is the Envoi journey itself, in the order the approved landing already teaches it.
Act 1, Scan: an SGQR sticker on a stall counter, small in frame.
Act 2, Ask: a phone rises toward the viewer showing a menu explained in the visitor's language, with prices that come only from the shop's menu.
Act 3, Approve: the phone shows the exact total and who gets paid, and a human taps approve in PayPal.
Act 4, Show the stall: the order appears large in the stall's language, and only after Paid.
Pending must never be shown as Paid at any frame of the sequence.
Any money shown is test money and must be labelled as such on the frame itself, because the site chrome already promises that label.

### The scene plate

Replace the meadow with one photographic plate of a Singapore hawker stall counter.
The plate stays static while the phone and sticker move, exactly as the meadow stays static while the card moves.
A real photograph is preferred; a generated plate must not show readable fake prices or a fake SGQR that a camera could mistake for a payment code.

### Sections below the hero

Keep the approved four steps, Scan, Ask, Approve, and Show the stall, as the specification section's four cards.
Keep `I run a shop` as the wide banner card's call to action, pointing at `/for-shops`.
Keep the languages line, Japanese, Malay, Spanish, and Chinese.
Keep the GitHub and Evidence links in place of the recorded page's footer claims.
Do not add a bento grid for its own sake; four step cards and one banner is the whole section.

### Type and colour direction for Envoi

Keep Envoi's existing ink, blue, pale, and green tokens from `src/app/globals.css` as the base.
Add one distinctive display serif only for the two landing headlines, paired with the existing sans for everything else.
A serif used alone as the whole identity, or a cream page background, would read as generated; neither is proposed.
The display serif is a Gate 1 decision, because it changes how the approved mockups look.

## Implementation options

| Option | Fidelity to recording | Cost and risk | Verdict for Envoi |
|---|---|---|---|
| Canvas image sequence, 240 WebP frames, GSAP ScrollTrigger pin and scrub | Exact, including photoreal card flight | Large preload, heavy memory, needs rendered frames Envoi does not have | Only if a real render budget is approved |
| DOM rebuild with GSAP ScrollTrigger: one phone, one sticker, layered plates, transform and opacity only | Close in feel, crisp at every size, no film grain | Needs careful art direction to avoid looking flat | Recommended |
| Scroll-scrubbed muted video element | Near-exact motion | Unreliable seeking on mobile Safari, large file | Not recommended |
| CSS scroll-driven animations only, no library | Partial, no pin choreography across browsers | No dependency, weakest control | Fallback only |

## Recommended build, if authorized

1. Add `gsap` as the only new dependency, which needs explicit install authorization.
2. Build the hero as a client component beside the server page, so the page still renders the headline, lead, and actions without JavaScript.
3. Pin the hero stage for one tall scroll track on desktop, and disable the pin below tablet width.
4. Choreograph four acts on one timeline: sticker settles, phone rises and scales, approval sheet slides in, stall-language card replaces it after Paid.
5. Animate transform and opacity only; never animate width, height, top, or left.
6. Serve a static stacked layout when `prefers-reduced-motion` is set or JavaScript is off.
7. Cap any canvas work at a device pixel ratio of 2 and pause rendering when the hero is off screen.
8. Keep the existing landing tests passing or revise them only through the gate that changes the copy they pin.

### Files the build would touch

- `src/app/page.tsx` for hero structure and section order.
- A new client hero component under `src/app/` for the ScrollTrigger timeline.
- The landing block at the end of `src/app/globals.css` for stage, pin, and reduced-motion styles.
- `public/` for the stall plate and phone artwork.
- `package.json` and the lockfile for `gsap`, only with install authorization.
- `tests/unit/landing-page.test.ts` only if a gate changes the headline or copy it asserts.

## Gate path before any code

- This redesign changes approved landing copy presentation and adds a dependency, so it reopens Gate 1 for the landing direction.
- Gate 2 must record GSAP, the asset strategy, and the performance budget.
- Gate 3 must name the landing tests, including reduced-motion and no-JavaScript rendering.
- Gate 4 must add one slice with a visible result, evidence frames at desktop and phone widths, and the closing question naming the next slice.
- No application implementation begins before Gate 4 approval.

## Open decisions for the user

- Approve the DOM rebuild, or fund a rendered 240-frame sequence.
- Approve a display serif for landing headlines, or keep the current Trebuchet and Segoe pairing.
- Approve a hawker-stall photographic plate, and choose real photography or a labelled generated plate.
- Decide whether the hero keeps the current headline text or reopens Gate 1 copy as well as presentation.
