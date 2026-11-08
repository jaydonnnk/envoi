import { describe, expect, it } from "vitest";
import { countableIdentifiers, scanWeek, stickerHash } from "@/domain/sgqr/demand";
import { decodeEmvcoTlv } from "@/domain/sgqr/decode";
import { FIXTURE_MOBILE, FIXTURE_UEN, payNowTemplate, sgqrPayload } from "../support/sgqr";

// S48: the keyed hash, the week and which identifiers a no-match scan counts. Every key, UEN and
// sticker here is a FIXTURE.
const KEY_A = "FIXTURE-key-A-0123456789abcdef0123456789";
const KEY_B = "FIXTURE-key-B-0123456789abcdef0123456789";

describe("stall demand", () => {
  describe("81 the hash cannot be read back without the key", () => {
    it("gives a different hash under a different key, and holds no part of the identifier", () => {
      const a = stickerHash("paynow_uen", FIXTURE_UEN, KEY_A);
      const b = stickerHash("paynow_uen", FIXTURE_UEN, KEY_B);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(b).not.toBe(a);
      expect(stickerHash("paynow_uen", FIXTURE_UEN, KEY_A)).toBe(a);
      expect(a.toUpperCase()).not.toContain(FIXTURE_UEN);
      // Moving characters between the scheme and the identifier changes the input, so it changes the hash.
      expect(stickerHash("paynow_ue", `n${FIXTURE_UEN}`, KEY_A)).not.toBe(a);
    });
  });

  it("a week starts on Monday in Singapore", () => {
    // Sunday 23:30 in Singapore is still the week that began on Monday 2 November.
    expect(scanWeek(new Date("2026-11-08T15:30:00Z"))).toBe("2026-11-02");
    // Monday 00:10 in Singapore is Sunday 16:10 in UTC, and starts the week of 9 November.
    expect(scanWeek(new Date("2026-11-08T16:10:00Z"))).toBe("2026-11-09");
  });

  it("counts business identifiers only, from a sticker whose checksum matches", () => {
    const both = decodeEmvcoTlv(sgqrPayload([payNowTemplate("2", FIXTURE_UEN), payNowTemplate("0", FIXTURE_MOBILE, "27")]));
    expect(countableIdentifiers(both)).toEqual([{ scheme: "paynow_uen", identifier: FIXTURE_UEN }]);
    expect(countableIdentifiers(decodeEmvcoTlv(sgqrPayload([payNowTemplate("2", FIXTURE_UEN)], { badChecksum: true })))).toEqual([]);
    expect(countableIdentifiers(decodeEmvcoTlv("FIXTURE not a sticker"))).toEqual([]);
  });
});
