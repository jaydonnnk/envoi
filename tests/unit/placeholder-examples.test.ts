import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S41: the example sentence in each buyer box has to be one the seeded fixture shop can actually
// answer. The live defect was an Ask Envoi example naming Kopi C, which Lorong Demo Kopi does not
// sell, so the first thing a judge was invited to type could not work.

const ROOT = join(import.meta.dirname, "..", "..");
const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

// The operator's own definition of the seeded fixture shop: its name, area and published items.
const cli = source("src/operator/cli.ts");
const FIXTURE_NAME = /name: "([^"]+)"/.exec(cli)?.[1] ?? "";
const FIXTURE_AREA = /area: "([^"]+)"/.exec(cli)?.[1] ?? "";
// unitMinor is the seeded fixture's own field; the operator's other item list uses priceMinor.
const FIXTURE_ITEMS = [...cli.matchAll(/\{ name: "([^"]+)", unitMinor: \d+ \}/g)].map((match) => match[1] ?? "");

function placeholderOf(file: string): string {
  return /placeholder="([^"]+)"/.exec(source(file))?.[1] ?? "";
}

describe("buyer box examples", () => {
  it("reads the seeded fixture shop the examples must match", () => {
    expect(FIXTURE_NAME).toBe("Lorong Demo Kopi");
    expect(FIXTURE_AREA).toBe("Tanjong Pagar");
    expect(FIXTURE_ITEMS).toEqual(["Kopi O", "Kaya toast set", "Teh C peng", "Soft-boiled eggs (2)"]);
  });

  it("the Ask Envoi example names only items that shop sells", () => {
    const example = placeholderOf("src/app/buy/ask/ask-envoi.tsx");

    expect(example).toContain(FIXTURE_NAME);
    expect(example).toContain("Kopi O");
    expect(example.toLowerCase()).toContain("kaya toast set");
    // Kopi C belongs to the other fixture shop. Naming it here is the defect this guard exists for.
    expect(example).not.toContain("Kopi C");
    for (const named of ["Kopi O", "Kaya toast set"]) expect(FIXTURE_ITEMS, named).toContain(named);
  });

  it("the one-sentence box example is answerable by a shop in the area it names", () => {
    const example = placeholderOf("src/app/buy/text-suggest.tsx").toLowerCase();

    expect(example).toContain(FIXTURE_AREA.toLowerCase());
    expect(example).toContain("kaya toast");
    expect(example).toContain("kopi");
    expect(FIXTURE_ITEMS.some((name) => name.toLowerCase().startsWith("kaya toast")), "kaya toast").toBe(true);
    expect(FIXTURE_ITEMS.some((name) => name.toLowerCase().startsWith("kopi")), "kopi").toBe(true);
  });
});
