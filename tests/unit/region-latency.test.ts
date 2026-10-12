import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Visit = { label: string; status: number; fixtureLabeled: boolean; interactiveMs: number; dbMs: number };
type Evidence = { client: { location: string }; budgetMs: number; r12DatabaseThresholdMs: number; visits: Visit[] };

// The claim rests on the recorded S1 measurement; without the evidence file this test fails.
const evidence = JSON.parse(
  readFileSync(new URL("../../docs/plans/envoi/evidence/s1-r12-latency.json", import.meta.url), "utf8"),
) as Evidence;

describe("region latency is measured, not assumed", () => {
  const cold = evidence.visits.filter((visit) => visit.label.startsWith("cold-"));

  it("records at least three cold first visits and a warm one from a stated Singapore client", () => {
    expect(evidence.client.location).toMatch(/Singapore/);
    expect(cold.length).toBeGreaterThanOrEqual(3);
    expect(evidence.visits.some((visit) => visit.label.startsWith("warm-"))).toBe(true);
    for (const visit of evidence.visits) expect(visit).toMatchObject({ status: 200, fixtureLabeled: true });
  });

  it("every cold visit fits the three-minute budget and keeps the database share under the R12 threshold", () => {
    expect(evidence.budgetMs).toBe(180_000);
    expect(evidence.r12DatabaseThresholdMs).toBe(18_000);
    for (const visit of cold) {
      expect(visit.interactiveMs, visit.label).toBeLessThan(evidence.budgetMs);
      expect(visit.dbMs, visit.label).toBeLessThanOrEqual(evidence.r12DatabaseThresholdMs);
    }
  });
});
