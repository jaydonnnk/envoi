import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublishedMenu, listPublishedOutlets } from "@/domain/outlets/search";
import { priceBasket } from "@/domain/purchases/price";
import * as schema from "@/lib/db/schema";
import { assignPayPalDestination, JUDGE_FIXTURES, seedJudgeFixtures } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S41: the fixture shops whose names a judge can read as shops. They are seeded the way
// seed-demo-fixture seeds, so these guards cover the wiring that makes a seeded shop buyable, not
// the names themselves. Every guard has its own mutation in evidence/s41-fixture-mutations.json.
describe("the judge fixture shops", () => {
  let database: TestDatabase;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let seeded: Awaited<ReturnType<typeof seedJudgeFixtures>>;

  beforeAll(async () => {
    database = await createTestDatabase("judgefix");
    db = drizzle(database.admin, { schema });
    seeded = await seedJudgeFixtures(db);
  });

  afterAll(async () => {
    await database?.drop();
  });

  // Per outlet, so three shops cannot hide one another's rows the way the single-outlet precedent's
  // uncorrelated subselects would.
  const snapshot = () => database.admin`
    select o.id, o.name, o.area, o.country, o.is_demo_fixture, o.published_menu_revision_id,
      (select count(*)::int from menu_revisions r where r.outlet_id = o.id) as revisions,
      (select json_agg(json_build_object('name', i.name, 'cents', i.unit_minor) order by i.position)
         from menu_items i join menu_revisions r on r.id = i.menu_revision_id
        where r.outlet_id = o.id) as items
    from outlets o order by o.name`;

  const outletOf = (name: string) => {
    const found = seeded.find((row) => row.name === name);
    if (!found) throw new Error(`no seeded result for ${name}`);
    return found;
  };

  it("publishes each shop with a confirmed revision and every item priced on that revision", async () => {
    expect(seeded.map((row) => row.status)).toEqual(["created", "created", "created"]);

    const rows = await snapshot();
    expect(rows.map((row) => row.name)).toEqual([...JUDGE_FIXTURES.map((fixture) => fixture.name)].sort());

    for (const fixture of JUDGE_FIXTURES) {
      const row = rows.find((candidate) => candidate.name === fixture.name)!;
      expect(row.revisions).toBe(1);
      expect(row.published_menu_revision_id).not.toBeNull();

      const items = row.items as { name: string; cents: number | null }[];
      expect(items).toHaveLength(fixture.items.length);
      // A null price refuses at pricing, so "every price is known" is what makes the shop buyable.
      expect(items.filter((item) => item.cents === null)).toEqual([]);
      expect(items.map((item) => item.name).sort()).toEqual([...fixture.items.map((item) => item.name)].sort());
    }

    const revisions = await database.admin<{ status: string }[]>`select status from menu_revisions`;
    expect(revisions.map((revision) => revision.status)).toEqual(["confirmed", "confirmed", "confirmed"]);
  });

  it("reports the existing ids on a second run and changes nothing", async () => {
    const before = await snapshot();

    const again = await seedJudgeFixtures(db);
    expect(again).toEqual(
      seeded.map((row) => ({
        status: "unchanged",
        fixtureKey: row.fixtureKey,
        name: row.name,
        outletId: row.outletId,
        menuRevisionId: row.menuRevisionId,
      })),
    );
    expect(await snapshot()).toEqual(before);
    expect(before).toHaveLength(3);
  });

  it("reaches the public list as a demo fixture, in the currency its country sets", async () => {
    const listed = await listPublishedOutlets(db);
    const mine = listed.filter((outlet) => JUDGE_FIXTURES.some((fixture) => fixture.name === outlet.name));
    expect(mine).toHaveLength(3);

    for (const fixture of JUDGE_FIXTURES) {
      const outlet = mine.find((candidate) => candidate.name === fixture.name)!;
      expect(outlet.isDemoFixture).toBe(true);
      expect(outlet.country).toBe(fixture.country);
      expect(outlet.currency).toBe(fixture.country === "US" ? "USD" : "SGD");
      expect(outlet.area).toBe(fixture.area);
    }
  });

  it("prices a basket once a destination is assigned, with no enrollment row anywhere", async () => {
    // The two Singapore shops share the SGD sandbox seller, which is a labeled fixture limitation
    // and not two shops each paid into their own account.
    const sellers: Record<string, string> = {
      "Ah Seng Chicken Rice": "EQN6264CF9F4Y",
      "Tiong Bahru Kopi House": "EQN6264CF9F4Y",
      "Larkspur Street Taqueria": "972VTMQPEUZ5A",
    };
    for (const fixture of JUDGE_FIXTURES) {
      const assigned = await assignPayPalDestination(db, outletOf(fixture.name).outletId, sellers[fixture.name]!);
      expect(assigned.status).toBe("created");
    }

    // Seeded shops have no enrollment: approve-enrollment would refuse them, and nothing on the
    // buyer's path asks for one. This is the claim under test, not an assumption about it.
    const enrollments = await database.admin<{ n: string }[]>`select count(*) as n from enrollments`;
    expect(Number(enrollments[0]!.n)).toBe(0);

    for (const fixture of JUDGE_FIXTURES) {
      const outletId = outletOf(fixture.name).outletId;
      const menu = await getPublishedMenu(db, outletId);
      expect(menu).not.toBeNull();
      const first = menu!.items[0]!;

      const quote = await priceBasket(db, { outletId, lines: [{ menuItemId: first.id, quantity: 2 }], rail: "paypal", now: new Date() });
      if (!quote.ok) throw new Error(`${fixture.name} refused a basket: ${quote.error.message}`);
      expect(quote.currency).toBe(fixture.country === "US" ? "USD" : "SGD");
      expect(quote.totalMinor).toBe(first.unitMinor! * 2);
      expect(quote.menuRevisionId).toBe(outletOf(fixture.name).menuRevisionId);
      expect(quote.destinationId).toBeTruthy();
    }
  });
});
