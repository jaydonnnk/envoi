import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// Review creation through the real POST /purchases handler, as envoi_web. PayPal is a labeled
// fixture fake (tests/support/fake-paypal.ts).
describe("review creation", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("review");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
    };
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const create = (cookie: string, body: unknown) => routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, body));
  const count = async (table: "purchases" | "audit_events") => (await fixture.database.admin.unsafe(`select count(*)::int as n from ${table}`))[0]!.n as number;

  it("prices come only from the confirmed revision", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    const [kopi, , teh] = fixture.items;
    const response = await create(cookie, {
      outletId: fixture.outletId,
      rail: "paypal",
      totalSgdCents: 1,
      lines: [
        { menuItemId: kopi!.id, quantity: 1, unitSgdCents: 1, lineSgdCents: 1 },
        { menuItemId: teh!.id, quantity: 2, unitSgdCents: 1, lineSgdCents: 2 },
      ],
    });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { purchaseId: string } };
    const [row] = await fixture.database.admin`select total_sgd_cents, lines from purchases where id = ${data.purchaseId}`;
    expect(row!.total_sgd_cents).toBe(kopi!.unitSgdCents + 2 * teh!.unitSgdCents);
    expect(row!.lines).toEqual([
      { menuItemId: kopi!.id, name: kopi!.name, quantity: 1, unitSgdCents: kopi!.unitSgdCents, lineSgdCents: kopi!.unitSgdCents },
      { menuItemId: teh!.id, name: teh!.name, quantity: 2, unitSgdCents: teh!.unitSgdCents, lineSgdCents: 2 * teh!.unitSgdCents },
    ]);
  });

  it("unknown price never becomes zero", async () => {
    // FIXTURE: a second published outlet whose menu has one item with no price.
    // Its id has the shape newId("out") makes, which the menu read requires since the S14 review fixes.
    const admin = fixture.database.admin;
    await admin`insert into outlets (id, name, area, is_demo_fixture) values ('out_unknownpricefixtureaaaaaaa', 'Unknown Price Fixture', 'Test', true)`;
    await admin`insert into menu_revisions (id, outlet_id, status, confirmed_at) values ('mrv_unknownprice', 'out_unknownpricefixtureaaaaaaa', 'confirmed', now())`;
    await admin`insert into menu_items (id, menu_revision_id, position, name, unit_sgd_cents, available) values
      ('itm_noprice', 'mrv_unknownprice', 0, 'Market price fish', null, true), ('itm_priced', 'mrv_unknownprice', 1, 'Rice', 100, true)`;
    await admin`update outlets set published_menu_revision_id = 'mrv_unknownprice' where id = 'out_unknownpricefixtureaaaaaaa'`;
    await admin`insert into payment_destinations (id, outlet_id, rail, environment, seller_merchant_id, status) values ('dst_unknownprice', 'out_unknownpricefixtureaaaaaaa', 'paypal', 'sandbox', 'FXTRSELLER2AB', 'active')`;
    const before = await count("purchases");

    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await create(cookie, {
      outletId: "out_unknownpricefixtureaaaaaaa",
      rail: "paypal",
      lines: [
        { menuItemId: "itm_noprice", quantity: 1 },
        { menuItemId: "itm_priced", quantity: 1 },
      ],
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "validation_failed", details: { reason: "price_unknown" } } });
    expect(await count("purchases")).toBe(before);
  });

  it("same basket twice returns the same review", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    const body = { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[3]!.id, quantity: 3 }] };
    const responses = await Promise.all([create(cookie, body), create(cookie, body)]);
    const ids = await Promise.all(responses.map(async (response) => ((await response.json()) as { data: { purchaseId: string } }).data.purchaseId));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(ids[0]).toBe(ids[1]);
    const rows = await fixture.database.admin`select id from purchases where id = ${ids[0]!} or checkout_key = (select checkout_key from purchases where id = ${ids[0]!})`;
    expect(rows).toHaveLength(1);
  });

  it("replacement only from a terminal unpaid state", async () => {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const body = { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[1]!.id, quantity: 1 }] };
    const first = (await (await create(cookie, body)).json()) as { data: { purchaseId: string } };
    const started = await routes.start.POST(jsonPost(`/api/v1/purchases/${first.data.purchaseId}/paypal/start`, cookie), routeParams(first.data.purchaseId));
    expect(started.status).toBe(200);
    const [pending] = await fixture.database.admin`select state from purchases where id = ${first.data.purchaseId}`;
    expect(pending!.state).toBe("pending_payment");

    const replacement = await create(cookie, body);
    expect(replacement.status).toBe(409);
    expect(await replacement.json()).toMatchObject({ ok: false, error: { code: "execution_locked" } });
    const rows = await fixture.database.admin`select id from purchases where checkout_key = (select checkout_key from purchases where id = ${first.data.purchaseId})`;
    expect(rows).toHaveLength(1);
  });

  it("rail pyusd is refused before PYUSD exists", async () => {
    const before = { purchases: await count("purchases"), audits: await count("audit_events") };
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await create(cookie, { outletId: fixture.outletId, rail: "pyusd", lines: [{ menuItemId: fixture.items[0]!.id, quantity: 1 }] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "rail_disabled" } } });
    expect({ purchases: await count("purchases"), audits: await count("audit_events") }).toEqual(before);
  });
});
