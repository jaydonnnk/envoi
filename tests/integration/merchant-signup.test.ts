import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_CONSENT_VERSION, WEB_MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import { importRuntime } from "@/domain/imports/request";
import { draftMenuFromPhoto } from "@/integrations/ai/menu-vision";
import { draftMenuFromPageText } from "@/integrations/ai/menu-web";
import { readPageText } from "@/integrations/browser/kernel";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import * as schema from "@/lib/db/schema";
import { approveEnrollment, assignPayPalDestination, approveMembership, createMerchant } from "@/operator/cli";
import { createFakeKernel, FIXTURE_PAGE_TEXT, isKernelUrl } from "../support/fake-kernel";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { FIXTURE_BOUNDS, FIXTURE_VISION_ENV, createFakeVision, fixturePolicy, importRequest, photoBody, solidJpeg, visionItem } from "../support/menu-import";
import { jsonRequest, newMerchant, signInCookie } from "../support/merchant";
import { createPaymentsFixture, FIXTURE_SELLER, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { envelope, FIXTURE_MENU, loadMerchantRoutes, publishedItems, shopApi, type DraftJson, type MerchantRoutes, type Shop } from "../support/publication";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// S43 named tests 89 to 98 and the guards of the Gate 3 S43 amendment, through the real routes and
// the real Better Auth handler as envoi_web on a disposable database migrated through 0035. PayPal
// writes are a FIXTURE fake at PayPalWriteClient; Kernel and the model are FIXTURE fakes at their
// fetch boundary, and every outbound fetch is recorded. Passwords and addresses are FIXTURE values
// from the documentation ranges, never real ones.

const platform = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => platform.client,
}));

// FIXTURE: a second sandbox-style seller id in PayPal's id alphabet. Not a real account.
const REQUESTED_SELLER = "FXTRSELLER3CD";
const PASSWORD = "FIXTURE-signup-password-0001";
const FIXTURE_WEB_MODEL = "FIXTURE-web-text-model";
const SPEND_ENV = { ...FIXTURE_VISION_ENV, WEB_IMPORTS_ENABLED: "true", AI_WEB_MENU_MODEL: FIXTURE_WEB_MODEL, KERNEL_API_KEY: "FIXTURE-kernel-key" };

type SignupRoutes = MerchantRoutes & {
  request: typeof import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/request/route");
  orders: typeof import("@/app/api/v1/merchant/outlets/[id]/orders/route");
  photo: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route");
  web: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-imports/web/route");
  copilot: typeof import("@/app/api/v1/merchant/outlets/[id]/copilot/route");
  purchases: typeof import("@/app/api/v1/purchases/route");
  purchase: typeof import("@/app/api/v1/purchases/[id]/route");
  start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
  complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
  publicOutlets: typeof import("@/app/api/v1/outlets/route");
  publicMenu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
};

async function loadRoutes(): Promise<SignupRoutes> {
  return {
    ...(await loadMerchantRoutes()),
    request: await import("@/app/api/v1/merchant/outlets/[id]/destinations/paypal/request/route"),
    orders: await import("@/app/api/v1/merchant/outlets/[id]/orders/route"),
    photo: await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route"),
    web: await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/web/route"),
    copilot: await import("@/app/api/v1/merchant/outlets/[id]/copilot/route"),
    purchases: await import("@/app/api/v1/purchases/route"),
    purchase: await import("@/app/api/v1/purchases/[id]/route"),
    start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
    complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
    publicOutlets: await import("@/app/api/v1/outlets/route"),
    publicMenu: await import("@/app/api/v1/outlets/[id]/menu/route"),
  };
}

let fixture: PaymentsFixture;
let routes: SignupRoutes;
let paypal: FakePayPal;
// Every outbound fetch the app makes, by URL. Kernel and the model answer from FIXTURE fakes.
const fetched: string[] = [];
let addressSeq = 0;
// A fresh FIXTURE address from 198.18.0.0/15 (benchmarking range) for each sign-up, so the
// per-address window of one test never refuses another's.
const freshAddress = () => `198.18.${Math.floor(addressSeq / 250)}.${(addressSeq++ % 250) + 1}`;

const counts = () => fixture.database.admin<{ users: number; accounts: number; sessions: number; outlets: number; memberships: number; enrollments: number; destinations: number }[]>`
  select (select count(*)::int from "user") as users, (select count(*)::int from account) as accounts, (select count(*)::int from session) as sessions,
    (select count(*)::int from outlets) as outlets, (select count(*)::int from merchant_memberships) as memberships,
    (select count(*)::int from enrollments) as enrollments, (select count(*)::int from payment_destinations) as destinations`.then((rows) => rows[0]!);

function signUpRequest(email: string, options: { forwardedFor?: string | null; cookie?: string } = {}): Request {
  const forwardedFor = options.forwardedFor === undefined ? freshAddress() : options.forwardedFor;
  return new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: TEST_BASE_URL,
      ...(forwardedFor === null ? {} : { "x-forwarded-for": forwardedFor }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify({ email, password: PASSWORD, name: "FIXTURE stall owner" }),
  });
}

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

let emailSeq = 0;
const freshEmail = (label: string) => `${label}-${emailSeq++}@signup.example.test`;

async function signUp(label: string, options: { forwardedFor?: string | null; cookie?: string } = {}): Promise<{ cookie: string; userId: string; email: string }> {
  const email = freshEmail(label);
  const response = await routes.auth.POST(signUpRequest(email, options));
  expect(response.status, `${label}: sign-up`).toBe(200);
  const [user] = await fixture.database.admin<{ id: string }[]>`select id from "user" where email = ${email}`;
  return { cookie: cookieOf(response), userId: user!.id, email };
}

const createShop = (cookie: string, name = "FIXTURE signup kopi") => routes.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name, area: "Tanjong Pagar" }));

const requestSeller = (shop: Pick<Shop, "outletId" | "cookie">, sellerMerchantId: string) =>
  routes.request.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${shop.outletId}/destinations/paypal/request`, shop.cookie, { sellerMerchantId }), routeParams(shop.outletId));

// One stranger's sign-up, shop and seller request, as the sign-up form sends them.
async function signedUpShop(label: string): Promise<Shop & { userId: string }> {
  const account = await signUp(label);
  const created = await createShop(account.cookie, `FIXTURE ${label} kopi`);
  expect(created.status, `${label}: shop`).toBe(201);
  const outletId = (await envelope<{ outlet: { id: string } }>(created)).data.outlet.id;
  expect((await requestSeller({ outletId, cookie: account.cookie }, REQUESTED_SELLER)).status, `${label}: seller request`).toBe(200);
  return { merchant: { email: account.email, password: PASSWORD, userId: account.userId }, cookie: account.cookie, outletId, userId: account.userId };
}

beforeAll(async () => {
  fixture = await createPaymentsFixture("signup", { MERCHANT_SIGNUP_ENABLED: "true", ...SPEND_ENV });
  paypal = createFakePayPal();
  platform.client = paypal.client;
  const kernel = createFakeKernel(() => ({ kind: "page", text: FIXTURE_PAGE_TEXT }));
  const vision = createFakeVision(() => ({ kind: "answer", output: { items: [visionItem("Kopi C", "1.80")] } }));
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    fetched.push(url);
    return isKernelUrl(url) ? kernel.fetch(input, init) : vision.fetch(input, init);
  }) as typeof globalThis.fetch);
  importRuntime.policy = fixturePolicy(1_000_000, [FIXTURE_BOUNDS, { ...FIXTURE_BOUNDS, model: FIXTURE_WEB_MODEL }]);
  importRuntime.limits = { outletInFlight: 1, globalInFlight: 100, outletDaily: 10, globalDaily: 1_000 };
  importRuntime.now = () => new Date();
  importRuntime.draft = draftMenuFromPhoto;
  importRuntime.readPage = readPageText;
  importRuntime.draftWeb = draftMenuFromPageText;
  routes = await loadRoutes();
});

beforeEach(async () => {
  await fixture.database.admin`delete from rate_limit_hits`;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await fixture?.database.drop();
});

describe("S43 merchant sign-up with MERCHANT_SIGNUP_ENABLED=true", () => {
  it("89: a sign-up, a shop and a seller request leave one labeled pending shop and no destination", async () => {
    const before = await counts();
    const shop = await signedUpShop("t89");
    expect(await counts()).toEqual({ ...before, users: before.users + 1, accounts: before.accounts + 1, sessions: before.sessions + 1, outlets: before.outlets + 1, memberships: before.memberships + 1, enrollments: before.enrollments + 1 });
    const rows = await fixture.database.admin`
      select m.outlet_id, m.revoked_at, o.self_signup, o.is_demo_fixture, o.published_menu_revision_id, e.status, e.is_demo, e.requested_seller_merchant_id,
        (select count(*)::int from payment_destinations d where d.outlet_id = o.id) as destinations
      from merchant_memberships m join outlets o on o.id = m.outlet_id join enrollments e on e.outlet_id = o.id where m.user_id = ${shop.userId}`;
    expect(rows).toEqual([
      { outlet_id: shop.outletId, revoked_at: null, self_signup: true, is_demo_fixture: true, published_menu_revision_id: null, status: "pending", is_demo: true, requested_seller_merchant_id: REQUESTED_SELLER, destinations: 0 },
    ]);
    // The member reads its own shop with the marker and the request it submitted.
    const list = await envelope<{ outlets: { id: string; selfSignup: boolean; requestedSeller: { merchantId: string } | null; enrollment: string }[] }>(
      await routes.outlets.GET(jsonRequest("GET", "/api/v1/merchant/outlets", shop.cookie)),
    );
    expect(list.data.outlets).toEqual([expect.objectContaining({ id: shop.outletId, selfSignup: true, enrollment: "pending", requestedSeller: expect.objectContaining({ merchantId: REQUESTED_SELLER }) })]);
    const audits = await fixture.database.admin<{ action: string }[]>`select action from audit_events where outlet_id = ${shop.outletId} and action in ('outlet_self_created', 'paypal_seller_requested') order by at, action`;
    expect(audits.map((row) => row.action).sort()).toEqual(["outlet_self_created", "paypal_seller_requested"]);
  });

  it("91: the pending shop cannot publish and a purchase for it is refused with no attempt row", async () => {
    const shop = await signedUpShop("t91");
    const api = shopApi(fixture.database, routes);
    const draft = await api.confirmDraft(shop, await api.saveDraft(shop, await api.getDraft(shop), FIXTURE_MENU));
    await api.confirmDetails(shop);
    const published = await api.publish(shop, draft);
    expect(published.status).toBe(400);
    expect((await envelope(published)).error).toMatchObject({ code: "validation_failed", details: { reason: "preconditions", missing: "enrollment,destination" } });
    const [item] = await fixture.database.admin<{ id: string }[]>`select id from menu_items where menu_revision_id = ${draft.revisionId} limit 1`;
    const buyer = await anonymousCookie(routes.auth.POST);
    const purchase = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines: [{ menuItemId: item!.id, quantity: 1 }] }));
    expect(purchase.status).toBe(404);
    const [rows] = await fixture.database.admin<{ purchases: number; attempts: number }[]>`
      select (select count(*)::int from purchases where outlet_id = ${shop.outletId}) as purchases,
        (select count(*)::int from payment_attempts a join purchases p on p.id = a.purchase_id where p.outlet_id = ${shop.outletId}) as attempts`;
    expect(rows).toEqual({ purchases: 0, attempts: 0 });
    expect(await fixture.database.admin`select published_menu_revision_id from outlets where id = ${shop.outletId} and published_menu_revision_id is not null`).toHaveLength(0);
  });

  async function approvedShop(label: string): Promise<{ shop: Shop & { userId: string }; draft: DraftJson }> {
    const shop = await signedUpShop(label);
    const api = shopApi(fixture.database, routes);
    const draft = await api.confirmDraft(shop, await api.saveDraft(shop, await api.getDraft(shop), FIXTURE_MENU));
    await api.confirmDetails(shop);
    const operator = drizzle(fixture.database.admin, { schema });
    // The operator connects the seller id the member requested, then approves the shop.
    const [requested] = await fixture.database.admin<{ seller: string }[]>`select requested_seller_merchant_id as seller from enrollments where outlet_id = ${shop.outletId}`;
    await assignPayPalDestination(operator, shop.outletId, requested!.seller);
    await approveEnrollment(operator, { outletId: shop.outletId, evidenceRef: "FIXTURE: S43 test run" });
    expect((await api.putConnection(shop, { sellerMerchantId: requested!.seller })).status).toBe(200);
    return { shop, draft };
  }

  it("92: after the operator connects and approves it, the member's shop publishes", async () => {
    const { shop, draft } = await approvedShop("t92");
    const response = await shopApi(fixture.database, routes).publish(shop, draft);
    expect(response.status).toBe(200);
    const [row] = await fixture.database.admin`
      select o.published_menu_revision_id is not null as published, e.status, d.seller_merchant_id as seller
      from outlets o join enrollments e on e.outlet_id = o.id join payment_destinations d on d.outlet_id = o.id and d.rail = 'paypal' where o.id = ${shop.outletId}`;
    expect(row).toEqual({ published: true, status: "approved", seller: REQUESTED_SELLER });
  });

  it("93: the signed-up account is refused on another merchant's outlet, draft, orders, destination and request", async () => {
    const intruder = await signedUpShop("t93-intruder");
    const victim = await signedUpShop("t93-victim");
    const [draft] = await fixture.database.admin<{ id: string; version: number }[]>`select id, version from menu_revisions where outlet_id = ${victim.outletId}`;
    const at = (path: string, method: string, payload?: unknown) => jsonRequest(method, `/api/v1/merchant/outlets/${victim.outletId}${path}`, intruder.cookie, payload);
    const p = routeParams(victim.outletId);
    const before = await fixture.database.admin`select o.name, e.requested_seller_merchant_id, r.version from outlets o join enrollments e on e.outlet_id = o.id join menu_revisions r on r.outlet_id = o.id where o.id = ${victim.outletId}`;
    const responses = [
      await routes.outlet.PATCH(at("", "PATCH", { name: "Renamed", area: "Elsewhere" }), p),
      await routes.draft.GET(at("/menu-draft", "GET"), p),
      await routes.draft.PUT(at("/menu-draft", "PUT", { revisionId: draft!.id, version: draft!.version, items: [] }), p),
      await routes.confirm.POST(at("/confirm", "POST", { revisionId: draft!.id, version: draft!.version }), p),
      await routes.orders.GET(at("/orders", "GET"), p),
      await routes.destination.PUT(at("/destinations/paypal", "PUT", { sellerMerchantId: FIXTURE_SELLER }), p),
      await routes.publish.POST(at("/publish", "POST", { revisionId: draft!.id, version: draft!.version }), p),
      await routes.request.POST(at("/destinations/paypal/request", "POST", { sellerMerchantId: FIXTURE_SELLER }), p),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await envelope(response)).error.code).toBe("forbidden_membership");
    }
    expect(await fixture.database.admin`select o.name, e.requested_seller_merchant_id, r.version from outlets o join enrollments e on e.outlet_id = o.id join menu_revisions r on r.outlet_id = o.id where o.id = ${victim.outletId}`).toEqual(before);
  });

  it("94: the fourth sign-up from one address and the thirty-first in all answer 429 and create nothing", async () => {
    const usersOf = (email: string) => fixture.database.admin<{ n: number }[]>`
      select (select count(*)::int from "user" where email = ${email}) + (select count(*)::int from account a join "user" u on u.id = a.user_id where u.email = ${email})
        + (select count(*)::int from session s join "user" u on u.id = s.user_id where u.email = ${email}) as n`.then((rows) => rows[0]!.n);
    const one = "203.0.113.7";
    for (let i = 0; i < 3; i += 1) await signUp(`t94-same-${i}`, { forwardedFor: one });
    const fourth = freshEmail("t94-fourth");
    const refused = await routes.auth.POST(signUpRequest(fourth, { forwardedFor: one }));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED", message: "Too many sign-ups for now. No account was created." });
    expect(await usersOf(fourth)).toBe(0);
    // A refusal from a buyer session creates nothing either and leaves the anonymous user alone.
    const buyer = await anonymousCookie(routes.auth.POST);
    const everyone = () => fixture.database.admin`select id, is_anonymous from "user" order by id`;
    const usersBefore = await everyone();
    const fromBuyer = freshEmail("t94-buyer");
    expect((await routes.auth.POST(signUpRequest(fromBuyer, { forwardedFor: one, cookie: buyer }))).status).toBe(429);
    expect(await usersOf(fromBuyer)).toBe(0);
    expect(await everyone()).toEqual(usersBefore);
    for (let i = 0; i < 27; i += 1) await signUp(`t94-many-${i}`);
    const thirtyFirst = freshEmail("t94-thirty-first");
    const global = await routes.auth.POST(signUpRequest(thirtyFirst));
    expect(global.status).toBe(429);
    expect(await usersOf(thirtyFirst)).toBe(0);
  });

  it("guard: only the sign-up path is limited", async () => {
    const merchant = await newMerchant(fixture.database, "t-path", { membership: false });
    const one = "203.0.113.9";
    for (let i = 0; i < 4; i += 1) {
      const response = await routes.auth.POST(
        new Request(`${TEST_BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: TEST_BASE_URL, "x-forwarded-for": one },
          body: JSON.stringify({ email: merchant.email, password: merchant.password }),
        }),
      );
      expect(response.status, `sign-in ${i + 1}`).toBe(200);
    }
    expect(await fixture.database.admin`select id from rate_limit_hits where bucket = 'merchant_signup'`).toHaveLength(0);
  });

  it("guard: the subject is the last x-forwarded-for entry and no address is stored", async () => {
    const last = "203.0.113.44";
    // A client can put anything first; only the entry the nearest proxy appends counts.
    for (let i = 0; i < 3; i += 1) await signUp(`t-xff-${i}`, { forwardedFor: `192.0.2.${i + 1}, ${last}` });
    const refused = await routes.auth.POST(signUpRequest(freshEmail("t-xff-fourth"), { forwardedFor: `192.0.2.99, ${last}` }));
    expect(refused.status).toBe(429);
    // Different last entries are different subjects even with one first entry.
    await signUp("t-xff-other", { forwardedFor: `192.0.2.1, 203.0.113.45` });

    const stored = () => fixture.database.admin`select * from rate_limit_hits`.then((rows) => JSON.stringify(rows));
    const needles = [last, "203.0.113.45", "192.0.2.1"];
    // Self-test: the scan finds an address written into the table it reads.
    await fixture.database.admin`insert into rate_limit_hits (id, bucket, subject, at) values ('rlh_fixtureneedle', 'merchant_signup', ${last}, now())`;
    expect(await stored()).toContain(last);
    await fixture.database.admin`delete from rate_limit_hits where id = 'rlh_fixtureneedle'`;
    const surface = await stored();
    expect(surface).toContain("merchant_signup");
    for (const needle of needles) expect(surface).not.toContain(needle);
  });

  it("95: a buyer session that signs up keeps its purchases' owner and gives the anonymous user no membership", async () => {
    const buyer = await anonymousCookie(routes.auth.POST);
    const [kopi] = fixture.items;
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: kopi!.id, quantity: 1 }] }));
    expect(created.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    const [owner] = await fixture.database.admin<{ id: string }[]>`select buyer_user_id as id from purchases where id = ${purchaseId}`;
    const account = await signUp("t95", { cookie: buyer });
    expect((await createShop(account.cookie)).status).toBe(201);
    const [after] = await fixture.database.admin`select p.buyer_user_id, u.is_anonymous from purchases p join "user" u on u.id = p.buyer_user_id where p.id = ${purchaseId}`;
    expect(after).toEqual({ buyer_user_id: owner!.id, is_anonymous: true });
    expect(await fixture.database.admin`select id from merchant_memberships where user_id = ${owner!.id}`).toHaveLength(0);
    expect(await fixture.database.admin`select id from merchant_memberships where user_id = ${account.userId}`).toHaveLength(1);
  });

  it("96: a second shop for one account is refused and two concurrent creations make one shop", async () => {
    const shop = await signedUpShop("t96");
    const before = await counts();
    const second = await createShop(shop.cookie, "FIXTURE second kopi");
    expect(second.status).toBe(403);
    expect((await envelope(second)).error.code).toBe("forbidden_membership");
    expect(await counts()).toEqual(before);

    const racer = await signUp("t96-race");
    const raced = await Promise.all([createShop(racer.cookie, "FIXTURE race one"), createShop(racer.cookie, "FIXTURE race two")]);
    expect(raced.map((response) => response.status).sort()).toEqual([201, 403]);
    // Which layer refuses the loser depends on timing; the lock guard below proves the database's.
    expect((await envelope(raced.find((response) => response.status === 403)!)).error.code).toBe("forbidden_membership");
    expect(await fixture.database.admin`select id from merchant_memberships where user_id = ${racer.userId}`).toHaveLength(1);
  });

  it("guard: an account whose only membership is revoked gets the one-shop refusal from the database", async () => {
    const merchant = await newMerchant(fixture.database, "t-revoked", { membership: true });
    await fixture.database.admin`update merchant_memberships set revoked_at = now() where user_id = ${merchant.userId}`;
    const cookie = await signInCookie(routes.auth.POST, merchant);
    const before = await counts();
    // A thrown error is captured as a value, so a missing refusal fails on the assertion below.
    const response: unknown = await createShop(cookie, "FIXTURE revoked kopi").catch((error: unknown) => error);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect((await envelope(response as Response)).error).toMatchObject({ code: "forbidden_membership", message: "This account already has a shop. One shop per account." });
    expect(await counts()).toEqual(before);
  });

  // The definer function's own checks, called as envoi_web, the only role that may execute it.
  describe("guard: create_self_signup_outlet", () => {
    let web: postgres.Sql;
    beforeAll(() => {
      web = postgres(fixture.database.webUrl, { max: 3, onnotice: () => {} });
    });
    afterAll(async () => {
      await web?.end();
    });
    const create = (sql: postgres.Sql | postgres.TransactionSql, userId: string, name: string) =>
      sql`select create_self_signup_outlet(${userId}, ${name}, 'Tanjong Pagar', now()) as id`.then((rows) => rows[0]!.id as string);
    const outletsNamed = (name: string) => fixture.database.admin`select id from outlets where name = ${name}`;

    it("refuses an anonymous user", async () => {
      const buyer = await anonymousCookie(routes.auth.POST);
      const session = (await (await routes.auth.GET(jsonRequest("GET", "/api/auth/get-session", buyer))).json()) as { user: { id: string; isAnonymous: boolean } };
      expect(session.user.isAnonymous).toBe(true);
      await expect(create(web, session.user.id, "FIXTURE anon shop")).rejects.toThrow(/self_signup_refused: no permanent account/);
      expect(await outletsNamed("FIXTURE anon shop")).toHaveLength(0);
    });

    it("refuses a user with any membership row, approved and unbound included", async () => {
      const operator = drizzle(fixture.database.admin, { schema });
      const email = freshEmail("t-unbound");
      const { userId } = await createMerchant(operator, { email, name: "FIXTURE unbound", password: PASSWORD });
      await approveMembership(operator, { email, evidenceRef: "FIXTURE: S43 test run" });
      await expect(create(web, userId, "FIXTURE unbound shop")).rejects.toThrow(/self_signup_refused: one shop per account/);
      expect(await outletsNamed("FIXTURE unbound shop")).toHaveLength(0);
    });

    it("locks the user row, so a second call waits for the first and is then refused", async () => {
      const account = await signUp("t-lock");
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let firstDone!: () => void;
      const firstCreated = new Promise<void>((resolve) => (firstDone = resolve));
      const first = web.begin(async (tx) => {
        await create(tx, account.userId, "FIXTURE lock one");
        firstDone();
        await held;
      });
      await firstCreated;
      const second = web.begin((tx) => create(tx, account.userId, "FIXTURE lock two")).then(
        () => "created",
        (error: Error) => error.message,
      );
      // The second call is given time to finish if nothing makes it wait.
      await new Promise((resolve) => setTimeout(resolve, 400));
      release();
      await first;
      expect(await second).toMatch(/self_signup_refused: one shop per account/);
      expect(await fixture.database.admin`select id from merchant_memberships where user_id = ${account.userId}`).toHaveLength(1);
    });
  });

  it("guard: the seller request checks the id format and refuses once the shop is approved", async () => {
    const shop = await signedUpShop("t-request");
    const malformed = await requestSeller(shop, "FXTRSELLER0O1");
    expect(malformed.status).toBe(400);
    expect((await envelope(malformed)).error).toMatchObject({ code: "validation_failed", details: { reason: "seller_id_format" } });
    expect((await requestSeller(shop, "FXTRSELLER4EF")).status).toBe(200);
    const [pending] = await fixture.database.admin`select requested_seller_merchant_id as seller from enrollments where outlet_id = ${shop.outletId}`;
    expect(pending).toEqual({ seller: "FXTRSELLER4EF" });
    await approveEnrollment(drizzle(fixture.database.admin, { schema }), { outletId: shop.outletId, evidenceRef: "FIXTURE: S43 test run" });
    const late = await requestSeller(shop, "FXTRSELLER5GH");
    expect(late.status).toBe(400);
    expect((await envelope(late)).error).toMatchObject({ code: "validation_failed", details: { reason: "enrollment_approved" } });
    const [after] = await fixture.database.admin`select requested_seller_merchant_id as seller from enrollments where outlet_id = ${shop.outletId}`;
    expect(after).toEqual({ seller: "FXTRSELLER4EF" });
  });

  it("97: the pending shop's photo import, web import and copilot answer not_found and call no Kernel or model", async () => {
    const shop = await signedUpShop("t97");
    const api = shopApi(fixture.database, routes);
    const base = (await api.getDraft(shop)).revisionId;
    const jpeg = await solidJpeg();
    const spend = async () => [
      await routes.photo.POST(importRequest(shop.outletId, shop.cookie, photoBody(jpeg), { baseRevisionId: base, headers: { "envoi-consent-version": MENU_CONSENT_VERSION } }), routeParams(shop.outletId)),
      await routes.web.POST(
        jsonRequest("POST", `/api/v1/merchant/outlets/${shop.outletId}/menu-imports/web`, shop.cookie, { url: "https://fixture-shop.example/menu", consentVersion: WEB_MENU_CONSENT_VERSION, baseRevisionId: base }),
        routeParams(shop.outletId),
      ),
      await routes.copilot.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${shop.outletId}/copilot`, shop.cookie, { turns: [{ role: "user", text: "FIXTURE question" }] }), routeParams(shop.outletId)),
    ];
    fetched.length = 0;
    for (const response of await spend()) {
      expect(response.status).toBe(404);
      expect((await envelope(response)).error.code).toBe("not_found");
    }
    expect(fetched).toEqual([]);
    expect(await fixture.database.admin`select id from rate_limit_hits where bucket <> 'merchant_signup'`).toHaveLength(0);
    expect(await fixture.database.admin`select id from menu_imports where outlet_id = ${shop.outletId}`).toHaveLength(0);

    // Control: once the operator approves the shop, the same photo import reaches the FIXTURE model.
    await approveEnrollment(drizzle(fixture.database.admin, { schema }), { outletId: shop.outletId, evidenceRef: "FIXTURE: S43 test run" });
    const photo = await routes.photo.POST(importRequest(shop.outletId, shop.cookie, photoBody(jpeg), { baseRevisionId: base }), routeParams(shop.outletId));
    expect(photo.status).toBe(200);
    expect(fetched.length).toBeGreaterThan(0);
  });

  it("98: the approved self-created shop shows its test label on the list, shop, review and receipt screens", async () => {
    const { shop, draft } = await approvedShop("t98");
    expect((await shopApi(fixture.database, routes).publish(shop, draft)).status).toBe(200);
    const list = await envelope<{ outlets: { id: string; isDemoFixture: boolean }[] }>(await routes.publicOutlets.GET());
    expect(list.data.outlets.find((outlet) => outlet.id === shop.outletId)).toMatchObject({ isDemoFixture: true });
    const menu = await envelope<{ outlet: { id: string; isDemoFixture: boolean } }>(await routes.publicMenu.GET(new Request(`${TEST_BASE_URL}/api/v1/outlets/${shop.outletId}/menu`), routeParams(shop.outletId)));
    expect(menu.data.outlet).toMatchObject({ id: shop.outletId, isDemoFixture: true });

    const buyer = await anonymousCookie(routes.auth.POST);
    const lines = (await publishedItems(fixture.database, shop.outletId)).map((item) => ({ menuItemId: item.id, quantity: 1 }));
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", buyer, { outletId: shop.outletId, rail: "paypal", lines }));
    expect(created.status).toBe(201);
    const purchaseId = (await envelope<{ purchaseId: string }>(created)).data.purchaseId;
    const read = async () => (await envelope<{ outletIsDemoFixture: boolean; state: string }>(await routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { cookie: buyer } }), routeParams(purchaseId)))).data;
    expect(await read()).toMatchObject({ outletIsDemoFixture: true });
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, buyer), routeParams(purchaseId))).status).toBe(200);
    const [attempt] = await fixture.database.admin<{ order_id: string }[]>`select order_id from payment_attempts where purchase_id = ${purchaseId}`;
    paypal.approve(attempt!.order_id);
    expect((await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, buyer), routeParams(purchaseId))).status).toBe(200);
    expect(await read()).toMatchObject({ outletIsDemoFixture: true, state: "paid" });
  });
});

// Decision 1: the app booted with the switch off. Every module loads again so the cached web
// environment and Better Auth instance read MERCHANT_SIGNUP_ENABLED=false.
describe("S43 with MERCHANT_SIGNUP_ENABLED=false", () => {
  let off: SignupRoutes;
  beforeAll(async () => {
    process.env.MERCHANT_SIGNUP_ENABLED = "false";
    vi.resetModules();
    off = await loadRoutes();
  });

  it("90: the sign-up answers 400, the outlet route forbidden_membership and the request route not_found, and no user exists", async () => {
    const email = freshEmail("t90-walk-in");
    const response = await off.auth.POST(signUpRequest(email));
    expect(response.status).toBe(400);
    expect(await fixture.database.admin`select id from "user" where email = ${email}`).toHaveLength(0);
    expect(await fixture.database.admin`select id from rate_limit_hits where bucket = 'merchant_signup'`).toHaveLength(0);

    // A permanent account with no membership, as the operator's create-merchant makes one.
    const stranger = await newMerchant(fixture.database, "t90-stranger", { membership: false });
    const cookie = await signInCookie(off.auth.POST, stranger);
    const before = await counts();
    const created = await off.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", cookie, { name: "FIXTURE walk-in kopi", area: "Tanjong Pagar" }));
    expect(created.status).toBe(403);
    expect((await envelope(created)).error.code).toBe("forbidden_membership");
    expect(await counts()).toEqual(before);

    // An operator-made pending shop's member gets no seller request.
    const member = await newMerchant(fixture.database, "t90-member", { membership: true });
    const memberCookie = await signInCookie(off.auth.POST, member);
    const shop = await off.outlets.POST(jsonRequest("POST", "/api/v1/merchant/outlets", memberCookie, { name: "FIXTURE operator kopi", area: "Tanjong Pagar" }));
    expect(shop.status).toBe(201);
    const outletId = (await envelope<{ outlet: { id: string } }>(shop)).data.outlet.id;
    const request = await off.request.POST(jsonRequest("POST", `/api/v1/merchant/outlets/${outletId}/destinations/paypal/request`, memberCookie, { sellerMerchantId: REQUESTED_SELLER }), routeParams(outletId));
    expect(request.status).toBe(404);
    expect((await envelope(request)).error.code).toBe("not_found");
    expect(await fixture.database.admin`select requested_seller_merchant_id from enrollments where outlet_id = ${outletId} and requested_seller_merchant_id is not null`).toHaveLength(0);
  });
});
