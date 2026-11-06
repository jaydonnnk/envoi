// PayPal's crypto page appends "?token=..." to a return URL that already has a query, so the value
// arrives as "pur_x?token=Y". Purchase ids never contain "?". The token is never used.
export function purchaseIdFromReturn(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.split("?", 1)[0] || null;
}
