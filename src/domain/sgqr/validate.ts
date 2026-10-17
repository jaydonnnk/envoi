import type { SupportedScheme } from "./decode";

// Which decoded or typed identifiers may become an outlet mapping (Gate 2 merchant flow: unsupported
// and personal proxies do not become published business identifiers). A valid format proves no
// ownership; the operator approves every mapping. The buyer's resolution of approved mappings
// (S10) uses the same rule, in resolve.ts.

export type MappableIdentifier = { scheme: "paynow_uen"; identifier: string };

export type MappingRefusal = { reason: "personal_proxy" | "uen_format"; message: string };

// Singapore UEN formats: a business (8 digits and a check letter), a local company (year, 5 digits
// and a check letter) or another entity (T, S or R, a 2-digit year, a 2-letter entity type, 4 digits
// and a check letter). [hypothesis] PayNow lets a business add a suffix of up to 3 letters or digits
// for a second account, so one is accepted after the UEN. A personal NRIC or mobile number matches
// none of these.
const UEN = /^(?:\d{8}[A-Z]|(?:18|19|20)\d{7}[A-Z]|[RST]\d{2}[A-Z]{2}\d{4}[A-Z])(?:[A-Z0-9]{1,3})?$/;

const UEN_MAX_CHARS = 13;

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase();
}

export function mappableIdentifier(field: { scheme: SupportedScheme; identifier: string }): MappableIdentifier | MappingRefusal {
  if (field.scheme === "paynow_proxy") {
    return { reason: "personal_proxy", message: "A PayNow mobile number or other personal proxy cannot be published as a business identifier. Enter the shop's UEN instead." };
  }
  const identifier = normalizeIdentifier(field.identifier);
  if (identifier.length > UEN_MAX_CHARS || !UEN.test(identifier)) {
    return { reason: "uen_format", message: "That is not a Singapore UEN. Check it against the sticker or your business registration." };
  }
  return { scheme: "paynow_uen", identifier };
}

export function isMappable(result: MappableIdentifier | MappingRefusal): result is MappableIdentifier {
  return "identifier" in result;
}
