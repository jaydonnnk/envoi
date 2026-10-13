import type { PayPalOrder, ProviderAmount, ProviderCapture, ProviderItem } from "@/domain/purchases/reconcile";
import { sgdFromDecimalString } from "@/lib/money";
import type { ProviderResult } from "./client";

// Provider payload to domain shape. Missing or unreadable fields map to null rather than a
// default, so the domain decisions see them and quarantine instead of guessing.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

function amount(value: unknown): ProviderAmount | null {
  if (!isObject(value)) return null;
  const currency = str(value.currency_code);
  const decimal = str(value.value);
  if (currency === null || decimal === null) return null;
  return { currency, cents: sgdFromDecimalString(decimal) };
}

function items(value: unknown): ProviderItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => (isObject(item) ? { name: str(item.name) ?? "", quantity: str(item.quantity) ?? "", unit: amount(item.unit_amount) } : { name: "", quantity: "", unit: null }));
}

function captures(unit: Json | null): ProviderCapture[] {
  const payments = unit && isObject(unit.payments) ? unit.payments : null;
  const list = payments && Array.isArray(payments.captures) ? payments.captures : [];
  return list.map((capture) => (isObject(capture) ? { id: str(capture.id), status: str(capture.status) ?? "", amount: amount(capture.amount) } : { id: null, status: "", amount: null }));
}

function approvalUrl(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const link = links.find((candidate) => isObject(candidate) && (candidate.rel === "payer-action" || candidate.rel === "approve"));
  return isObject(link) ? str(link.href) : null;
}

export function mapOrder(body: unknown): PayPalOrder | null {
  if (!isObject(body)) return null;
  const id = str(body.id);
  const status = str(body.status);
  if (id === null || status === null) return null;
  const units = Array.isArray(body.purchase_units) ? body.purchase_units : [];
  const unit = isObject(units[0]) ? units[0] : null;
  const payee = unit && isObject(unit.payee) ? unit.payee : null;
  return {
    id,
    status,
    purchaseUnitCount: units.length,
    payeeMerchantId: payee ? str(payee.merchant_id) : null,
    amount: unit ? amount(unit.amount) : null,
    customId: unit ? str(unit.custom_id) : null,
    items: unit ? items(unit.items) : null,
    captures: captures(unit),
    approvalUrl: approvalUrl(body.links),
  };
}

// A 2xx we cannot read is not evidence of anything; it is treated like a lost response.
export function mapOrderResult(result: ProviderResult<unknown>): ProviderResult<PayPalOrder> {
  if (result.kind !== "ok") return result;
  const order = mapOrder(result.value);
  return order ? { kind: "ok", value: order } : { kind: "http_error", status: 502, retryable: true };
}

export const orderPath = (orderId: string) => `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
