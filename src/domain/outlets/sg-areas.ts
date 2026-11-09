import catalogue from "./sg-areas.json";

type SingaporeArea = { label: string; parents: readonly string[] };

export const singaporeAreaSource = catalogue.source;

const labels = new Set(catalogue.areas.map(({ label }) => label));
const aliases: Readonly<Partial<Record<string, string>>> = { "Choa Chu Kang": "Chua Chu Kang" };
const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const searchIndex = catalogue.areas.map((area) => ({
  area,
  terms: [area.label, ...area.parents].flatMap((label) => [fold(label), fold(aliases[label] ?? "")]),
}));

export function isSingaporeArea(label: string): boolean {
  return labels.has(label);
}

export function searchSingaporeAreas(query: string): readonly SingaporeArea[] {
  const term = fold(query);
  return searchIndex.filter(({ terms }) => terms.some((value) => value.includes(term))).map(({ area }) => area);
}
