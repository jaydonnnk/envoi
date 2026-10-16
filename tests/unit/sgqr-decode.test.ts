import { describe, expect, it } from "vitest";
import { decodeEmvcoTlv } from "@/domain/sgqr/decode";
import { mappableIdentifier } from "@/domain/sgqr/validate";
import { FIXTURE_MOBILE, FIXTURE_UEN, payNowTemplate, sgqrPayload, tlv } from "../support/sgqr";

// S9: the EMVCo decode the merchant's browser and the server share. Every payload is a FIXTURE built
// tag by tag; none is an authentic sticker.

const decoded = (payload: string) => {
  const result = decodeEmvcoTlv(payload);
  if (result.kind !== "decoded") throw new Error(`FIXTURE payload did not decode: ${result.kind}`);
  return result;
};

describe("SGQR decode", () => {
  it("unrecognized tags are surfaced not guessed", () => {
    const grab = tlv("27", tlv("00", "com.grab") + tlv("01", "FIXTUREGRAB01"));
    const sgqrId = tlv("51", tlv("00", "SG.SGQR") + tlv("01", "FIXTURE00001") + tlv("03", "018956"));
    // PayNow by its GUI, but with no proxy type: it cannot be read as either scheme.
    const payNowWithoutType = tlv("28", tlv("00", "SG.PAYNOW") + tlv("02", FIXTURE_UEN));
    const unknown = tlv("80", "FIXTURE-UNKNOWN");
    const result = decoded(sgqrPayload([payNowTemplate("2", FIXTURE_UEN), grab, payNowWithoutType, sgqrId], { extra: [unknown] }));

    expect(result.recognized).toEqual([{ scheme: "paynow_uen", identifier: FIXTURE_UEN, label: "PayNow UEN" }]);
    expect(result.unrecognized).toEqual([
      { tagId: "27", length: grab.length - 4, value: grab.slice(4) },
      { tagId: "28", length: payNowWithoutType.length - 4, value: payNowWithoutType.slice(4) },
      { tagId: "51", length: sgqrId.length - 4, value: sgqrId.slice(4) },
      { tagId: "80", length: 15, value: "FIXTURE-UNKNOWN" },
    ]);
    expect(result.checksumValid).toBe(true);
  });

  it("checksum validity is computed, not assumed", () => {
    const payload = sgqrPayload([payNowTemplate("2", FIXTURE_UEN)], { name: "FIXTURE KOPI" });
    expect(decoded(payload).checksumValid).toBe(true);
    // One character changed after the CRC was computed, as a misread would.
    expect(decoded(payload.replace("FIXTURE KOPI", "FIXTURE KOPO")).checksumValid).toBe(false);
    expect(decoded(sgqrPayload([payNowTemplate("2", FIXTURE_UEN)], { badChecksum: true })).checksumValid).toBe(false);
  });

  it("a payload that is not EMVCo decodes to nothing", () => {
    const valid = sgqrPayload([payNowTemplate("2", FIXTURE_UEN)]);
    for (const payload of ["https://example.test/FIXTURE", "", valid.slice(0, -10), tlv("00", "02") + valid.slice(6), `${valid}9`, "x".repeat(513)]) {
      expect(decodeEmvcoTlv(payload), JSON.stringify(payload.slice(0, 40))).toEqual({ kind: "not_emvco" });
    }
  });

  it("a PayNow mobile number decodes as a proxy, not a UEN", () => {
    const result = decoded(sgqrPayload([payNowTemplate("0", FIXTURE_MOBILE)]));
    expect(result.recognized).toEqual([{ scheme: "paynow_proxy", identifier: FIXTURE_MOBILE, label: "PayNow proxy that is not a business UEN" }]);
    expect(result.unrecognized).toEqual([]);
  });
});

describe("UEN validation", () => {
  it("a malformed UEN is refused", () => {
    for (const identifier of ["S1234567D", "91234567", FIXTURE_MOBILE, "T26LL0001", "2026123456", "53300001F12345", "53300001-F"]) {
      expect(mappableIdentifier({ scheme: "paynow_uen", identifier }), identifier).toMatchObject({ reason: "uen_format" });
    }
    for (const [identifier, normalized] of [
      ["53300001F", "53300001F"],
      ["202612345k", "202612345K"],
      [` ${FIXTURE_UEN} `, FIXTURE_UEN],
      ["53300001FA01", "53300001FA01"],
    ]) {
      expect(mappableIdentifier({ scheme: "paynow_uen", identifier: identifier! }), identifier).toEqual({ scheme: "paynow_uen", identifier: normalized });
    }
  });
});

describe("browser decoder", () => {
  it("the ZXing decoder is served from this site and is the pinned package's file", async () => {
    const { createHash } = await import("node:crypto");
    const { readFileSync } = await import("node:fs");
    const { ZXING_WASM_SHA256, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
    const { ZXING_WASM_PATH } = await import("@/app/merchant/setup/sgqr-sticker");
    expect(ZXING_WASM_PATH).toBe(`/vendor/zxing_reader-${ZXING_WASM_VERSION}.wasm`);
    const served = readFileSync(new URL(`../../public${ZXING_WASM_PATH}`, import.meta.url));
    expect(createHash("sha256").update(served).digest("hex")).toBe(ZXING_WASM_SHA256);
  });
});
