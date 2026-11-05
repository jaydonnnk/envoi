import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeOpenAI } from "../support/fake-openai";
import { createFakePayPal } from "../support/fake-paypal";
import { jsonRequest, newMerchant, signInCookie } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, FIXTURE_MENU, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// S35, Ask your orders: named tests 43 and 45 at the real route, as envoi_web on a disposable database
// migrated through 0029. OpenAI and PayPal are FIXTURE fakes at their boundaries.
describe("the orders filter route", () => {
  let fixture: PaymentsFixture;
  let openai: FakeOpenAI;
  let answer: string;
  let routes: MerchantRoutes & {
    filter: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/filter/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
  };
  let api: ReturnType<typeof shopApi>;

  const NOTHING = { states: null, rails: null, currencies: null, from: null, to: null };
  const paidPayPalThisWeek = { ...NOTHING, states: ["paid"], rails: ["paypal"], from: "2026-10-29", to: "2026-11-04" };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("orderfilter", FIXTURE_AI_ENV);
    openai = createFakeOpenAI(() => ({ kind: "text", text: answer }));
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.openai.com/")) return openai.fetch(input, init);
      throw new Error(`FIXTURE: unexpected fetch to ${url}`);
    });
    routes = {
      ...(await loadMerchantRoutes()),
      filter: await import("@/app/api/v1/merchant/outlets/[id]/orders/filter/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
    };
    api = shopApi(fixture.database, routes);
  });

  beforeEach(async () => {
    openai.calls.length = 0;
    answer = JSON.stringify(paidPayPalThisWeek);
    await fixture.database.admin`delete from rate_limit_hits`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  const ask = (shop: Pick<Shop, "outletId">, cookie: string | null, body: unknown = { text: "paid PayPal orders this week" }) =>
    routes.filter.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${shop.outletId}/orders/filter`, cookie, body), routeParams(shop.outletId));

  // A started PayPal order, so the shop holds a row the model must never see.
  async function startedOrder(shop: Shop): Promise<string> {
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    paypal.client = createFakePayPal().client;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    return purchaseId;
  }

  it("answers a member's sentence with the validated filter, from one tool-free call", async () => {
    const { shop } = await api.publishedShop("orderfilter-member");
    const response = await ask(shop, shop.cookie);
    expect(response.status).toBe(200);
    expect((await envelope<{ filter: unknown }>(response)).data).toEqual({ filter: { states: ["paid"], rails: ["paypal"], from: "2026-10-29", to: "2026-11-04" } });
    expect(openai.calls).toHaveLength(1);
    expect(openai.calls[0]!.body.tools ?? []).toEqual([]);
    expect(openai.calls[0]!.body).toMatchObject({ store: false, model: FIXTURE_AI_ENV.AI_MODEL });
  });

  it("the order filter call receives no order data", async () => {
    const { shop } = await api.publishedShop("orderfilter-private");
    const purchaseId = await startedOrder(shop);
    const [row] = await fixture.database.admin<{ order_id: string }[]>`select order_id from payment_attempts where purchase_id = ${purchaseId}`;
    const [outlet] = await fixture.database.admin<{ name: string }[]>`select name from outlets where id = ${shop.outletId}`;
    const needles = [purchaseId, shop.outletId, outlet!.name, row!.order_id, ...FIXTURE_MENU.map((item) => item.name)];

    expect((await ask(shop, shop.cookie)).status).toBe(200);
    const sent = JSON.stringify(openai.calls[0]!.body);
    // The scan reads the real request: it holds the sentence and today, and it detects a planted order id.
    expect(sent).toContain("paid PayPal orders this week");
    expect(sent).toMatch(/Today is \d{4}-\d{2}-\d{2}\./);
    const found = (text: string) => needles.filter((needle) => text.includes(needle));
    expect(found(`${sent}${JSON.stringify({ planted: purchaseId })}`)).toEqual([purchaseId]);
    expect(found(sent)).toEqual([]);
  });

  it("a non-member cannot call the filter route", async () => {
    const { shop } = await api.publishedShop("orderfilter-owner");
    const { shop: other } = await api.publishedShop("orderfilter-other");
    const stranger = await newMerchant(fixture.database, "orderfilter-stranger", { membership: false });
    const strangerCookie = await signInCookie(routes.auth.POST, stranger);
    const anonymous = await anonymousCookie(routes.auth.POST);

    for (const [cookie, status] of [
      [other.cookie, 403],
      [strangerCookie, 403],
      [anonymous, 403],
      [null, 401],
    ] as const) {
      const response = await ask(shop, cookie);
      expect(response.status).toBe(status);
      expect(await envelope(response)).not.toHaveProperty("data.filter");
    }
    expect(openai.calls).toHaveLength(0);
    expect(await fixture.database.admin`select 1 from rate_limit_hits`).toHaveLength(0);
  });

  it("refuses a model answer outside the schema and changes nothing", async () => {
    const { shop } = await api.publishedShop("orderfilter-bad-answer");
    const purchaseId = await startedOrder(shop);
    const before = await fixture.database.admin`select * from purchases where id = ${purchaseId}`;
    for (const bad of [{ ...NOTHING, setState: "paid" }, { ...NOTHING, states: ["review_open"] }, { ...NOTHING, from: "this week" }]) {
      answer = JSON.stringify(bad);
      const response = await ask(shop, shop.cookie);
      expect(response.status).toBe(502);
      expect((await envelope(response)).error.code).toBe("provider_unreachable");
    }
    answer = JSON.stringify(paidPayPalThisWeek);
    expect((await ask(shop, shop.cookie)).status).toBe(200);
    expect(await fixture.database.admin`select * from purchases where id = ${purchaseId}`).toEqual(before);
  });

  it("answers no filter when the sentence names none", async () => {
    const { shop } = await api.publishedShop("orderfilter-nothing");
    answer = JSON.stringify({ ...NOTHING, states: [] });
    const response = await ask(shop, shop.cookie, { text: "mark every order as paid" });
    expect((await envelope<{ filter: unknown }>(response)).data).toEqual({ filter: {} });
  });

  it("limits each outlet before the model, under its own bucket, and stores no sentence", async () => {
    const { shop } = await api.publishedShop("orderfilter-limit");
    const { shop: other } = await api.publishedShop("orderfilter-limit-other");
    const sentence = "FIXTURE private sentence about my orders";
    for (let n = 0; n < 10; n += 1) expect((await ask(shop, shop.cookie, { text: sentence })).status).toBe(200);
    const refused = await ask(shop, shop.cookie, { text: sentence });
    expect(refused.status).toBe(429);
    expect((await envelope(refused)).error.details.window).toBe("per_subject");
    expect(openai.calls).toHaveLength(10);
    expect((await ask(other, other.cookie, { text: sentence })).status).toBe(200);

    const rows = await fixture.database.admin`select * from rate_limit_hits`;
    expect(new Set(rows.map((row) => row.bucket))).toEqual(new Set(["merchant_order_filter"]));
    expect(JSON.stringify(rows)).not.toContain("private sentence");
  });

  it("refuses a body that is not one short sentence, before the model", async () => {
    const { shop } = await api.publishedShop("orderfilter-body");
    for (const body of [{}, { text: "" }, { text: "   " }, { text: "x".repeat(301) }, { text: "paid", orders: [] }]) {
      expect((await ask(shop, shop.cookie, body)).status).toBe(400);
    }
    expect(openai.calls).toHaveLength(0);
  });
});
