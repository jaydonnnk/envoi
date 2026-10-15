import { webEnv } from "@/env";
import { appError, type AppError } from "@/lib/errors";

// Same-origin check for browser mutations (Gate 3 Files, Authorization). The request's Origin must
// be exactly APP_BASE_URL's origin; a missing Origin is refused too, because every browser sends one
// on a cross-origin or POST fetch. The Host header is never consulted: behind Render's proxy it is
// not the app's public origin. Returns null when the request may proceed.
export function assertSameOrigin(request: Request): AppError | null {
  const origin = request.headers.get("origin");
  if (origin !== null && origin === new URL(webEnv().APP_BASE_URL).origin) return null;
  return appError("forbidden_origin", "This request did not come from Envoi.", { details: { reason: origin === null ? "missing" : "foreign" } });
}
