// Counted, time-bounded request-body reader (Gate 3 Files and "Menu photo import"). It pulls chunks
// and stops at maxBytes or the time bound; it never trusts Content-Length. S4 uses it for the
// suggestion body; S11 uses it for menu photo uploads.

export type BoundedRead =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too_large" | "timeout" | "aborted" };

export async function readCountedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number, timeoutMs: number, signal: AbortSignal): Promise<BoundedRead> {
  if (signal.aborted) return { ok: false, reason: "aborted" };
  if (!body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = body.getReader();
  let failure: "timeout" | "aborted" | null = null;
  const stop = (reason: "timeout" | "aborted") => {
    failure ??= reason;
    reader.cancel().catch(() => {});
  };
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  const onAbort = () => stop("aborted");
  signal.addEventListener("abort", onAbort, { once: true });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (failure) return { ok: false, reason: failure };
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: failure ?? "aborted" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
