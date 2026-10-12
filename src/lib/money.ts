// Integer minor-unit SGD. S1 needs only construction and display; S2 adds the arithmetic.
export type SgdCents = number & { readonly __brand: "SgdCents" };

export function sgdFromCents(cents: number): SgdCents {
  if (!Number.isSafeInteger(cents)) throw new RangeError("SGD amounts are whole cents");
  return cents as SgdCents;
}

export function formatSgd(value: SgdCents): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}S$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
