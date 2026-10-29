import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_CONSENT_VERSION, WEB_MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import { importRuntime } from "@/domain/imports/request";
import { draftMenuFromPhoto } from "@/integrations/ai/menu-vision";
import { draftMenuFromPageText } from "@/integrations/ai/menu-web";
import { readPageText } from "@/integrations/browser/kernel";
import { createFakeKernel, FIXTURE_PAGE_TEXT, FIXTURE_PICTURE_TEXT, isKernelUrl, type FakeKernel, type PageTurn } from "../support/fake-kernel";
import { FIXTURE_BOUNDS, FIXTURE_RESERVATION, FIXTURE_VISION_ENV, createFakeVision, fixturePolicy, importRequest, photoBody, solidJpeg, visionItem, type VisionTurn } from "../support/menu-import";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";
import { loadMerchantRoutes, publishedItems, shopApi, type MerchantRoutes, type Shop } from "../support/publication";
import { TEST_BASE_URL } from "../support/session";

// S24 named tests 1, 3, 4, 7, 9 (route half), 10 and 11, run through the web route handler as
// envoi_web against a migrated disposable database with the real Better Auth handler. Kernel and
// OpenAI are faked at their fetch boundaries (FIXTURE); the real readPageText and text call run.
// Test 2, the switch off, is in menu-web-import-disabled.test.ts because the environment is read once.

const FIXTURE_WEB_MODEL = "FIXTURE-web-text-model";
const WEB_BOUNDS = { ...FIXTURE_BOUNDS, model: FIXTURE_WEB_MODEL };
const ISOLATED = { outletInFlight: 1, globalInFlight: 100, outletDaily: 10, globalDaily: 1_000 };
const FIXTURE_LINK = "https://fixture-shop.example/menu";

// What an honest model drafts from FIXTURE_PAGE_TEXT, plus one computed price and one invented item.
const PAGE_DRAFT = {
  items: [
    visionItem("Kopi C", "1.80", { portion: "Hot" }),
    visionItem("Kaya toast set", "3.50"),
    visionItem("Ebi fry", "4.90", { portion: "3 pcs" }),
    visionItem("Ebi fry", "6.40", { portion: "+ Mentaiko" }),
    visionItem("Golden Lobster", "3.50"),
  ],
};

type Envelope = { ok: boolean; data?: Record<string, unknown> & { import?: Record<string, unknown>; draft?: { items: { name: string; portion: string | null; priceSgdCents: number | null; source: string }[]; status: string; published: boolean } }; error?: { code: string; details: Record<string, string | number | boolean> } };

let fixture: PaymentsFixture;
let routes: MerchantRoutes & { web: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-imports/web/route"); photo: typeof import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route") };
let api: ReturnType<typeof shopApi>;
let page: PageTurn;
let kernel: FakeKernel;
let model: (index: number) => VisionTurn;
let openai: ReturnType<typeof createFakeVision>;

beforeAll(async () => {
  fixture = await createPaymentsFixture("web-import", { ...FIXTURE_VISION_ENV, WEB_IMPORTS_ENABLED: "true", AI_WEB_MENU_MODEL: FIXTURE_WEB_MODEL, KERNEL_API_KEY: "FIXTURE-kernel-key", LOG_LEVEL: "debug" });
  routes = {
    ...(await loadMerchantRoutes()),
    web: await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/web/route"),
    photo: await import("@/app/api/v1/merchant/outlets/[id]/menu-imports/route"),
  };
  api = shopApi(fixture.database, routes);
});

beforeEach(() => {
  page = { kind: "page", text: FIXTURE_PAGE_TEXT };
  model = () => ({ kind: "answer", output: PAGE_DRAFT });
  kernel = createFakeKernel(() => page);
  openai = createFakeVision((index) => model(index));
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return isKernelUrl(url) ? kernel.fetch(input, init) : openai.fetch(input, init);
  }) as typeof globalThis.fetch);
  importRuntime.policy = fixturePolicy(1_000_000, [FIXTURE_BOUNDS, WEB_BOUNDS]);
  importRuntime.limits = ISOLATED;
  importRuntime.now = () => new Date();
  importRuntime.draft = draftMenuFromPhoto;
  importRuntime.readPage = readPageText;
  importRuntime.draftWeb = draftMenuFromPageText;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await fixture?.database.drop();
});

const baseOf = async (shop: Shop) => (await api.getDraft(shop)).revisionId;

function webRequest(shop: Shop, body: Record<string, unknown>): Request {
  return new Request(`${TEST_BASE_URL}/api/v1/merchant/outlets/${shop.outletId}/menu-imports/web`, {
    method: "POST",
    headers: { cookie: shop.cookie, origin: TEST_BASE_URL, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendWeb(shop: Shop, overrides: Record<string, unknown> = {}) {
  const body = { url: FIXTURE_LINK, consentVersion: WEB_MENU_CONSENT_VERSION, baseRevisionId: await baseOf(shop), ...overrides };
  const response = await routes.web.POST(webRequest(shop, body), routeParams(shop.outletId));
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as Envelope };
}

const attempts = (outletId: string) =>
  fixture.database.admin<{ id: string; closed_outcome: string | null; model_dispatched_at: Date | null; source: string; source_host: string | null }[]>`
    select id, closed_outcome, model_dispatched_at, source, source_host from menu_imports where outlet_id = ${outletId} order by admitted_at`;

describe("a menu page link must be public https (route)", () => {
  it.each([
    ["http://fixture-shop.example/menu", "not_https"],
    ["https://merchant:pw@fixture-shop.example/menu", "has_credentials"],
    ["https://10.0.0.8/menu", "ip_or_local_host"],
    ["https://fixture-shop.example:8080/menu", "bad_port"],
    [`https://fixture-shop.example/${"a".repeat(2_048)}`, "too_long"],
    ["menu please", "malformed"],
  ])("%s refuses as %s before admission, with no Kernel or model call", async (url, reason) => {
    const shop = await api.newShop(`link-${reason}`);
    const result = await sendWeb(shop, { url });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: "validation_failed", details: { reason } });
    expect(await attempts(shop.outletId)).toEqual([]);
    expect(kernel.calls).toEqual([]);
    expect(openai.calls).toEqual([]);
  });
});

describe("web import needs the current web consent version", () => {
  it("an older or photo consent version is refused before admission", async () => {
    const shop = await api.newShop("web-consent");
    for (const consentVersion of ["web-menu-consent-00000000", MENU_CONSENT_VERSION]) {
      const result = await sendWeb(shop, { consentVersion });
      expect(result.status).toBe(409);
      expect(result.body.error).toMatchObject({ code: "consent_required", details: { consentVersion: WEB_MENU_CONSENT_VERSION } });
    }
    expect(await attempts(shop.outletId)).toEqual([]);
    expect(kernel.calls).toEqual([]);
    expect(openai.calls).toEqual([]);
  });
});

describe("web import counts toward the photo import caps and spend ceiling", () => {
  it("a photo import and a web import share the per-outlet daily cap", async () => {
    importRuntime.limits = { ...ISOLATED, outletDaily: 2 };
    model = () => ({ kind: "answer", output: { items: [visionItem("FIXTURE Kopi O", "1.80")] } });
    const shop = await api.newShop("shared-cap");
    const photo = await routes.photo.POST(importRequest(shop.outletId, shop.cookie, photoBody(await solidJpeg()), { baseRevisionId: await baseOf(shop) }), routeParams(shop.outletId));
    expect(photo.status).toBe(200);
    model = () => ({ kind: "answer", output: PAGE_DRAFT });
    expect((await sendWeb(shop)).status).toBe(200);
    const third = await sendWeb(shop);
    expect(third.body.error).toMatchObject({ code: "admission_rejected", details: { reason: "daily_cap_outlet" } });
    expect((await attempts(shop.outletId)).map((row) => row.source)).toEqual(["photo", "web_page"]);
  });

  it("a held photo reservation leaves no room for a web import under the ceiling", async () => {
    // Both FIXTURE bounds reserve FIXTURE_RESERVATION; the ceiling holds the day's spend plus one.
    const shop = await api.newShop("shared-ceiling");
    const [held] = await fixture.database.admin<{ total: string | null }[]>`
      select sum(reserved_usd_micros) as total from menu_imports where admitted_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc' and (model_dispatched_at is not null or (closed_at is null and deadline_at > now()))`;
    const spent = Number(held?.total ?? 0);
    importRuntime.policy = fixturePolicy(spent + FIXTURE_RESERVATION, [FIXTURE_BOUNDS, WEB_BOUNDS]);
    await fixture.database.admin`insert into menu_imports (id, outlet_id, actor_user_id, base_revision_id, consent_version, model_config_version, admitted_at, deadline_at, model_dispatched_at, closed_at, closed_outcome, reserved_usd_micros)
      values ('imp_fixtureheldphoto', ${shop.outletId}, ${shop.merchant.userId}, ${await baseOf(shop)}, 'FIXTURE', 'FIXTURE', now(), now() + interval '90 seconds', now(), now(), 'model_failed', ${FIXTURE_RESERVATION})`;
    const result = await sendWeb(shop);
    expect(result.body.error).toMatchObject({ code: "admission_rejected", details: { reason: "spend_ceiling_reached" } });
    expect(kernel.calls).toEqual([]);
  });
});

describe("a page with no printed price makes no model call", () => {
  it("closes as picture_menu after one Kernel read, with the reservation released", async () => {
    page = { kind: "page", text: FIXTURE_PICTURE_TEXT };
    const shop = await api.newShop("picture-menu");
    const result = await sendWeb(shop);
    expect(result.status).toBe(422);
    expect(result.body.error).toMatchObject({ code: "import_rejected", details: { outcome: "picture_menu" } });
    expect(openai.calls).toEqual([]);
    expect(kernel.deletes()).toBe(1);
    const [row] = await attempts(shop.outletId);
    expect(row).toMatchObject({ closed_outcome: "picture_menu", model_dispatched_at: null });
  });

  it("a PDF link answers as a PDF menu, closes as picture_menu and makes no model call", async () => {
    // FIXTURE: the browser reports a PDF document whose text holds a price, so only the PDF check stops it.
    page = { kind: "page", text: FIXTURE_PAGE_TEXT, pdf: true };
    const shop = await api.newShop("pdf-menu");
    const result = await sendWeb(shop);
    expect(result.status).toBe(422);
    expect(result.body.error).toMatchObject({ code: "import_rejected", message: "Envoi cannot read PDF menus. Type the menu instead.", details: { outcome: "picture_menu", reason: "pdf_menu" } });
    expect(openai.calls).toEqual([]);
    expect(kernel.deletes()).toBe(1);
    const [row] = await attempts(shop.outletId);
    expect(row).toMatchObject({ closed_outcome: "picture_menu", model_dispatched_at: null });
  });

  it("a refused, timed-out or unreachable page closes with its outcome and no model call", async () => {
    for (const [turn, outcome, code] of [
      [{ kind: "page", text: "Sign in", signIn: true }, "page_refused", "import_rejected"],
      [{ kind: "vm_error", error: "Timeout 18000ms exceeded." }, "page_timeout", "provider_unreachable"],
      [{ kind: "vm_error", error: "net::ERR_NAME_NOT_RESOLVED" }, "page_unreachable", "import_rejected"],
    ] as const) {
      page = turn;
      const shop = await api.newShop(`page-${outcome}`);
      const result = await sendWeb(shop);
      expect(result.body.error).toMatchObject({ code, details: { outcome } });
      expect((await attempts(shop.outletId))[0]?.closed_outcome).toBe(outcome);
    }
    expect(openai.calls).toEqual([]);
  });
});

describe("a completed web import", () => {
  it("drafts printed prices, blanks the rest as not_on_page and leaves out names not on the page", async () => {
    const shop = await api.newShop("web-complete");
    const result = await sendWeb(shop);
    expect(result.status).toBe(200);
    expect(result.body.data?.import).toMatchObject({ outcome: "completed", rowsDrafted: 4, rowsBlankPrice: 1, droppedNames: 1, added: 4 });
    expect(result.body.data?.import?.blankPrices).toEqual([{ name: "Ebi fry", portion: "+ Mentaiko", basis: "not_on_page" }]);
    expect(result.body.data?.draft?.items.map((item) => [item.name, item.portion, item.priceSgdCents, item.source])).toEqual([
      ["Kopi C", "Hot", 180, "import_suggestion"],
      ["Kaya toast set", null, 350, "import_suggestion"],
      ["Ebi fry", "3 pcs", 490, "import_suggestion"],
      ["Ebi fry", "+ Mentaiko", null, "import_suggestion"],
    ]);
    expect(await attempts(shop.outletId)).toMatchObject([{ closed_outcome: "completed", source: "web_page", source_host: "fixture-shop.example" }]);
    expect(kernel.deletes()).toBe(1);
    // The page text went to the model only as data inside the page block, with store: false.
    expect(openai.calls).toHaveLength(1);
    expect(openai.calls[0]?.body).toMatchObject({ store: false, model: FIXTURE_WEB_MODEL });
    expect(openai.calls[0]?.body).not.toHaveProperty("tools");
  });
});

describe("a web draft lands unconfirmed and publishes nothing", () => {
  it("the published revision and its confirmation are untouched after a completed web import", async () => {
    const { shop } = await api.publishedShop("web-published");
    const before = await publishedItems(fixture.database, shop.outletId);
    const [revisionBefore] = await fixture.database.admin`select r.* from outlets o join menu_revisions r on r.id = o.published_menu_revision_id where o.id = ${shop.outletId}`;
    const result = await sendWeb(shop);
    expect(result.status).toBe(200);
    expect(result.body.data?.draft).toMatchObject({ status: "draft", published: false });
    expect(await publishedItems(fixture.database, shop.outletId)).toEqual(before);
    const [revisionAfter] = await fixture.database.admin`select r.* from outlets o join menu_revisions r on r.id = o.published_menu_revision_id where o.id = ${shop.outletId}`;
    expect(revisionAfter).toEqual(revisionBefore);
    expect(revisionAfter?.status).toBe("confirmed");
  });
});

describe("page text and the full URL never reach a log, response or row", () => {
  it("a planted marker in the page text and the URL path appears on no surface", async () => {
    const TEXT_NEEDLE = "FIXTURENEEDLETEXT7Q";
    const PATH_NEEDLE = "FIXTURENEEDLEPATH3Z";
    const variants = (needle: string) => [needle, JSON.stringify(needle).slice(1, -1), needle.toLowerCase(), encodeURIComponent(needle)];
    const found = (surface: string, needle: string) => variants(needle).some((variant) => surface.includes(variant));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => void logs.push(String(line)));
    vi.spyOn(console, "error").mockImplementation((line: unknown) => void logs.push(String(line)));
    page = { kind: "page", text: `${FIXTURE_PAGE_TEXT}\n${TEXT_NEEDLE} Teh O (Hot) - $1.60` };
    const shop = await api.newShop("needle");
    for (const turn of [undefined, { kind: "status", status: 500 } as const]) {
      if (turn) model = () => turn;
      const result = await sendWeb(shop, { url: `https://fixture-shop.example/${PATH_NEEDLE}/menu?q=${PATH_NEEDLE}` });
      logs.push(result.text);
    }
    const rows = await fixture.database.admin`select row_to_json(t)::text as row from (select * from menu_imports where outlet_id = ${shop.outletId}) t
      union all select row_to_json(a)::text from (select * from audit_events where outlet_id = ${shop.outletId}) a
      union all select row_to_json(i)::text from (select i.* from menu_items i join menu_revisions r on r.id = i.menu_revision_id where r.outlet_id = ${shop.outletId}) i`;
    const surfaces = { logs: logs.join("\n"), rows: rows.map((row) => String(row.row)).join("\n") };
    expect(rows.length).toBeGreaterThan(2);
    expect(logs.length).toBeGreaterThan(2);
    // The needles did travel: the page text reached the model and the path reached Kernel.
    expect(found(JSON.stringify(openai.calls[0]?.body), TEXT_NEEDLE)).toBe(true);
    expect(found(JSON.stringify(kernel.calls), PATH_NEEDLE)).toBe(true);
    for (const [name, surface] of Object.entries(surfaces)) {
      for (const needle of [TEXT_NEEDLE, PATH_NEEDLE]) {
        // Self-test first: the scanner finds the needle once it is planted on this serialized surface.
        expect(found(surface + JSON.stringify({ planted: `x/${needle}` }), needle), `${name} self-test`).toBe(true);
        expect(found(surface, needle), `${name} holds ${needle}`).toBe(false);
      }
    }
  });
});
