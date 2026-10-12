import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { anonymousCookie, TEST_BASE_URL, webEnvFor } from "../support/session";

// Exercises the real route handlers, as envoi_web, against a migrated disposable database.
describe("receipt is private to its session", () => {
  let database: TestDatabase;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
  };
  let outletId: string;

  beforeAll(async () => {
    database = await createTestDatabase("receipt");
    outletId = (await seedDemoFixture(drizzle(database.admin, { schema }))).outletId;
    Object.assign(process.env, webEnvFor(database.webUrl));
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
    };
  });

  afterAll(async () => {
    await database?.drop();
  });

  const readPurchase = (id: string, cookie: string) =>
    routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${id}`, { headers: { cookie } }), { params: Promise.resolve({ id }) });

  it("the owner reads the purchase; another anonymous session gets 404", async () => {
    const owner = await anonymousCookie(routes.auth.POST);
    const other = await anonymousCookie(routes.auth.POST);

    const created = await routes.purchases.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchases`, {
        method: "POST",
        headers: { cookie: owner, "content-type": "application/json", origin: TEST_BASE_URL },
        body: JSON.stringify({ outletId }),
      }),
    );
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { purchaseId: string } };

    const mine = await readPurchase(data.purchaseId, owner);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ ok: true, data: { id: data.purchaseId, paymentAttempted: false, totalSgdCents: 160 + 2 * 450 } });

    const theirs = await readPurchase(data.purchaseId, other);
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
