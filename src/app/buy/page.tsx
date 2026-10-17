import { getPublishedMenu, listPublishedOutlets } from "@/domain/outlets/search";
import { textSuggestionsEnabled } from "@/integrations/ai/openai";
import { webDb } from "@/lib/db/web";
import { BasketForm } from "./basket-form";
import { TextSuggest } from "./text-suggest";

type BuySearchParams = { outlet?: string | string[]; items?: string | string[] };

const MANUAL_LIST_ID = "shops";

export const dynamic = "force-dynamic";

// Loads the page data and times the database share of the request, outside the component body.
// data-server-ms and data-db-ms let the S1 latency measurement split a cold visit into Render,
// Neon and request time without a separate endpoint (R12).
async function loadBuyData(searchParams: Promise<BuySearchParams>) {
  const started = performance.now();
  const { outlet, items } = await searchParams;
  const outletId = typeof outlet === "string" ? outlet : undefined;
  // Items a text suggestion picked start at quantity 1. Only ids on this outlet's published menu
  // count; BasketForm ignores any other id.
  const preselected = typeof items === "string" ? items.split(",").slice(0, 20) : [];
  const dbStarted = performance.now();
  const menu = outletId ? await getPublishedMenu(webDb(), outletId) : null;
  const shops = menu ? [] : await listPublishedOutlets(webDb());
  const dbMs = Math.round(performance.now() - dbStarted);
  return { outletId, preselected, menu, shops, dbMs, serverMs: Math.round(performance.now() - started) };
}

export default async function BuyPage({ searchParams }: { searchParams: Promise<BuySearchParams> }) {
  const { outletId, preselected, menu, shops, dbMs, serverMs } = await loadBuyData(searchParams);
  const textEnabled = textSuggestionsEnabled();

  if (menu) {
    return (
      <main data-server-ms={serverMs} data-db-ms={dbMs}>
        <p className="eyebrow">
          <a href="/buy">All shops</a>
        </p>
        <h1>{menu.outlet.name}</h1>
        <p className="lead">
          {menu.outlet.area} {menu.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
        </p>
        <section className="card" aria-labelledby="menu-heading">
          <h2 id="menu-heading">Choose items</h2>
          <BasketForm outletId={menu.outlet.id} items={menu.items} preselected={preselected} />
        </section>
      </main>
    );
  }

  if (outletId) {
    return (
      <main data-server-ms={serverMs} data-db-ms={dbMs}>
        <h1>Not on Envoi</h1>
        <p className="lead">That shop is not on Envoi.</p>
        <a className="button secondary" href="/buy">
          See all shops
        </a>
      </main>
    );
  }

  return (
    <main data-server-ms={serverMs} data-db-ms={dbMs}>
      <p className="eyebrow">Buy</p>
      <h1>Find a participating shop</h1>
      <p className="lead">{textEnabled ? "Tell Envoi what you want, scan the shop's sticker, or pick a shop to see its menu." : "Scan the shop's sticker, or pick a shop to see its menu."}</p>
      {textEnabled && <TextSuggest manualListId={MANUAL_LIST_ID} />}
      <section className="card scan-entry" aria-labelledby="scan-heading">
        <h2 id="scan-heading">Or scan the sticker</h2>
        <p className="muted">Standing at the counter? Scan the shop&apos;s SGQR sticker to open that exact outlet. No area needed.</p>
        {/* A plain link, so the scan page loads as its own document with the camera permission. */}
        <a className="button full" href="/buy/scan">
          Scan
        </a>
      </section>
      <div className="stack shops" id={MANUAL_LIST_ID}>
        {textEnabled && <h2 className="list-heading">Or pick a shop</h2>}
        {shops.length === 0 && <p className="card">No shop is on Envoi yet.</p>}
        {shops.map((shop) => (
          <a className="card shop" key={shop.id} href={`/buy?outlet=${encodeURIComponent(shop.id)}`}>
            <span>
              <strong>{shop.name}</strong>
              <small>{shop.area}</small>
            </span>
            {shop.isDemoFixture && <span className="chip warn">Demo fixture</span>}
          </a>
        ))}
      </div>
    </main>
  );
}
