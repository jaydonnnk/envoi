// EMVCo merchant-presented QR decode (Gate 3 "SGQR"). Pure and dependency-free, so the merchant's
// browser and the server run the same code. It never invents a field and never drops an
// unrecognized tag silently, and its input is never logged or persisted: callers keep the payload in
// memory only, and the logger redacts one that reaches it by mistake.

export type TlvTag = { tagId: string; length: number; value: string };

export type SgqrDecode =
  | { kind: "not_emvco" }
  | { kind: "decoded"; recognized: SgqrField[]; unrecognized: TlvTag[]; checksumValid: boolean };

export type SupportedScheme = "paynow_uen" | "paynow_proxy";
export type SgqrField = { scheme: SupportedScheme; identifier: string; label: string };

// EMVCo caps a merchant-presented payload at 512 characters.
export const SGQR_MAX_PAYLOAD_CHARS = 512;

// EMVCo data objects outside the merchant account templates: payload format indicator (00), point
// of initiation (01), category, currency, amount, tip and convenience fees, country, name, city,
// postal code, additional data (62), CRC (63) and the alternate-language template (64). They are
// recognized as the envelope and yield no field: SGQR carries no menu, and a shop name in a sticker
// proves nothing. Every other tag, including each merchant account template that is not PayNow,
// is listed as unrecognized.
const ENVELOPE_TAGS = new Set(["00", "01", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64"]);

const PAYNOW_GUI = "SG.PAYNOW";
// PayNow proxy types in an SGQR PayNow template: 2 is a UEN; any other type, such as 0 for a
// mobile number, is a proxy that is not a business identifier.
const PAYNOW_PROXY_UEN = "2";

function parseTlv(text: string): TlvTag[] | null {
  const tags: TlvTag[] = [];
  let at = 0;
  while (at < text.length) {
    const head = text.slice(at, at + 4);
    if (!/^\d{4}$/.test(head)) return null;
    const length = Number(head.slice(2));
    const value = text.slice(at + 4, at + 4 + length);
    if (length === 0 || value.length !== length) return null;
    tags.push({ tagId: head.slice(0, 2), length, value });
    at += 4 + length;
  }
  return tags;
}

// CRC-16/CCITT-FALSE (polynomial 0x1021, initial 0xFFFF) over the UTF-8 bytes of the payload up to
// and including the CRC tag's id and length, as EMVCo specifies.
export function emvcoCrc(text: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function checksumValid(payload: string, tags: TlvTag[]): boolean {
  const last = tags.at(-1);
  if (!last || last.tagId !== "63" || last.length !== 4) return false;
  return emvcoCrc(payload.slice(0, -4)) === last.value.toUpperCase();
}

// A PayNow merchant account template yields exactly one field, or null when it is not PayNow or
// lacks its proxy type or value, so the caller lists it as unrecognized instead.
function payNowField(tag: TlvTag): SgqrField | null {
  const parts = parseTlv(tag.value);
  if (!parts) return null;
  const sub = (id: string) => parts.find((part) => part.tagId === id)?.value;
  if (sub("00")?.toUpperCase() !== PAYNOW_GUI) return null;
  const proxyType = sub("01");
  const identifier = sub("02");
  if (proxyType === undefined || identifier === undefined) return null;
  return proxyType === PAYNOW_PROXY_UEN
    ? { scheme: "paynow_uen", identifier, label: "PayNow UEN" }
    : { scheme: "paynow_proxy", identifier, label: "PayNow proxy that is not a business UEN" };
}

const isMerchantAccountTemplate = (tagId: string) => Number(tagId) >= 26 && Number(tagId) <= 51;

export function decodeEmvcoTlv(payload: string): SgqrDecode {
  if (payload.length === 0 || payload.length > SGQR_MAX_PAYLOAD_CHARS) return { kind: "not_emvco" };
  const tags = parseTlv(payload);
  // A payload that does not open with the payload format indicator 01, or does not parse to its
  // last character, is not EMVCo; nothing is decoded from part of it.
  if (!tags || tags[0]?.tagId !== "00" || tags[0].value !== "01") return { kind: "not_emvco" };

  const recognized: SgqrField[] = [];
  const unrecognized: TlvTag[] = [];
  for (const tag of tags) {
    if (ENVELOPE_TAGS.has(tag.tagId)) continue;
    const field = isMerchantAccountTemplate(tag.tagId) ? payNowField(tag) : null;
    if (field) recognized.push(field);
    else unrecognized.push(tag);
  }
  return { kind: "decoded", recognized, unrecognized, checksumValid: checksumValid(payload, tags) };
}
