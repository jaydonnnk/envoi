// The wording Envoi's product rules forbid on a merchant or visitor page: PayPal costs what it costs,
// and no page may imply Envoi is cheaper than a card or saves anyone money (Gate 1 fourth build plan).
export const SAVINGS_CLAIMS: readonly RegExp[] = [
  /cheap/i,
  /\bsav(?:e|es|ed|ing|ings)\b/i,
  /\bdiscount/i,
  /\b(?:lower|lowest|reduced?|smaller|better)\s+(?:\w+\s+)?(?:fee|fees|cost|costs|rate|rates|price|prices)\b/i,
  /\b(?:less|fewer)\s+(?:\w+\s+)?(?:than|fee|fees)\b/i,
  /\bno\s+(?:\w+\s+)?fees?\b/i,
  /\bfee[- ]free\b/i,
  /\bbeats?\s+(?:\w+\s+)?(?:card|cards|fee|fees|rate|rates)\b/i,
];

export function savingsClaimsIn(markup: string): string[] {
  return SAVINGS_CLAIMS.filter((claim) => claim.test(markup)).map(String);
}
