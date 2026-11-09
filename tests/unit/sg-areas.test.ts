import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AreaPicker } from "@/app/merchant/setup/area-picker";
import { isSingaporeArea, searchSingaporeAreas } from "@/domain/outlets/sg-areas";

it("Area search uses catalogue labels and preserves selection", () => {
  const areas = searchSingaporeAreas("");
  expect(areas).toHaveLength(376);
  expect(new Set(areas.map(({ label }) => label)).size).toBe(376);
  expect(isSingaporeArea("Bedok North")).toBe(true);
  expect(isSingaporeArea("bedok north")).toBe(false);
  expect(searchSingaporeAreas(" bedok   north ")).toEqual([{ label: "Bedok North", parents: ["Bedok"] }]);
  expect(searchSingaporeAreas("BEDOK")).toContainEqual({ label: "Siglap", parents: ["Bedok"] });
  expect(searchSingaporeAreas("chua-chu  kang")).toContainEqual({ label: "Yew Tee", parents: ["Choa Chu Kang"] });
  expect(searchSingaporeAreas("lakeside, business")).toContainEqual({ label: "Lakeside (Business)", parents: ["Jurong East"] });
  expect(searchSingaporeAreas("fixture no match")).toEqual([]);

  const html = renderToStaticMarkup(createElement(AreaPicker, { id: "fixture-area", savedArea: "Fixture saved Area" }));
  expect(html).toMatch(/<option [^>]*value="Fixture saved Area"[^>]* selected="">Fixture saved Area \(saved area\)<\/option>/);
});
