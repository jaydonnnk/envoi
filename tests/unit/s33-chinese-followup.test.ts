import { describe, expect, it, vi } from "vitest";
import { assertRegistered, CAP_USD, cappedFetch, chineseCases, PATHS, verdict, type Row } from "../../docs/plans/envoi/evidence/s33-chinese-followup.mjs";

// S33 Chinese follow-up scoring and cap. FIXTURE: no real provider.
const cases = chineseCases();
const all = (over: Partial<Row> = {}): Row[] => cases.flatMap(({ id }) => PATHS.map((path) => ({ id, path, structuralPass: true, wrongLinks: 0, semantic: "pass" as const, ...over })));

describe("S33 FIXTURE Chinese follow-up", () => {
  it("reuses the five original sentences", () => {
    expect(cases.map((row) => row.sentence)).toContain("我要在 Lorong Demo Kopi 买两杯黑咖啡（Kopi O）。");
    expect(cases).toHaveLength(5);
  });

  it("is eligible only at 5/5 on each path with zero wrong links", () => {
    expect(verdict(cases, all())).toEqual({ assistant: 5, box: 5, wrongLinks: 0, complete: true, eligible: true });
  });

  it("never counts a missing outcome as a pass", () => {
    const result = verdict(cases, all().slice(0, -1));
    expect(result.complete).toBe(false);
    expect(result.eligible).toBe(false);
  });

  it("needs a recorded semantic pass, not structure alone", () => {
    const rows = all();
    rows[0] = { ...rows[0]!, semantic: undefined };
    expect(verdict(cases, rows).eligible).toBe(false);
  });

  it("a single wrong link fails an otherwise perfect run", () => {
    const rows = all();
    rows[3] = { ...rows[3]!, wrongLinks: 1 };
    expect(verdict(cases, rows).eligible).toBe(false);
  });

  it("refuses a request that could pass the follow-up cap before the meter sees it", () => {
    const meter = vi.fn<typeof fetch>();
    expect(() => cappedFetch(meter, { spentUsd: CAP_USD - 0.1, reservedUsd: 0 })("https://api.openai.com/v1/responses")).toThrow("spend cap");
    expect(() => cappedFetch(meter, { spentUsd: 0, reservedUsd: CAP_USD - 0.1 })("https://api.openai.com/v1/responses")).toThrow("spend cap");
    expect(meter).not.toHaveBeenCalled();
    cappedFetch(meter, { spentUsd: 0, reservedUsd: 0 })("https://api.openai.com/v1/responses");
    expect(meter).toHaveBeenCalledTimes(1);
  });

  it("refuses a run whose sentence differs from its pre-registration", () => {
    const row = (entry: (typeof cases)[number]) => `| ${entry.id} | ${entry.language} | ${entry.sentence} | \`${JSON.stringify(entry.expected)}\` |`;
    const status = (rows: string[]) => `#### S33 Chinese follow-up pre-registration\n5/5 on each path with zero wrong links\n${rows.join("\n")}\n`;
    expect(() => assertRegistered(status(cases.map(row)), cases)).not.toThrow();
    expect(() => assertRegistered(status(cases.map(row).slice(1)), cases)).toThrow("zh1");
    expect(() => assertRegistered("no section", cases)).toThrow("missing");
  });
});
