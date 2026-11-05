import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeter, usageCost, scoreOutcome, type Basket, type Expected, type Observation } from "../../docs/plans/envoi/evidence/s32-language-eval.mjs";

// FIXTURE outcomes only. Neither OpenAI nor a database is called by these scoring tests.
const expected: Expected = { kind: "basket", shop: "Test Shop", lines: [["Kopi C", 2], ["Iced milk tea", 1]] };
const basket: Basket = { shop: "Test Shop", lines: [["Kopi C", 2], ["Iced milk tea", 1]] };
const observed: Observation = { got: { kind: "basket", ...basket }, baskets: [basket], modelWrittenLinks: 0 };

describe("S32 FIXTURE language evaluation scoring", () => {
  it("the language evaluation counts a wrong basket link as a failure", () => {
    const wrong: Basket = { ...basket, shop: "Lorong Demo Kopi" };
    expect(scoreOutcome(expected, { ...observed, baskets: [wrong, basket] })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("rejects a link containing an unrequested item", () => {
    const wrong: Basket = { ...basket, lines: [["Kopi O", 2], ["Iced milk tea", 1]] };
    expect(scoreOutcome(expected, { ...observed, baskets: [wrong, basket] })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("rejects a link with the wrong quantity", () => {
    const wrong: Basket = { ...basket, lines: [["Kopi C", 1], ["Iced milk tea", 1]] };
    expect(scoreOutcome(expected, { ...observed, baskets: [wrong, basket] })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("rejects an extra line instead of ignoring it", () => {
    const wrong: Basket = { ...basket, lines: [...basket.lines, ["Kopi C", 2]] };
    expect(scoreOutcome(expected, { ...observed, baskets: [wrong, basket] })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("counts a basket on an unavailable case as a wrong link", () => {
    const unavailable: Expected = { kind: "unavailable_item", shop: "Test Shop", names: ["Kaya toast set"] };
    expect(scoreOutcome(unavailable, { ...observed, got: { ...unavailable } })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("counts a model-written URL as a wrong link", () => {
    expect(scoreOutcome(expected, { ...observed, modelWrittenLinks: 1 })).toEqual({ structuralPass: false, wrongLinks: 1 });
  });
  it("requires the returned basket even when a correct proposal was captured", () => {
    expect(scoreOutcome(expected, { ...observed, got: { kind: "failed" } })).toEqual({ structuralPass: false, wrongLinks: 0 });
  });
  it("requires a captured proposal and allows line reordering", () => {
    expect(scoreOutcome(expected, { ...observed, baskets: [] })).toEqual({ structuralPass: false, wrongLinks: 0 });
    const reversed = { ...basket, lines: [...basket.lines].reverse() };
    expect(scoreOutcome(expected, { got: { kind: "basket", ...reversed }, baskets: [reversed], modelWrittenLinks: 0 })).toEqual({ structuralPass: true, wrongLinks: 0 });
  });
  it("requires both ambiguity choices and the requested quantity", () => {
    const choose: Expected = { kind: "choose", shop: "Test Shop", names: ["Iced lemon tea", "Iced milk tea"], quantity: 3 };
    expect(scoreOutcome(choose, { got: { ...choose }, baskets: [], modelWrittenLinks: 0 })).toEqual({ structuralPass: true, wrongLinks: 0 });
    expect(scoreOutcome(choose, { got: { ...choose, names: ["Iced lemon tea"] }, baskets: [], modelWrittenLinks: 0 })).toEqual({ structuralPass: false, wrongLinks: 0 });
    expect(scoreOutcome(choose, { got: { ...choose, quantity: 1 }, baskets: [], modelWrittenLinks: 0 })).toEqual({ structuralPass: false, wrongLinks: 0 });
  });
  it("requires the unavailable item at the right shop", () => {
    const unavailable: Expected = { kind: "unavailable_item", shop: "Test Shop", names: ["Kaya toast set"] };
    expect(scoreOutcome(unavailable, { got: unavailable, baskets: [], modelWrittenLinks: 0 })).toEqual({ structuralPass: true, wrongLinks: 0 });
    expect(scoreOutcome(unavailable, { got: { ...unavailable, shop: "Lorong Demo Kopi" }, baskets: [], modelWrittenLinks: 0 })).toEqual({ structuralPass: false, wrongLinks: 0 });
  });
});

const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });
function ledgerPath() {
  const dir = mkdtempSync(join(tmpdir(), "s32-FIXTURE-"));
  scratch.push(dir);
  return join(dir, "ledger.json");
}
const request = { method: "POST", body: JSON.stringify({ model: "gpt-6-sol", input: "FIXTURE sentence", max_output_tokens: 99999 }) };
const endpoint = "https://api.openai.com/v1/responses";
const usage = { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 } };

describe("S32 FIXTURE spend boundary, no real provider", () => {
  it("charges cached tokens once and bounds output before forwarding", async () => {
    const path = ledgerPath();
    let forwardedBody = "";
    const provider = vi.fn<typeof fetch>(async (_url, init) => {
      forwardedBody = String(init?.body);
      return Response.json({ model: "gpt-6-sol", service_tier: "default", usage });
    });
    const meter = createMeter(path, provider);
    await meter.fetch(endpoint, request);
    expect(JSON.parse(forwardedBody).max_output_tokens).toBe(2000);
    expect(JSON.parse(forwardedBody).service_tier).toBe("default");
    expect(meter.ledger).toEqual({ spentUsd: 0.00264, reservedUsd: 0, requests: 1, inputTokens: 1000, cachedTokens: 200, outputTokens: 100, cacheWriteTokens: 0, longCacheWriteTokens: 0, cacheUpperBoundTokens: 0 });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(meter.ledger);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("refuses a request before it can exceed the shared US$1 cap", async () => {
    const path = ledgerPath();
    writeFileSync(path, JSON.stringify({ spentUsd: 0.99, reservedUsd: 0, requests: 10, inputTokens: 1000, cachedTokens: 0, outputTokens: 100, cacheWriteTokens: 0, longCacheWriteTokens: 0 }));
    const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage }));
    const meter = createMeter(path, provider);
    await expect(meter.fetch(endpoint, request)).rejects.toThrow("spend cap");
    expect(provider).not.toHaveBeenCalled();
    expect(meter.isStopped()).toBe(true);
  });
  it("keeps unknown usage reserved and refuses a subsequent request", async () => {
    const provider = vi.fn<typeof fetch>(async () => Response.json({}));
    const path = ledgerPath();
    const meter = createMeter(path, provider);
    await expect(meter.fetch(endpoint, request)).rejects.toThrow("charge remains reserved");
    expect(meter.ledger.reservedUsd).toBeGreaterThan(0);
    await expect(meter.fetch(endpoint, request)).rejects.toThrow("already stopped");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(() => createMeter(path, provider)).toThrow("unresolved earlier model charge");
  });
  it("rejects another endpoint and another model before forwarding", async () => {
    const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage }));
    const meter = createMeter(ledgerPath(), provider);
    await expect(meter.fetch("https://fixture.invalid/responses", request)).rejects.toThrow();
    await expect(meter.fetch(endpoint, { ...request, body: JSON.stringify({ model: "another-model" }) })).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it("rejects impossible cached usage", () => {
    expect(() => usageCost(100, 101, 10)).toThrow();
  });
});

describe("S32 FIXTURE cache-write accounting", () => {
  it("charges short and long cache writes without double counting", () => {
    // Literal fixture: 1000 ordinary, 4000 read, 3000 short-write, 4000 long-write, 100 output.
    expect(usageCost(12000, 4000, 100, 7000, 4000)).toBe(0.0313);
  });
  it("rejects overlapping cache reads and writes", () => {
    expect(() => usageCost(100, 60, 0, 41)).toThrow("cache-write counts exceed input usage");
  });
  it("reserves the highest cache-write rate before forwarding", async () => {
    const path = ledgerPath();
    writeFileSync(path, JSON.stringify({ spentUsd: 0.972, reservedUsd: 0, requests: 10, inputTokens: 1000, cachedTokens: 0, outputTokens: 100, cacheWriteTokens: 0, longCacheWriteTokens: 0 }));
    const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage }));
    const meter = createMeter(path, provider);
    await expect(meter.fetch(endpoint, request)).rejects.toThrow("spend cap");
    expect(provider).not.toHaveBeenCalled();
  });
  it("prices missing cache-write lifetime at the highest rate", async () => {
    const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage: { ...usage, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } } }));
    const meter = createMeter(ledgerPath(), provider);
    await meter.fetch(endpoint, request);
    expect(meter.ledger.spentUsd).toBe(0.00354);
    expect(meter.ledger.cacheUpperBoundTokens).toBe(300);
    expect(meter.ledger.longCacheWriteTokens).toBe(0);
    expect(meter.ledger.reservedUsd).toBe(0);
  });
  it("refuses a response with an unexpected model or processing tier", async () => {
    for (const field of ["model", "service_tier"]) {
      const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage, [field]: "unexpected" }));
      const meter = createMeter(ledgerPath(), provider);
      await expect(meter.fetch(endpoint, request)).rejects.toThrow("charge remains reserved");
      expect(meter.ledger.reservedUsd).toBeGreaterThan(0);
    }
  });
});

it("keeps an earlier unresolved charge inside the continuation cap", async () => {
  const path = ledgerPath();
  writeFileSync(path, JSON.stringify({ spentUsd: 0.90, reservedUsd: 0.08, requests: 10, inputTokens: 1000, cachedTokens: 0, outputTokens: 100, cacheWriteTokens: 0, longCacheWriteTokens: 0 }));
  const provider = vi.fn<typeof fetch>(async () => Response.json({ model: "gpt-6-sol", service_tier: "default", usage }));
  const meter = createMeter(path, provider, { allowReserved: true });
  await expect(meter.fetch(endpoint, request)).rejects.toThrow("spend cap");
  expect(provider).not.toHaveBeenCalled();
  expect(meter.ledger.reservedUsd).toBe(0.08);
});
