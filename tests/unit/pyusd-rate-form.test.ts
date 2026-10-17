import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PyusdWalletCard } from "@/app/merchant/setup/pyusd-wallet";
import type { MerchantOutlet } from "@/domain/outlets/merchant";

// S16 review fixes, F10: every rate save is a new dated version that invalidates the shop's open PYUSD
// reviews, so an unchanged rate already confirmed today offers no button to press again. The card is
// rendered as the server first paints it, with a FIXTURE outlet and a fixed Singapore clock.

const NOW = new Date("2026-10-18T04:00:00.000Z"); // 12:00 in Singapore

function card(rate: { pyusdPerSgd: string; confirmedAt: string; expired: boolean }): string {
  const outlet = { id: "out_fixture", pyusd: { enabled: true, wallet: null, rate } } as unknown as MerchantOutlet;
  return renderToStaticMarkup(createElement(PyusdWalletCard, { outlet, onSaved: () => {} }));
}

const submit = (html: string) => html.match(/<button class="button" type="submit"[^>]*>[^<]*<\/button>/)?.[0] ?? "";

describe("PYUSD rate form", () => {
  afterEach(() => vi.useRealTimers());

  it("a rate confirmed today offers no second confirmation", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    // 00:30 the same Singapore day, which is still the previous day in UTC.
    const today = submit(card({ pyusdPerSgd: "1.000000", confirmedAt: "2026-10-17T16:30:00.000Z", expired: false }));
    expect(today).toContain(">Confirmed today<");
    expect(today).toContain('disabled=""');
    // Fixture self-check: a rate set yesterday in Singapore can be confirmed again today.
    const yesterday = submit(card({ pyusdPerSgd: "1.000000", confirmedAt: "2026-10-17T15:30:00.000Z", expired: false }));
    expect(yesterday).toContain(">Confirm this rate today<");
    expect(yesterday).not.toContain("disabled");
  });
});
