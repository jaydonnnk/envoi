import { Suspense } from "react";
import { outletPyusdAvailability } from "@/app/pyusd-availability";
import { outletRails } from "@/domain/outlets/destination";
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
  // Items a text suggestion picked start at quantity 1; the Phantom Browse link (S16) names each as
  // "id:quantity". Only ids on this outlet's published menu count; BasketForm ignores any other id,
  // and a quantity outside 1..20 reads as 1.
  const preselected = typeof items === "string" ? items.split(",").slice(0, 20).map(preselectedLine) : [];
  const dbStarted = performance.now();
  const menu = outletId ? await getPublishedMenu(webDb(), outletId) : null;
  const shops = menu ? [] : await listPublishedOutlets(webDb());
  // A shop with only a PYUSD wallet is reviewed on PYUSD; every other shop starts on PayPal.
  const rails = menu ? await outletRails(webDb(), menu.outlet.id) : null;
  const dbMs = Math.round(performance.now() - dbStarted);
  return { outletId, preselected, menu, shops, rail: rails && !rails.paypal && rails.pyusd ? ("pyusd" as const) : ("paypal" as const), dbMs, serverMs: Math.round(performance.now() - started) };
}

function preselectedLine(entry: string): { id: string; quantity: number } {
  const [id = "", quantity] = entry.split(":");
  const parsed = Number(quantity);
  return { id, quantity: Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 1 };
}

// A shop whose only payment method is PYUSD (S16) says up front whether it can be paid now, with
// the reason when not, because no PayPal journey exists to fall back on.
async function PyusdOnlyStatus({ outletId }: { outletId: string }) {
  const { availability } = await outletPyusdAvailability(outletId);
  return (
    <div className={`rail ${availability.available ? "choice" : "unavailable"}`} aria-disabled={!availability.available}>
      <span className="rail-head">
        <strong>PYUSD on Solana devnet, test tokens</strong>
        <span className="chip">{availability.available ? "Available" : "Unavailable"}</span>
      </span>
      <small>
        {availability.available
          ? "This shop takes only PYUSD devnet test tokens on Envoi."
          : `${availability.message} This shop takes no other payment method on Envoi, so it cannot be paid here until PYUSD is available again.`}
      </small>
    </div>
  );
}

const PyusdOnlyPending = () => (
  <div className="rail unavailable" aria-disabled="true">
    <span className="rail-head">
      <strong>PYUSD on Solana devnet, test tokens</strong>
      <span className="chip">Checking</span>
    </span>
    <small>Checking whether this shop can take PYUSD…</small>
  </div>
);

export default async function BuyPage({ searchParams }: { searchParams: Promise<BuySearchParams> }) {
  const { outletId, preselected, menu, shops, rail, dbMs, serverMs } = await loadBuyData(searchParams);
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
          {rail === "pyusd" && (
            <Suspense fallback={<PyusdOnlyPending />}>
              <PyusdOnlyStatus outletId={menu.outlet.id} />
            </Suspense>
          )}
          <BasketForm outletId={menu.outlet.id} items={menu.items} preselected={preselected} rail={rail} />
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
