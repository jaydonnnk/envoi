// R12 measurement: one visit to /buy, reported as JSON.
//
//   npx tsx tests/e2e/latency.ts <baseUrl> <label>
//
// "Interactive buy page" means the server-rendered HTML (shop links work without JavaScript) plus every
// stylesheet and script it references. The split uses the page's own data-server-ms and data-db-ms:
//   server time = data-server-ms; database share = data-db-ms (Neon wake plus query round trips);
//   network baseline = a warm /api/v1/health round trip taken right after;
//   Render wake = time to first byte - server time - network baseline (derived, not observed directly).
// A visit counts as cold only when Render and Neon were both idle beforehand; the caller states that.

export {};

const [rawBase, label = "visit"] = process.argv.slice(2);
if (!rawBase) {
  console.error("usage: latency.ts <baseUrl> <label>");
  process.exit(2);
}
const baseUrl = rawBase.replace(/\/$/, "");

async function timed(url: string): Promise<{ ttfbMs: number; totalMs: number; status: number; body: string }> {
  const started = performance.now();
  const response = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
  const ttfbMs = performance.now() - started;
  const body = await response.text();
  return { ttfbMs, totalMs: performance.now() - started, status: response.status, body };
}

const startedAt = new Date().toISOString();
const t0 = performance.now();
const page = await timed(`${baseUrl}/buy`);
const assets = [...page.body.matchAll(/<(?:script[^>]+src|link[^>]+rel="stylesheet"[^>]+href)="([^"]+)"/g)].map((match) => match[1]!);
await Promise.all(assets.map((path) => timed(new URL(path, baseUrl).toString())));
const interactiveMs = performance.now() - t0;

const health = await timed(`${baseUrl}/api/v1/health`);
const serverMs = Number(/data-server-ms="(\d+)"/.exec(page.body)?.[1] ?? NaN);
const dbMs = Number(/data-db-ms="(\d+)"/.exec(page.body)?.[1] ?? NaN);
const round = (value: number) => Math.round(value);

console.log(
  JSON.stringify({
    label,
    startedAt,
    status: page.status,
    fixtureLabeled: page.body.includes("Demo fixture"),
    interactiveMs: round(interactiveMs),
    documentTtfbMs: round(page.ttfbMs),
    documentTotalMs: round(page.totalMs),
    assetCount: assets.length,
    serverMs,
    dbMs,
    warmHealthRttMs: round(health.ttfbMs),
    derivedRenderWakeMs: round(Math.max(0, page.ttfbMs - serverMs - health.ttfbMs)),
  }),
);
