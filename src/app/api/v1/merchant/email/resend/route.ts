import { z } from "zod";
import { admitConfirmationResend, MAX_MERCHANT_EMAIL_LENGTH, readConfirmationJson } from "@/domain/outlets/email-confirmation";
import { merchantMailSettings, webEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";

const input = z.object({ email: z.string().trim().toLowerCase().max(MAX_MERCHANT_EMAIL_LENGTH).pipe(z.email()) }).strict();

export async function POST(request: Request): Promise<Response> {
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);

  const parsed = input.safeParse(await readConfirmationJson(request));
  if (!parsed.success) return httpErr(appError("validation_failed", "Enter a valid email address."));

  if (merchantMailSettings()) {
    const admission = await admitConfirmationResend(webDb(), request.headers, webEnv().BETTER_AUTH_SECRET, new Date());
    if (admission.kind === "rate_limited") {
      return httpErr(appError("rate_limited", "Too many requests. Try again later.", { retryable: true }));
    }
    try {
      // Pass no browser headers. Better Auth's anonymous resend path has an account-independent timing floor.
      await getAuth().api.sendVerificationEmail({ body: { email: parsed.data.email } });
    } catch {
      log("warn", "merchant_confirmation_resend_failed");
    }
  }

  return httpOk({ accepted: true }, { status: 202 });
}
