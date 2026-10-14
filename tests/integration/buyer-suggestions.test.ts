import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestFromText } from "@/domain/suggestions/suggest";
import type { Suggestion } from "@/domain/suggestions/types";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import { log } from "@/lib/log";
import { createFakeOpenAI, FIXTURE_AI_ENV, proposal, type FakeOpenAI, type FakeTurn } from "../support/fake-openai";
import { handEditPublishedMenu } from "../support/db";
import { createPaymentsFixture, jsonPost, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

// S4 text suggestions against the FIXTURE OpenAI boundary: the model proposes ids, and Envoi keeps
// only registered ones, prices them from the registry and asks for an area it was not given.
describe("buyer text suggestions", () => {
  let fixture: PaymentsFixture;
  let fake: FakeOpenAI;
  let script: (index: number) => FakeTurn = () => ({ kind: "answer", proposal: proposal({}) });
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    suggestions: typeof import("@/app/api/v1/buyer/suggestions/route");
  };
  let cookie: string;

  beforeAll(async () => {
    fixture = await createPaymentsFixture("suggest", FIXTURE_AI_ENV);
    fake = createFakeOpenAI((index) => script(index));
    vi.stubGlobal("fetch", fake.fetch);
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      suggestions: await import("@/app/api/v1/buyer/suggestions/route"),
    };
    cookie = await anonymousCookie(routes.auth.POST);
  });

  beforeEach(async () => {
    fake.calls.length = 0;
    // Each case starts with an empty limiter so the D9 windows never decide these cases.
    await fixture.database.admin`delete from rate_limit_hits`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture?.database.drop();
  });

  const item = (name: string) => {
    const found = fixture.items.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no fixture item ${name}`);
    return found;
  };

  async function suggest(body: { text: string; area?: string }, as = cookie): Promise<{ status: number; suggestion?: Suggestion; code?: string; message?: string }> {
    const response = await routes.suggestions.POST(jsonPost("/api/v1/buyer/suggestions", as, body));
    const envelope = (await response.json()) as { data?: { suggestion: Suggestion }; error?: { code: string; message: string } };
    return { status: response.status, suggestion: envelope.data?.suggestion, code: envelope.error?.code, message: envelope.error?.message };
  }

  it("model cannot invent a price", async () => {
    const kaya = item("Kaya toast set");
    script = (index) =>
      index === 0
        ? { kind: "tools", calls: [{ name: "get_published_menu", args: { outletId: fixture.outletId } }] }
        : { kind: "answer", proposal: { ...proposal({ kind: "items", outletId: fixture.outletId, itemIds: [kaya.id, "itm_inventedbythemodel"], area: "Tanjong Pagar" }), unitSgdCents: 1 } };

    const result = await suggest({ text: "kaya toast near Tanjong Pagar" });

    expect(result.status).toBe(200);
    expect(result.suggestion).toEqual({
      kind: "items",
      outletId: fixture.outletId,
      outlet: { id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true },
      matches: [{ id: kaya.id, name: "Kaya toast set", unitSgdCents: 450, available: true }],
    });
  });

  it("an unregistered outlet id is dropped", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: ["out_inventedbythemodel", fixture.outletId], area: "Tanjong Pagar" }) });

    const result = await suggest({ text: "coffee near Tanjong Pagar" });

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true }] });
  });

  it("no tool output carries a price", async () => {
    script = (index) =>
      index === 0
        ? {
            kind: "tools",
            calls: [
              { name: "search_outlets", args: { area: "Tanjong Pagar", name: null } },
              { name: "get_published_menu", args: { outletId: fixture.outletId } },
              { name: "list_item_names", args: { area: "Tanjong Pagar" } },
            ],
          }
        : { kind: "answer", proposal: proposal({ kind: "no_match", area: "Tanjong Pagar" }) };

    await suggest({ text: "kopi near Tanjong Pagar" });

    const outputs = fake.toolOutputs();
    expect(outputs).toHaveLength(3);
    expect(outputs.join("\n")).toContain("Kaya toast set");
    for (const output of outputs) {
      expect(output).not.toMatch(/unitSgdCents|price|S\$|\b(160|450|220|200)\b/i);
    }
  });

  it("the tools find a shop from an area written the way buyers write it", async () => {
    script = (index) =>
      index === 0
        ? {
            kind: "tools",
            calls: [
              { name: "search_outlets", args: { area: "near Tanjong Pagar", name: null } },
              { name: "list_item_names", args: { area: "Tanjong Pagar MRT" } },
              { name: "search_outlets", args: { area: "Tanjong-Pagar", name: null } },
            ],
          }
        : { kind: "answer", proposal: proposal({ kind: "no_match" }) };

    await suggest({ text: "kaya toast and kopi", area: "near Tanjong Pagar" });

    const [near, items, hyphenated] = fake.toolOutputs();
    expect(near).toContain("Lorong Demo Kopi");
    expect(items).toContain("Kaya toast set");
    expect(hyphenated).toContain("Lorong Demo Kopi");
  });

  it("model tool budget is enforced", async () => {
    script = (index) => (index < 4 ? { kind: "tools", calls: [{ name: "search_outlets", args: { area: "Tanjong Pagar", name: null } }] } : { kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId], area: "Tanjong Pagar" }) });

    const result = await suggest({ text: "kopi near Tanjong Pagar" });

    expect(result.suggestion).toEqual({ kind: "budget_exceeded" });
    // Three tool results reached the model; the fourth call was refused and no fifth request was sent.
    expect(fake.calls).toHaveLength(4);
    expect(fake.toolOutputs()).toHaveLength(3);
  });

  it("missing area asks for clarification", async () => {
    // The FIXTURE model ignores its instructions and names the demo shop for "near me".
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId], area: "near me" }) });

    const result = await suggest({ text: "kopi near me" });

    expect(result.suggestion).toEqual({ kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });
    expect(JSON.stringify(result.suggestion)).not.toMatch(/nearest|closest|Lorong Demo Kopi/i);
  });

  it("kaya toast and kopi asks for an area, then near Tanjong Pagar returns the demo shop and items", async () => {
    const kaya = item("Kaya toast set");
    const kopi = item("Kopi O");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "items", outletId: fixture.outletId, itemIds: [kaya.id, kopi.id] }) });

    const first = await suggest({ text: "kaya toast and kopi" });
    expect(first.suggestion).toEqual({ kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });

    const second = await suggest({ text: "kaya toast and kopi", area: "near Tanjong Pagar" });
    expect(second.suggestion).toMatchObject({
      kind: "items",
      outletId: fixture.outletId,
      matches: [
        { id: kopi.id, name: "Kopi O", unitSgdCents: 160 },
        { id: kaya.id, name: "Kaya toast set", unitSgdCents: 450 },
      ],
    });
  });

  it("an area the buyer did not write is not trusted", async () => {
    // The FIXTURE model fills in an area the buyer never gave.
    script = () => ({ kind: "answer", proposal: proposal({ kind: "items", outletId: fixture.outletId, itemIds: [item("Kopi O").id], area: "Tanjong Pagar" }) });

    const result = await suggest({ text: "kaya toast and kopi" });

    expect(result.suggestion).toEqual({ kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });
  });

  it("a shop outside the stated area is not suggested", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId], area: "Bugis" }) });

    const result = await suggest({ text: "kopi near Bugis" });

    expect(result.suggestion).toEqual({ kind: "no_match" });
  });

  it("a failed model call offers manual selection", async () => {
    script = () => ({ kind: "status", status: 500 });

    const result = await suggest({ text: "kopi near Tanjong Pagar" });

    expect(result.status).toBe(502);
    expect(result.code).toBe("provider_unreachable");
    expect(result.message).toBe("Suggestions are not available right now. Pick a shop from the list instead.");
  });

  it("a model area the buyer did not write as a word is not trusted", async () => {
    // The FIXTURE model reports a one-letter "area" that occurs inside the buyer's words.
    script = () => ({ kind: "answer", proposal: proposal({ kind: "items", outletId: fixture.outletId, itemIds: [item("Kopi O").id], area: "o" }) });

    const result = await suggest({ text: "kopi near me" });

    expect(result.suggestion).toEqual({ kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });
  });

  it("an area that is only part of a word matches no shop", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId] }) });

    const result = await suggest({ text: "kopi", area: "an" });

    expect(result.suggestion).toEqual({ kind: "no_match" });
  });

  it("an area that names more than the shop's area still matches it", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId] }) });

    const result = await suggest({ text: "kopi", area: "Tanjong Pagar MRT" });

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true }] });
  });

  it("a shop the buyer names needs no area", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId] }) });

    const result = await suggest({ text: "breakfast at Lorong Demo Kopi" });

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true }] });
  });

  it("an item marked unavailable is not suggested", async () => {
    const kopi = item("Kopi O");
    const kaya = item("Kaya toast set");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "items", outletId: fixture.outletId, itemIds: [kopi.id, kaya.id], area: "Tanjong Pagar" }) });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = false where id = ${kopi.id}`);
    try {
      const result = await suggest({ text: "kaya toast and kopi near Tanjong Pagar" });

      expect(result.suggestion).toMatchObject({ kind: "items", matches: [{ id: kaya.id }] });
      expect(JSON.stringify(result.suggestion)).not.toContain(kopi.id);
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = true where id = ${kopi.id}`);
    }
  });

  it("an item with no price is not suggested", async () => {
    const teh = item("Teh C peng");
    const kaya = item("Kaya toast set");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "items", outletId: fixture.outletId, itemIds: [teh.id, kaya.id], area: "Tanjong Pagar" }) });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_sgd_cents = null where id = ${teh.id}`);
    try {
      const result = await suggest({ text: "kaya toast and teh near Tanjong Pagar" });

      expect(result.suggestion).toMatchObject({ kind: "items", matches: [{ id: kaya.id }] });
      expect(JSON.stringify(result.suggestion)).not.toContain(teh.id);
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_sgd_cents = 220 where id = ${teh.id}`);
    }
  });

  it("a failed model call is not retried", async () => {
    script = () => ({ kind: "status", status: 500 });

    await suggest({ text: "kopi near Tanjong Pagar" });

    expect(fake.calls).toHaveLength(1);
  });

  it("OpenAI is asked not to store the request", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "no_match" }) });

    await suggest({ text: "kopi near Tanjong Pagar" });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.store).toBe(false);
  });

  it("the buyer's text never reaches the log", async () => {
    const needle = "FIXTUREneedle4471";
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
    const out = vi.spyOn(console, "log").mockImplementation(capture);
    const err = vi.spyOn(console, "error").mockImplementation(capture);
    // Every level reaches the sink here, so nothing is hidden by the fixture's warn threshold.
    const level = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";
    try {
      // Self-test: the captured surface is the logger's real serialized output.
      log("info", "fixture_probe", { note: needle });
      expect(lines.join("\n")).toContain(needle);
      lines.length = 0;

      script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId], area: "Tanjong Pagar" }) });
      await suggest({ text: `${needle} kopi near Tanjong Pagar`, area: `${needle} Tanjong Pagar` });
      script = () => ({ kind: "status", status: 500 });
      await suggest({ text: `${needle} kopi near Tanjong Pagar` });

      expect(lines.some((line) => line.includes("ai_suggestion"))).toBe(true);
      expect(lines.join("\n")).not.toContain(needle);
    } finally {
      process.env.LOG_LEVEL = level;
      out.mockRestore();
      err.mockRestore();
    }
  });

  it("text longer than 280 characters is refused before any model call", async () => {
    const result = await suggest({ text: "k".repeat(281) });

    expect(result.status).toBe(400);
    expect(result.code).toBe("validation_failed");
    expect(fake.calls).toHaveLength(0);
  });

  it("a body over 4 KiB is refused unread", async () => {
    const response = await routes.suggestions.POST(jsonPost("/api/v1/buyer/suggestions", cookie, { text: "kopi near Tanjong Pagar", pad: "x".repeat(4_096) }));
    const envelope = (await response.json()) as { error?: { code: string; details: { reason?: string } } };

    expect(response.status).toBe(400);
    expect(envelope.error).toMatchObject({ code: "validation_failed", details: { reason: "too_large" } });
    expect(fake.calls).toHaveLength(0);
  });

  it("suggestions need a buyer session", async () => {
    const result = await suggest({ text: "kopi near Tanjong Pagar" }, "");

    expect(result.status).toBe(401);
    expect(result.code).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);
  });

  describe("T_AI_BUDGET", () => {
    const principal: BuyerPrincipal = { kind: "buyer", userId: "FIXTURE-buyer", isAnonymous: true };
    let web: ReturnType<typeof connectWeb>;

    beforeAll(() => {
      web = connectWeb(fixture.database.webUrl, 2);
    });
    afterAll(async () => {
      await web.close();
    });

    function model(turn: FakeTurn) {
      // A hung FIXTURE request gives up by itself 200 ms after it is sent, so a budget even
      // 0.2 seconds longer than the approved one fails the next test on its assertion: the
      // request then fails on its own before the budget aborts it.
      const boundary = createFakeOpenAI(() => turn);
      const bounded: typeof globalThis.fetch = (input, init) => {
        const signal = AbortSignal.any([init?.signal ?? new AbortController().signal, AbortSignal.timeout(200)]);
        return boundary.fetch(input, { ...init, signal });
      };
      return createOpenAISuggestionModel({ apiKey: "fixture-openai-key", model: "FIXTURE-model", fetch: bounded });
    }

    it("a model still working 30 seconds after the request started yields budget_exceeded", async () => {
      const startedAt = new Date(Date.now() - 29_950);

      const result = await suggestFromText(web.db, principal, { text: "kopi near Tanjong Pagar" }, startedAt, model({ kind: "hang" }));

      expect(result).toEqual({ kind: "budget_exceeded" });
    });

    it("a model answering 29.8 seconds after the request started is not cut off", async () => {
      const startedAt = new Date(Date.now() - 29_800);

      const result = await suggestFromText(web.db, principal, { text: "kopi near Tanjong Pagar" }, startedAt, model({ kind: "answer", proposal: proposal({ kind: "no_match" }) }));

      expect(result).toEqual({ kind: "no_match" });
    });
  });
});
