import { listPublishedOutlets, type PublishedOutletSummary } from "@/domain/outlets/search";
import { containsWords, normalize, usableArea } from "@/domain/suggestions/suggest";
import type { Db } from "@/lib/db/web";

// Public registry reads for the agent tools. Only published outlets and their confirmed menus are
// visible, exactly as on the public HTTP reads; no destination, seller id or purchase is reachable.

const MAX_OUTLETS = 10;

// Areas and names match as whole words in either direction ("Tanjong Pagar MRT" finds "Tanjong
// Pagar", "o" finds nothing), the rule S4's review fixed for untrusted text.
function matches(field: string, wanted: string | null): boolean {
  if (wanted === null) return true;
  const value = normalize(field);
  return containsWords(value, wanted) || containsWords(wanted, value);
}

export async function searchRegistry(db: Db, search: { area?: string; name?: string }): Promise<PublishedOutletSummary[]> {
  const area = usableArea(search.area);
  const name = search.name ? normalize(search.name) || null : null;
  const published = await listPublishedOutlets(db, 500);
  return published.filter((outlet) => matches(outlet.area, area) && matches(outlet.name, name)).slice(0, MAX_OUTLETS);
}

