import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestAnswer } from "@/domain/purchases/digest";
import type { PayPalOrder } from "@/domain/purchases/reconcile";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { formatMoney, money } from "@/lib/money";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeOpenAI } from "../support/fake-openai";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { jsonRequest, newMerchant, signInCookie } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, FIXTURE_MENU, loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie } from "../support/session";

// S47, the weekly summary: named tests 78 and 79 and the Gate 3 S47 amendment's guards, through the
// real purchase, completion and digest routes as envoi_web on a disposable database. OpenAI and PayPal
// are the labeled FIXTURE fakes at their boundaries.

const platform = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => platform.client!,
}));

const CLEAN = "Your Envoi sales were {{paid_total}} across {{paid_count}} paid orders.";
const WITH_NET = "Your Envoi sales were {{paid_total}} across {{paid_count}} paid orders, and {{net_total}} reached you.";

describe("the weekly summary route", () => {
  let fixture: PaymentsFixture;
  let openai: FakeOpenAI;
  let paypal: FakePayPal;
  let template: string;
  let routes: MerchantRoutes & {
    digest: typeof import("@/app/api/v1/merchant/outlets/[id]/digest/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
  };
  let api: ReturnType<typeof shopApi>;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("digest", FIXTURE_AI_ENV);
    openai = createFakeOpenAI(() => ({ kind: "text", text: JSON.stringify({ template }) }));
    paypal = createFakePayPal();
    platform.client = paypal.client;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.openai.com/")) return openai.fetch(input, init);
      throw new Error(`FIXTURE: unexpected fetch to ${url}`);
    });
    routes = {
      ...(await loadMerchantRoutes()),
      digest: await import("@/app/api/v1/merchant/outlets/[id]/digest/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    };
    api = shopApi(fixture.database, routes);
  });

  beforeEach(async () => {
    openai.calls.length = 0;
    template = CLEAN;
    paypal.tamper = null;
    await fixture.database.admin`delete from rate_limit_hits`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  const label = (name: string) => `digest-${name}-${Math.random().toString(36).slice(2, 8)}`;

  const write = (shop: Pick<Shop, "outletId">, cookie: string | null, body: unknown = { language: "en" }) =>
    routes.digest.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${shop.outletId}/digest`, cookie, body), routeParams(shop.outletId));

  const answer = async (response: Response) => {
    expect(response.status).toBe(200);
    return (await envelope<DigestAnswer>(response)).data;
  };

  // A paid PayPal order of one of each published item. A null fee leaves PayPal's figures unknown.
  async function paidOrder(shop: Shop, feeMinor: number | null): Promise<{ purchaseId: string; grossMinor: number }> {
    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    const [attempt] = await fixture.database.admin<{ order_id: string }[]>`select order_id from payment_attempts where purchase_id = ${purchaseId}`;
    paypal.approve(attempt!.order_id);
    paypal.tamper = (order: PayPalOrder): PayPalOrder => ({
      ...order,
      payerCountry: "US",
      captures: order.captures.map((capture) => ({ ...capture, feeMinor, netMinor: feeMinor === null || capture.amount === null ? null : (capture.amount.minor ?? 0) - feeMinor })),
    });
    await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId));
    paypal.tamper = null;
    const [row] = await fixture.database.admin<{ state: string; g: number }[]>`
      select p.state, a.capture_gross_minor as g from purchases p join payment_attempts a on a.purchase_id = p.id where p.id = ${purchaseId}`;
    expect(row!.state).toBe("paid");
    return { purchaseId, grossMinor: row!.g };
  }

  it("fills a member's summary from code's figures, after one tool-free call that holds no figure or order", async () => {
    const { shop } = await api.publishedShop(label("member"));
    const first = await paidOrder(shop, 50);
    const second = await paidOrder(shop, 70);
    template = WITH_NET;

    const data = await answer(await write(shop, shop.cookie, { language: "ms" }));
    const sgd = (minor: number) => formatMoney(money("SGD", minor));
    const gross = first.grossMinor + second.grossMinor;
    expect(data.digest).toEqual({
      kind: "ok",
      paragraphs: [{ currency: "SGD", text: `Your Envoi sales were ${sgd(gross)} across 2 paid orders, and ${sgd(gross - 120)} reached you.` }],
    });

    expect(openai.calls).toHaveLength(1);
    const call = openai.calls[0]!;
    expect(call.body.tools ?? []).toEqual([]);
    expect(call.body).toMatchObject({ store: false, model: FIXTURE_AI_ENV.AI_MODEL });
    const sent = JSON.stringify(call.body);
    const [outlet] = await fixture.database.admin<{ name: string }[]>`select name from outlets where id = ${shop.outletId}`;
    const needles = [sgd(gross), sgd(gross - 120), String(gross), first.purchaseId, second.purchaseId, shop.outletId, outlet!.name, ...FIXTURE_MENU.map((item) => item.name)];
    // The scanner finds a planted needle on the same serialized surface.
    expect(`${sent}${needles[0]}`).toContain(needles[0]);
    for (const needle of needles) expect(sent).not.toContain(needle);
    expect(sent).toContain("Malay");
    expect(sent).toContain("{{net_total}}");
  });

  describe("78 a digest holding a figure the code did not compute is refused", () => {
    it("shows no text when the model's template holds a figure of its own", async () => {
      const { shop } = await api.publishedShop(label("digit"));
      await paidOrder(shop, 50);
      template = "Your Envoi sales were {{paid_total}} across {{paid_count}} paid orders, 3 more than last week.";
      const data = await answer(await write(shop, shop.cookie));
      expect(data.digest).toEqual({ kind: "refused" });
      expect(openai.calls).toHaveLength(1);
    });

    it("refuses net while a fee is unknown, and never offers it to the model", async () => {
      const { shop } = await api.publishedShop(label("unknown-fee"));
      await paidOrder(shop, 50);
      await paidOrder(shop, null);
      template = WITH_NET;
      const data = await answer(await write(shop, shop.cookie));
      expect(data.digest).toEqual({ kind: "refused" });
      const sent = JSON.stringify(openai.calls[0]!.body);
      expect(sent).toContain("{{paid_total}}");
      expect(sent).not.toContain("{{net_total}}");
      expect(sent).not.toContain("{{fee_total}}");
    });
  });

  describe("79 no sales language is invented on an empty week", () => {
    it("makes no model call and shows no summary for a shop with no paid order", async () => {
      const { shop } = await api.publishedShop(label("empty"));
      const data = await answer(await write(shop, shop.cookie));
      expect(data.digest).toEqual({ kind: "empty" });
      expect(openai.calls).toHaveLength(0);
    });

    it("counts a paid order from before the seven days, or one whose refund PayPal completed, as no sale this week", async () => {
      const { shop } = await api.publishedShop(label("old-refunded"));
      const old = await paidOrder(shop, 50);
      const refunded = await paidOrder(shop, 50);
      await fixture.database.admin`update purchases set created_at = now() - interval '8 days' where id = ${old.purchaseId}`;
      const [user] = await fixture.database.admin<{ id: string }[]>`select id from "user" limit 1`;
      const [attempt] = await fixture.database.admin<{ id: string; capture_id: string }[]>`select id, capture_id from payment_attempts where purchase_id = ${refunded.purchaseId}`;
      // A FIXTURE refund row, as S45's confirmed refund writes it.
      await fixture.database.admin`insert into refunds (id, attempt_id, purchase_id, outlet_id, capture_id, paypal_refund_id, amount_minor, currency, state, confirmed_by_user_id, idempotency_key)
        values (${`ref_${refunded.purchaseId}`}, ${attempt!.id}, ${refunded.purchaseId}, ${shop.outletId}, ${attempt!.capture_id}, ${`FIXTURE-${refunded.purchaseId}`}, ${refunded.grossMinor}, 'SGD', 'completed', ${user!.id}, ${`key_${refunded.purchaseId}`})`;
      const data = await answer(await write(shop, shop.cookie));
      expect(data.digest).toEqual({ kind: "empty" });
      expect(openai.calls).toHaveLength(0);
    });
  });

  it("refuses another merchant, a merchant with no membership, a buyer and no session before the model or the limiter", async () => {
    const { shop } = await api.publishedShop(label("owner"));
    await paidOrder(shop, 50);
    const { shop: other } = await api.publishedShop(label("other"));
    const stranger = await newMerchant(fixture.database, label("stranger"), { membership: false });
    const strangerCookie = await signInCookie(routes.auth.POST, stranger);
    const anonymous = await anonymousCookie(routes.auth.POST);
    for (const [cookie, status] of [
      [other.cookie, 403],
      [strangerCookie, 403],
      [anonymous, 403],
      [null, 401],
    ] as const) {
      const response = await write(shop, cookie);
      expect(response.status).toBe(status);
      expect(await envelope(response)).not.toHaveProperty("data.digest");
    }
    expect(openai.calls).toHaveLength(0);
    expect(await fixture.database.admin`select 1 from rate_limit_hits`).toHaveLength(0);
  });

  it("gives a member of a shop without an approved enrollment no summary and spends nothing", async () => {
    const { shop } = await api.readyShop(label("unapproved"), "enrollment");
    const response = await write(shop, shop.cookie);
    expect(response.status).toBe(404);
    expect(openai.calls).toHaveLength(0);
    expect(await fixture.database.admin`select 1 from rate_limit_hits`).toHaveLength(0);
  });

  it("refuses a language outside the four, before the limiter", async () => {
    const { shop } = await api.publishedShop(label("language"));
    for (const body of [{ language: "fr" }, { language: "en", extra: true }, {}]) expect((await write(shop, shop.cookie, body)).status).toBe(400);
    expect(await fixture.database.admin`select 1 from rate_limit_hits`).toHaveLength(0);
  });

  it("stops the eleventh summary in ten minutes for one shop", async () => {
    const { shop } = await api.publishedShop(label("limit"));
    for (let n = 0; n < 10; n += 1) expect((await write(shop, shop.cookie)).status).toBe(200);
    const refused = await write(shop, shop.cookie);
    expect(refused.status).toBe(429);
    expect(await envelope(refused)).not.toHaveProperty("data.digest");
    const rows = await fixture.database.admin<{ bucket: string }[]>`select bucket from rate_limit_hits`;
    expect(new Set(rows.map((row) => row.bucket))).toEqual(new Set(["merchant_digest"]));
  });
});
