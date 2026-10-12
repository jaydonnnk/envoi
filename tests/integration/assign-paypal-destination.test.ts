import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { assignPayPalDestination, seedDemoFixture } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";

// FIXTURE seller ids in PayPal's id alphabet, not real accounts.
const SELLER_A = "FXTRSELLER2AB";
const SELLER_B = "THERSELLER3CD";

describe("a PayPal destination is assigned once", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase("destination");
  });

  afterAll(async () => {
    await database?.drop();
  });

  const destinations = () => database.admin`select id, outlet_id, seller_merchant_id, status, version from payment_destinations order by id`;

  it("a rerun naming the same or another seller changes no row or version and reports the existing one", async () => {
    const db = drizzle(database.admin, { schema });
    const { outletId } = await seedDemoFixture(db);
    const first = await assignPayPalDestination(db, outletId, SELLER_A);
    expect(first).toMatchObject({ status: "created", sellerMerchantId: SELLER_A, version: 1 });
    const before = await destinations();

    const same = await assignPayPalDestination(db, outletId, SELLER_A);
    const other = await assignPayPalDestination(db, outletId, SELLER_B);
    for (const rerun of [same, other]) {
      expect(rerun).toEqual({ status: "unchanged", outletId, destinationId: first.destinationId, sellerMerchantId: SELLER_A, version: 1 });
    }
    expect(await destinations()).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it("refuses a seller id that is not a PayPal account id", async () => {
    const db = drizzle(database.admin, { schema });
    const { outletId } = await seedDemoFixture(db);
    for (const bad of ["seller@example.com", "FIXTURESELLER", "PJPWJW3VL4ET"]) {
      await expect(assignPayPalDestination(db, outletId, bad), bad).rejects.toThrow(/13 characters, 2-9 and A-Z without I or O/);
    }
  });
});
