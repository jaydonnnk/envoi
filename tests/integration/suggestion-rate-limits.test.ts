import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWeb } from "@/lib/db/web";
import { admit, SUGGESTION_LIMITS } from "@/lib/ratelimit";
import { createFakeOpenAI, FIXTURE_AI_ENV, proposal, type FakeOpenAI } from "../support/fake-openai";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

// Gate 4 delta D9: POST /buyer/suggestions is limited to 10 requests per buyer in 10 minutes and
// 100 across all buyers in an hour, checked before any model call. The windows are asserted with
// literal values, not the module's constants.
describe("text suggestion rate limits", () => {
  let fixture: PaymentsFixture;
  let fake: FakeOpenAI;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    suggestions: typeof import("@/app/api/v1/buyer/suggestions/route");
  };
  const T0 = new Date("2026-10-13T08:00:00.000Z").getTime();

  beforeAll(async () => {
    fixture = await createPaymentsFixture("ratelimit", FIXTURE_AI_ENV);
    fake = createFakeOpenAI(() => ({ kind: "answer", proposal: proposal({ kind: "no_match" }) }));
    vi.stubGlobal("fetch", fake.fetch);
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      suggestions: await import("@/app/api/v1/buyer/suggestions/route"),
    };
  });

  beforeEach(async () => {
    fake.calls.length = 0;
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

  async function ask(cookie: string): Promise<{ status: number; code?: string; window?: string }> {
    const response = await routes.suggestions.POST(jsonPost("/api/v1/buyer/suggestions", cookie, { text: "kopi near Tanjong Pagar" }));
    const envelope = (await response.json()) as { error?: { code: string; details: { window?: string } } };
    return { status: response.status, code: envelope.error?.code, window: envelope.error?.details.window };
  }

  async function sessions(n: number): Promise<string[]> {
    const cookies: string[] = [];
    for (let i = 0; i < n; i++) cookies.push(await anonymousCookie(routes.auth.POST));
    return cookies;
  }

  it("text suggestions are rate limited per buyer session", async () => {
    const [first, second] = await sessions(2);

    for (let i = 0; i < 10; i++) expect((await ask(first!)).status).toBe(200);
    expect(fake.calls).toHaveLength(10);

    expect(await ask(first!)).toEqual({ status: 429, code: "rate_limited", window: "per_subject" });
    expect(fake.calls).toHaveLength(10);

    expect((await ask(second!)).status).toBe(200);
    expect(fake.calls).toHaveLength(11);

    // The window is 10 minutes: one millisecond short of it the first buyer is still refused.
    vi.setSystemTime(T0 + 599_999);
    expect((await ask(first!)).code).toBe("rate_limited");
    expect(fake.calls).toHaveLength(11);
    vi.setSystemTime(T0 + 600_000);
    expect((await ask(first!)).status).toBe(200);
    expect(fake.calls).toHaveLength(12);
  });

  it("text suggestions are rate limited across all sessions", async () => {
    // Eleven buyers, none past the per-session window: ten ask ten times each, then the eleventh asks
    // once. No session reaches its own limit, so only the global window can refuse.
    const cookies = await sessions(11);
    for (const cookie of cookies.slice(0, 10)) {
      for (let i = 0; i < 10; i++) expect((await ask(cookie)).status).toBe(200);
    }
    expect(fake.calls).toHaveLength(100);

    expect(await ask(cookies[10]!)).toEqual({ status: 429, code: "rate_limited", window: "global" });
    expect(fake.calls).toHaveLength(100);

    // The window is an hour.
    vi.setSystemTime(T0 + 3_599_999);
    expect((await ask(cookies[10]!)).code).toBe("rate_limited");
    vi.setSystemTime(T0 + 3_600_000);
    expect((await ask(cookies[10]!)).status).toBe(200);
    expect(fake.calls).toHaveLength(101);
  });

  it("a refused suggestion request records nothing", async () => {
    const [cookie] = await sessions(1);
    for (let i = 0; i < 10; i++) expect((await ask(cookie!)).status).toBe(200);

    expect((await ask(cookie!)).code).toBe("rate_limited");
    expect((await ask(cookie!)).code).toBe("rate_limited");

    const [row] = await fixture.database.admin<{ n: number }[]>`select count(*)::int as n from rate_limit_hits`;
    expect(row?.n).toBe(10);
  });

  it("concurrent requests cannot pass the per-session window together", async () => {
    vi.useRealTimers();
    const web = connectWeb(fixture.database.webUrl, 20);
    try {
      const now = new Date();
      const results = await Promise.all(Array.from({ length: 30 }, () => admit(web.db, "buyer_suggestion", "FIXTURE-buyer", SUGGESTION_LIMITS, now)));
      expect(results.filter((result) => result.kind === "admitted")).toHaveLength(10);
    } finally {
      await web.close();
    }
  });
});
