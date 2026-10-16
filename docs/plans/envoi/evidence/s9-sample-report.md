# S9 SGQR decode report: fixture-only

Date: 2026-10-16.
Result label: **fixture-only**.
No consented authentic SGQR sticker photo was available, so no decode-accuracy claim is made.
The roadmap's 8 of 10 clean-sample figure is a planning target and was not measured.

## Samples

Every sample is a FIXTURE: a QR code generated with the pinned ZXing writer (`zxing-wasm` 3.1.3, from `node_modules`) from a payload built tag by tag with `tests/support/sgqr.ts`, on a light sticker-like border.
None is a photograph of a real sticker, and the UENs, mobile number and SGQR id are made up.

Each was selected through the setup page's file input on a local production build (`next build`, `next start` at `http://localhost:3100`, FIXTURE settings, disposable database `envoi_t_s9browser_f5bc8492`, dropped after), decoded in the browser by `barcode-detector` 3.2.2 with the wasm served from `/vendor/zxing_reader-3.1.3.wasm`.

| Sample | Payload content | Result on the page |
| --- | --- | --- |
| `fixture-uen` | PayNow UEN `T26LL0001A` (tag 26), a `com.grab` template (tag 27), an `SG.SGQR` template (tag 51), valid CRC | Checksum valid; "PayNow UEN T26LL0001A, Recognized"; "2 other tags Envoi does not read" listing tags 27 and 51 with their values; UEN prefilled; submitted, recorded as from the sticker with checksum valid, then approved by the operator act. |
| `fixture-mobile` | PayNow proxy type 0, mobile `+6590000001`, valid CRC | Checksum valid; "PayNow proxy that is not a business UEN, Cannot be used"; UEN left empty. Typing the mobile number as the UEN is refused: "That is not a Singapore UEN." |
| `fixture-bad-checksum` | PayNow UEN `T26LL0001A`, CRC deliberately wrong | "Checksum does not match" with the warning to check every value; the UEN is still shown for review. |
| `fixture-url` | `https://example.test/FIXTURE-not-sgqr` | "This QR code is not an SGQR payment code." and manual entry offered. |
| `fixture-unreadable` | A plain grey image with no QR code | "No QR code could be read from this photo." and manual entry offered. |

Manual entry of `53300001F` was recorded as entered by hand, and a sticker UEN corrected to `53300009F` as corrected from the sticker.
The server log of that run contains no QR payload (`000201`) and no merchant name from a payload; the `identifier_submission` lines carry the outlet id and the outcome only.

## Not established

- [unknown] Decode rate on authentic stickers, photographed at an angle, blurred or under glare.
- [unknown] Whether authentic stickers carry PayNow proxy types other than 0 and 2, or UEN suffixes; the accepted suffix of up to three characters is a [hypothesis].
- [unknown] Behaviour on phone browsers other than the desktop Chromium in the Claude browser pane.
