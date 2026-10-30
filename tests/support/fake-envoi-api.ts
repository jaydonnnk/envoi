// FIXTURE: a fake of Envoi's three public API routes at the generated client's fetch boundary, for
// the S20 reference agent's tests. No Envoi deployment is called; every shop, item, token and link
// it answers is a FIXTURE value.

export const FIXTURE_BASE_URL = "https://fixture.envoi.test";
export const FIXTURE_AGENT_TOKEN = "envoi_agent_FIXTUREtokenFIXTUREtokenFIXTUREtokenFIXTUREtoken";
export const FIXTURE_LINK_TOKEN = "fixturelinktokenfixturelinktokenfixturelinktokenab";
export const FIXTURE_LINK = `${FIXTURE_BASE_URL}/approve/${FIXTURE_LINK_TOKEN}`;
export const FIXTURE_EXPIRES_AT = "2026-10-28T03:10:00.000Z";

export const TEST_SHOP = { id: "out_fixturetestshop", name: "FIXTURE Test Shop", area: "Test Area", isDemoFixture: true };
export const OTHER_SHOP = { id: "out_fixtureothershop", name: "FIXTURE Other Shop", area: "Other Area", isDemoFixture: true };

export const MENUS: Record<string, { id: string; name: string; unitMinor: number | null; available: boolean | null }[]> = {
  [TEST_SHOP.id]: [
    { id: "itm_kopic", name: "Kopi C", unitMinor: 180, available: true },
    { id: "itm_kaya", name: "Kaya toast set", unitMinor: 450, available: false },
    { id: "itm_lemontea", name: "Iced lemon tea", unitMinor: 220, available: true },
    { id: "itm_milktea", name: "Iced milk tea", unitMinor: 250, available: true },
  ],
  [OTHER_SHOP.id]: [{ id: "itm_otherkopi", name: "Kopi O", unitMinor: 160, available: true }],
};

export type FakeEnvoiRequest = { method: string; path: string; headers: Headers; body: unknown };

export type FakeEnvoiApi = { fetch: typeof globalThis.fetch; requests: FakeEnvoiRequest[] };

const SHOPS = [TEST_SHOP, OTHER_SHOP];

export function createFakeEnvoiApi(): FakeEnvoiApi {
  const requests: FakeEnvoiRequest[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== FIXTURE_BASE_URL) throw new Error(`FIXTURE fake Envoi refuses an unexpected URL: ${request.url}`);
    const text = request.method === "GET" ? "" : await request.text();
    requests.push({ method: request.method, path: url.pathname, headers: request.headers, body: text ? JSON.parse(text) : null });

    if (request.method === "GET" && url.pathname === "/api/v1/outlets") return Response.json({ ok: true, data: { outlets: SHOPS } });
    const menu = url.pathname.match(/^\/api\/v1\/outlets\/([^/]+)\/menu$/);
    if (request.method === "GET" && menu) {
      const shop = SHOPS.find((candidate) => candidate.id === decodeURIComponent(menu[1]!));
      if (!shop) return Response.json({ ok: false, error: { code: "not_found", message: "Not found.", retryable: false, details: {} } }, { status: 404 });
      return Response.json({ ok: true, data: { outlet: shop, menuRevisionId: `rev_${shop.id}`, items: MENUS[shop.id] } });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/purchase-requests") {
      if (request.headers.get("authorization") !== `Bearer ${FIXTURE_AGENT_TOKEN}`) {
        return Response.json({ ok: false, error: { code: "unauthorized", message: "Unauthorized.", retryable: false, details: {} } }, { status: 401 });
      }
      return Response.json({ ok: true, data: { url: FIXTURE_LINK, expiresAt: FIXTURE_EXPIRES_AT } }, { status: 201 });
    }
    throw new Error(`FIXTURE fake Envoi has no route for ${request.method} ${url.pathname}`);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}
