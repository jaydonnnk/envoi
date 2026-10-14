// Redacting logger. Errors are logged only as allowlisted SafeErrorRecords, never as error objects,
// and free-text fields pass through redact() before reaching a sink.

export type SafeErrorRecord = {
  name: string;
  status: number | null;
  retryable: boolean | null;
  provider: "openai" | "paypal" | "solana_rpc" | "internal";
};

const ALLOWED_ERROR_NAMES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError", "PostgresError"]);

export function toSafeErrorRecord(err: unknown, provider: SafeErrorRecord["provider"]): SafeErrorRecord {
  const name = err instanceof Error && ALLOWED_ERROR_NAMES.has(err.name) ? err.name : "Error";
  const candidate = (err as { status?: unknown; statusCode?: unknown } | null) ?? {};
  const rawStatus = candidate.status ?? candidate.statusCode;
  const status = typeof rawStatus === "number" && Number.isInteger(rawStatus) ? rawStatus : null;
  return { name, status, retryable: null, provider };
}

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/postgres(?:ql)?:(?:\\?\/){2}[^\s"'@]*@/gi, "postgres://[redacted]@"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:[redacted]"],
  [/[A-Za-z0-9+/]{200,}={0,2}/g, "[redacted-base64]"],
];

export function redact(text: string): string {
  return REDACTIONS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | null | SafeErrorRecord>;

function threshold(): Level {
  const configured = process.env.LOG_LEVEL;
  return configured === "debug" || configured === "warn" || configured === "error" ? configured : "info";
}

export type RedactingLogger = (level: Level, event: string, fields?: LogFields) => void;

export function log(level: Level, event: string, fields: LogFields = {}): void {
  if (ORDER[level] < ORDER[threshold()]) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = typeof value === "string" ? redact(value) : value;
  }
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...safe });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
