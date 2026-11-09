// S54, the copilot figure guard (Gate 2 step 9 and the Gate 3 amendment). Pure: it collects the
// amounts a turn's own tool results hold, extracts the amounts a reply names, and reports any amount
// the turn's records do not hold. Canonical form is integer cents as a decimal string, "1670" or
// "-62"; there is no float path. Values are compared, never currency labels, so the check enforces
// exactly the S45 evaluation's rule: every amount appears in a tool result of that turn.

export const COPILOT_UNCHECKED_NOTICE =
  "Envoi did not show this answer because it named an amount that no record checked this turn. Nothing was sent. Your orders table still works.";

const SYMBOL_OR_CODE = String.raw`S\$|US\$|\$|SGD|USD`;
// Comma thousands or plain digits, with at most two decimals. More decimals than two never match,
// so a three-decimal mention is not silently read as a two-decimal amount.
const AMOUNT = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
const PREFIX = new RegExp(String.raw`(?<![A-Za-z])(-?)(${SYMBOL_OR_CODE})\s*(-?)(${AMOUNT})(?!\d|\.\d|,\d)`, "g");
const POSTFIX = new RegExp(String.raw`(?<![\d.,A-Za-z])(-?)(${AMOUNT})\s*(-?)(${SYMBOL_OR_CODE})(?![A-Za-z])`, "g");

function canonical(amount: string, negative: boolean): string | null {
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  const minor = Number(match[1]!.replaceAll(",", "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (minor === 0) return "0";
  return negative ? `-${minor}` : String(minor);
}

function canonicalProviderValue(value: string): string | null {
  const negative = value.startsWith("-");
  return canonical(negative ? value.slice(1) : value, negative);
}

type Found = { index: number; end: number; amount: string };

function mentions(text: string): Found[] {
  const spans: Found[] = [];
  for (const match of text.matchAll(PREFIX)) {
    const amount = canonical(match[4]!, match[1] === "-" || match[3] === "-");
    if (amount !== null) spans.push({ index: match.index!, end: match.index! + match[0].length, amount });
  }
  // A postfix mention that overlaps a prefix one is the same words, not a second amount.
  for (const match of text.matchAll(POSTFIX)) {
    const index = match.index!;
    const end = index + match[0].length;
    if (spans.some((span) => index < span.end && end > span.index)) continue;
    const amount = canonical(match[2]!, match[1] === "-" || match[3] === "-");
    if (amount !== null) spans.push({ index, end, amount });
  }
  return spans.sort((a, b) => a.index - b.index);
}

export function replyAmounts(text: string): string[] {
  return mentions(text).map((span) => span.amount);
}

// One walk of a tool result: PayPal money objects (a string currency_code with a decimal string
// value) and every string that holds a money mention, as Envoi's formatMoney output does.
export function collectFigures(value: unknown): Set<string> {
  const figures = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      for (const span of mentions(node)) figures.add(span.amount);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (typeof record.currency_code === "string" && typeof record.value === "string") {
      const amount = canonicalProviderValue(record.value);
      if (amount !== null) figures.add(amount);
    }
    for (const inner of Object.values(record)) walk(inner);
  };
  walk(value);
  return figures;
}

export function uncheckedAmounts(text: string, figures: ReadonlySet<string>): string[] {
  return replyAmounts(text).filter((amount) => !figures.has(amount));
}
