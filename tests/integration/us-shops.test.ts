import type { Address } from "@solana/kit";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runMaintenance } from "@/domain/maintenance/tasks";
import { assertPyusdEligible } from "@/domain/pyusd/attempts";
import { pyusdAvailability } from "@/domain/pyusd/identity";
import { decodeEmvcoTlv } from "@/domain/sgqr/decode";
import { resolveSgqr } from "@/domain/sgqr/resolve";
import { createOrderBody, type CreateOrderInput, type PayPalWriteClient } from "@/integrations/paypal/orders";
import * as schema from "@/lib/db/schema";
import { connectWeb, type Db } from "@/lib/db/web";
import { approveIdentifier, issueAgentToken } from "@/operator/cli";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { captureEvent, delivery, fakeVerificationFetch, type VerificationCall } from "../support/fake-webhooks";
import { loadDocument, validate } from "../support/openapi";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, FIXTURE_MENU, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { seedPyusdDestination } from "../support/pyusd";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";
import { FIXTURE_UEN, payNowTemplate, sgqrPayload } from "../support/sgqr";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
vi.mock("@/integrations/paypal/orders-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders-read")>()),
  paypalReadClient: () => paypal.client,
}));
const state = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return { ...actual, webEnv: (source?: NodeJS.ProcessEnv) => ({ ...actual.webEnv(source), ...state.env }) };
});

const quiet = () => {};

// S27: US shops and currency-explicit money, against the real schema as envoi_web. PayPal is the
// labeled fixture fake and every order and capture id is FIXTURE-*. The Singapore shop is the seeded
// demo fixture; the US shop is a FIXTURE shop that chose the United States before publishing.
describe("US shops (S27)", () => {
  let fixture: PaymentsFixture;
  let api: ReturnType<typeof shopApi>;
  let us: { shop: Shop; items: { id: string; name: string; unitMinor: number }[] };
  let web: { db: Db; close: () => Promise<void> };
  let maintenance: { db: Db; client: postgres.Sql };
  const verifications: VerificationCall[] = [];
  let routes: MerchantRoutes & {
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
    webhook: typeof import("@/app/api/v1/integrations/paypal/webhook/route");
    outletList: typeof import("@/app/api/v1/outlets/route");
    publicMenu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
    mcp: typeof import("@/app/mcp/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("us_shops");
    vi.stubGlobal("fetch", fakeVerificationFetch(verifications));
    web = connectWeb(fixture.database.webUrl, 2);
    const client = postgres(fixture.database.maintenanceUrl, { max: 2, onnotice: quiet });
    maintenance = { db: drizzle(client, { schema }), client };
    routes = {
      ...(await loadMerchantRoutes()),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
      webhook: await import("@/app/api/v1/integrations/paypal/webhook/route"),
      outletList: await import("@/app/api/v1/outlets/route"),
      publicMenu: await import("@/app/api/v1/outlets/[id]/menu/route"),
      mcp: await import("@/app/mcp/route"),
    };
    api = shopApi(fixture.database, routes);
    const { shop } = await api.publishedShop("us_diner", FIXTURE_MENU, "US");
    us = { shop, items: (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ id: item.id, name: item.name, unitMinor: item.unitMinor! })) };
  });

  afterEach(() => {
    vi.useRealTimers();
    state.env = {};
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await maintenance?.client.end({ timeout: 5 });
    await web?.close();
    await fixture?.database.drop();
  });

  const admin = () => fixture.database.admin;
  const post = (path: string, cookie: string, id: string, handler: (req: Request, ctx: ReturnType<typeof routeParams>) => Promise<Response>) =>
    handler(jsonPost(`/api/v1/purchases/${id}/${path}`, cookie), routeParams(id));

  async function review(fake: FakePayPal, outletId: string, itemId: string, rail: "paypal" | "pyusd" = "paypal") {
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId, rail, lines: [{ menuItemId: itemId, quantity: 2 }] }));
    return { cookie, response, purchaseId: response.status === 201 ? ((await response.json()) as { data: { purchaseId: string } }).data.purchaseId : null };
  }

  // A US purchase whose order the buyer approved. With `lose`, the capture PayPal performed loses its
  // answer, so the purchase is uncertain until a later read decides it.
  async function approvedUsPurchase(fake: FakePayPal, lose: boolean) {
    const { cookie, purchaseId } = await review(fake, us.shop.outletId, us.items[0]!.id);
    expect(purchaseId).not.toBeNull();
    expect((await post("paypal/start", cookie, purchaseId!, routes.start.POST)).status).toBe(200);
    const orderId = fake.calls[0]!.orderId!;
    fake.approve(orderId);
    if (lose) fake.fail("captureOrder", "lose_response");
    return { cookie, purchaseId: purchaseId!, orderId };
  }

  // The provider reports the capture in Singapore dollars, with the same digits, for a USD purchase.
  const sgdCapture = (fake: FakePayPal) => {
    fake.tamper = (order, phase) =>
      phase === "post_capture" ? { ...order, captures: order.captures.map((capture) => ({ ...capture, amount: { currency: "SGD", minor: capture.amount!.minor } })) } : order;
  };

  async function outcome(purchaseId: string) {
    const [row] = await admin()<{ purchase: string; attempt: string; captureId: string | null; currency: string }[]>`
      select p.state as purchase, a.state as attempt, a.capture_id as "captureId", p.currency
      from purchases p join payment_attempts a on a.purchase_id = p.id where p.id = ${purchaseId}`;
    return row!;
  }

  describe("an outlet's country cannot change after its first publication", () => {
    it("the merchant route answers country_locked once the shop has published", async () => {
      const shop = await api.newShop("country_switch");
      for (const country of ["US", "SG", "US"] as const) {
        const response = await api.patchOutlet(shop, { country });
        expect(response.status).toBe(200);
        expect((await envelope<{ outlet: { country: string; currency: string } }>(response)).data.outlet).toMatchObject({ country, currency: country === "US" ? "USD" : "SGD" });
      }

      // A failure inside the route is a failed answer here, never a thrown test.
      const locked = await api.patchOutlet(us.shop, { country: "SG" }).catch(() => null);
      expect(locked?.status).toBe(409);
      expect(await locked?.json()).toMatchObject({ ok: false, error: { code: "country_locked" } });
      expect(await admin()`select country from outlets where id = ${us.shop.outletId}`).toEqual([{ country: "US" }]);
      // Naming the country it already has changes nothing and is not an error.
      expect((await api.patchOutlet(us.shop, { country: "US" })).status).toBe(200);
    });

    it("the database refuses the change itself, whatever the domain does", async () => {
      const unpublished = await api.newShop("country_db");
      const webSql = postgres(fixture.database.webUrl, { max: 1, onnotice: quiet });
      try {
        await webSql`update outlets set country = 'US' where id = ${unpublished.outletId}`;
        expect(await admin()`select country from outlets where id = ${unpublished.outletId}`).toEqual([{ country: "US" }]);
        const refused = await webSql`update outlets set country = 'SG' where id = ${us.shop.outletId}`.then(
          () => null,
          (error: unknown) => error as { code?: string },
        );
        expect(refused?.code).toBe("23514");
        expect(await admin()`select country from outlets where id = ${us.shop.outletId}`).toEqual([{ country: "US" }]);
      } finally {
        await webSql.end({ timeout: 5 });
      }
    });
  });

  it("a US purchase creates a USD PayPal order", async () => {
    const fake = createFakePayPal();
    const sent: CreateOrderInput[] = [];
    const createOrder = fake.client.createOrder.bind(fake.client);
    fake.client.createOrder = (input, requestId) => {
      sent.push(input);
      return createOrder(input, requestId);
    };
    const { cookie, purchaseId } = await review(fake, us.shop.outletId, us.items[0]!.id);
    expect(purchaseId).not.toBeNull();
    expect((await admin()`select currency, total_minor from purchases where id = ${purchaseId}`)[0]).toEqual({ currency: "USD", total_minor: us.items[0]!.unitMinor * 2 });
    expect((await post("paypal/start", cookie, purchaseId!, routes.start.POST)).status).toBe(200);

    expect(sent).toHaveLength(1);
    const body = createOrderBody(sent[0]!) as { purchase_units: { amount: { currency_code: string; value: string; breakdown: { item_total: { currency_code: string } } }; items: { unit_amount: { currency_code: string } }[] }[] };
    const [unit] = body.purchase_units;
    expect(unit!.amount.currency_code).toBe("USD");
    expect(unit!.amount.breakdown.item_total.currency_code).toBe("USD");
    expect(unit!.items.map((item) => item.unit_amount.currency_code)).toEqual(["USD"]);
    expect(await admin()`select currency from payment_attempts where purchase_id = ${purchaseId}`).toEqual([{ currency: "USD" }]);
  });

  describe("a capture in another currency never marks a purchase paid", () => {
    it("control: a USD capture of a US purchase is paid through the return", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await approvedUsPurchase(fake, false);
      expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(200);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "paid", attempt: "capture_confirmed", currency: "USD" });
    });

    it("the return", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await approvedUsPurchase(fake, false);
      sgdCapture(fake);
      expect((await post("paypal/complete", cookie, purchaseId, routes.complete.POST)).status).toBe(200);
      expect(await outcome(purchaseId)).toMatchObject({ purchase: "uncertain", captureId: null });
    });

    it("the reconcile route", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await approvedUsPurchase(fake, true);
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      sgdCapture(fake);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(Date.now() + 31_000));
      expect((await post("reconcile", cookie, purchaseId, routes.reconcile.POST)).status).toBe(200);
      expect(fake.reads().length).toBeGreaterThan(0);
      expect((await outcome(purchaseId)).purchase).not.toBe("paid");
      expect((await outcome(purchaseId)).captureId).toBeNull();
    });

    it("the webhook", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId, orderId } = await approvedUsPurchase(fake, true);
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      sgdCapture(fake);
      // Past the provider-read debounce the buyer's own return just opened.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(Date.now() + 31_000));
      const readsBefore = fake.reads().length;
      const event = captureEvent("PAYMENT.CAPTURE.COMPLETED", orderId, `FIXTURE-CAPTURE-${orderId.slice("FIXTURE-ORDER-".length)}`);
      expect((await routes.webhook.POST(delivery(event))).status).toBe(200);
      expect(fake.reads().length).toBe(readsBefore + 1);
      expect((await outcome(purchaseId)).purchase).not.toBe("paid");
      expect((await outcome(purchaseId)).captureId).toBeNull();
    });

    it("maintenance", async () => {
      const fake = createFakePayPal();
      const { cookie, purchaseId } = await approvedUsPurchase(fake, true);
      await post("paypal/complete", cookie, purchaseId, routes.complete.POST);
      sgdCapture(fake);
      const readsBefore = fake.reads().length;
      await runMaintenance(maintenance.db, { paypal: fake.client, solana: null, now: () => new Date(Date.now() + 31_000), log: quiet }, "manual");
      expect(fake.reads().length).toBeGreaterThan(readsBefore);
      expect((await outcome(purchaseId)).purchase).not.toBe("paid");
      expect((await outcome(purchaseId)).captureId).toBeNull();
    });
  });

  it("PYUSD preparation refuses a purchase that is not in SGD", async () => {
    state.env = { PYUSD_ENABLED: true };
    // Pricing: a US shop gives no PYUSD review at all.
    const atUs = await review(createFakePayPal(), us.shop.outletId, us.items[0]!.id, "pyusd");
    expect(atUs.response.status).toBe(409);
    expect(await atUs.response.json()).toMatchObject({ ok: false, error: { code: "pyusd_unavailable", details: { reason: "not_sgd_shop" } } });

    // Availability on the buyer pages: the reason is the shop's currency, before any other check.
    expect(await pyusdAvailability({ currency: "USD", enabled: true, hasWallet: true, rate: { expired: false } }, () => null)).toMatchObject({ available: false, reason: "not_sgd_shop" });

    // Preparation: an SGD PYUSD review is eligible; the same review in another currency is not.
    // A merchant-created Singapore shop, enrolled and published, with a FIXTURE devnet wallet and rate.
    const sg = await api.publishedShop("pyusd_sg");
    const [sgItem] = await publishedItems(fixture.database, sg.shop.outletId);
    await seedPyusdDestination(fixture.database, sg.shop.outletId, {
      wallet: "FXTRMerchant1111111111111111111111111111111" as Address,
      tokenAccount: "FXTRToken11111111111111111111111111111111111" as Address,
      atomicPerSgd: 742_115n,
      confirmedAt: new Date(Date.now() - 60_000),
    });
    const { cookie, purchaseId } = await review(createFakePayPal(), sg.shop.outletId, sgItem!.id, "pyusd");
    expect(purchaseId).not.toBeNull();
    const session = (await (await routes.auth.GET(new Request(`${TEST_BASE_URL}/api/auth/get-session`, { headers: { cookie } }))).json()) as { user: { id: string } };
    const principal = { kind: "buyer" as const, userId: session.user.id, isAnonymous: true };
    expect(await assertPyusdEligible(web.db, purchaseId!, principal, new Date())).toMatchObject({ eligible: true });
    await admin()`update purchases set currency = 'USD' where id = ${purchaseId}`;
    expect(await assertPyusdEligible(web.db, purchaseId!, principal, new Date())).toMatchObject({ eligible: false, error: { code: "pyusd_unavailable", details: { reason: "not_sgd_shop" } } });
  });

  it("SGQR resolution never returns a US outlet", async () => {
    const uen = FIXTURE_UEN;
    const sg = await api.publishedShop("sgqr_sg");
    // The same approved UEN on a Singapore and a US shop: only the Singapore shop is a candidate.
    for (const shop of [sg.shop, us.shop]) {
      expect((await api.patchOutlet(shop, { identifier: { scheme: "paynow_uen", identifier: uen, distinguisher: `FIXTURE ${shop.outletId}`, payload: null } })).status).toBe(200);
      const [row] = await admin()<{ id: string }[]>`select id from outlet_identifiers where outlet_id = ${shop.outletId} and identifier = ${uen}`;
      expect(await approveIdentifier(drizzle(admin(), { schema }), { identifierId: row!.id, evidenceRef: "FIXTURE: S27 test run" })).toMatchObject({ status: "approved" });
    }
    const resolution = await resolveSgqr(web.db, decodeEmvcoTlv(sgqrPayload([payNowTemplate("2", uen)])));
    expect(resolution).toMatchObject({ kind: "single", outlet: { id: sg.shop.outletId, country: "SG", currency: "SGD" } });
  });

  it("public menu answers carry the currency and match the OpenAPI document", async () => {
    const document = loadDocument();
    const list = await routes.outletList.GET();
    const listed = await list.json();
    expect(validate(document, { $ref: "#/components/schemas/OutletListResponse" }, listed)).toEqual([]);
    const usSummary = (listed as { data: { outlets: { id: string; country: string; currency: string }[] } }).data.outlets.find((outlet) => outlet.id === us.shop.outletId);
    expect(usSummary).toMatchObject({ country: "US", currency: "USD" });

    for (const [outletId, currency] of [
      [us.shop.outletId, "USD"],
      [fixture.outletId, "SGD"],
    ] as const) {
      const menu = await (await routes.publicMenu.GET(new Request(`${TEST_BASE_URL}/api/v1/outlets/${outletId}/menu`), routeParams(outletId))).json();
      expect(validate(document, { $ref: "#/components/schemas/MenuResponse" }, menu)).toEqual([]);
      expect((menu as { data: { currency: string; outlet: { currency: string } } }).data).toMatchObject({ currency, outlet: { currency } });
    }
  });

  it("the MCP tools answer with the currency beside every price", async () => {
    const { token } = await issueAgentToken(drizzle(admin(), { schema }), "FIXTURE S27 agent");
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const response = await routes.mcp.POST(
        new Request(`${TEST_BASE_URL}/mcp`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", host: new URL(TEST_BASE_URL).host, "mcp-protocol-version": "2025-06-18" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
        }),
      );
      const body = (await response.json()) as { result: { content: { text: string }[] } };
      return JSON.parse(body.result.content[0]!.text) as Record<string, unknown>;
    };
    const found = (await callTool("search_outlets", {})) as { outlets: { id: string; currency: string }[] };
    expect(found.outlets.find((outlet) => outlet.id === us.shop.outletId)).toMatchObject({ currency: "USD" });
    for (const [outletId, currency] of [
      [us.shop.outletId, "USD"],
      [fixture.outletId, "SGD"],
    ] as const) {
      const menu = (await callTool("get_menu", { outletId })) as { currency: string; items: { unitMinor: number; currency: string }[] };
      expect(menu.currency).toBe(currency);
      expect(menu.items.length).toBeGreaterThan(0);
      for (const item of menu.items) expect(item).toMatchObject({ unitMinor: expect.any(Number), currency });
    }
  });
});
