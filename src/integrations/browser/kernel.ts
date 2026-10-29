import Kernel from "@onkernel/sdk";
import { log, type SafeErrorRecord } from "@/lib/log";

// The one Kernel cloud browser session of a web menu import (S24; Gate 2 web menu import, rule 4),
// and the only module that imports the Kernel SDK. One session: headless, stealth off (which also
// leaves Kernel's CAPTCHA solver off), direct egress with no proxy, no profile, no extension and no
// live view; one navigation to the merchant's link with no link following; the visible text, cut to
// PAGE_READ_BOUNDS.maxTextBytes. The session is deleted in a finally block on every path. The page
// text and the full URL stay in this request's memory and never reach a log.

export const PAGE_READ_BOUNDS = { timeoutMs: 20_000, maxTextBytes: 65_536 } as const;

// The API host is a reviewed code constant, never configuration: the SDK would otherwise read
// KERNEL_BASE_URL from the environment. Its logger is off for the same reason: KERNEL_LOG=debug would
// otherwise print each request body, and the execute body carries the full URL.
export const KERNEL_API_BASE_URL = "https://api.onkernel.com";

export type PageRead =
  // pdf: the link opened a PDF document; Envoi reads no PDF, so its text is never used.
  | { kind: "ok"; text: string; finalHost: string; pdf: boolean }
  | { kind: "refused" | "timeout" | "unreachable"; error: SafeErrorRecord };

type FetchFunction = typeof globalThis.fetch;

// The create request, asserted field by field by named test 6.
export const KERNEL_SESSION_REQUEST = {
  headless: true,
  stealth: false,
  proxy: { mode: "direct" },
  kiosk_mode: false,
  // Kernel ends an idle session after this; the finally block deletes it long before.
  timeout_seconds: 30,
} as const;

// Runs inside Kernel's browser VM. One goto, no clicks and no link following. A password field or
// an HTTP error status reads as a page that needs a sign-in or refused us.
const pageScript = (url: string, timeoutMs: number) => `
const response = await page.goto(${JSON.stringify(url)}, { waitUntil: "load", timeout: ${timeoutMs} });
const text = await page.evaluate(() => (document.body ? document.body.innerText : ""));
const signIn = await page.evaluate(() => document.querySelector('input[type="password"]') !== null);
const pdf = await page.evaluate(() => document.contentType === "application/pdf");
return { status: response ? response.status() : null, text: text.slice(0, ${PAGE_READ_BOUNDS.maxTextBytes}), host: new URL(page.url()).hostname, signIn, pdf };
`;

const record = (name: string, status: number | null = null): SafeErrorRecord => ({ name, status, retryable: null, provider: "kernel" });

// The page must end on the host the merchant vouched for. A redirect elsewhere is a page that is not
// theirs, so it reads as refused; only a leading "www." may differ.
export function isSameShopHost(finalHost: string, requestedHost: string): boolean {
  const bare = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return bare(finalHost) === bare(requestedHost);
}

// Cuts the text to at most maxBytes of UTF-8 without splitting a character.
export function cutToBytes(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= maxBytes) return text;
  return new TextDecoder().decode(bytes.subarray(0, maxBytes)).replace(/�$/, "");
}

type ScriptResult = { status: number | null; text: string; host: string; signIn: boolean; pdf?: boolean };

function isScriptResult(value: unknown): value is ScriptResult {
  const candidate = value as Partial<ScriptResult> | null;
  return typeof candidate?.text === "string" && typeof candidate.host === "string" && typeof candidate.signIn === "boolean";
}

export async function readPageText(url: URL, signal: AbortSignal, options: { apiKey: string; fetch?: FetchFunction }): Promise<PageRead> {
  const client = new Kernel({ apiKey: options.apiKey, baseURL: KERNEL_API_BASE_URL, logLevel: "off", maxRetries: 0, timeout: PAGE_READ_BOUNDS.timeoutMs, fetch: options.fetch });
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), PAGE_READ_BOUNDS.timeoutMs);
  const joined = AbortSignal.any([signal, budget.signal]);
  let sessionId: string | null = null;
  try {
    const session = await client.browsers.create({ ...KERNEL_SESSION_REQUEST }, { signal: joined });
    sessionId = session.session_id;
    // Leave the VM two seconds to report a navigation timeout before the budget aborts the call.
    const navigationMs = PAGE_READ_BOUNDS.timeoutMs - 2_000;
    const run = await client.browsers.playwright.execute(sessionId, { code: pageScript(url.href, navigationMs), timeout_sec: Math.ceil(PAGE_READ_BOUNDS.timeoutMs / 1_000) }, { signal: joined });
    if (!run.success || !isScriptResult(run.result)) {
      // The VM's error text can carry the URL, so only its class is kept.
      return /timeout/i.test(run.error ?? "") ? { kind: "timeout", error: record("TimeoutError") } : { kind: "unreachable", error: record("Error") };
    }
    const { status, text, host, signIn, pdf } = run.result;
    if (status !== null && status >= 400) return { kind: "refused", error: record("Error", status) };
    if (signIn || !isSameShopHost(host, url.hostname)) return { kind: "refused", error: record("Error") };
    if (pdf === true) return { kind: "ok", text: "", finalHost: host, pdf: true };
    return { kind: "ok", text: cutToBytes(text, PAGE_READ_BOUNDS.maxTextBytes), finalHost: host, pdf: false };
  } catch (err) {
    if (budget.signal.aborted && !signal.aborted) return { kind: "timeout", error: record("TimeoutError") };
    const status = (err as { status?: unknown } | null)?.status;
    return { kind: "unreachable", error: record(signal.aborted ? "AbortError" : "Error", typeof status === "number" ? status : null) };
  } finally {
    clearTimeout(timer);
    if (sessionId !== null) {
      // Never tied to the request's signal: a disconnected merchant still gets the session deleted.
      // The session id is Kernel's, not the merchant's; logging it is the deletion evidence.
      const id = sessionId;
      await client.browsers.deleteByID(id).then(
        () => log("info", "kernel_session_deleted", { sessionId: id }),
        (err: unknown) => {
          const status = (err as { status?: unknown } | null)?.status;
          log("warn", "kernel_session_delete_failed", { sessionId: id, error: record("Error", typeof status === "number" ? status : null) });
        },
      );
    }
  }
}
