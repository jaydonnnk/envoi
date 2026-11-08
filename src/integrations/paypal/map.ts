import type { PayPalOrder, ProviderAmount, ProviderCapture, ProviderItem } from "@/domain/purchases/reconcile";
import { minorFromDecimalString } from "@/lib/money";
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
  return { currency, minor: minorFromDecimalString(decimal) };
}

function items(value: unknown): ProviderItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => (isObject(item) ? { name: str(item.name) ?? "", quantity: str(item.quantity) ?? "", unit: amount(item.unit_amount) } : { name: "", quantity: "", unit: null }));
}

// S46: PayPal's fee and the net to the seller, from seller_receivable_breakdown. Each is kept only
// when it is a readable, non-negative amount in the capture's own currency; anything else is null,
// which the desk shows as unknown, never zero. Neither is read by any payment decision.
function breakdownPart(breakdown: Json | null, key: string, captureAmount: ProviderAmount | null): number | null {
  if (!breakdown || !captureAmount) return null;
  const part = amount(breakdown[key]);
  if (!part || part.minor === null || part.minor < 0 || part.currency !== captureAmount.currency) return null;
  return part.minor;
}

function captures(unit: Json | null): ProviderCapture[] {
  const payments = unit && isObject(unit.payments) ? unit.payments : null;
  const list = payments && Array.isArray(payments.captures) ? payments.captures : [];
  return list.map((capture) => {
    if (!isObject(capture)) return { id: null, status: "", amount: null, feeMinor: null, netMinor: null };
    const captureAmount = amount(capture.amount);
    const breakdown = isObject(capture.seller_receivable_breakdown) ? capture.seller_receivable_breakdown : null;
    return {
      id: str(capture.id),
      status: str(capture.status) ?? "",
      amount: captureAmount,
      feeMinor: breakdownPart(breakdown, "paypal_fee", captureAmount),
      netMinor: breakdownPart(breakdown, "net_amount", captureAmount),
    };
  });
}

// S46: the country of the payer's PayPal account, as PayPal gives it, and nothing else about the
// payer. The account address under payment_source comes first, then the older payer address.
function countryCode(value: unknown): string | null {
  const address = isObject(value) && isObject(value.address) ? value.address : null;
  const code = address ? str(address.country_code) : null;
  return code !== null && /^[A-Z]{2}$/.test(code) ? code : null;
}

function payerCountry(body: Json): string | null {
  const source = isObject(body.payment_source) ? body.payment_source : null;
  return countryCode(source ? source.paypal : null) ?? countryCode(body.payer);
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
    payerCountry: payerCountry(body),
  };
}

// A 2xx we cannot read is not evidence of anything; it is treated like a lost response.
export function mapOrderResult(result: ProviderResult<unknown>): ProviderResult<PayPalOrder> {
  if (result.kind !== "ok") return result;
  const order = mapOrder(result.value);
  return order ? { kind: "ok", value: order } : { kind: "http_error", status: 502, retryable: true };
}

export const orderPath = (orderId: string) => `/v2/checkout/orders/${encodeURIComponent(orderId)}`;
