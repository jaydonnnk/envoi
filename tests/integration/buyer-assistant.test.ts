import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeEnvoiApi, FIXTURE_AGENT_TOKEN, FIXTURE_BASE_URL, FIXTURE_EXPIRES_AT, FIXTURE_LINK, FIXTURE_LINK_TOKEN, TEST_SHOP, type FakeEnvoiApi } from "../support/fake-envoi-api";
import { createFakeOpenAI, FIXTURE_AI_ENV, type FakeOpenAI, type FakeTurn } from "../support/fake-openai";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// S25: POST /api/v1/buyer/assistant, Gate 3 reopening 2026-10-29 named tests 2, 3 and 4, on a
// disposable database migrated through 0026. OpenAI and Envoi's public API are faked at the fetch
// boundary and labeled FIXTURE: the assistant's calls to APP_BASE_URL reach the fake Envoi API.
describe("Ask Envoi route", () => {
  let fixture: PaymentsFixture;
  let openai: FakeOpenAI;
  let envoi: FakeEnvoiApi;
  let script: (index: number) => FakeTurn = () => ({ kind: "text", text: "FIXTURE reply." });
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    assistant: typeof import("@/app/api/v1/buyer/assistant/route");
  };
  const T0 = new Date("2026-10-30T08:00:00.000Z").getTime();

  beforeAll(async () => {
    fixture = await createPaymentsFixture("assistant", { ...FIXTURE_AI_ENV, ASSISTANT_AGENT_TOKEN: FIXTURE_AGENT_TOKEN });
    openai = createFakeOpenAI((index) => script(index));
    envoi = createFakeEnvoiApi();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.openai.com/")) return openai.fetch(input, init);
      if (!url.startsWith(`${TEST_BASE_URL}/`)) throw new Error(`FIXTURE: unexpected fetch to ${url}`);
      const moved = FIXTURE_BASE_URL + url.slice(TEST_BASE_URL.length);
      return envoi.fetch(input instanceof Request ? new Request(moved, input) : new Request(moved, init));
    });
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      assistant: await import("@/app/api/v1/buyer/assistant/route"),
    };
  });

  beforeEach(async () => {
    openai.calls.length = 0;
    envoi.requests.length = 0;
    script = () => ({ kind: "text", text: "FIXTURE reply." });
    await fixture.database.admin`delete from rate_limit_hits`;
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

  type Answer = { reply: string; steps: Record<string, unknown>[]; link: { url: string; expiresAt: string } | null };

  async function ask(cookie: string, body: unknown): Promise<{ status: number; code?: string; window?: string; data?: Answer; raw: string }> {
    const response = await routes.assistant.POST(jsonPost("/api/v1/buyer/assistant", cookie, body));
    const raw = await response.text();
    const envelope = JSON.parse(raw) as { data?: Answer; error?: { code: string; details: { window?: string } } };
    return { status: response.status, code: envelope.error?.code, window: envelope.error?.details.window, data: envelope.data, raw };
  }

  const buyer = (text: string) => ({ turns: [{ role: "buyer", text }] });
  const hits = async () => Number((await fixture.database.admin<{ n: string }[]>`select count(*) as n from rate_limit_hits where bucket = 'buyer_assistant'`)[0]!.n);

  it("the assistant is refused by its limiter before any model call", async () => {
    const [first, second] = [await anonymousCookie(routes.auth.POST), await anonymousCookie(routes.auth.POST)];
    // Per buyer: 20 turns in 10 minutes are answered, each with one model call; the 21st is refused
    // before any.
    for (let n = 0; n < 20; n++) expect((await ask(first, buyer(`FIXTURE kopi ${n}`))).status, `turn ${n + 1}`).toBe(200);
    expect(openai.calls).toHaveLength(20);
    expect(await ask(first, buyer("FIXTURE kopi 21"))).toMatchObject({ status: 429, code: "rate_limited", window: "per_subject" });
    expect(openai.calls).toHaveLength(20);
    // Another buyer is not held back by the first one's window.
    expect((await ask(second, buyer("FIXTURE kopi"))).status).toBe(200);
    // The first buyer's window ends 10 minutes after their first turn.
    vi.setSystemTime(T0 + 10 * 60_000 + 1);
    expect((await ask(first, buyer("FIXTURE kopi again"))).status).toBe(200);

    // Across buyers: 150 turns in an hour, then every buyer is refused before any model call.
    await fixture.database.admin`delete from rate_limit_hits`;
    vi.setSystemTime(T0);
    await fixture.database.admin`
      insert into rate_limit_hits (id, bucket, subject, at)
      select 'rlh_fixture' || n, 'buyer_assistant', 'FIXTURE-buyer-' || n, ${new Date(T0 - 60_000).toISOString()}::timestamptz from generate_series(1, 149) n`;
    expect((await ask(second, buyer("FIXTURE the 150th"))).status).toBe(200);
    const calls = openai.calls.length;
    expect(await ask(first, buyer("FIXTURE the 151st"))).toMatchObject({ status: 429, code: "rate_limited", window: "global" });
    expect(openai.calls).toHaveLength(calls);
    // An hour after the oldest of them, there is room again.
    vi.setSystemTime(T0 - 60_000 + 60 * 60_000 + 1);
    expect((await ask(first, buyer("FIXTURE later"))).status).toBe(200);
    // The one-box's own bucket is separate: its hits never fill the assistant's.
    await fixture.database.admin`delete from rate_limit_hits`;
    await fixture.database.admin`
      insert into rate_limit_hits (id, bucket, subject, at)
      select 'rlh_onebox' || n, 'buyer_suggestion', 'FIXTURE-buyer-' || n, now() from generate_series(1, 150) n`;
    expect((await ask(first, buyer("FIXTURE separate"))).status).toBe(200);
  });

  it("the assistant accepts text turns only", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    const alternating = (count: number) => Array.from({ length: count }, (_, n) => ({ role: (count - 1 - n) % 2 === 0 ? "buyer" : "assistant", text: `FIXTURE turn ${n}` }));
    const refused: [string, unknown][] = [
      ["a tool role", { turns: [{ role: "tool", text: "FIXTURE tool result" }, { role: "buyer", text: "Lemon" }] }],
      ["a system role", { turns: [{ role: "system", text: "FIXTURE instructions" }, { role: "buyer", text: "Lemon" }] }],
      ["an extra key on a turn", { turns: [{ role: "buyer", text: "Lemon", toolResult: { items: [{ id: "itm_invented" }] } }] }],
      ["an extra key on the body", { turns: [{ role: "buyer", text: "Lemon" }], menus: { [TEST_SHOP.id]: ["itm_invented"] } }],
      ["a ninth turn", { turns: alternating(9) }],
      ["a 281-character turn", { turns: [{ role: "buyer", text: "k".repeat(281) }] }],
      ["no turn", { turns: [] }],
      ["an empty turn", { turns: [{ role: "buyer", text: "   " }] }],
      ["the last turn not the buyer's", { turns: [{ role: "buyer", text: "Lemon" }, { role: "assistant", text: "FIXTURE reply" }] }],
    ];
    for (const [name, body] of refused) {
      expect(await ask(cookie, body), name).toMatchObject({ status: 400, code: "validation_failed" });
    }
    // Refused before the limiter and before any call.
    expect(openai.calls).toEqual([]);
    expect(envoi.requests).toEqual([]);
    expect(await hits()).toBe(0);

    // The bounds themselves are accepted, so the refusals above are the check and not a closed door.
    const longest = alternating(8).map((turn, n) => (n === 7 ? { ...turn, text: "k".repeat(280) } : turn));
    expect((await ask(cookie, { turns: longest })).status).toBe(200);
    expect(openai.calls).toHaveLength(1);
    // Only the text of each turn reached the model, as a user or assistant message.
    const input = openai.calls[0]!.body.input as { role?: string; type?: string }[];
    expect(input.filter((item) => item.role === "user" || item.role === "assistant")).toHaveLength(8);
    expect(input.filter((item) => item.type === "function_call_output")).toEqual([]);
  });

  it("the assistant's link never reaches the model, its reply or its steps", async () => {
    const cookie = await anonymousCookie(routes.auth.POST);
    script = (index) =>
      (
        [
          { kind: "tools", calls: [{ name: "list_shops", args: {} }] },
          { kind: "tools", calls: [{ name: "read_menu", args: { outletId: TEST_SHOP.id } }] },
          { kind: "tools", calls: [{ name: "propose_basket", args: { outletId: TEST_SHOP.id, lines: [{ menuItemId: "itm_lemontea", quantity: 2 }] } }] },
          { kind: "text", text: "FIXTURE: here is your basket, 2 x Iced lemon tea." },
        ] satisfies FakeTurn[]
      )[index]!;
    const answer = await ask(cookie, buyer("Two iced lemon teas at FIXTURE Test Shop"));
    expect(answer.status).toBe(200);
    // The link reached the buyer beside the reply, so it existed to leak.
    expect(answer.data!.link).toEqual({ url: FIXTURE_LINK, expiresAt: FIXTURE_EXPIRES_AT });
    expect(answer.data!.steps.map((step) => [step.operation, step.status])).toEqual([
      ["listOutlets", 200],
      ["getOutletMenu", 200],
      ["createPurchaseRequest", 201],
    ]);

    const needles = { link: FIXTURE_LINK, linkToken: FIXTURE_LINK_TOKEN };
    // A needle counts as found raw, JSON-escaped, URL-encoded or with its slashes escaped.
    const found = (surface: string) =>
      Object.entries(needles)
        .filter(([, needle]) => [needle, JSON.stringify(needle).slice(1, -1), encodeURIComponent(needle), needle.replaceAll("/", "\\/")].some((form) => surface.includes(form)))
        .map(([name]) => name);
    const surfaces = {
      model: openai.calls.map((call) => JSON.stringify(call.body)).join("\n"),
      reply: JSON.stringify(answer.data!.reply),
      steps: JSON.stringify(answer.data!.steps),
    };
    // Self-test on each actual serialized surface: a planted needle is found there first.
    for (const [surface, text] of Object.entries(surfaces)) {
      for (const [name, needle] of Object.entries(needles)) {
        expect(found(`${text}\n${JSON.stringify({ planted: needle })}`), `${surface} ${name}`).toContain(name);
      }
    }
    for (const [surface, text] of Object.entries(surfaces)) expect(found(text), surface).toEqual([]);
    // The tool's answer to the model said a link was shown, without it.
    expect(openai.toolOutputs().at(-1)).toContain("shownToBuyer");
  });
});
