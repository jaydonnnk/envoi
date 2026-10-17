// Browser-only QR reading for the merchant sticker photo (S9) and the buyer scan (S10). The ZXing
// decoder is served from this site, never a CDN; tests pin the file to the package's hash.
export const ZXING_WASM_PATH = "/vendor/zxing_reader-3.1.3.wasm";

export async function qrDetector() {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? ZXING_WASM_PATH : prefix + path) } });
  return new BarcodeDetector({ formats: ["qr_code"] });
}
