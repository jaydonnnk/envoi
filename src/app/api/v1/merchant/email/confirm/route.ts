import { APIError } from "better-auth/api";
import { z } from "zod";
import { readConfirmationJson } from "@/domain/outlets/email-confirmation";
import { getAuth } from "@/lib/auth";
import { appError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/http/origin";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log } from "@/lib/log";

const input = z.object({ token: z.string().max(2_048).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) }).strict();

export async function POST(request: Request): Promise<Response> {
  const foreign = assertSameOrigin(request);
  if (foreign) return httpErr(foreign);

  const invalid = appError("validation_failed", "This confirmation link is invalid or expired. Request a new one.");
  const parsed = input.safeParse(await readConfirmationJson(request));
  if (!parsed.success) return httpErr(invalid);

  try {
    await getAuth().api.verifyEmail({ query: { token: parsed.data.token } });
    return httpOk({ confirmed: true });
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) return httpErr(invalid);
    log("warn", "merchant_confirmation_verify_failed");
    return httpErr(appError("provider_unreachable", "Email confirmation is temporarily unavailable. Try again.", { retryable: true }));
  }
}
