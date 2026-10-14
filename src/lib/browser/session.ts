// Browser-only: starts an anonymous buyer session if this browser has none.
export async function ensureBuyerSession(): Promise<void> {
  const current = await fetch("/api/auth/get-session", { cache: "no-store" });
  const session: unknown = current.ok ? await current.json() : null;
  if (session) return;
  const signIn = await fetch("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!signIn.ok) throw new Error("session");
}

// POSTs JSON to an Envoi API route and returns the parsed envelope with the status.
export async function postJson<T>(url: string, body: unknown = {}, signal?: AbortSignal): Promise<{ status: number; ok: boolean; data?: T; error?: { code: string; message: string } }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const envelope = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code: string; message: string } } | null;
  return { status: response.status, ok: response.ok && envelope?.ok === true, data: envelope?.data, error: envelope?.error };
}

export type ApiResult<T> = { status: number; ok: boolean; data?: T; error?: { code: string; message: string; details?: Record<string, string | number | boolean> } };

// Sends JSON with any method to an Envoi API route and returns the parsed envelope with the status.
// A request that never got a response, such as a network failure, resolves as a failed result with
// status 0 and no error envelope, so every caller shows its own failure state instead of an
// unhandled rejection.
export async function requestJson<T>(method: "GET" | "POST" | "PUT" | "PATCH", url: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (response === null) return { status: 0, ok: false };
  const envelope = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: ApiResult<T>["error"] } | null;
  return { status: response.status, ok: response.ok && envelope?.ok === true, data: envelope?.data, error: envelope?.error };
}
