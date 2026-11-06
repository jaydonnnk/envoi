// Test 48's scanner for the agents page (S37): an agent token, whole or as its bare secret, or a
// known token value given by the caller. It runs on the rendered page in the test, and on the served
// page and the scripts it loads, locally and on Render:
//   npx tsx scripts/scan-agents-page.ts http://localhost:3000
// A hit prints where it was found and never the value.

const PREFIXED = /envoi_agent_[A-Za-z0-9]+/;
// newSecretToken: 32 bytes in lowercase base32, not part of a longer run.
const BARE_SECRET = /(?<![a-z2-7])[a-z2-7]{52}(?![a-z2-7])/;

export function holdsTokenValue(text: string, knownValues: readonly string[] = []): boolean {
  return PREFIXED.test(text) || BARE_SECRET.test(text) || knownValues.some((value) => value.length > 0 && text.includes(value));
}

export type ServedScan = { pages: number; scripts: number; hits: string[] };

export async function scanServedAgentsPage(baseUrl: string, knownValues: readonly string[] = [], request: typeof fetch = fetch): Promise<ServedScan> {
  const pageUrl = new URL("/agents", baseUrl);
  const page = await request(pageUrl);
  if (!page.ok) throw new Error(`${pageUrl} answered ${page.status}`);
  const html = await page.text();
  if (!html.includes("Bring your own assistant")) throw new Error(`${pageUrl} is not the agents page`);

  const scan: ServedScan = { pages: 1, scripts: 0, hits: holdsTokenValue(html, knownValues) ? ["/agents"] : [] };
  const sources = new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]!));
  for (const source of sources) {
    const scriptUrl = new URL(source, pageUrl);
    if (scriptUrl.origin !== pageUrl.origin) continue;
    const script = await request(scriptUrl);
    if (!script.ok) throw new Error(`${scriptUrl.pathname} answered ${script.status}`);
    scan.scripts += 1;
    if (holdsTokenValue(await script.text(), knownValues)) scan.hits.push(scriptUrl.pathname);
  }
  return scan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scan = await scanServedAgentsPage(process.argv[2] ?? "http://localhost:3000");
  if (scan.scripts === 0) {
    console.error("scan-agents-page: the page loaded no script, so the scan did not reach the served bundle.");
    process.exit(1);
  }
  if (scan.hits.length > 0) {
    for (const hit of scan.hits) console.error(`scan-agents-page: token value in ${hit}`);
    process.exit(1);
  }
  console.log(`scan-agents-page: no token value in the page or its ${scan.scripts} scripts.`);
}
