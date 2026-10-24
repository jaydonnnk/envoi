import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// S18: the merchant's shop QR is drawn in the browser by the ZXing encoder, served from this site
// like the decoder, never the library's default CDN.
describe("shop QR", () => {
  it("the QR writer is served from this site and is the pinned package's file", async () => {
    const { ZXING_WASM_SHA256, ZXING_WASM_VERSION } = await import("zxing-wasm/writer");
    const { ZXING_WRITER_WASM_PATH } = await import("@/lib/browser/qr");
    expect(ZXING_WRITER_WASM_PATH).toBe(`/vendor/zxing_writer-${ZXING_WASM_VERSION}.wasm`);
    const served = readFileSync(new URL(`../../public${ZXING_WRITER_WASM_PATH}`, import.meta.url));
    const packaged = readFileSync(new URL("../../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm", import.meta.url));
    expect(createHash("sha256").update(served).digest("hex")).toBe(createHash("sha256").update(packaged).digest("hex"));
    expect(createHash("sha256").update(served).digest("hex")).toBe(ZXING_WASM_SHA256);
  });
});
