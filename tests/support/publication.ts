import { drizzle } from "drizzle-orm/postgres-js";
import { expect } from "vitest";
import * as schema from "@/lib/db/schema";
import { approveEnrollment, assignPayPalDestination } from "@/operator/cli";
import type { TestDatabase } from "./db";
import { jsonRequest, newMerchant, signInCookie, type TestMerchant } from "./merchant";
import { FIXTURE_SELLER, routeParams } from "./payments";

// S7: a merchant's own shop taken through every publication precondition with the real route
// handlers as envoi_web, and the operator acts run as the operator CLI would. FIXTURE accounts use
// passwords generated in memory for this run only; the seller id is the FIXTURE sandbox-style id.

export type MerchantRoutes = {
  auth: typeof import("@/app/api/auth/[...all]/route");
  outlets: typeof import("@/app/api/v1/merchant/outlets/route");
  outlet: typeof import("@/app/api/v1/merchant/outlets/[id]/route");
  draft: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route");
  confirm: typeof import("@/app/api/v1/merchant/outlets/[id]/confirm/route");
  destination: typeof import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/route");
  publish: typeof import("@/app/api/v1/merchant/outlets/[id]/publish/route");
};

export async function loadMerchantRoutes(): Promise<MerchantRoutes> {
  return {
    auth: await import("@/app/api/auth/[...all]/route"),
    outlets: await import("@/app/api/v1/merchant/outlets/route"),
    outlet: await import("@/app/api/v1/merchant/outlets/[id]/route"),
    draft: await import("@/app/api/v1/merchant/outlets/[id]/menu-draft/route"),
    confirm: await import("@/app/api/v1/merchant/outlets/[id]/confirm/route"),
    destination: await import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/route"),
    publish: await import("@/app/api/v1/merchant/outlets/[id]/publish/route"),
  };
}

export type Envelope<T> = { ok: boolean; data: T; error: { code: string; message: string; details: Record<string, string | number | boolean> } };

export const envelope = async <T>(response: Response) => (await response.json()) as Envelope<T>;

export type DraftJson = {
  outletId: string;
  revisionId: string;
  version: number;
  status: "draft" | "confirmed";
  published: boolean;
  items: { id: string; name: string; portion: string | null; priceMinor: number | null; availability: string; source: string }[];
};

export type ItemInput = { id?: string; name: string; priceMinor: number | null; availability?: "available" | "unavailable" | "unknown" };

export type Shop = { merchant: TestMerchant; cookie: string; outletId: string };

export const FIXTURE_MENU: ItemInput[] = [
  { name: "FIXTURE Kopi", priceMinor: 180 },
  { name: "FIXTURE Kaya toast", priceMinor: 400 },
];

export type PublicationCheck = "enrollment" | "outlet_details" | "menu_confirmation" | "destination";

export function shopApi(database: TestDatabase, routes: MerchantRoutes) {
  const at = (shop: Shop, path: string, method: string, payload?: unknown) => jsonRequest(method, `/api/v1/merchant/outlets/${shop.outletId}${path}`, shop.cookie, payload);

  async function newShop(label: string): Promise<Shop> {
    const merchant = await newMerchant(database, label, { membership: true });
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const created = await routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: `FIXTURE ${label} kopi`, area: "Tanjong Pagar" }));
    expect(created.status).toBe(201);
    return { merchant, cookie, outletId: (await envelope<{ outlet: { id: string } }>(created)).data.outlet.id };
  }

  const getDraft = async (shop: Shop): Promise<DraftJson> => {
    const response = await routes.draft.GET(at(shop, "/menu-draft", "GET"), routeParams(shop.outletId));
    expect(response.status).toBe(200);
    return (await envelope<DraftJson>(response)).data;
  };

  const putDraft = (shop: Shop, base: Pick<DraftJson, "revisionId" | "version">, items: ItemInput[]) =>
    routes.draft.PUT(
      at(shop, "/menu-draft", "PUT", {
        revisionId: base.revisionId,
        version: base.version,
        items: items.map((item) => ({ portion: null, availability: "available", ...item })),
      }),
      routeParams(shop.outletId),
    );

  async function saveDraft(shop: Shop, base: Pick<DraftJson, "revisionId" | "version">, items: ItemInput[]): Promise<DraftJson> {
    const response = await putDraft(shop, base, items);
    expect(response.status).toBe(200);
    return (await envelope<DraftJson>(response)).data;
  }

  async function confirmDraft(shop: Shop, draft: DraftJson): Promise<DraftJson> {
    const response = await routes.confirm.POST(at(shop, "/confirm", "POST", { revisionId: draft.revisionId, version: draft.version }), routeParams(shop.outletId));
    expect(response.status).toBe(200);
    return (await envelope<DraftJson>(response)).data;
  }

  const patchOutlet = (shop: Shop, payload: unknown) => routes.outlet.PATCH(at(shop, "", "PATCH", payload), routeParams(shop.outletId));

  async function confirmDetails(shop: Shop): Promise<void> {
    const [outlet] = await database.admin<{ name: string; area: string }[]>`select name, area from outlets where id = ${shop.outletId}`;
    expect((await patchOutlet(shop, { name: outlet!.name, area: outlet!.area, detailsConfirmed: true })).status).toBe(200);
  }

  const operatorDb = () => drizzle(database.admin, { schema });
  const prepareConnection = (shop: Shop, seller = FIXTURE_SELLER) => assignPayPalDestination(operatorDb(), shop.outletId, seller);
  const approve = (shop: Shop) => approveEnrollment(operatorDb(), { outletId: shop.outletId, evidenceRef: "FIXTURE: test run" });

  const putConnection = (shop: Shop, payload: unknown) => routes.destination.PUT(at(shop, "/destinations/paypal", "PUT", payload), routeParams(shop.outletId));

  async function acceptConnection(shop: Shop): Promise<void> {
    expect((await putConnection(shop, { sellerMerchantId: FIXTURE_SELLER })).status).toBe(200);
  }

  const publish = (shop: Shop, draft: Pick<DraftJson, "revisionId" | "version">) =>
    routes.publish.POST(at(shop, "/publish", "POST", { revisionId: draft.revisionId, version: draft.version }), routeParams(shop.outletId));

  // A shop with every precondition in place except `omit`, its menu saved (and confirmed unless
  // omitted). A destination omission leaves the operator's connection prepared but not accepted.
  async function readyShop(label: string, omit: PublicationCheck | null = null, items: ItemInput[] = FIXTURE_MENU, country: "SG" | "US" = "SG"): Promise<{ shop: Shop; draft: DraftJson }> {
    const shop = await newShop(label);
    // S27: a US shop chooses its country before anything is published.
    if (country !== "SG") expect((await patchOutlet(shop, { country })).status).toBe(200);
    let draft = await saveDraft(shop, await getDraft(shop), items);
    if (omit !== "menu_confirmation") draft = await confirmDraft(shop, draft);
    if (omit !== "outlet_details") await confirmDetails(shop);
    if (omit !== "enrollment") await approve(shop);
    await prepareConnection(shop);
    if (omit !== "destination") await acceptConnection(shop);
    return { shop, draft };
  }

  async function publishedShop(label: string, items: ItemInput[] = FIXTURE_MENU, country: "SG" | "US" = "SG"): Promise<{ shop: Shop; draft: DraftJson }> {
    const { shop, draft } = await readyShop(label, null, items, country);
    expect((await publish(shop, draft)).status).toBe(200);
    return { shop, draft: await getDraft(shop) };
  }

  // Edits the published menu with `change`, confirms the new revision and publishes it.
  async function republish(shop: Shop, change: (items: DraftJson["items"]) => ItemInput[]): Promise<DraftJson> {
    const published = await getDraft(shop);
    expect(published.published).toBe(true);
    const draft = await confirmDraft(shop, await saveDraft(shop, published, change(published.items)));
    expect((await publish(shop, draft)).status).toBe(200);
    return getDraft(shop);
  }

  return { newShop, getDraft, putDraft, saveDraft, confirmDraft, patchOutlet, confirmDetails, prepareConnection, approve, putConnection, acceptConnection, publish, readyShop, publishedShop, republish };
}

// The published menu's items as buyers read them, with their keys across revisions.
export async function publishedItems(database: TestDatabase, outletId: string) {
  return database.admin<{ revisionId: string; id: string; itemKey: string; name: string; unitMinor: number }[]>`
    select r.id as "revisionId", i.id, i.item_key as "itemKey", i.name, i.unit_minor as "unitMinor"
    from outlets o join menu_revisions r on r.id = o.published_menu_revision_id join menu_items i on i.menu_revision_id = r.id
    where o.id = ${outletId} order by i.position`;
}
