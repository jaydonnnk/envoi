import type { WebEnv } from "@/env";
import { log } from "@/lib/log";

// The only module that talks HTTP to PayPal. The API host is a reviewed constant checked against a
// sandbox-only allowlist when a client is created, so a live host fails boot instead of moving
// real money. No environment variable or request input can name another host.

export const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";
const ALLOWED_API_HOSTS: ReadonlySet<string> = new Set(["api-m.sandbox.paypal.com"]);
// The buyer is only ever sent to the sandbox approval page.
const ALLOWED_APPROVAL_HOSTS: ReadonlySet<string> = new Set(["www.sandbox.paypal.com"]);

export type PayPalConfig = {
  apiBase: string;
  clientId: string;
  clientSecret: string;
  partnerAttributionId: string;
  timeoutMs: number;
};

export type ProviderResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "http_error"; status: number; retryable: boolean }
  | { kind: "network_error"; retryable: true }
  | { kind: "timeout"; responseReceived: false };

export function assertSandboxApiBase(apiBase: string): void {
  let url: URL;
  try {
    url = new URL(apiBase);
  } catch {
    throw new Error("PayPal API base is not a URL");
  }
  if (url.protocol !== "https:" || !ALLOWED_API_HOSTS.has(url.hostname) || url.port !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`PayPal host ${url.hostname} is not an allowlisted sandbox host`);
  }
}

export function isSandboxApprovalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_APPROVAL_HOSTS.has(url.hostname) && url.port === "";
  } catch {
    return false;
  }
}

export function paypalConfigFromEnv(env: WebEnv): PayPalConfig {
  return {
    apiBase: PAYPAL_SANDBOX_API_BASE,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    partnerAttributionId: env.PAYPAL_PARTNER_ATTRIBUTION_ID,
    timeoutMs: 15_000,
  };
}

export type PayPalRequest = { method: "GET" | "POST"; path: string; body?: unknown; requestId?: string };

export type PayPalHttp = { send(request: PayPalRequest): Promise<ProviderResult<unknown>> };

// PayPal error names and issue codes are upper-case identifiers; nothing else from an error body
// reaches the log.
function issueCodes(body: unknown): string {
  const codes: string[] = [];
  const candidate = body as { name?: unknown; details?: Array<{ issue?: unknown }> } | null;
  if (typeof candidate?.name === "string") codes.push(candidate.name);
  for (const detail of Array.isArray(candidate?.details) ? candidate.details : []) {
    if (typeof detail?.issue === "string") codes.push(detail.issue);
  }
  return codes.filter((code) => /^[A-Z0-9_]{1,64}$/.test(code)).join(",");
}

function failure(err: unknown): ProviderResult<never> {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return { kind: "timeout", responseReceived: false };
  return { kind: "network_error", retryable: true };
}

export function createPayPalHttp(cfg: PayPalConfig): PayPalHttp {
  assertSandboxApiBase(cfg.apiBase);
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<ProviderResult<string>> {
    if (token && token.expiresAt > Date.now()) return { kind: "ok", value: token.value };
    try {
      const response = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!response.ok) {
        log("warn", "paypal_token_failed", { status: response.status });
        return { kind: "http_error", status: response.status, retryable: response.status === 429 || response.status >= 500 };
      }
      const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") return { kind: "http_error", status: 502, retryable: true };
      token = { value: body.access_token, expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000 };
      return { kind: "ok", value: token.value };
    } catch (err) {
      return failure(err);
    }
  }

  return {
    async send(request) {
      const bearer = await accessToken();
      if (bearer.kind !== "ok") return bearer;
      const headers: Record<string, string> = {
        authorization: `Bearer ${bearer.value}`,
        "content-type": "application/json",
        prefer: "return=representation",
        "PayPal-Partner-Attribution-Id": cfg.partnerAttributionId,
      };
      if (request.requestId) headers["PayPal-Request-Id"] = request.requestId;
      try {
        const response = await fetch(`${cfg.apiBase}${request.path}`, {
          method: request.method,
          headers,
          body: request.method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          log("warn", "paypal_http_error", { method: request.method, status: response.status, issues: issueCodes(body) });
          return { kind: "http_error", status: response.status, retryable: response.status === 429 || response.status >= 500 };
        }
        return { kind: "ok", value: body };
      } catch (err) {
        return failure(err);
      }
    },
  };
}
