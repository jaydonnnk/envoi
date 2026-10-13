import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestFromText } from "@/domain/suggestions/suggest";
import type { Suggestion } from "@/domain/suggestions/types";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import { createFakeOpenAI, FIXTURE_AI_ENV, proposal, type FakeOpenAI, type FakeTurn } from "../support/fake-openai";
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
      // A hung FIXTURE request gives up by itself after 2 seconds, so a budget longer than the
      // approved one fails this test on its assertion rather than on the test timeout.
      const boundary = createFakeOpenAI(() => turn);
      const bounded: typeof globalThis.fetch = (input, init) => {
        const signal = AbortSignal.any([init?.signal ?? new AbortController().signal, AbortSignal.timeout(2_000)]);
        return boundary.fetch(input, { ...init, signal });
      };
      return createOpenAISuggestionModel({ apiKey: "fixture-openai-key", model: "FIXTURE-model", fetch: bounded });
    }

    it("a model still working 30 seconds after the request started yields budget_exceeded", async () => {
      const startedAt = new Date(Date.now() - 29_950);

      const result = await suggestFromText(web.db, principal, { text: "kopi near Tanjong Pagar" }, startedAt, model({ kind: "hang" }));

      expect(result).toEqual({ kind: "budget_exceeded" });
    });

    it("a model answering 25 seconds after the request started is not cut off", async () => {
      const startedAt = new Date(Date.now() - 25_000);

      const result = await suggestFromText(web.db, principal, { text: "kopi near Tanjong Pagar" }, startedAt, model({ kind: "answer", proposal: proposal({ kind: "no_match" }) }));

      expect(result).toEqual({ kind: "no_match" });
    });
  });
});
