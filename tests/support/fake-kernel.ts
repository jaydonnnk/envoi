// FIXTURE support for the S24 web menu import tests. Kernel is faked at the SDK's fetch boundary: the
// fake answers the create, execute and delete calls readPageText makes and records each one. No
// Kernel session is ever started; every answer is labeled.

export const KERNEL_API = "https://api.onkernel.com";
export const FIXTURE_SESSION_ID = "FIXTURE-kernel-session";

export type KernelCall = { method: string; path: string; body: Record<string, unknown> | null };

export type PageTurn =
  | { kind: "page"; text: string; status?: number; signIn?: boolean; host?: string }
  | { kind: "vm_error"; error: string } // the VM's goto failed, for example net::ERR_NAME_NOT_RESOLVED
  | { kind: "create_fails"; status: number }
  | { kind: "hang" }; // the execute call never answers until aborted

export type FakeKernel = { fetch: typeof globalThis.fetch; calls: KernelCall[]; deletes: () => number; creates: () => KernelCall[] };

export function isKernelUrl(url: string): boolean {
  return url.startsWith(`${KERNEL_API}/`);
}

// `deleteStatus` answers the delete call with that status instead of 204, for a failed delete.
export function createFakeKernel(turn: () => PageTurn, options: { deleteStatus?: number } = {}): FakeKernel {
  const calls: KernelCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== KERNEL_API) throw new Error(`FIXTURE fake Kernel refuses an unexpected URL: ${url.origin}`);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method, path: url.pathname, body });
    const current = turn();
    if (method === "POST" && url.pathname === "/browsers") {
      if (current.kind === "create_fails") return Response.json({ code: "FIXTURE", message: "FIXTURE create failure" }, { status: current.status });
      return Response.json({ session_id: FIXTURE_SESSION_ID, cdp_ws_url: "wss://fixture.invalid", created_at: "2026-10-29T00:00:00Z", headless: true, stealth: false, timeout_seconds: 30 });
    }
    if (method === "POST" && url.pathname === `/browsers/${FIXTURE_SESSION_ID}/playwright/execute`) {
      if (current.kind === "hang") {
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          const abort = () => reject(signal?.reason ?? new DOMException("aborted", "AbortError"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        });
      }
      if (current.kind === "vm_error") return Response.json({ success: false, error: current.error });
      if (current.kind === "page") return Response.json({ success: true, result: { status: current.status ?? 200, text: current.text, host: current.host ?? "fixture-shop.example", signIn: current.signIn ?? false } });
    }
    if (method === "DELETE" && url.pathname === `/browsers/${FIXTURE_SESSION_ID}`) {
      if (options.deleteStatus !== undefined) return Response.json({ code: "FIXTURE", message: "FIXTURE delete failure" }, { status: options.deleteStatus });
      return new Response(null, { status: 204 });
    }
    throw new Error(`FIXTURE fake Kernel has no answer for ${method} ${url.pathname}`);
  }) as typeof globalThis.fetch;
  return {
    fetch,
    calls,
    deletes: () => calls.filter((call) => call.method === "DELETE").length,
    creates: () => calls.filter((call) => call.method === "POST" && call.path === "/browsers"),
  };
}

// FIXTURE page texts, named by what they exercise.
export const FIXTURE_PAGE_TEXT = [
  "Demo fixture page. Envoi test data, not a real shop.",
  "Test Shop",
  "Kopi C (Hot) - $1.80",
  "Kaya toast set - $3.50",
  "Ebi fry, 3 pcs - $4.90",
  "Ebi fry + Mentaiko - add one dollar fifty",
].join("\n");
export const FIXTURE_PICTURE_TEXT = "Demo fixture page.\nBakery Corner\nOpen 8am to 10pm. Call 6123 4567.";
