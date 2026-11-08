import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareLanguage, TOURIST_LANGUAGES, type TouristReadyInput } from "@/domain/menu/prepare";
import type { MenuTranslator } from "@/domain/menu/translate";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { webDb } from "@/lib/db/web";
import { createFakeOpenAI, type FakeOpenAI } from "../support/fake-openai";
import { createFakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { envelope, loadMerchantRoutes, shopApi, type MerchantRoutes } from "../support/publication";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// S50: the Tourist-ready Workflow, Gate 3 S50 amendment, named tests 87 and 88. Real route handlers
// run as envoi_web against a migrated disposable database. Render's API is faked at the fetch
// boundary (api.render.com), OpenAI likewise, and PayPal through its write client; every answer from
// them is a FIXTURE.
describe("tourist-ready workflow", () => {
  let fixture: PaymentsFixture;
  let openai: FakeOpenAI;
  let routes: MerchantRoutes & {
    auth: typeof import("@/app/api/auth/[...all]/route");
    translations: typeof import("@/app/api/v1/buyer/menu-translations/route");
  };
  let api: ReturnType<typeof shopApi>;

  // How the FIXTURE Render API answers a flow start, and what it was sent.
  const render = { mode: "ok" as "ok" | "error" | "hang", starts: [] as { flow: string; input: TouristReadyInput[] }[] };

  async function fakeRender(request: Request): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/flow-runs") throw new Error(`FIXTURE: unexpected Render call ${request.method} ${request.url}`);
    render.starts.push((await request.clone().json()) as { flow: string; input: TouristReadyInput[] });
    if (render.mode === "error") return Response.json({ id: "FIXTURE", message: "FIXTURE failure" }, { status: 500 });
    if (render.mode === "hang") {
      // Never answers on its own: only the caller's abort ends it, and a fallback after 10 seconds.
      return new Promise((_, reject) => {
        const fallback = setTimeout(() => reject(new Error("FIXTURE: hang fallback")), 10_000);
        request.signal.addEventListener("abort", () => {
          clearTimeout(fallback);
          reject(request.signal.reason);
        });
      });
    }
    return Response.json({ id: "frn-FIXTURE", status: "pending" }, { status: 201 });
  }

  // The fake model translates every item it is sent into a FIXTURE name.
  function fixtureAnswer(body: { input: unknown[] }): string {
    const user = body.input.find((entry) => (entry as { role?: string }).role === "user") as { content: { text: string }[] };
    const menu = JSON.parse(user.content[0]!.text.match(/^<menu>\n(.*)\n<\/menu>$/s)![1]!) as { itemId: string; name: string }[];
    return JSON.stringify({ items: menu.map((item) => ({ itemId: item.itemId, name: `FIXTURE 译 ${item.name}`, explanation: null })) });
  }

  beforeAll(async () => {
    fixture = await createPaymentsFixture("tourist_ready", {
      OPENAI_API_KEY: "fixture-openai-key",
      AI_MENU_TRANSLATION_MODEL: "FIXTURE-translation-model",
      RENDER_API_KEY: "FIXTURE-render-key",
      RENDER_WORKFLOW_SLUG: "fixture-workflow",
    });
    openai = createFakeOpenAI((_, body) => ({ kind: "text", text: fixtureAnswer(body) }));
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.startsWith("https://api.render.com/")) return fakeRender(request);
      if (request.url.startsWith("https://api.openai.com/")) return openai.fetch(input, init);
      throw new Error(`FIXTURE: unexpected fetch to ${request.url}`);
    });
    routes = {
      ...(await loadMerchantRoutes()),
      auth: await import("@/app/api/auth/[...all]/route"),
      translations: await import("@/app/api/v1/buyer/menu-translations/route"),
    };
    api = shopApi(fixture.database, routes);
    paypal.client = createFakePayPal().client;
  });

  beforeEach(() => {
    render.mode = "ok";
    render.starts.length = 0;
    openai.calls.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  const publishedPointer = async (outletId: string) =>
    (await fixture.database.admin<{ id: string | null }[]>`select published_menu_revision_id as id from outlets where id = ${outletId}`)[0]!.id;

  const rowsFor = async (revisionId: string) =>
    fixture.database.admin<{ language: string }[]>`select language from menu_translations where menu_revision_id = ${revisionId} order by language`;

  // A FIXTURE translator that counts its calls and names every item.
  function countingTranslator(): MenuTranslator & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      model: "FIXTURE-translation-model",
      translate: async (items, language) => {
        calls.push(language.tag);
        return { kind: "ok", output: { items: items.map((item) => ({ itemId: item.id, name: `FIXTURE ${language.tag} ${item.name}`, explanation: null })) } };
      },
    };
  }

  it("a failed run leaves publication and on-demand translation working", async () => {
    // A start that Render refuses.
    render.mode = "error";
    const failed = await api.readyShop("tr_refused");
    // A route that throws counts as a failed publish, not as a crash of this test.
    const status = (published: Promise<Response>) => published.then((response) => response.status, () => "threw");
    expect(await status(api.publish(failed.shop, failed.draft))).toBe(200);
    expect(await publishedPointer(failed.shop.outletId)).toBe(failed.draft.revisionId);
    expect(render.starts).toHaveLength(1);

    // A start that never answers is cut off by the 3 second timeout; the publish still answers.
    render.mode = "hang";
    const hung = await api.readyShop("tr_hung");
    const started = Date.now();
    const hungStatus = await status(api.publish(hung.shop, hung.draft));
    const elapsed = Date.now() - started;
    expect(hungStatus).toBe(200);
    expect(elapsed).toBeLessThan(5_000);
    expect(await publishedPointer(hung.shop.outletId)).toBe(hung.draft.revisionId);

    // Nothing was stored by a run, and a buyer still gets the translation on demand.
    expect(await rowsFor(hung.draft.revisionId)).toEqual([]);
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.translations.POST(jsonPost("/api/v1/buyer/menu-translations", cookie, { outletId: hung.shop.outletId, language: "zh" }));
    const body = await envelope<{ menuRevisionId: string }>(response);
    expect(response.status).toBe(200);
    expect(body.data.menuRevisionId).toBe(hung.draft.revisionId);
    expect(openai.calls).toHaveLength(1);
  }, 30_000);

  it("a repeated run makes no duplicate translation", async () => {
    const { shop, draft } = await api.publishedShop("tr_repeat");
    const input = { outletId: shop.outletId, revisionId: draft.revisionId };
    const translator = countingTranslator();
    for (let run = 0; run < 2; run += 1) {
      for (const language of TOURIST_LANGUAGES) expect(await prepareLanguage(webDb(), input, language, new Date(), translator)).toBe("ready");
    }
    expect((await rowsFor(draft.revisionId)).map((row) => row.language)).toEqual([...TOURIST_LANGUAGES].sort());
    expect(translator.calls).toEqual([...TOURIST_LANGUAGES]);
  });

  it("the trigger starts one run for the committed outlet and revision", async () => {
    const { shop, draft } = await api.readyShop("tr_ids");
    expect((await api.publish(shop, draft)).status).toBe(200);
    expect(render.starts).toEqual([{ flow: "fixture-workflow/touristReady", input: [{ outletId: shop.outletId, revisionId: draft.revisionId }] }]);
  });

  it("a refused publish starts no run", async () => {
    const { shop, draft } = await api.readyShop("tr_stale");
    const stale = await api.publish(shop, { revisionId: draft.revisionId, version: draft.version + 1 });
    expect(stale.status).toBe(409);
    expect(render.starts).toEqual([]);
  });

  it("a run for a superseded revision makes no translator call", async () => {
    const { shop, draft } = await api.publishedShop("tr_superseded");
    const newer = await api.republish(shop, (items) => items.map((item) => ({ id: item.id, name: `${item.name} new`, priceMinor: item.priceMinor })));
    expect(newer.revisionId).not.toBe(draft.revisionId);
    const translator = countingTranslator();
    expect(await prepareLanguage(webDb(), { outletId: shop.outletId, revisionId: draft.revisionId }, "zh", new Date(), translator)).toBe("superseded");
    expect(translator.calls).toEqual([]);
    expect(await rowsFor(newer.revisionId)).toEqual([]);
  });

  it("a step throws when the translation is unavailable and returns for an unknown shop", async () => {
    const { shop, draft } = await api.publishedShop("tr_unavailable");
    const failing: MenuTranslator = { model: "FIXTURE-translation-model", translate: async () => ({ kind: "failed" }) };
    const outcome = await prepareLanguage(webDb(), { outletId: shop.outletId, revisionId: draft.revisionId }, "ja", new Date(), failing).then(
      (result) => `returned ${result}`,
      (err: unknown) => `threw ${(err as Error).message}`,
    );
    expect(outcome).toBe("threw translation unavailable: ja");
    expect(await prepareLanguage(webDb(), { outletId: "out_FIXTURE00000000000000", revisionId: draft.revisionId }, "ja", new Date(), countingTranslator())).toBe("not_found");
  });
});
