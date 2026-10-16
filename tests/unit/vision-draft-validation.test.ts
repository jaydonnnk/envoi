import { describe, expect, it } from "vitest";
import { validateVisionDraft } from "@/domain/imports/validate-result";

// S11: validateVisionDraft on FIXTURE model outputs; pure, no database. A failed validation cannot
// reach commitImport, whose input type accepts only a successful one.

const row = (name: string | null, priceText: string | null, fields: { portion?: string | null; currency?: "sgd_or_unmarked" | "other" | null } = {}) => ({
  name,
  portion: fields.portion ?? null,
  priceText,
  currency: fields.currency === undefined ? (priceText === null ? null : "sgd_or_unmarked") : fields.currency,
});

function ok(raw: unknown) {
  const result = validateVisionDraft(raw);
  if (!result.ok) throw new Error(`FIXTURE output was refused: ${result.reason}`);
  return result;
}

describe("vision draft validation", () => {
  it("malformed result is an error not a repair", () => {
    expect(validateVisionDraft({ items: [{ name: "Kopi", price: "1.80" }] })).toEqual({ ok: false, reason: "malformed" });
    expect(validateVisionDraft({ items: "Kopi 1.80" })).toEqual({ ok: false, reason: "malformed" });
    expect(validateVisionDraft(null)).toEqual({ ok: false, reason: "malformed" });
  });

  it("blank price stays blank", () => {
    const result = ok({ items: [row("Chilli crab", "market price", { currency: null }), row("Fish soup", null)] });
    expect(result.items.map((item) => [item.priceSgdCents, item.priceBasis])).toEqual([
      [null, "ambiguous"],
      [null, "blank"],
    ]);
    expect(result.blankPriceCount).toBe(2);
  });

  it("more than 100 draft rows is refused", () => {
    const rows = Array.from({ length: 101 }, (_, n) => row(`Item ${n}`, "1.00"));
    expect(validateVisionDraft({ items: rows })).toEqual({ ok: false, reason: "too_many_rows" });
    expect(ok({ items: rows.slice(0, 100) }).items).toHaveLength(100);
  });

  it("draft text over 120 characters is refused", () => {
    expect(validateVisionDraft({ items: [row("K".repeat(121), "1.00")] })).toEqual({ ok: false, reason: "text_too_long" });
    expect(ok({ items: [row("K".repeat(120), "1.00")] }).items).toHaveLength(1);
    // S11 review fixes: the bound holds for a portion as well as a name.
    expect(validateVisionDraft({ items: [row("Kopi", "1.00", { portion: "P".repeat(121) })] })).toEqual({ ok: false, reason: "text_too_long" });
    expect(ok({ items: [row("Kopi", "1.00", { portion: "P".repeat(120) })] }).items).toHaveLength(1);
  });

  it("draft result over 128 KiB is refused", () => {
    // 100 rows of 120-character names and portions of control characters, each serialized as a
    // six-byte JSON escape: about 141 KiB once validated.
    const text = "\u0001".repeat(120);
    const rows = Array.from({ length: 100 }, () => row(text, null, { portion: text }));
    expect(validateVisionDraft({ items: rows })).toEqual({ ok: false, reason: "oversize" });
  });

  it("non-SGD price stays blank", () => {
    const [item] = ok({ items: [row("Nasi lemak", "12", { currency: "other" })] }).items;
    expect(item).toMatchObject({ priceSgdCents: null, priceBasis: "other_currency" });
  });

  it("zero or malformed price text stays blank", () => {
    const result = ok({ items: ["0", "-1", "3.505", "1e3"].map((price, n) => row(`Item ${n}`, price)) });
    expect(result.items.map((item) => [item.priceSgdCents, item.priceBasis])).toEqual([
      [null, "ambiguous"],
      [null, "ambiguous"],
      [null, "ambiguous"],
      [null, "ambiguous"],
    ]);
    expect(ok({ items: [row("Kopi", "1.80")] }).items[0]).toMatchObject({ priceSgdCents: 180, priceBasis: "explicit" });
  });

  it("duplicate variants are flagged for the merchant", () => {
    const result = ok({ items: [row("Teh", "1.60", { portion: "Hot" }), row("teh", "1.90", { portion: "hot" }), row("Teh", "2.10", { portion: "Iced" })] });
    expect(result.items.map((item) => [item.priceSgdCents, item.priceBasis])).toEqual([
      [null, "duplicate_variant"],
      [null, "duplicate_variant"],
      [210, "explicit"],
    ]);
  });
});

// S11 review fixes: two bounds of the draft that no Gate 3 case reached.
describe("vision draft validation, review fixes", () => {
  it("a price above the menu cap stays blank and an empty row is dropped", () => {
    // The menu editor refuses a price above S$1,000, so an imported one is never filled above it.
    const priced = ok({ items: [row("Kopi", "1000"), row("Crab", "1000.01")] });
    expect(priced.items.map((item) => [item.priceSgdCents, item.priceBasis])).toEqual([
      [100_000, "explicit"],
      [null, "ambiguous"],
    ]);
    // A row whose every field is null is dropped, not kept as a nameless blank item.
    const kept = ok({ items: [row(null, null), row("Teh", "1.60"), row(null, null)] });
    expect(kept.items.map((item) => item.name)).toEqual(["Teh"]);
    expect(kept.blankPriceCount).toBe(0);
    expect(validateVisionDraft({ items: [row(null, null)] })).toEqual({ ok: false, reason: "empty" });
  });
});
