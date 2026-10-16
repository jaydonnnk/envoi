import { createHash, randomBytes } from "node:crypto";

export type IdPrefix = "out" | "mrv" | "itm" | "pur" | "dst" | "att" | "aud" | "pev" | "rlh" | "prq" | "agt" | "usr" | "acc" | "mbr" | "enr" | "mnt" | "opg" | "imp" | "oid";

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

// 256 random bits, base32-encoded: agent handoff tokens and agent bearer tokens (Gate 3 Files).
// Only hashToken's digest is stored; the token itself is shown once and never persisted.
export function newSecretToken(): string {
  return base32(randomBytes(32));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
