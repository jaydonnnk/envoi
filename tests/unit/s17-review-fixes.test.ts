import { describe, expect, it } from "vitest";
import { reviewNavigation } from "@/app/buy/landing";
import { PYUSD_CHECK_MESSAGE } from "@/app/receipt/[purchaseId]/live-status";
import { heldBody, pyusdReceiptStatus } from "@/app/receipt/[purchaseId]/pyusd-receipt";
import { PYUSD_PROOFS } from "@/domain/pyusd/constants";

// S17 review fixes, 2026-10-18 (findings 3 and 5). Each test is a review-fix test recorded in
// 00-status.md, not a Gate 3 named test. FIXTURE ids only.

describe("S17 review fixes", () => {
  it("a Phantom landing replaces /buy in the history", () => {
    const calls: string[] = [];
    const router = { push: (href: string) => calls.push(`push ${href}`), replace: (href: string) => calls.push(`replace ${href}`) };
    reviewNavigation(router, true)("/review/pur_fixture_landing");
    reviewNavigation(router, false)("/review/pur_fixture_button");
    expect(calls).toEqual(["replace /review/pur_fixture_landing", "push /review/pur_fixture_button"]);
  });

  it("a held receipt says what its next check does", () => {
    // Release is on in the shipped constants, so the next check closes a held attempt unpaid.
    expect(PYUSD_PROOFS.automaticUnpaidRelease).toBe(true);
    const held = pyusdReceiptStatus("uncertain", "11:05", { attemptState: "held_no_match", closedBy: null });
    expect(held.body).toBe(heldBody(true));
    expect(held.body).toContain("Its next check closes this purchase as unpaid");
    expect(heldBody(false)).toContain("does not close a payment as unpaid on its own");
  });

  it("a held check result says what the next check does", () => {
    expect(PYUSD_CHECK_MESSAGE.held_no_match).toBe("Envoi found no matching devnet transfer. Its next check closes this purchase as unpaid; do not pay again.");
  });
});
