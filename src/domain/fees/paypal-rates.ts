// PayPal's published Singapore rates (S44, Gate 3 fourth build plan), each with where and when it was
// read. A rate nobody read stays null and reads unknown, never zero. These estimate a fee for a shop
// deciding whether to enroll; PayPal's own record of a sale decides what it actually charged.

export type PayPalRate = { percentBasisPoints: number | null; fixedMinor: number | null; source: string; readOn: string };
export type FeeResult = { kind: "known"; feeMinor: number; netMinor: number } | { kind: "unknown" };

export const PAYPAL_FEES_PAGE = "https://www.paypal.com/sg/business/paypal-business-fees";
// The date PayPal's page itself gives ("Last Updated"), as read on PAYPAL_SG_*.readOn.
export const PAYPAL_FEES_PAGE_UPDATED_ON = "2026-10-28";

// "Receiving international transactions": Singapore is in no named row, so "All other markets, All
// markets" applies. Fixed fee from "Fixed fee for commercial transactions": Singapore dollar, 0.50 SGD.
export const PAYPAL_SG_INTERNATIONAL: PayPalRate = { percentBasisPoints: 440, fixedMinor: 50, source: PAYPAL_FEES_PAGE, readOn: "2026-11-07" };
// "Standard rate for receiving domestic transactions": MY & SG. The same fixed fee.
export const PAYPAL_SG_DOMESTIC: PayPalRate = { percentBasisPoints: 390, fixedMinor: 50, source: PAYPAL_FEES_PAGE, readOn: "2026-11-07" };

type ReadRate = { percentBasisPoints: number; fixedMinor: number };

export function readRate(rate: PayPalRate): ReadRate | null {
  if (rate.percentBasisPoints === null || rate.fixedMinor === null || rate.readOn === "") return null;
  return { percentBasisPoints: rate.percentBasisPoints, fixedMinor: rate.fixedMinor };
}

function isOrderAmount(orderMinor: number): boolean {
  return Number.isSafeInteger(orderMinor) && orderMinor > 0;
}

// Rounded half up to the cent, in whole numbers, so no float can move a fee.
export function feeOn(orderMinor: number, rate: PayPalRate): FeeResult {
  const read = readRate(rate);
  if (read === null || !isOrderAmount(orderMinor)) return { kind: "unknown" };
  const feeMinor = Math.floor((orderMinor * read.percentBasisPoints + 5_000) / 10_000) + read.fixedMinor;
  // PayPal's page does not say how a fee larger than the sale is treated.
  if (feeMinor > orderMinor) return { kind: "unknown" };
  return { kind: "known", feeMinor, netMinor: orderMinor - feeMinor };
}

// The fee as a share of the order, one decimal, before rounding the fee to the cent. Null when unknown.
export function feePercentLabel(orderMinor: number, rate: PayPalRate): string | null {
  const read = readRate(rate);
  if (read === null || !isOrderAmount(orderMinor)) return null;
  const tenths = Math.round((orderMinor * read.percentBasisPoints + read.fixedMinor * 10_000) / (orderMinor * 10));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}
