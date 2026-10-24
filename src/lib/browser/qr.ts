// Browser-only QR reading for the merchant sticker photo (S9) and the buyer scan (S10), and drawing
// of the merchant's shop QR (S18). The ZXing decoder and encoder are served from this site, never a
// CDN; tests pin each file to the package's hash.
export const ZXING_WASM_PATH = "/vendor/zxing_reader-3.1.3.wasm";
export const ZXING_WRITER_WASM_PATH = "/vendor/zxing_writer-3.1.3.wasm";

export async function qrDetector() {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_PATH : prefix + path) } });
  return new BarcodeDetector({ formats: ["qr_code"] });
}

// The shop QR (S18) encodes the shop's public buy link and nothing else: never a PayNow, EMVCo or
// wallet payload, so no bank app can pay with it. Returns a PNG with its quiet zone.
export async function drawShopQr(url: string): Promise<Blob> {
  const { prepareZXingModule, writeBarcode } = await import("zxing-wasm/writer");
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WRITER_WASM_PATH : prefix + path) } });
  const { image, error } = await writeBarcode(url, { format: "QRCode", ecLevel: "M", scale: 12, addQuietZones: true });
  if (!image) throw new Error(error || "The QR code could not be drawn.");
  return image;
}
