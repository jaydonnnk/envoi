import { describe, expect, it } from "vitest";
import { needsMerchant, nextProblem, noteOf, visibleRows, type GridRow } from "@/app/merchant/setup/menu-grid";
import { excerptFor } from "@/domain/imports/verbatim";
import { money } from "@/lib/money";

// S30 named test 31 and the excerpt rule. The filter and the walk are the functions the table uses;
// that a browser's focus really lands on each row is the keyboard evidence in 00-status.md, because
// this project has no DOM test environment. Rows and page text are FIXTURES.

const row = (key: string, patch: Partial<GridRow> = {}): GridRow => ({
  key,
  name: `FIXTURE ${key}`,
  portion: "",
  price: "1.50",
  availability: "available",
  priceInvalid: false,
  priceMissing: false,
  flagged: false,
  ...patch,
});

const ROWS = [
  row("fine-first"),
  row("no-name", { name: "  " }),
  row("fine-middle"),
  row("bad-price", { price: "abc", priceInvalid: true }),
  row("blank-price", { price: "", priceMissing: true }),
  row("no-availability", { availability: "unknown" }),
  row("fine-last"),
];
const NEEDING = ["no-name", "bad-price", "blank-price", "no-availability"];

describe("needs review and Next problem", () => {
  it("needs review and Next problem reach every row that still needs the merchant", () => {
    expect(visibleRows(ROWS, "needs", null).map((shown) => shown.key)).toEqual(NEEDING);
    expect(visibleRows(ROWS, "all", null).map((shown) => shown.key)).toEqual(ROWS.map((shown) => shown.key));

    const walked: string[] = [];
    let after: string | null = null;
    for (let turn = 0; turn < NEEDING.length; turn += 1) {
      const next = nextProblem(ROWS, after);
      walked.push(next!.key);
      after = next!.key;
    }
    expect(walked).toEqual(NEEDING);
    // One more turn wraps round to the first, so a skipped row is reached again.
    expect(nextProblem(ROWS, after)?.key).toBe("no-name");
  });

  it("each row needs the merchant for its own reason", () => {
    for (const key of NEEDING) expect(needsMerchant(ROWS.find((candidate) => candidate.key === key)!), key).toBe(true);
    expect(needsMerchant(row("complete"))).toBe(false);
  });

  it("Next problem lands on the cell the note names first", () => {
    const column = (key: string) => nextProblem(ROWS.filter((candidate) => candidate.key === key), null)?.column;
    expect(column("no-name")).toBe("name");
    expect(column("bad-price")).toBe("price");
    expect(column("blank-price")).toBe("price");
    expect(column("no-availability")).toBe("availability");
    // A row missing both a price and availability lands on the price, as its note says.
    const both = row("both", { price: "", priceMissing: true, availability: "unknown" });
    expect(nextProblem([both], null)?.column).toBe("price");
    expect(noteOf(both)).toBe("Price needed");
  });

  it("Next problem finds nothing when no row needs the merchant, and a lone problem finds itself", () => {
    expect(nextProblem([row("a"), row("b")], "a")).toBeNull();
    expect(nextProblem([], null)).toBeNull();
    expect(nextProblem([row("a", { availability: "unknown" }), row("b")], "a")?.key).toBe("a");
  });

  it("a removed row does not stop the walk", () => {
    expect(nextProblem(ROWS, "removed-key")?.key).toBe("no-name");
  });

  it("a row just fixed stays in view until the merchant moves on", () => {
    const fixed = [row("fixed"), row("open", { availability: "unknown" })];
    expect(visibleRows(fixed, "needs", "fixed").map((shown) => shown.key)).toEqual(["fixed", "open"]);
    expect(visibleRows(fixed, "needs", null).map((shown) => shown.key)).toEqual(["open"]);
  });
});

describe("excerptFor: the page's words around a drafted name", () => {
  const PAGE = ["FIXTURE page", "Kopi C (Hot) - $1.80", "Kaya toast set - $3.50", "Ebi fry, 3 pcs - $4.90", "Ebi fry + Mentaiko - add one dollar fifty"].join("\n");

  it("gives the line that holds the name", () => {
    expect(excerptFor(PAGE, "Kaya toast set", money("SGD", 350))).toBe("Kaya toast set - $3.50");
  });

  it("is at most 120 characters, keeps the name and price, and cuts at a word", () => {
    const filler = "lorem ipsum dolor sit amet ".repeat(40);
    const excerpt = excerptFor(`${filler}Kopi C $1.80 ${filler}`, "Kopi C", money("SGD", 180))!;
    expect(excerpt.length).toBeLessThanOrEqual(120);
    expect(excerpt.length).toBeGreaterThan(100);
    expect(excerpt).toContain("Kopi C $1.80");
    // Whatever the cut falls on, each end is a whole word.
    const WORDS = new Set(["lorem", "ipsum", "dolor", "sit", "amet"]);
    for (let shift = 0; shift < 27; shift += 1) {
      const words = excerptFor(`${filler}${filler.slice(0, shift)} Kopi C $1.80 ${filler.slice(shift)}`, "Kopi C", money("SGD", 180))!.split(" ");
      expect(WORDS.has(words[0]!), `shift ${shift}: ${words[0]}`).toBe(true);
      expect(WORDS.has(words.at(-1)!), `shift ${shift}: ${words.at(-1)}`).toBe(true);
    }
    // A name longer than the limit is still cut to it.
    expect(excerptFor("x".repeat(300), "x".repeat(200), null)!.length).toBe(120);
  });

  it("uses the whole allowance when the name sits at the end of a long line", () => {
    const excerpt = excerptFor(`${"lorem ipsum dolor sit amet ".repeat(40)}Kopi C $1.80\nMilo $2.00`, "Kopi C", money("SGD", 180))!;
    expect(excerpt.length).toBeGreaterThan(100);
    expect(excerpt.endsWith("Kopi C $1.80")).toBe(true);
  });

  it("uses the whole allowance when the name sits at the start of a long line", () => {
    const excerpt = excerptFor(`Earlier line\nKopi C $1.80 ${"lorem ipsum dolor sit amet ".repeat(40)}`, "Kopi C", money("SGD", 180))!;
    expect(excerpt.startsWith("Kopi C $1.80")).toBe(true);
    expect(excerpt.length).toBeGreaterThan(100);
  });

  it("a matching price too far from the name is not reached for", () => {
    const excerpt = excerptFor(`$3.50 ${"lorem ipsum dolor sit amet ".repeat(20)}Kopi C`, "Kopi C", money("SGD", 350))!;
    expect(excerpt).toContain("Kopi C");
    expect(excerpt).not.toContain("$3.50");
  });

  it("prefers the occurrence nearest the drafted price", () => {
    const page = "Ebi fry - small - $4.90\nsomething else\nEbi fry - large - $6.40";
    expect(excerptFor(page, "Ebi fry", money("SGD", 640))).toBe("Ebi fry - large - $6.40");
    expect(excerptFor(page, "Ebi fry", money("SGD", 490))).toBe("Ebi fry - small - $4.90");
  });

  it("a price on the name's own line beats a nearer one on the next row's line", () => {
    expect(excerptFor("Ebi fry, 3 pcs - $4.90\nEbi fry + Mentaiko", "Ebi fry", money("SGD", 490))).toBe("Ebi fry, 3 pcs - $4.90");
  });

  it("on a tie takes the price printed after the name", () => {
    expect(excerptFor("$1.80 Kopi\nKopi $1.80", "Kopi", money("SGD", 180))).toBe("Kopi $1.80");
  });

  it("holds a price printed on the next line with its name", () => {
    expect(excerptFor("Teh O\nHot $1.60\nMilo", "Teh O", money("SGD", 160))).toBe("Teh O Hot $1.60");
  });

  it("a blank-price name alone on its line shows the next line", () => {
    expect(excerptFor("Chicken rice set\n\nask staff\nMilo $2.00", "Chicken rice set", null)).toBe("Chicken rice set ask staff");
  });

  it("a blank-price name with words on its line stops at that line", () => {
    expect(excerptFor("Chicken rice set, ask staff\nMilo $2.00", "Chicken rice set", null)).toBe("Chicken rice set, ask staff");
  });

  it("finds a name across case and spacing, and reads special characters literally", () => {
    expect(excerptFor("KAYA   TOAST\nSET - $3.50", "kaya toast set", null)).toBe("KAYA TOAST SET - $3.50");
    expect(excerptFor("Kopi (C)+ [hot] $1.80", "Kopi (C)+ [hot]", null)).toBe("Kopi (C)+ [hot] $1.80");
    expect(excerptFor("Kopi CCC $1.80", "Kopi (C)+", null)).toBeNull();
  });

  it("is null for a name the page does not print or an empty name", () => {
    expect(excerptFor(PAGE, "Golden Lobster", money("SGD", 350))).toBeNull();
    expect(excerptFor(PAGE, "   ", null)).toBeNull();
  });
});
