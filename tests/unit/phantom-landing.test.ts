import { describe, expect, it } from "vitest";
import { landingReview, landsOnPyusd, requestReview, type ReviewLine } from "@/app/buy/landing";

// S16 amendment (Gate 3 reopening 2026-10-18): /buy opened from the Phantom Browse link asks for the
// PYUSD review itself. The request and navigation are injected, so these tests see exactly what the
// page would send and open. FIXTURE ids only.

const LINES: ReviewLine[] = [{ menuItemId: "itm_fixture_kopi", quantity: 1 }];

function fakeServer(answer: { ok: boolean; data?: { purchaseId: string }; error?: { message: string } }) {
  const posted: unknown[] = [];
  const opened: string[] = [];
  return {
    posted,
    opened,
    post: async (body: unknown) => {
      posted.push(body);
      return answer;
    },
    navigate: (href: string) => {
      opened.push(href);
    },
  };
}

describe("Phantom landing", () => {
  it("a Phantom landing requests one PYUSD review and opens it", async () => {
    expect(landsOnPyusd("pyusd", LINES.length)).toBe(true);
    const review = landingReview(landsOnPyusd("pyusd", LINES.length), LINES);
    expect(review).toEqual({ rail: "pyusd", lines: LINES });
    const server = fakeServer({ ok: true, data: { purchaseId: "pur_fixture_landing" } });
    expect(await requestReview(server.post, server.navigate, "out_fixture", review!.rail, review!.lines)).toBeNull();
    expect(server.posted).toEqual([{ outletId: "out_fixture", rail: "pyusd", lines: LINES }]);
    expect(server.opened).toEqual(["/review/pur_fixture_landing"]);
  });

  it("a refused Phantom landing keeps the basket and shows the message", async () => {
    const server = fakeServer({ ok: false, error: { message: "FIXTURE: this shop does not take PYUSD right now." } });
    expect(await requestReview(server.post, server.navigate, "out_fixture", "pyusd", LINES)).toBe("FIXTURE: this shop does not take PYUSD right now.");
    expect(server.opened).toEqual([]);
  });

  it("a link without the PYUSD rail or a basket only fills the basket", () => {
    expect(landsOnPyusd(undefined, LINES.length)).toBe(false);
    expect(landsOnPyusd("paypal", LINES.length)).toBe(false);
    expect(landsOnPyusd(["pyusd", "pyusd"], LINES.length)).toBe(false);
    expect(landsOnPyusd("pyusd", 0)).toBe(false);
    expect(landingReview(false, LINES)).toBeNull();
    expect(landingReview(true, [])).toBeNull();
  });
});
