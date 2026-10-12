import { statusOf, type AppError } from "@/lib/errors";

export type CachePolicy = "private" | "public-short";

const CACHE_HEADER: Record<CachePolicy, string> = {
  private: "no-store",
  "public-short": "public, max-age=30",
};

export function httpOk<T>(body: T, init?: ResponseInit & { cache?: CachePolicy }): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", CACHE_HEADER[init?.cache ?? "private"]);
  return Response.json({ ok: true, data: body }, { ...init, headers });
}

export function httpErr(err: AppError): Response {
  return Response.json(
    { ok: false, error: { code: err.code, message: err.message, retryable: err.retryable, details: err.details ?? {} } },
    { status: statusOf(err.code), headers: { "Cache-Control": "no-store" } },
  );
}
