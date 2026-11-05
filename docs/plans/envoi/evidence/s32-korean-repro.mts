// Diagnostic only: perfect FIXTURE model answers, real local DB and box settlement.
// The spaced strings are unregistered counterfactuals, never replacements for S32's fixed sentences.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { suggestFromText, containsWords, normalize } from "@/domain/suggestions/suggest";
import { createOpenAISuggestionModel } from "@/integrations/ai/openai";
import { connectWeb } from "@/lib/db/web";
import { seedFixtureMenus } from "./s32-language-eval.mjs";
import { createTestDatabase } from "../../../../tests/support/db";
import { createFakeOpenAI, proposal } from "../../../../tests/support/fake-openai";

assert(process.env.TEST_DATABASE_URL?.startsWith("postgres://postgres@127.0.0.1:5432/"), "local fixture DB required");
const database = await createTestDatabase("s32korean");
const web = connectWeb(database.webUrl, 2);
const rows: unknown[] = [];
try {
  const menus = await seedFixtureMenus(database, web);
  const cases: { id: string; language: string; sentence: string; expected: { kind: string; shop: string; lines?: [string, number][]; names?: string[]; quantity?: number } }[] = JSON.parse(readFileSync("docs/plans/envoi/evidence/s32-language-cases.json", "utf8"));
  for (const entry of cases.filter((entry) => entry.language === "ko")) {
    const menu = menus.find((menu) => menu.outlet.name === entry.expected.shop);
    assert(menu);
    const idFor = (name: string) => { const item = menu.items.find((item) => item.name === name); assert(item); return item.id; };
    const lines = entry.expected.kind === "basket" ? entry.expected.lines?.map(([name, quantity]) => ({ itemId: idFor(name), quantity })) : [{ itemId: idFor(entry.expected.names?.[0] ?? ""), quantity: entry.expected.quantity ?? 1 }];
    const perfect = proposal({ kind: entry.expected.kind === "choose" ? "choose" : "basket", outletId: menu.outlet.id, lines, choices: entry.expected.kind === "choose" ? entry.expected.names?.map(idFor) : [] });
    const spaced = entry.sentence.replace(`${entry.expected.shop}에서`, `${entry.expected.shop} 에서`);
    assert.notEqual(spaced, entry.sentence);
    assert.equal(containsWords(normalize(entry.sentence), normalize(menu.outlet.name)), false);
    assert.equal(containsWords(normalize(spaced), normalize(menu.outlet.name)), true);
    const outcomes = [];
    for (const text of [entry.sentence, spaced]) {
      const fake = createFakeOpenAI(() => ({ kind: "answer", proposal: perfect }));
      const result = await suggestFromText(web.db, { kind: "buyer", userId: "FIXTURE-s32-diagnostic", isAnonymous: true }, { text }, new Date(), createOpenAISuggestionModel({ apiKey: "FIXTURE-no-key", model: "FIXTURE-perfect-proposal", fetch: fake.fetch }));
      outcomes.push(result);
    }
    assert.deepEqual(outcomes[0], { kind: "clarification", question: "Which area are you in? For example, Tanjong Pagar.", missing: ["area"] });
    assert.equal(outcomes[1]?.kind, entry.expected.kind);
    rows.push({ id: entry.id, original: entry.sentence, unregisteredCounterfactual: spaced, expected: entry.expected, originalGot: outcomes[0], counterfactualGot: outcomes[1] });
  }
} finally {
  await web.close();
  await database.drop();
}
assert.equal(rows.length, 5);
writeFileSync("docs/plans/envoi/evidence/s32-korean-repro.json", JSON.stringify({ label: "FIXTURE perfect model replies at provider fetch; local PostgreSQL; no real model; counterfactuals are NOT registered evaluation replacements", ranAt: new Date().toISOString(), finding: "All five attached Korean shop-name particles are rejected by whole-word scope validation; a space changes only the scope match and all five intended outcomes settle", rows }, null, 2) + "\n");
console.log("Korean scope counterexample reproduced in all five fixed cases; all five unregistered spaced controls settle correctly. No real model call.");
