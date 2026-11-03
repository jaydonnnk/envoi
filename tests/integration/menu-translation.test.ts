import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreateTranslation, type MenuTranslator } from "@/domain/menu/translate";
import type { TranslationCall } from "@/integrations/ai/menu-translate";
import { webDb } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { createFakeOpenAI, type FakeOpenAI } from "../support/fake-openai";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

// S29: the menu explained and translated, Gate 3 reopening 2026-10-29 named tests 24, 28, 29 and 30,
// and test 23 at the route, on a disposable database migrated through 0028. OpenAI is faked at the
// fetch boundary and every translation it answers is a FIXTURE.
describe("menu translation", () => {
  let fixture: PaymentsFixture;
  let openai: FakeOpenAI;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    translations: typeof import("@/app/api/v1/buyer/menu-translations/route");
  };
  const T0 = new Date("2026-11-08T08:00:00.000Z").getTime();

  // The menu the model was sent: the data block of the one user message.
  function sentMenu(body: { input: unknown[] }): Record<string, string>[] {
    const user = body.input.find((entry) => (entry as { role?: string }).role === "user") as { content: { text: string }[] };
    return JSON.parse(user.content[0]!.text.match(/^<menu>\n(.*)\n<\/menu>$/s)![1]!) as Record<string, string>[];
  }

  // The fake model translates every item it is sent into a FIXTURE name.
  function fixtureAnswer(body: { input: unknown[] }): string {
    return JSON.stringify({ items: sentMenu(body).map((item) => ({ itemId: item.itemId, name: `FIXTURE 译 ${item.name}`, explanation: "FIXTURE 说明。" })) });
  }

  beforeAll(async () => {
    fixture = await createPaymentsFixture("translation", { OPENAI_API_KEY: "fixture-openai-key", AI_MENU_TRANSLATION_MODEL: "FIXTURE-translation-model" });
    openai = createFakeOpenAI((_, body) => ({ kind: "text", text: fixtureAnswer(body) }));
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.openai.com/")) return openai.fetch(input, init);
      throw new Error(`FIXTURE: unexpected fetch to ${url}`);
    });
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      translations: await import("@/app/api/v1/buyer/menu-translations/route"),
    };
  });

  beforeEach(async () => {
    openai.calls.length = 0;
    await fixture.database.admin`delete from rate_limit_hits`;
    await fixture.database.admin`delete from menu_translations`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  type Answer = { menuRevisionId: string; language: string; items: { itemId: string; name: string; explanation: string | null }[] };

  async function translate(cookie: string, body: unknown): Promise<{ status: number; code?: string; window?: string; data?: Answer }> {
    const response = await routes.translations.POST(jsonPost("/api/v1/buyer/menu-translations", cookie, body));
    const envelope = (await response.json()) as { data?: Answer; error?: { code: string; details: { window?: string } } };
    return { status: response.status, code: envelope.error?.code, window: envelope.error?.details.window, data: envelope.data };
  }

  const rows = async () => fixture.database.admin<{ menu_revision_id: string; language: string; model: string }[]>`select menu_revision_id, language, model from menu_translations order by created_at, language`;
  const hits = async () => Number((await fixture.database.admin<{ n: string }[]>`select count(*) as n from rate_limit_hits where bucket = 'menu_translation'`)[0]!.n);

  it("a translation language must be a primary language subtag", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    for (const language of ["zh-CN", "ZH", "zh_CN", "Hans", "zzz", "und", "", 7, null]) {
      expect(await translate(cookie, { outletId: fixture.outletId, language }), JSON.stringify(language)).toMatchObject({ status: 400, code: "validation_failed" });
    }
    // An extra key is refused too, and so is a body over 1 KiB, however it is padded.
    expect(await translate(cookie, { outletId: fixture.outletId, language: "zh", items: [] })).toMatchObject({ status: 400, code: "validation_failed" });
    const padded = jsonPost("/api/v1/buyer/menu-translations", cookie, {});
    const oversized = new Request(padded, { body: `${" ".repeat(1_000)}${JSON.stringify({ outletId: fixture.outletId, language: "zh" })}` });
    expect((await routes.translations.POST(oversized)).status).toBe(400);
    // Without a buyer session nothing is read.
    const anonymous = new Request(padded, { headers: { "content-type": "application/json", origin: new URL(padded.url).origin }, body: JSON.stringify({ outletId: fixture.outletId, language: "zh" }) });
    expect((await routes.translations.POST(anonymous)).status).toBe(401);
    // A refused request is neither admitted nor sent to the model.
    expect(await hits()).toBe(0);
    expect(openai.calls).toHaveLength(0);
    expect((await translate(cookie, { outletId: fixture.outletId, language: "zh" })).status).toBe(200);
    // The database refuses a stored language that is not a primary subtag, whatever wrote it.
    const [published] = await fixture.database.admin<{ id: string }[]>`select published_menu_revision_id as id from outlets where id = ${fixture.outletId}`;
    const revision = published!.id;
    const stored = (language: string) =>
      fixture.database.admin`insert into menu_translations (menu_revision_id, language, items, model) values (${revision}, ${language}, '[]'::jsonb, 'FIXTURE')`.then(() => "stored", (err: unknown) => (err as { constraint_name?: string }).constraint_name);
    for (const language of ["zh-CN", "ZH", "zhhh"]) expect(await stored(language), language).toBe("menu_translations_language_check");
  });

  it("a cached translation makes no model call", async () => {
    const [first, second] = [await anonymousCookie(routes.auth.POST), await anonymousCookie(routes.auth.POST)];
    const miss = await translate(first, { outletId: fixture.outletId, language: "zh" });
    expect(miss.status).toBe(200);
    expect(openai.calls).toHaveLength(1);
    expect(miss.data!.items.map((item) => item.itemId)).toEqual(fixture.items.map((item) => item.id));
    // The call is tool-free and not stored by OpenAI, and the menu reaches it without a price.
    const sent = openai.calls[0]!.body;
    expect(sent.tools ?? []).toEqual([]);
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("FIXTURE-translation-model");
    const menu = sentMenu(sent);
    expect(menu.map((item) => Object.keys(item))).toEqual(fixture.items.map(() => ["itemId", "name"]));
    expect(menu.map((item) => item.name)).toEqual(fixture.items.map((item) => item.name));

    // A second visit, by the same buyer or another, answers from the stored row without a model call.
    const hit = await translate(first, { outletId: fixture.outletId, language: "zh" });
    const other = await translate(second, { outletId: fixture.outletId, language: "zh" });
    expect(openai.calls).toHaveLength(1);
    expect(hit.data).toEqual(miss.data);
    expect(other.data).toEqual(miss.data);
    expect(await rows()).toEqual([{ menu_revision_id: miss.data!.menuRevisionId, language: "zh", model: "FIXTURE-translation-model" }]);

    // Another language is its own row and its own call; English keeps the shop's names.
    const english = await translate(first, { outletId: fixture.outletId, language: "en" });
    expect(openai.calls).toHaveLength(2);
    expect(english.data!.items.map((item) => item.name)).toEqual(fixture.items.map((item) => item.name));
  });

  it("a new menu revision gets new translations", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    const before = await translate(cookie, { outletId: fixture.outletId, language: "ja" });
    expect(openai.calls).toHaveLength(1);

    // FIXTURE republication: a new confirmed revision with the same items under new ids becomes the
    // outlet's published menu, as the merchant's own publication would make it.
    const revision = newId("mrv");
    await fixture.database.admin.begin(async (sql) => {
      await sql`insert into menu_revisions (id, outlet_id, status, confirmed_at) values (${revision}, ${fixture.outletId}, 'confirmed', now())`;
      await sql`
        insert into menu_items (id, menu_revision_id, position, name, portion, unit_minor, available, source, item_key)
        select 'itm_' || substr(md5(id), 1, 26), ${revision}, position, name, portion, unit_minor, available, source, item_key
        from menu_items where menu_revision_id = ${before.data!.menuRevisionId}`;
      await sql`update outlets set published_menu_revision_id = ${revision} where id = ${fixture.outletId}`;
    });

    const after = await translate(cookie, { outletId: fixture.outletId, language: "ja" });
    expect(openai.calls).toHaveLength(2);
    expect(after.data!.menuRevisionId).toBe(revision);
    expect(after.data!.items.map((item) => item.itemId)).not.toEqual(before.data!.items.map((item) => item.itemId));
    expect((await rows()).map((row) => row.menu_revision_id)).toEqual([before.data!.menuRevisionId, revision]);
    // The old revision's row stays as it was; it is no longer read for this shop.
    await translate(cookie, { outletId: fixture.outletId, language: "ja" });
    expect(openai.calls).toHaveLength(2);
    // The web role may read and insert a translation, never rewrite or remove one.
    const web = postgres(fixture.database.webUrl, { max: 1, onnotice: () => {} });
    try {
      const refusal = async (statement: Promise<unknown>) => statement.then(() => "allowed", (err: unknown) => (err as { code?: string }).code);
      expect(await refusal(web`update menu_translations set items = '[]'::jsonb`)).toBe("42501");
      expect(await refusal(web`delete from menu_translations`)).toBe("42501");
    } finally {
      await web.end({ timeout: 5 });
    }
    expect(await rows()).toHaveLength(2);
  });

  it("two concurrent misses store one translation", async () => {
    // Both callers miss before either inserts: the fake translator holds each call until both arrive.
    let arrived = 0;
    let release: () => void = () => undefined;
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    const translator = (label: string): MenuTranslator => ({
      model: "FIXTURE-translation-model",
      translate: async (items): Promise<TranslationCall> => {
        arrived += 1;
        if (arrived === 2) release();
        await bothArrived;
        return { kind: "ok", output: { items: items.map((item) => ({ itemId: item.id, name: `FIXTURE ${label} ${item.name}`, explanation: null })) } };
      },
    });
    const now = new Date(T0);
    const settled = await Promise.allSettled([
      getOrCreateTranslation(webDb(), fixture.outletId, "ko", now, translator("A")),
      getOrCreateTranslation(webDb(), fixture.outletId, "ko", now, translator("B")),
    ]);
    expect(arrived).toBe(2);
    // Neither caller fails on the other's insert.
    expect(settled.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    const [a, b] = settled.map((outcome) => (outcome as PromiseFulfilledResult<unknown>).value);
    expect(await rows()).toHaveLength(1);
    // Both answer with the one stored row, whichever insert won.
    expect(a).toEqual(b);
    expect(a).toMatchObject({ kind: "ok" });
  });

  it("the translation route is refused by its limiter before any model call", async () => {
    const [first, second] = [await anonymousCookie(routes.auth.POST), await anonymousCookie(routes.auth.POST)];
    // Per buyer: 30 requests in 10 minutes are answered; the 31st is refused before any model call,
    // and a miss in a new language would otherwise call the model.
    for (let n = 0; n < 30; n++) expect((await translate(first, { outletId: fixture.outletId, language: "de" })).status, `request ${n + 1}`).toBe(200);
    expect(openai.calls).toHaveLength(1);
    expect(await translate(first, { outletId: fixture.outletId, language: "fr" })).toMatchObject({ status: 429, code: "rate_limited", window: "per_subject" });
    expect(openai.calls).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
    // Another buyer is not held back by the first one's window.
    expect((await translate(second, { outletId: fixture.outletId, language: "fr" })).status).toBe(200);
    expect(openai.calls).toHaveLength(2);
    vi.setSystemTime(T0 + 10 * 60_000 + 1);
    expect((await translate(first, { outletId: fixture.outletId, language: "de" })).status).toBe(200);

    // Across buyers: 120 in an hour, then every buyer is refused before any model call.
    await fixture.database.admin`delete from rate_limit_hits`;
    vi.setSystemTime(T0);
    await fixture.database.admin`
      insert into rate_limit_hits (id, bucket, subject, at)
      select 'rlh_fixture' || n, 'menu_translation', 'FIXTURE-buyer-' || n, ${new Date(T0 - 60_000).toISOString()}::timestamptz from generate_series(1, 119) n`;
    expect((await translate(second, { outletId: fixture.outletId, language: "de" })).status).toBe(200);
    const calls = openai.calls.length;
    expect(await translate(first, { outletId: fixture.outletId, language: "it" })).toMatchObject({ status: 429, code: "rate_limited", window: "global" });
    expect(openai.calls).toHaveLength(calls);
    vi.setSystemTime(T0 - 60_000 + 60 * 60_000 + 1);
    expect((await translate(first, { outletId: fixture.outletId, language: "it" })).status).toBe(200);
    expect(openai.calls).toHaveLength(calls + 1);
    // Other buckets never fill this one.
    await fixture.database.admin`delete from rate_limit_hits`;
    await fixture.database.admin`
      insert into rate_limit_hits (id, bucket, subject, at)
      select 'rlh_other' || n, 'buyer_assistant', 'FIXTURE-buyer-' || n, now() from generate_series(1, 150) n`;
    expect((await translate(first, { outletId: fixture.outletId, language: "it" })).status).toBe(200);
    expect(await hits()).toBe(1);
  });

  it("an unknown shop, a model failure and translation off answer without a stored row", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    expect(await translate(cookie, { outletId: "out_aaaaaaaaaaaaaaaaaaaaaaaaaa", language: "zh" })).toMatchObject({ status: 404, code: "not_found" });
    const failing: MenuTranslator = { model: "FIXTURE-translation-model", translate: async () => ({ kind: "failed" }) };
    expect(await getOrCreateTranslation(webDb(), fixture.outletId, "zh", new Date(T0), failing)).toEqual({ kind: "unavailable" });
    expect(await getOrCreateTranslation(webDb(), fixture.outletId, "zh", new Date(T0), null)).toEqual({ kind: "unavailable" });
    expect(await rows()).toEqual([]);
  });
});
