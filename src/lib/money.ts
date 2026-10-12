// Integer minor-unit SGD. No float path exists: provider strings are parsed digit by digit.
export type SgdCents = number & { readonly __brand: "SgdCents" };

export function sgdFromCents(cents: number): SgdCents {
  if (!Number.isSafeInteger(cents)) throw new RangeError("SGD amounts are whole cents");
  return cents as SgdCents;
}

export function multiplySgd(unit: SgdCents, quantity: number): SgdCents {
  if (!Number.isSafeInteger(quantity)) throw new RangeError("quantity must be a whole number");
  return sgdFromCents(unit * quantity);
}

export function sumSgd(values: readonly SgdCents[]): SgdCents {
  return sgdFromCents(values.reduce((sum, value) => sum + value, 0));
}

// "5", "5.6" and "5.60" are readable; anything else, including "5.600", "-1" or "5,60", is
// ambiguous and returns null. Unknown never becomes zero.
export function sgdFromDecimalString(value: string): SgdCents | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return sgdFromCents(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}

// The provider's two-decimal form, for example 560 -> "5.60".
export function sgdToDecimalString(value: SgdCents): string {
  if (value < 0) throw new RangeError("provider amounts are never negative");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function formatSgd(value: SgdCents): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}S$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
