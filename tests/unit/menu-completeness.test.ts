import { describe, expect, it } from "vitest";
import { assessMenuCompleteness } from "@/domain/menu/draft";
import type { MenuItemDraft } from "@/domain/menu/types";
import { sgdFromCents } from "@/lib/money";

const item = (id: string, patch: Partial<MenuItemDraft> = {}): MenuItemDraft => ({
  id,
  name: `Item ${id}`,
  portion: null,
  priceSgdCents: sgdFromCents(250),
  availability: "available",
  source: "merchant",
  ...patch,
});

describe("menu completeness", () => {
  it("incomplete menu blocks confirmation", () => {
    // Unknown availability is incomplete: it is never read as available.
    expect(assessMenuCompleteness([item("a"), item("b", { availability: "unknown" }), item("c", { availability: "unavailable" })])).toEqual({
      complete: false,
      incompleteItemIds: ["b"],
      reason: "missing_availability",
    });
  });

  it("a blank price or a blank name is incomplete and named first", () => {
    expect(assessMenuCompleteness([item("a", { priceSgdCents: null }), item("b", { name: "  " }), item("c")])).toEqual({
      complete: false,
      incompleteItemIds: ["a", "b"],
      reason: "missing_price",
    });
    expect(assessMenuCompleteness([item("a"), item("b", { name: "" })])).toEqual({ complete: false, incompleteItemIds: ["b"], reason: "missing_name" });
  });

  it("a menu whose every item has a name, a price and a chosen availability is complete", () => {
    expect(assessMenuCompleteness([item("a"), item("b", { availability: "unavailable", portion: "large" })])).toEqual({ complete: true, itemCount: 2 });
  });
});
