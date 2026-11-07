// PayPal's published Singapore rates (S44, Gate 3 fourth build plan), each with where and when it was
// read. A rate nobody read stays null and reads unknown, never zero. These estimate a fee for a shop
// deciding whether to enroll; PayPal's own record of a sale decides what it actually charged.

export type PayPalRate = { percentBasisPoints: number | null; fixedMinor: number | null; source: string; readOn: string };
export type FeeResult = { kind: "known"; feeMinor: number; netMinor: number } | { kind: "unknown" };

export const PAYPAL_FEES_PAGE = "https://www.paypal.com/sg/business/paypal-business-fees";
// PayPal's page said "Last Updated: 28, October 2026" when read. Dates stay here and in the S44 record,
// not on the screen, by the user's instruction on 2026-11-07.

// "Receiving international transactions": Singapore is in no named row, so "All other markets, All
// markets" applies. Fixed fee from "Fixed fee for commercial transactions": Singapore dollar, 0.50 SGD.
export const PAYPAL_SG_INTERNATIONAL: PayPalRate = { percentBasisPoints: 440, fixedMinor: 50, source: PAYPAL_FEES_PAGE, readOn: "2026-11-07" };
// "Standard rate for receiving domestic transactions": MY & SG. The same fixed fee.
export const PAYPAL_SG_DOMESTIC: PayPalRate = { percentBasisPoints: 390, fixedMinor: 50, source: PAYPAL_FEES_PAGE, readOn: "2026-11-07" };

// "Receiving micropayments", All other markets (where available), international, plus the SGD row of
// "Micropayments fixed fee". By application and pre-approval, and it then applies to every sale. PayPal's
// help article speaks of digital goods, so whether a food stall qualifies is unknown until PayPal says.
export const PAYPAL_SG_MICROPAYMENT_INTERNATIONAL: PayPalRate = { percentBasisPoints: 600, fixedMinor: 8, source: PAYPAL_FEES_PAGE, readOn: "2026-11-07" };

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
