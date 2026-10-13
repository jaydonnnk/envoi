import type { PricedLine } from "@/domain/purchases/price";
import type { SgdCents } from "@/lib/money";

// Provider-read decisions (Gate 3, Purchases, attempts and provider decisions). Pure: the PayPal
// integration maps its payloads into PayPalOrder, and these functions decide what they prove.

export type ProviderAmount = { currency: string; cents: SgdCents | null }; // cents null: unreadable value
export type ProviderItem = { name: string; quantity: string; unit: ProviderAmount | null };
export type ProviderCapture = { id: string | null; status: string; amount: ProviderAmount | null };

export type PayPalOrder = {
  id: string;
  status: string;
  purchaseUnitCount: number;
  payeeMerchantId: string | null;
  amount: ProviderAmount | null;
  customId: string | null;
  items: ProviderItem[] | null;
  captures: ProviderCapture[];
  approvalUrl: string | null;
};

export type ExpectedPurchase = {
  purchaseId: string;
  outletId: string;
  payeeId: string;
  totalSgdCents: SgdCents;
  currency: "SGD";
  lines: readonly PricedLine[];
  correlationId: string;
};

export type CaptureEvidence = {
  orderId: string;
  captureId: string;
  grossSgdCents: SgdCents;
  currency: "SGD";
  payeeId: string;
  verifiedAt: Date;
};

export type UncertainReason = "missing_capture_id" | "amount_mismatch" | "payee_mismatch" | "currency_mismatch" | "basket_mismatch" | "status_not_complete";

export type CaptureDecision =
  | { decision: "confirmed"; evidence: CaptureEvidence }
  | { decision: "uncertain"; reason: UncertainReason }
  | { decision: "failed"; reason: string };

// The order must describe exactly the stored basket: one purchase unit, our correlation id and the
// same item names, quantities and unit prices.
function basketMatches(order: PayPalOrder, expected: ExpectedPurchase): boolean {
  if (order.purchaseUnitCount !== 1 || order.customId !== expected.correlationId) return false;
  const items = order.items;
  if (!items || items.length !== expected.lines.length) return false;
  return expected.lines.every((line, index) => {
    const item = items[index];
    return (
      item !== undefined &&
      item.name === line.name &&
      item.quantity === String(line.quantity) &&
      item.unit?.currency === "SGD" &&
      item.unit.cents === line.unitSgdCents
    );
  });
}

// Before any capture: is this the order we created, approved by the buyer, still carrying the
// bound payee, amount and basket? Anything else is never captured.
export type ApprovedOrderCheck = { ok: true } | { ok: false; waiting: true } | { ok: false; waiting: false; reason: UncertainReason | "order_mismatch" | "not_approved" };

export function verifyApprovedOrder(order: PayPalOrder, orderId: string, expected: ExpectedPurchase): ApprovedOrderCheck {
  if (order.id !== orderId) return { ok: false, waiting: false, reason: "order_mismatch" };
  if (order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED") return { ok: false, waiting: true };
  if (order.status !== "APPROVED") return { ok: false, waiting: false, reason: "not_approved" };
  if (order.payeeMerchantId !== expected.payeeId) return { ok: false, waiting: false, reason: "payee_mismatch" };
  if (order.amount?.currency !== expected.currency) return { ok: false, waiting: false, reason: "currency_mismatch" };
  if (order.amount.cents !== expected.totalSgdCents) return { ok: false, waiting: false, reason: "amount_mismatch" };
  if (!basketMatches(order, expected)) return { ok: false, waiting: false, reason: "basket_mismatch" };
  return { ok: true };
}

// After the capture call: paid only when one completed capture of exactly the stored total, in
// SGD, reached the bound payee for the stored basket. No tolerance anywhere; a mismatch is
// quarantined as uncertain, never shown as paid.
export function decideCaptureOutcome(order: PayPalOrder, expected: ExpectedPurchase, verifiedAt: Date): CaptureDecision {
  if (order.captures.length !== 1) return order.captures.length === 0 ? { decision: "uncertain", reason: "missing_capture_id" } : { decision: "uncertain", reason: "basket_mismatch" };
  const [capture] = order.captures as [ProviderCapture];
  if (!capture.id) return { decision: "uncertain", reason: "missing_capture_id" };
  if (capture.status !== "COMPLETED" || order.status !== "COMPLETED") return { decision: "uncertain", reason: "status_not_complete" };
  if (order.payeeMerchantId !== expected.payeeId) return { decision: "uncertain", reason: "payee_mismatch" };
  if (order.amount?.currency !== expected.currency || capture.amount?.currency !== expected.currency) return { decision: "uncertain", reason: "currency_mismatch" };
  if (order.amount.cents !== expected.totalSgdCents || capture.amount.cents !== expected.totalSgdCents) return { decision: "uncertain", reason: "amount_mismatch" };
  if (!basketMatches(order, expected)) return { decision: "uncertain", reason: "basket_mismatch" };
  return {
    decision: "confirmed",
    evidence: { orderId: order.id, captureId: capture.id, grossSgdCents: expected.totalSgdCents, currency: "SGD", payeeId: expected.payeeId, verifiedAt },
  };
}

// Outcome-reason prefix stored when a same-key create replay was refused outright by PayPal.
export const CREATE_REPLAY_REFUSED = "create_replay_refused";

export type CreateRecovery = "replay_same_key" | "safe_to_recreate" | "block_uncertain";

export type CreateRecoveryInput = { state: string; orderId: string | null; outcomeReason: string | null };

// Lost create response (Gate 3 Races). First replay the identical PayPal-Request-Id, because
// PayPal returns the latest status of the earlier request with that key. Recreating with a new
// key is safe only when the attempt never held an order id: capture needs an order id Envoi never
// received, and the buyer never received an approval link, so no external effect is possible.
// An attempt that holds an order id is never recreated; its review window closes it.
export function decideCreateRecovery(attempt: CreateRecoveryInput): CreateRecovery {
  if (attempt.state !== "create_unknown" || attempt.orderId !== null) return "block_uncertain";
  if (attempt.outcomeReason?.startsWith(CREATE_REPLAY_REFUSED)) return "safe_to_recreate";
  return "replay_same_key";
}

// A refusal PayPal states outright: a 4xx naming its issue codes. Request timeouts, conflicts, rate
// limits, 5xx, network errors and timeouts prove nothing about what PayPal did.
type HttpRefusal = { kind: "http_error"; status: number; issues?: string };

export function isDefinitiveRefusal<T extends { kind: string }>(result: T): result is Extract<T, HttpRefusal> {
  if (result.kind !== "http_error") return false;
  const { status, issues } = result as unknown as HttpRefusal;
  return status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429 && Boolean(issues);
}
