import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { previewPurchaseRequest } from "@/domain/handoffs/redeem";
import * as schema from "@/lib/db/schema";
import { connectWeb, type Db } from "@/lib/db/web";
import { issueAgentToken } from "@/operator/cli";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { loadMerchantRoutes, publishedItems, shopApi, type ItemInput, type MerchantRoutes } from "../support/publication";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// S7 review fix (M1): a handoff stores the item ids of the menu the agent read, and real
// republication gives every item a new id while it keeps its key, so redemption prices the menu
// published now by key. Each file gets its own disposable database, so these merchant shops
// never answer the area search of agent-handoff.test.ts. PayPal is never called here.
describe("agent handoff across republication", () => {
  let fixture: PaymentsFixture;
  let web: { db: Db; close: () => Promise<void> };
  let agentToken: string;
  let routes: MerchantRoutes & {
    requests: typeof import("@/app/api/v1/purchase-requests/route");
    redeem: typeof import("@/app/api/v1/purchase-requests/redeem/route");
  };
  let shops: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("handoffrepub");
    agentToken = (await issueAgentToken(drizzle(fixture.database.admin, { schema }), "fixture agent")).token;
    web = connectWeb(fixture.database.webUrl, 2);
    routes = {
      ...(await loadMerchantRoutes()),
      requests: await import("@/app/api/v1/purchase-requests/route"),
      redeem: await import("@/app/api/v1/purchase-requests/redeem/route"),
    };
    shops = shopApi(fixture.database, routes);
  });

  afterAll(async () => {
    await web?.close();
    await fixture?.database.drop();
  });

  // The agent's link for a basket of one outlet, as the token inside the returned URL.
  async function link(outletId: string, lines: { menuItemId: string; quantity: number }[], extra: Record<string, unknown> = {}): Promise<string> {
    const response = await routes.requests.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchase-requests`, {
        method: "POST",
        headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json" },
        body: JSON.stringify({ outletId, lines, ...extra }),
      }),
    );
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { url: string } };
    return /\/approve\/([a-z2-7]{52})$/.exec(data.url)![1]!;
  }

  // A fresh buyer session redeems the token.
  async function redeem(token: string): Promise<{ status: number; body: { data?: { outcome: string; purchaseId?: string }; error?: { code: string; details?: { reason?: string } } } }> {
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.redeem.POST(jsonPost("/api/v1/purchase-requests/redeem", cookie, { token }));
    return { status: response.status, body: (await response.json()) as never };
  }

  const named = <T extends { name: string }>(items: readonly T[], name: string): T => {
    const found = items.find((entry) => entry.name === name);
    if (!found) throw new Error(`no item ${name}`);
    return found;
  };

  // Republishes the menu with each kept item's price and availability set by `change`.
  const republishWith = (shop: Parameters<typeof shops.republish>[0], change: (item: { id: string; name: string; priceMinor: number | null }) => ItemInput | null) =>
    shops.republish(shop, (items) => items.map((item) => change(item)).filter((item): item is ItemInput => item !== null));

  it("handoff carries no amount", async () => {
    const { shop } = await shops.publishedShop("handoff-amount", [{ name: "FIXTURE Soft-boiled eggs (2)", priceMinor: 180 }]);
    const eggs = named(await publishedItems(fixture.database, shop.outletId), "FIXTURE Soft-boiled eggs (2)");
    const token = await link(shop.outletId, [{ menuItemId: eggs.id, quantity: 2 }], { totalMinor: 1, unitMinor: 1, amount: "0.01" });

    const columns = await fixture.database.admin<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'purchase_requests'`;
    expect(columns.map((column) => column.column_name).filter((name) => /total|amount|price|cents/.test(name))).toEqual([]);

    // The shop republishes a new price after the agent asked; the review uses the price at redemption.
    await republishWith(shop, (item) => ({ id: item.id, name: item.name, priceMinor: 250 }));
    const redeemed = await redeem(token);
    expect(redeemed.body.data?.outcome).toBe("redeemed");
    const [purchase] = await fixture.database.admin`select total_minor, entry_point from purchases where id = ${redeemed.body.data!.purchaseId!}`;
    expect(purchase!.total_minor).toBe(500);
    expect(purchase!.entry_point).toBe("agent_handoff");
  });

  it("a basket that no longer prices is refused and stays redeemable", async () => {
    const { shop } = await shops.publishedShop("handoff-unavailable");
    const kopi = named(await publishedItems(fixture.database, shop.outletId), "FIXTURE Kopi");
    const token = await link(shop.outletId, [{ menuItemId: kopi.id, quantity: 1 }]);
    const kopiAvailable = (available: boolean) => (item: { id: string; name: string; priceMinor: number | null }): ItemInput => ({
      id: item.id,
      name: item.name,
      priceMinor: item.priceMinor,
      availability: item.name === kopi.name && !available ? "unavailable" : "available",
    });

    await republishWith(shop, kopiAvailable(false));
    const refused = await redeem(token);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatchObject({ code: "validation_failed", details: { reason: "unavailable" } });

    await republishWith(shop, kopiAvailable(true));
    const later = await redeem(token);
    expect(later.body.data?.outcome).toBe("redeemed");
  });

  it("a handoff redeemed after republication prices the republished menu", async () => {
    const { shop } = await shops.publishedShop("handoff-republished", [
      { name: "FIXTURE Kopi", priceMinor: 180 },
      { name: "FIXTURE Kaya toast", priceMinor: 400 },
      { name: "FIXTURE Teh", priceMinor: 150 },
    ]);
    const before = await publishedItems(fixture.database, shop.outletId);
    const basket = await link(shop.outletId, [
      { menuItemId: named(before, "FIXTURE Kopi").id, quantity: 2 },
      { menuItemId: named(before, "FIXTURE Kaya toast").id, quantity: 1 },
    ]);
    const removed = await link(shop.outletId, [{ menuItemId: named(before, "FIXTURE Teh").id, quantity: 1 }]);

    // Republished: Kopi costs more, Teh is gone, and every item has a new id under its old key.
    await republishWith(shop, (item) => (item.name === "FIXTURE Teh" ? null : { id: item.id, name: item.name, priceMinor: item.name === "FIXTURE Kopi" ? 200 : item.priceMinor }));
    const after = await publishedItems(fixture.database, shop.outletId);
    expect(after.map((item) => item.id).filter((id) => before.some((old) => old.id === id))).toEqual([]);

    expect(await previewPurchaseRequest(web.db, basket, new Date())).toMatchObject({ kind: "open", lines: [{ name: "FIXTURE Kopi", quantity: 2 }, { name: "FIXTURE Kaya toast", quantity: 1 }] });
    expect(await previewPurchaseRequest(web.db, removed, new Date())).toMatchObject({ kind: "open", lines: [{ name: "An item no longer on the menu", quantity: 1 }] });

    const redeemed = await redeem(basket);
    expect(redeemed.body.data?.outcome).toBe("redeemed");
    const [purchase] = await fixture.database.admin<{ total: number; revision: string; lines: { menuItemId: string; quantity: number }[] }[]>`
      select total_minor as total, menu_revision_id as revision, lines from purchases where id = ${redeemed.body.data!.purchaseId!}`;
    expect(purchase!.revision).toBe(after[0]!.revisionId);
    expect(purchase!.total).toBe(2 * 200 + 400);
    expect(purchase!.lines.map((line) => [line.menuItemId, line.quantity])).toEqual([
      [named(after, "FIXTURE Kopi").id, 2],
      [named(after, "FIXTURE Kaya toast").id, 1],
    ]);

    // An item whose key is no longer published stays refused, and the link stays unredeemed.
    const refused = await redeem(removed);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatchObject({ code: "validation_failed", details: { reason: "unknown_item" } });
    expect((await previewPurchaseRequest(web.db, removed, new Date())).kind).toBe("open");
  });
});
