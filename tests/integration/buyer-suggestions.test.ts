import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestFromText } from "@/domain/suggestions/suggest";
import type { Suggestion } from "@/domain/suggestions/types";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import { newId } from "@/lib/ids";
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

  // Read inside a case: the fixture's ids exist only after beforeAll has built the database.
  const outlet = () => ({ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true, country: "SG", currency: "SGD" });

  // A second FIXTURE shop, published or not, so a sent outletId can be shown to widen the scope of
  // that shop alone. Removed by the case that adds it; no other case sees it. Real id shapes, because
  // getPublishedMenu refuses any other.
  async function addFixtureShop(key: string, name: string, published: boolean): Promise<{ outletId: string; itemId: string }> {
    const outletId = newId("out");
    const revision = newId("mrv");
    const itemId = newId("itm");
    await fixture.database.admin`insert into outlets (id, name, area, is_demo_fixture, fixture_key, created_at) values (${outletId}, ${name}, ${"Bugis"}, true, ${key}, now())`;
    await fixture.database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at, created_at) values (${revision}, ${outletId}, 'confirmed', now(), now())`;
    await fixture.database.admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_minor, available) values (${itemId}, ${itemId}, ${revision}, 0, ${name}, 100, true)`;
    if (published) await fixture.database.admin`update outlets set published_menu_revision_id = ${revision} where id = ${outletId}`;
    return { outletId, itemId };
  }

  // outlets and menu_revisions reference each other, so the cleanup runs with the triggers off, as
  // the other hand edits here do, and still removes every row it added.
  async function removeFixtureShop(key: string): Promise<void> {
    await handEditPublishedMenu(fixture.database.admin, async (sql) => {
      const rows = await sql<{ id: string }[]>`select id from outlets where fixture_key = ${key}`;
      for (const row of rows) {
        await sql`delete from menu_items where menu_revision_id in (select id from menu_revisions where outlet_id = ${row.id})`;
        await sql`delete from menu_revisions where outlet_id = ${row.id}`;
        await sql`delete from outlets where id = ${row.id}`;
      }
    });
  }

  // The rows Gate 3's settle rule 7 says a suggestion never creates. The limiter's own
  // rate_limit_hits row is written by design (D9) and is not one of them.
  async function writtenRows(): Promise<Record<string, number>> {
    const [row] = await fixture.database.admin<{ purchases: number; attempts: number; audits: number; requests: number }[]>`
      select (select count(*)::int from purchases) as purchases,
             (select count(*)::int from payment_attempts) as attempts,
             (select count(*)::int from audit_events) as audits,
             (select count(*)::int from purchase_requests) as requests`;
    return row!;
  }

  async function suggest(body: { text: string; area?: string; outletId?: string }, as = cookie): Promise<{ status: number; suggestion?: Suggestion; code?: string; message?: string }> {
    const response = await routes.suggestions.POST(jsonPost("/api/v1/buyer/suggestions", as, body));
    const envelope = (await response.json()) as { data?: { suggestion: Suggestion }; error?: { code: string; message: string } };
    return { status: response.status, suggestion: envelope.data?.suggestion, code: envelope.error?.code, message: envelope.error?.message };
  }

  it("model cannot invent a price", async () => {
    const kaya = item("Kaya toast set");
    script = (index) =>
      index === 0
        ? { kind: "tools", calls: [{ name: "get_published_menu", args: { outletId: fixture.outletId } }] }
        : { kind: "answer", proposal: { ...proposal({ kind: "items", outletId: fixture.outletId, itemIds: [kaya.id, "itm_inventedbythemodel"], area: "Tanjong Pagar" }), unitMinor: 1 } };

    const result = await suggest({ text: "kaya toast near Tanjong Pagar" });

    expect(result.status).toBe(200);
    expect(result.suggestion).toEqual({
      kind: "items",
      outletId: fixture.outletId,
      outlet: { id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true, country: "SG", currency: "SGD" },
      matches: [{ id: kaya.id, name: "Kaya toast set", unitMinor: 450, available: true }],
    });
  });

  it("an unregistered outlet id is dropped", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: ["out_inventedbythemodel", fixture.outletId], area: "Tanjong Pagar" }) });

    const result = await suggest({ text: "coffee near Tanjong Pagar" });

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true, country: "SG", currency: "SGD" }] });
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
      expect(output).not.toMatch(/unitMinor|price|S\$|\b(160|450|220|200)\b/i);
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
        { id: kopi.id, name: "Kopi O", unitMinor: 160 },
        { id: kaya.id, name: "Kaya toast set", unitMinor: 450 },
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

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true, country: "SG", currency: "SGD" }] });
  });

  it("a shop the buyer names needs no area", async () => {
    script = () => ({ kind: "answer", proposal: proposal({ kind: "outlets", outletIds: [fixture.outletId] }) });

    const result = await suggest({ text: "breakfast at Lorong Demo Kopi" });

    expect(result.suggestion).toEqual({ kind: "outlets", matches: [{ id: fixture.outletId, name: "Lorong Demo Kopi", area: "Tanjong Pagar", isDemoFixture: true, country: "SG", currency: "SGD" }] });
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
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_minor = null where id = ${teh.id}`);
    try {
      const result = await suggest({ text: "kaya toast and teh near Tanjong Pagar" });

      expect(result.suggestion).toMatchObject({ kind: "items", matches: [{ id: kaya.id }] });
      expect(JSON.stringify(result.suggestion)).not.toContain(teh.id);
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_minor = 220 where id = ${teh.id}`);
    }
  });

  // Gate 3 named test 4 (S21). The model proposes four lines; only the two that are on this shop's
  // published menu with a price survive, and their prices are the registry's.
  it("a basket holds only published available priced items", async () => {
    const kopi = item("Kopi O");
    const kaya = item("Kaya toast set");
    const teh = item("Teh C peng");
    script = () => ({
      kind: "answer",
      proposal: proposal({
        kind: "basket",
        outletId: fixture.outletId,
        lines: [
          { itemId: kopi.id, quantity: 2 },
          { itemId: "itm_inventedbythemodel", quantity: 1 },
          { itemId: kaya.id, quantity: 1 },
          { itemId: teh.id, quantity: 3 },
        ],
        area: "Tanjong Pagar",
      }),
    });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_minor = null where id = ${teh.id}`);
    try {
      const result = await suggest({ text: "two kopi o and kaya toast near Tanjong Pagar" });

      expect(result.suggestion).toEqual({
        kind: "basket",
        outletId: fixture.outletId,
        outlet: outlet(),
        lines: [
          { item: { id: kopi.id, name: "Kopi O", unitMinor: 160, available: true }, quantity: 2 },
          { item: { id: kaya.id, name: "Kaya toast set", unitMinor: 450, available: true }, quantity: 1 },
        ],
      });
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set unit_minor = 220 where id = ${teh.id}`);
    }
  });

  // Gate 3 named test 5 (S21), settle rule 4: an item the shop published but marked unavailable is
  // named, and the whole answer becomes unavailable, so nothing else is added either.
  it("an unavailable item is named and never added", async () => {
    const kopi = item("Kopi O");
    const kaya = item("Kaya toast set");
    script = () => ({
      kind: "answer",
      proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kaya.id, quantity: 1 }, { itemId: kopi.id, quantity: 2 }], area: "Tanjong Pagar" }),
    });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = false where id = ${kaya.id}`);
    try {
      const result = await suggest({ text: "kaya toast and two kopi o near Tanjong Pagar" });

      expect(result.suggestion).toEqual({ kind: "unavailable_item", outletId: fixture.outletId, outlet: outlet(), items: [{ id: kaya.id, name: "Kaya toast set" }] });
      expect(JSON.stringify(result.suggestion)).not.toContain(kopi.id);
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = true where id = ${kaya.id}`);
    }
  });

  // Gate 3 named test 6 (S21), settle rule 5: a quantity outside the bound asks again rather than
  // reaching a clamped basket, and 20 itself is the bound, not one past it.
  it("a quantity outside 1 to 20 asks again", async () => {
    const kopi = item("Kopi O");
    const asksAgain = { kind: "clarification", question: "What would you like to buy?", missing: ["item"] };
    for (const quantity of [0, -1, 21, 2.5]) {
      script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kopi.id, quantity }], area: "Tanjong Pagar" }) });
      const refused = await suggest({ text: `${quantity} kopi o near Tanjong Pagar` });
      expect(refused.suggestion, `quantity ${quantity}`).toEqual(asksAgain);
    }

    script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kopi.id, quantity: 20 }], area: "Tanjong Pagar" }) });
    const allowed = await suggest({ text: "twenty kopi o near Tanjong Pagar" });
    expect(allowed.suggestion).toMatchObject({ kind: "basket", lines: [{ quantity: 20 }] });
  });

  // Gate 3 named test 7 (S21), settle rule 6: two published items that fit one phrase are offered as
  // a choice with the quantity the buyer gave, and an id the menu does not hold is not offered.
  it("two fitting items ask which one", async () => {
    const kopi = item("Kopi O");
    const teh = item("Teh C peng");
    script = () => ({
      kind: "answer",
      proposal: proposal({ kind: "choose", outletId: fixture.outletId, choices: [kopi.id, teh.id, "itm_inventedbythemodel"], lines: [{ itemId: kopi.id, quantity: 2 }], area: "Tanjong Pagar" }),
    });

    const result = await suggest({ text: "two drinks near Tanjong Pagar" });

    expect(result.suggestion).toEqual({
      kind: "choose",
      outletId: fixture.outletId,
      outlet: outlet(),
      quantity: 2,
      matches: [
        { id: kopi.id, name: "Kopi O", unitMinor: 160, available: true },
        { id: teh.id, name: "Teh C peng", unitMinor: 220, available: true },
      ],
    });
  });

  // Gate 3 named test 8 (S21), settle rule 6: one survivor is the basket the buyer meant.
  it("one surviving choice becomes a basket", async () => {
    const kopi = item("Kopi O");
    const teh = item("Teh C peng");
    script = () => ({
      kind: "answer",
      proposal: proposal({ kind: "choose", outletId: fixture.outletId, choices: [kopi.id, teh.id], lines: [{ itemId: kopi.id, quantity: 3 }], area: "Tanjong Pagar" }),
    });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = false where id = ${teh.id}`);
    try {
      const result = await suggest({ text: "three drinks near Tanjong Pagar" });

      expect(result.suggestion).toEqual({
        kind: "basket",
        outletId: fixture.outletId,
        outlet: outlet(),
        lines: [{ item: { id: kopi.id, name: "Kopi O", unitMinor: 160, available: true }, quantity: 3 }],
      });
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = true where id = ${teh.id}`);
    }
  });

  // Beyond the named tests, settle rule 6's tail: no survivor is no match, not an empty choice.
  it("a choice with no survivor is no match", async () => {
    const kopi = item("Kopi O");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "choose", outletId: fixture.outletId, choices: [kopi.id], lines: [{ itemId: kopi.id, quantity: 2 }], area: "Tanjong Pagar" }) });
    await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = false where id = ${kopi.id}`);
    try {
      const result = await suggest({ text: "two kopi o near Tanjong Pagar" });

      expect(result.suggestion).toEqual({ kind: "no_match" });
    } finally {
      await handEditPublishedMenu(fixture.database.admin, (sql) => sql`update menu_items set available = true where id = ${kopi.id}`);
    }
  });

  // Beyond the named tests: a choice carries one quantity for whichever item the buyer picks, so two
  // different quantities ask again rather than one of them being chosen for them.
  it("a choice carrying two quantities asks again", async () => {
    const kopi = item("Kopi O");
    const teh = item("Teh C peng");
    script = () => ({
      kind: "answer",
      proposal: proposal({ kind: "choose", outletId: fixture.outletId, choices: [kopi.id, teh.id], lines: [{ itemId: kopi.id, quantity: 2 }, { itemId: teh.id, quantity: 3 }], area: "Tanjong Pagar" }),
    });

    const result = await suggest({ text: "two or three drinks near Tanjong Pagar" });

    expect(result.suggestion).toEqual({ kind: "clarification", question: "What would you like to buy?", missing: ["item"] });
  });

  // Gate 3 named test 9 (S21), settle rules 1 and 2.
  it("an outletId puts that shop in scope and nothing else", async () => {
    const kopi = item("Kopi O");
    const second = await addFixtureShop("s21second", "Fixture Second Kopitiam", true);
    const unpublished = await addFixtureShop("s21draft", "Fixture Unpublished Kopitiam", false);
    try {
      // The buyer named no area and no shop: the id they sent is what puts that shop in scope.
      script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kopi.id, quantity: 2 }] }) });
      const scoped = await suggest({ text: "two kopi o", outletId: fixture.outletId });
      expect(scoped.suggestion).toMatchObject({ kind: "basket", outletId: fixture.outletId, lines: [{ quantity: 2 }] });

      // An unknown or unpublished id answers exactly as if it were absent.
      for (const outletId of ["out_s21unknown", unpublished.outletId]) {
        const absent = await suggest({ text: "two kopi o", outletId });
        expect(absent.suggestion, outletId).toEqual({ kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });
      }

      // And nothing else: the sent id does not put a different published shop in scope.
      script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: second.outletId, lines: [{ itemId: second.itemId, quantity: 2 }] }) });
      const other = await suggest({ text: "two kopi o", outletId: fixture.outletId });
      expect(other.suggestion).toEqual({ kind: "no_match" });
    } finally {
      await removeFixtureShop("s21second");
      await removeFixtureShop("s21draft");
    }
  });

  // Gate 3 named test 10 (S21), settle rule 1: a shop the buyer named needs no area to fill a basket.
  it("a shop named in the sentence needs no area", async () => {
    const kopi = item("Kopi O");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kopi.id, quantity: 2 }] }) });

    const result = await suggest({ text: "two kopi o at Lorong Demo Kopi" });

    expect(result.suggestion).toMatchObject({ kind: "basket", outletId: fixture.outletId, lines: [{ quantity: 2 }] });
  });

  // Gate 3 named test 11 (S21), settle rule 7: a suggestion is a proposal and writes no review,
  // purchase, hold or audit row. The limiter's own row is written by design and is not one of them.
  it("a suggestion writes nothing", async () => {
    const kopi = item("Kopi O");
    script = () => ({ kind: "answer", proposal: proposal({ kind: "basket", outletId: fixture.outletId, lines: [{ itemId: kopi.id, quantity: 2 }], area: "Tanjong Pagar" }) });
    const before = await writtenRows();

    const result = await suggest({ text: "two kopi o near Tanjong Pagar" });

    expect(result.suggestion).toMatchObject({ kind: "basket" });
    expect(await writtenRows()).toEqual(before);
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
