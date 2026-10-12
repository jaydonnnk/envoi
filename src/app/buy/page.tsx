import { getPublishedMenu, listPublishedOutlets } from "@/domain/outlets/search";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";
import { ReviewButton } from "./review-button";

export const dynamic = "force-dynamic";

// Loads the page data and times the database share of the request, outside the component body.
// data-server-ms and data-db-ms let the S1 latency measurement split a cold visit into Render,
// Neon and request time without a separate endpoint (R12).
async function loadBuyData(searchParams: Promise<{ outlet?: string | string[] }>) {
  const started = performance.now();
  const { outlet } = await searchParams;
  const outletId = typeof outlet === "string" ? outlet : undefined;
  const dbStarted = performance.now();
  const menu = outletId ? await getPublishedMenu(webDb(), outletId) : null;
  const shops = menu ? [] : await listPublishedOutlets(webDb());
  const dbMs = Math.round(performance.now() - dbStarted);
  return { outletId, menu, shops, dbMs, serverMs: Math.round(performance.now() - started) };
}

export default async function BuyPage({ searchParams }: { searchParams: Promise<{ outlet?: string | string[] }> }) {
  const { outletId, menu, shops, dbMs, serverMs } = await loadBuyData(searchParams);

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
        <div className="stack">
          <section className="card" aria-labelledby="menu-heading">
            <h2 id="menu-heading">Menu</h2>
            {menu.items.map((item) => (
              <div className="row" key={item.id}>
                <span>{item.name}</span>
                <span className="money">{item.unitSgdCents === null ? "Price not set" : formatSgd(sgdFromCents(item.unitSgdCents))}</span>
              </div>
            ))}
          </section>
          <section className="card" aria-labelledby="tracer-heading">
            <h2 id="tracer-heading">Fixture basket</h2>
            <p className="muted">
              This tracer build reviews one fixed basket chosen by the server: 1 × {menu.items[0]?.name ?? "item"} and 2 ×{" "}
              {menu.items[1]?.name ?? "item"}. Choosing your own items comes later.
            </p>
            <ReviewButton outletId={menu.outlet.id} />
          </section>
        </div>
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
      <p className="lead">Pick a shop to see its menu.</p>
      <div className="stack">
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
