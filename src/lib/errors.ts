export type ErrorCode =
  | "validation_failed" | "unauthorized" | "forbidden_membership" | "forbidden_origin" | "not_found"
  | "review_expired" | "review_invalidated" | "checkout_conflict" | "revision_conflict"
  | "execution_locked" | "capture_already_dispatched" | "payment_uncertain" | "payments_disabled"
  | "consent_required" | "import_rejected" | "import_expired" | "import_base_revision_changed"
  | "admission_rejected"
  | "pyusd_unavailable" | "rate_expired" | "wallet_proof_rejected" | "wallet_attempt_locked"
  | "provider_unreachable" | "provider_mismatch" | "rate_limited";

export type AppError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  operatorVisible: boolean;
  details?: Record<string, string | number | boolean>;
};

// The only mapping from error code to HTTP status.
const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden_membership: 403,
  forbidden_origin: 403,
  not_found: 404,
  review_expired: 409,
  review_invalidated: 409,
  checkout_conflict: 409,
  revision_conflict: 409,
  execution_locked: 409,
  capture_already_dispatched: 409,
  payment_uncertain: 409,
  payments_disabled: 503,
  consent_required: 409,
  import_rejected: 422,
  import_expired: 409,
  import_base_revision_changed: 409,
  admission_rejected: 429,
  pyusd_unavailable: 409,
  rate_expired: 409,
  wallet_proof_rejected: 422,
  wallet_attempt_locked: 409,
  provider_unreachable: 502,
  provider_mismatch: 502,
  rate_limited: 429,
};

export function statusOf(code: ErrorCode): number {
  return STATUS[code];
}

export function appError(code: ErrorCode, message: string, extra: Partial<Omit<AppError, "code" | "message">> = {}): AppError {
  return { code, message, retryable: false, operatorVisible: false, ...extra };
}

// The answer for an API path that does not exist, and for a route that must not be told apart
// from one: the operator routes answer every non-operator with exactly this.
export const unknownRouteError = (): AppError => appError("not_found", "Not found.");

// Tells a domain refusal from a domain result; no result type carries both code and retryable.
export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "retryable" in value && "operatorVisible" in value;
}
