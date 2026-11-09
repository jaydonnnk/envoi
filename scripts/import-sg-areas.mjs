import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const source = {
  dataset: "Master Plan 2019 Subzone Boundary (No Sea) (GEOJSON)",
  agency: "Urban Redevelopment Authority",
  url: "https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view",
  accessed: "2026-11-09",
  licence: "https://data.gov.sg/open-data-licence",
  sha256: "77e30aa02b1784b649d9b6f23e3b2ebb825af787de554f3a3fb76bbee3013c42",
};

const file = process.argv[2];
assert.ok(file, "Usage: node scripts/import-sg-areas.mjs <URA GeoJSON>");
const bytes = readFileSync(file);
assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, "URA GeoJSON checksum mismatch");

const { type, features } = JSON.parse(bytes);
assert.equal(type, "FeatureCollection");
const planningAreas = new Map();
const subzones = new Map();

for (const { properties: { PLN_AREA_C, PLN_AREA_N, SUBZONE_C, SUBZONE_N } } of features) {
  assert.match(PLN_AREA_C, /^[A-Z]{2}$/);
  assert.match(SUBZONE_C, new RegExp(`^${PLN_AREA_C}SZ[0-9]{2}$`));
  assert.ok(PLN_AREA_N.trim() && SUBZONE_N.trim());
  assert.equal(planningAreas.get(PLN_AREA_C) ?? PLN_AREA_N, PLN_AREA_N, "Conflicting planning area name");
  planningAreas.set(PLN_AREA_C, PLN_AREA_N);
  const subzone = { name: SUBZONE_N, parent: PLN_AREA_C };
  assert.deepEqual(subzones.get(SUBZONE_C) ?? subzone, subzone, "Conflicting subzone");
  subzones.set(SUBZONE_C, subzone);
}

assert.equal(planningAreas.size, 55);
assert.equal(new Set(planningAreas.values()).size, 55);
assert.equal(subzones.size, 332);
assert.equal(new Set([...subzones.values()].map(({ name }) => name)).size, 332);

const titleCase = (name) => name.toLowerCase().replace(/(^|[ (\-])[a-z]/g, (start) => start.toUpperCase());
const byName = new Map([...planningAreas.values()].map((name) => [titleCase(name), new Set()]));
for (const { name, parent } of subzones.values()) {
  const parentName = planningAreas.get(parent);
  assert.ok(parentName, "Missing subzone parent");
  const label = titleCase(name);
  const parents = byName.get(label) ?? new Set();
  parents.add(titleCase(parentName));
  byName.set(label, parents);
}
assert.equal(byName.size, 376);

const areas = [...byName.keys()].sort().map((label) => ({ label, parents: [...byName.get(label)].sort() }));
const rows = areas.map((entry) => `    ${JSON.stringify(entry)}`);
const provenance = JSON.stringify(source, null, 2).replaceAll("\n", "\n  ");
process.stdout.write(`{\n  "source": ${provenance},\n  "areas": [\n${rows.join(",\n")}\n  ]\n}\n`);
