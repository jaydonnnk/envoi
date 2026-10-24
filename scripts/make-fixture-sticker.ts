// Draws a labeled FIXTURE SGQR sticker for demos and the merchant sticker upload: a PayNow UEN
// payload built with the tests' tag-by-tag builder, encoded by the pinned ZXing writer, then read
// back and decoded with Envoi's own decoder before the file is kept. It is never an authentic
// sticker and carries no official SGQR or MAS branding (product rule 9).
//   npx tsx scripts/make-fixture-sticker.ts <uen> "<shop name>" <out.png>
import { unlinkSync } from "node:fs";
import sharp from "sharp";
import { readBarcodes, writeBarcode } from "zxing-wasm/full";
import { decodeEmvcoTlv } from "../src/domain/sgqr/decode";
import { isMappable, mappableIdentifier } from "../src/domain/sgqr/validate";
import { payNowTemplate, sgqrPayload, tlv } from "../tests/support/sgqr";

const [uen, name, out] = process.argv.slice(2);
if (!uen || !name || !out) {
  console.error('usage: npx tsx scripts/make-fixture-sticker.ts <uen> "<shop name>" <out.png>');
  process.exit(2);
}

// A UEN the merchant flow would refuse makes a sticker that cannot demo anything.
const mappable = mappableIdentifier({ scheme: "paynow_uen", identifier: uen });
if (!isMappable(mappable)) {
  console.error(mappable.message);
  process.exit(2);
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Tag 62 sub-tag 01 marks the payload itself as a fixture, so a decoded string says so too.
const payload = sgqrPayload([payNowTemplate("2", uen)], { name, extra: [tlv("62", tlv("01", "FIXTURE"))] });
const { svg } = await writeBarcode(payload, { format: "QRCode", ecLevel: "M", scale: 10 });
const qr = await sharp(Buffer.from(svg)).resize(520, 520, { kernel: "nearest" }).png().toBuffer();

const width = 720;
const height = 1000;
const center = width / 2;
const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="#ffffff"/>
<rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="32" fill="#ffffff" stroke="#c62828" stroke-width="10" stroke-dasharray="28 14"/>
<rect x="40" y="40" width="${width - 80}" height="96" rx="18" fill="#c62828"/>
<text x="${center}" y="102" font-family="Helvetica, Arial" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">TEST FIXTURE STICKER</text>
<text x="${center}" y="186" font-family="Helvetica, Arial" font-size="34" font-weight="700" fill="#111111" text-anchor="middle">${escapeXml(name)}</text>
<rect x="90" y="215" width="540" height="540" rx="16" fill="#ffffff" stroke="#dddddd" stroke-width="4"/>
<text x="${center}" y="810" font-family="Helvetica, Arial" font-size="30" fill="#111111" text-anchor="middle">PayNow UEN ${escapeXml(uen)}</text>
<text x="${center}" y="870" font-family="Helvetica, Arial" font-size="26" fill="#c62828" text-anchor="middle">Not a real SGQR. Made-up UEN. Do not pay.</text>
<text x="${center}" y="915" font-family="Helvetica, Arial" font-size="24" fill="#555555" text-anchor="middle">Envoi demo only. Never scan with a bank app.</text>
</svg>`;
await sharp(Buffer.from(frame)).composite([{ input: qr, top: 225, left: 100 }]).png().toFile(out);

// Keep the file only if the picture reads back to the exact payload and Envoi recognizes the UEN.
const [read] = await readBarcodes(new Uint8Array(await sharp(out).toBuffer()), { formats: ["QRCode"] });
const decoded = decodeEmvcoTlv(read?.text ?? "");
const recognized = decoded.kind === "decoded" && decoded.checksumValid && decoded.recognized.some((f) => f.identifier === uen.toUpperCase());
if (read?.text !== payload || !recognized) {
  unlinkSync(out);
  console.error("The sticker did not read back as a recognized PayNow UEN; nothing was kept.", JSON.stringify(decoded));
  process.exit(1);
}
console.log(`${out}: PayNow UEN ${uen}, checksum valid`);
