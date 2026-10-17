import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScanResult } from "@/app/buy/scan/scan-sticker";
import type { SgqrResolution } from "@/domain/sgqr/resolve";

// S10 review fixes: what the scan screen shows for a resolution that opens no outlet by itself.
// Every outlet here is a FIXTURE.
type Shown = Exclude<SgqrResolution, { kind: "single" }>;

const fixtureOutlet = (id: string, distinguisher: string) => ({ id, name: "FIXTURE Scan Kopi", area: "FIXTURE area", isDemoFixture: true, distinguisher });

const render = (resolution: Shown) => renderToStaticMarkup(createElement(ScanResult, { resolution }));

describe("scan result", () => {
  // F3: the candidate list is bounded at 20, so an outlet that is not listed is sent to text search.
  it("which outlet points to text search for an outlet that is not listed", () => {
    const html = render({ kind: "ambiguous", candidates: [fixtureOutlet("out_fixture_a", "FIXTURE stall 1"), fixtureOutlet("out_fixture_b", "FIXTURE stall 2")] });
    expect(html).toContain("Which outlet?");
    expect(html).toContain("Not listed? Search for it by name below.");
  });

  // F6: the scan screen's one aria-live region announces every outcome, so a result adds no live
  // region or role of its own that would be announced a second time.
  it("a scan result adds no live region of its own", () => {
    const shown: Shown[] = [
      { kind: "ambiguous", candidates: [fixtureOutlet("out_fixture_a", "FIXTURE stall 1"), fixtureOutlet("out_fixture_b", "FIXTURE stall 2")] },
      { kind: "no_match" },
      { kind: "unsupported_payload", unrecognizedCount: 0 },
    ];
    for (const resolution of shown) expect(render(resolution), resolution.kind).not.toMatch(/role=|aria-live/);
  });
});
