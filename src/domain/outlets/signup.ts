import { createHmac } from "node:crypto";
import { admit, type Admission, type RateLimits } from "@/lib/ratelimit";
import type { Db } from "@/lib/db/web";

// Merchant sign-up limits (S43, Gate 3 S43 amendment decision 4) [hypothesis]: at most 3 sign-ups
// per address and 30 in all in an hour. They bound what a stranger can create; neither measures demand.
export const MERCHANT_SIGNUP_LIMITS: RateLimits = {
  perSubject: { max: 3, windowMs: 60 * 60_000 },
  global: { max: 30, windowMs: 60 * 60_000 },
};

// The limiter's per-address key (decision 3). The address is the last x-forwarded-for entry, the one
// the nearest proxy adds, or "unknown" without the header; whether Render overwrites a client-sent
// header is [unknown] until the Render check. Only an HMAC under the auth secret is stored, never the
// address, and the label keeps this hash apart from any other use of the secret.
export function signupSubject(headers: Headers, secret: string): string {
  const entries = (headers.get("x-forwarded-for") ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const address = entries.at(-1) ?? "unknown";
  return createHmac("sha256", secret).update(`merchant_signup\n${address}`, "utf8").digest("hex");
}

export function admitSignup(db: Db, headers: Headers, secret: string, now: Date): Promise<Admission> {
  return admit(db, "merchant_signup", signupSubject(headers, secret), MERCHANT_SIGNUP_LIMITS, now);
}
