// The Phantom Browse link for a phone without an injected wallet (Gate 2 "Phone path"; Gate 3 call
// stack "PYUSD purchase"). It opens Envoi's /buy page inside Phantom's wallet browser with the basket
// from public values only: the outlet id, item-quantity pairs and the rail name pyusd, so /buy asks for
// the PYUSD review itself (reopening 2026-10-18). It carries no purchase id, session, price, payee or
// personal data. Inside Phantom the buyer gets a new anonymous session and confirms a fresh,
// server-priced review by paying; the original browser's review is never prepared and expires.

export type BrowseLine = { menuItemId: string; quantity: number };

export function buildPhantomBrowseLink(appBaseUrl: string, outletId: string, lines: readonly BrowseLine[]): string {
  const base = new URL(appBaseUrl).origin;
  const target = new URL("/buy", base);
  target.searchParams.set("outlet", outletId);
  target.searchParams.set("items", lines.map((line) => `${line.menuItemId}:${line.quantity}`).join(","));
  target.searchParams.set("rail", "pyusd");
  return `https://phantom.com/ul/browse/${encodeURIComponent(target.toString())}?ref=${encodeURIComponent(base)}`;
}
