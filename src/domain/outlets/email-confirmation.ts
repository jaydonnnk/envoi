import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { signupProxyAddress } from "@/domain/outlets/signup";
import type { MailSettings } from "@/env";
import { sendConfirmationMail } from "@/integrations/email/resend";
import { account, user } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { readCountedBody } from "@/lib/http/bounded-body";
import { log } from "@/lib/log";
import { admit, type Admission } from "@/lib/ratelimit";

export const MAX_MERCHANT_EMAIL_LENGTH = 254;

const HOUR_MS = 3_600_000;

function subject(secret: string, bucket: string, value: string): string {
  return createHmac("sha256", secret).update(`${bucket}\n${value}`, "utf8").digest("hex");
}

export function admitConfirmationResend(db: Db, headers: Headers, secret: string, now: Date): Promise<Admission> {
  const bucket = "merchant_email_resend";
  return admit(db, bucket, subject(secret, bucket, signupProxyAddress(headers)), {
    perSubject: { max: 10, windowMs: HOUR_MS },
    global: null,
  }, now);
}

export async function deliverMerchantConfirmation(options: {
  db: Db;
  secret: string;
  settings: MailSettings;
  origin: string;
  recipient: { id: string; email: string };
  token: string;
}): Promise<void> {
  const { db, secret, settings, origin, recipient, token } = options;
  const email = recipient.email.trim().toLowerCase();
  try {
    // Run after the response. A user whose credential write failed must never receive a link.
    const [eligible] = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(account, and(eq(account.userId, user.id), eq(account.accountId, user.id), eq(account.providerId, "credential")))
      .where(and(eq(user.id, recipient.id), eq(user.email, email), eq(user.merchantEmailVerificationRequired, true), eq(user.emailVerified, false)))
      .limit(1);
    if (!eligible) return;

    const bucket = "merchant_email_delivery";
    const admission = await admit(db, bucket, subject(secret, bucket, email), {
      perSubject: { max: 3, windowMs: HOUR_MS },
      global: { max: 50, windowMs: 24 * HOUR_MS },
    }, new Date());
    if (admission.kind !== "admitted") return;

    const confirmationUrl = new URL("/merchant/setup/confirm-email", origin);
    confirmationUrl.hash = new URLSearchParams({ token }).toString();
    const outcome = await sendConfirmationMail(settings, { to: email, confirmationUrl: confirmationUrl.toString() });
    if (outcome === "failed") log("warn", "merchant_confirmation_delivery_failed");
  } catch {
    log("warn", "merchant_confirmation_delivery_failed");
  }
}

export async function readConfirmationJson(request: Request): Promise<unknown> {
  const read = await readCountedBody(request.body, 4_096, 2_000, request.signal);
  if (!read.ok) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.bytes));
  } catch {
    return null;
  }
}
