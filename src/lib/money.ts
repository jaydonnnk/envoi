// Currency-explicit money (S27). Integer minor units with the currency beside every amount; no
// float path exists: provider strings are parsed digit by digit. Two currencies are never summed
// or compared: that throws, so a USD amount can never be read as SGD.
export type Currency = "SGD" | "USD";
export type Country = "SG" | "US";

export const CURRENCIES: readonly Currency[] = ["SGD", "USD"];
export const COUNTRIES: readonly Country[] = ["SG", "US"];
export const CURRENCY_BY_COUNTRY: Record<Country, Currency> = { SG: "SGD", US: "USD" };

export type Money = { readonly currency: Currency; readonly minor: number };

export class CurrencyMismatchError extends Error {
  constructor(expected: Currency, actual: Currency) {
    super(`expected ${expected}, got ${actual}`);
    this.name = "CurrencyMismatchError";
  }
}

export function isCurrency(value: unknown): value is Currency {
  return value === "SGD" || value === "USD";
}

export function isCountry(value: unknown): value is Country {
  return value === "SG" || value === "US";
}

export function money(currency: Currency, minor: number): Money {
  if (!isCurrency(currency)) throw new RangeError("unknown currency");
  if (!Number.isSafeInteger(minor)) throw new RangeError("amounts are whole minor units");
  return { currency, minor };
}

export function multiply(value: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity)) throw new RangeError("quantity must be a whole number");
  return money(value.currency, value.minor * quantity);
}

export function sum(currency: Currency, values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) {
    if (value.currency !== currency) throw new CurrencyMismatchError(currency, value.currency);
    total += value.minor;
  }
  return money(currency, total);
}

export function sameAmount(a: Money, b: Money): boolean {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
  return a.minor === b.minor;
}

// "5", "5.6" and "5.60" are readable; anything else, including "5.600", "-1" or "5,60", is
// ambiguous and returns null. Unknown never becomes zero. Both currencies have two decimals.
export function fromDecimalString(currency: Currency, value: string): Money | null {
  const minor = minorFromDecimalString(value);
  return minor === null ? null : money(currency, minor);
}

// The same parse for a provider amount whose currency code is not yet checked: the caller keeps
// the provider's code beside the number and compares it before trusting the amount.
export function minorFromDecimalString(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

// The provider's two-decimal form, for example 560 -> "5.60".
export function toDecimalString(value: Money): string {
  if (value.minor < 0) throw new RangeError("provider amounts are never negative");
  return `${Math.floor(value.minor / 100)}.${String(value.minor % 100).padStart(2, "0")}`;
}

const SYMBOL: Record<Currency, string> = { SGD: "S$", USD: "US$" };

export function formatMoney(value: Money): string {
  const sign = value.minor < 0 ? "-" : "";
  const abs = Math.abs(value.minor);
  return `${sign}${SYMBOL[value.currency]}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// PYUSD entry points only: the PYUSD rail prices in SGD at the shop's rate.
export function requireSgd(value: Money): Money {
  if (value.currency !== "SGD") throw new CurrencyMismatchError("SGD", value.currency);
  return value;
}
