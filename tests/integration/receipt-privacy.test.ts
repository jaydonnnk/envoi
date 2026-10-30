import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// Exercises the real route handlers, as envoi_web, against a migrated disposable database.
describe("receipt is private to its session", () => {
  let fixture: PaymentsFixture;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("receipt");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
    };
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const readPurchase = (id: string, cookie: string) => routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${id}`, { headers: { cookie } }), routeParams(id));

  it("the owner reads the purchase; another anonymous session gets 404", async () => {
    const owner = await anonymousCookie(routes.auth.POST);
    const other = await anonymousCookie(routes.auth.POST);
    const [kopi] = fixture.items;

    const created = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", owner, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: kopi!.id, quantity: 2 }] }),
    );
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { purchaseId: string } };

    const mine = await readPurchase(data.purchaseId, owner);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ ok: true, data: { id: data.purchaseId, state: "review_open", payment: null, totalMinor: 2 * kopi!.unitMinor } });

    const theirs = await readPurchase(data.purchaseId, other);
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
