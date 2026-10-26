import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { basketProposalFor, chooseHeading, chooseSummary, holdBasketProposal, noBasketProposal, shopHref, unavailableHeading } from "@/app/buy/one-box";

// S21, Gate 3 named test 12 and the guards around it: the basket a sentence fills travels in memory
// from the suggestion response to the shop page (Gate 2 one-box ordering point 5), never in an
// address and never in storage, and the four answers say the approved mockup's words. FIXTURE ids only.

const ROOT = join(import.meta.dirname, "..", "..");
const OUTLET = "out_fixtureshop0000000";
const OTHER_OUTLET = "out_fixtureshop0000001";
const ITEM = "itm_fixturekopi0000000";
const QUANTITY = 7;
const PROPOSAL = { outletId: OUTLET, lines: [{ id: ITEM, quantity: QUANTITY }] };

// An address carries the basket when it holds an item id or a quantity.
const ITEM_ID = /itm_[0-9a-z]+/;
const BASKET_IN_ADDRESS = /[?&](items?|q|qty|quantity)=|:\d+/;
const STORAGE = /localStorage|sessionStorage|indexedDB|document\.cookie/;

function leaks(address: string): { itemId: boolean; basket: boolean } {
  return { itemId: ITEM_ID.test(address), basket: BASKET_IN_ADDRESS.test(address) };
}

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

const CLIENT_FILES = ["src/app/buy/one-box.ts", "src/app/buy/text-suggest.tsx", "src/app/buy/shop-basket.tsx"];

describe("one-box answers", () => {
  // Gate 3 named test 12 (S21).
  it("the prefilled basket never reaches a URL", () => {
    // Self-test: the scanner finds both needles in the address the item answer still uses, which is
    // the mechanism this test forbids for a basket.
    expect(leaks(`/buy?outlet=${OUTLET}&items=${ITEM}:${QUANTITY}`)).toEqual({ itemId: true, basket: true });

    holdBasketProposal(PROPOSAL);
    const address = shopHref(OUTLET);

    expect(leaks(address)).toEqual({ itemId: false, basket: false });
    expect(address).not.toContain(ITEM);
    expect(address).not.toContain(String(QUANTITY));
    expect(address).toBe(`/buy?outlet=${OUTLET}`);
    // The basket itself did travel, in memory, to the shop it was held for and no other.
    expect(basketProposalFor(OUTLET)).toEqual(PROPOSAL);
    expect(basketProposalFor(OTHER_OUTLET)).toBeNull();
    // The server's snapshot, which the browser also hydrates against, is always nothing.
    expect(noBasketProposal()).toBeNull();
  });

  // Beyond the named tests: in memory means in memory, so no storage API carries it either, and the
  // module holding it stays on the browser side of the boundary.
  it("no client source of the one-box answers reaches storage", () => {
    // Self-test: the scanner finds a planted storage needle.
    expect(STORAGE.test("window.sessionStorage.setItem('basket', json)")).toBe(true);

    for (const file of CLIENT_FILES) expect(source(file), file).not.toMatch(STORAGE);
    expect(source("src/app/buy/one-box.ts").startsWith('"use client"')).toBe(true);
  });

  // Beyond the named tests: the four answers' words are Gate 1's approved mockup copy, built from
  // registry names and the buyer's own quantity, never from model wording.
  it("the one-box answers say the mockup's words", () => {
    expect(chooseHeading(["Iced lemon tea", "Iced milk tea"])).toBe("Which iced tea?");
    expect(chooseSummary(2, 2)).toBe("Two published items fit. Pick one, and Envoi puts 2 in the basket.");
    expect(unavailableHeading(["Kaya toast set"], "Test Shop")).toBe("Kaya toast set is unavailable at Test Shop today");
    // Degrading says less rather than inventing a phrase.
    expect(chooseHeading(["Kopi O", "Teh C peng"])).toBe("Which one?");
    expect(chooseHeading([])).toBe("Which one?");
    expect(unavailableHeading(["Kaya toast set", "Mee siam"], "Test Shop")).toBe("Kaya toast set, Mee siam are unavailable at Test Shop today");
    expect(chooseSummary(6, 1)).toBe("6 published items fit. Pick one, and Envoi puts 1 in the basket.");
  });
});
