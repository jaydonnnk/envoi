import { emvcoCrc } from "@/domain/sgqr/decode";

// FIXTURE SGQR payloads, built tag by tag so each test states exactly what a sticker carries. None
// is an authentic sticker: the UENs, the mobile number and the SGQR id are made up for tests.

export const FIXTURE_UEN = "T26LL0001A";
export const FIXTURE_OTHER_UEN = "53300001F";
export const FIXTURE_MOBILE = "+6590000001";

export function tlv(tagId: string, value: string): string {
  if (!/^\d{2}$/.test(tagId) || value.length === 0 || value.length > 99) throw new Error(`bad FIXTURE tag ${tagId}`);
  return `${tagId}${String(value.length).padStart(2, "0")}${value}`;
}

export const payNowTemplate = (proxyType: string, proxyValue: string, tagId = "26") =>
  tlv(tagId, tlv("00", "SG.PAYNOW") + tlv("01", proxyType) + tlv("02", proxyValue) + tlv("03", "0"));

// A complete payload: the envelope around `accounts`, with a correct CRC unless told otherwise.
export function sgqrPayload(accounts: string[], options: { name?: string; extra?: string[]; badChecksum?: boolean } = {}): string {
  const body =
    tlv("00", "01") +
    tlv("01", "11") +
    accounts.join("") +
    tlv("52", "5812") +
    tlv("53", "702") +
    tlv("58", "SG") +
    tlv("59", options.name ?? "FIXTURE KOPI") +
    tlv("60", "Singapore") +
    (options.extra ?? []).join("") +
    "6304";
  const crc = emvcoCrc(body);
  return body + (options.badChecksum ? (crc === "0000" ? "0001" : "0000") : crc);
}
