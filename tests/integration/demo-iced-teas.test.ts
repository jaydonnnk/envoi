import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { addDemoIcedTeas } from "@/operator/cli";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";

// S25: the add-demo-iced-teas operator command, Gate 3 reopening 2026-10-29 named test 9 and its two
// refusals. A FIXTURE shop is published through the merchant routes and then named and labeled as the
// demo Test Shop.
describe("demo iced teas", () => {
  let fixture: PaymentsFixture;
  let routes: MerchantRoutes;
  let api: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("icedteas");
    routes = await loadMerchantRoutes();
    api = shopApi(fixture.database, routes);
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  type Item = { name: string; priceSgdCents: number };

  const operatorDb = () => drizzle(fixture.database.admin, { schema });
  const revisions = async (outletId: string) => Number((await fixture.database.admin<{ n: string }[]>`select count(*) as n from menu_revisions where outlet_id = ${outletId}`)[0]!.n);
  const audits = async (outletId: string) => fixture.database.admin<{ actor: string; action: string }[]>`select actor, action from audit_events where outlet_id = ${outletId} order by at`;

  // Runs one case on a fresh demo Test Shop and retires its name afterwards whatever happens, so the
  // next case finds exactly one Test Shop.
  async function withDemoTestShop(items: Item[], run: (shop: Shop) => Promise<void>) {
    const { shop } = await api.publishedShop("teas", items);
    await fixture.database.admin`update outlets set name = 'Test Shop', is_demo_fixture = true where id = ${shop.outletId}`;
    try {
      await run(shop);
    } finally {
      await fixture.database.admin`update outlets set name = 'FIXTURE retired Test Shop' where id = ${shop.outletId}`;
    }
  }

  // The refusal's message, or "resolved" when the command did not refuse, so a missing refusal fails
  // on an assertion.
  const refusal = () =>
    addDemoIcedTeas(operatorDb()).then(
      () => "resolved",
      (err: Error) => err.message,
    );

  it("the demo iced teas are added once and published through the menu rules", () =>
    withDemoTestShop([{ name: "FIXTURE Kopi C", priceSgdCents: 180 }], async (shop) => {
      const before = await publishedItems(fixture.database, shop.outletId);
      const auditsBefore = (await audits(shop.outletId)).length;

      const added = await addDemoIcedTeas(operatorDb());
      expect(added).toMatchObject({ status: "added", outletId: shop.outletId });
      const after = await publishedItems(fixture.database, shop.outletId);
      // The published menu is a new revision: the shop's own item kept its key, and the two teas
      // follow it at their prices.
      expect(after[0]!.revisionId).toBe(added.revisionId);
      expect(added.revisionId).not.toBe(before[0]!.revisionId);
      expect(after.map((item) => [item.name, item.unitSgdCents])).toEqual([
        ["FIXTURE Kopi C", 180],
        ["Iced lemon tea", 220],
        ["Iced milk tea", 250],
      ]);
      expect(after[0]!.itemKey).toBe(before[0]!.itemKey);
      // Through the merchant's own draft, confirm and publish rules, then recorded as an operator act.
      // All four share one timestamp, so they are compared as a set.
      expect(
        (await audits(shop.outletId))
          .slice(auditsBefore)
          .map((event) => [event.actor.split(":")[0], event.action])
          .sort(),
      ).toEqual([
        ["merchant", "menu_confirmed"],
        ["merchant", "menu_draft_saved"],
        ["merchant", "outlet_published"],
        ["operator", "demo_iced_teas_added"],
      ]);

      // Run again, it changes nothing.
      const count = await revisions(shop.outletId);
      expect(await addDemoIcedTeas(operatorDb())).toEqual({ status: "unchanged", outletId: shop.outletId, revisionId: added.revisionId });
      expect(await revisions(shop.outletId)).toBe(count);
      expect(await publishedItems(fixture.database, shop.outletId)).toEqual(after);
    }));

  it("the demo iced teas never publish a merchant's own unpublished changes", () =>
    withDemoTestShop([{ name: "FIXTURE Kopi C", priceSgdCents: 180 }], async (shop) => {
      await api.saveDraft(shop, await api.getDraft(shop), [{ name: "FIXTURE merchant's unpublished item", priceSgdCents: 300 }]);
      const count = await revisions(shop.outletId);
      const before = await publishedItems(fixture.database, shop.outletId);

      expect(await refusal()).toMatch(/unpublished menu changes/);
      expect(await revisions(shop.outletId)).toBe(count);
      expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
    }));

  it("the demo iced teas never change a price the shop already set", () =>
    withDemoTestShop(
      [
        { name: "Iced lemon tea", priceSgdCents: 220 },
        { name: "Iced milk tea", priceSgdCents: 300 },
      ],
      async (shop) => {
        const count = await revisions(shop.outletId);
        const before = await publishedItems(fixture.database, shop.outletId);

        expect(await refusal()).toMatch(/Iced milk tea at another price/);
        expect(await revisions(shop.outletId)).toBe(count);
        expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
      },
    ));
});
