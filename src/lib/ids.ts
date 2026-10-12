import { randomBytes } from "node:crypto";

export type IdPrefix = "out" | "mrv" | "itm" | "pur" | "dst" | "att" | "aud";

// 128 random bits, base32-encoded, so a receipt id cannot be guessed or enumerated.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${base32(randomBytes(16))}`;
}
