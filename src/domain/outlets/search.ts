import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { menuItems, menuRevisions, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";

export type PublishedOutletSummary = { id: string; name: string; area: string; isDemoFixture: boolean };

export type PublishedMenuItem = { id: string; name: string; unitSgdCents: number | null; available: boolean | null };

export type PublishedMenu = { outlet: PublishedOutletSummary; menuRevisionId: string; items: PublishedMenuItem[] };

// Only outlets with a published, confirmed revision are buyer-readable.
export async function listPublishedOutlets(db: Db, limit = 50): Promise<PublishedOutletSummary[]> {
  return db
    .select({ id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture })
    .from(outlets)
    .where(isNotNull(outlets.publishedMenuRevisionId))
    .orderBy(asc(outlets.name), asc(outlets.id))
    .limit(limit);
}

export async function getPublishedMenu(db: Db, outletId: string): Promise<PublishedMenu | null> {
  const rows = await db
    .select({
      outlet: { id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture },
      menuRevisionId: menuRevisions.id,
      item: { id: menuItems.id, name: menuItems.name, unitSgdCents: menuItems.unitSgdCents, available: menuItems.available },
    })
    .from(outlets)
    .innerJoin(menuRevisions, and(eq(menuRevisions.id, outlets.publishedMenuRevisionId), eq(menuRevisions.status, "confirmed")))
    .leftJoin(menuItems, eq(menuItems.menuRevisionId, menuRevisions.id))
    .where(eq(outlets.id, outletId))
    .orderBy(asc(menuItems.position));
  const first = rows[0];
  if (!first) return null;
  return {
    outlet: first.outlet,
    menuRevisionId: first.menuRevisionId,
    items: rows.flatMap((row) => (row.item ? [row.item] : [])),
  };
}

// Price-free reads for the AI suggestion tools. Nothing here returns a price: the model never sees
// one, and pricing always re-reads the confirmed revision server-side.

export type OutletSearch = { area: string | null; name: string | null };

export type PublishedItemName = { outletId: string; outletName: string; itemId: string; name: string };

// Matches when either text contains the other, so "Tanjong Pagar MRT" finds an outlet in
// "Tanjong Pagar" and "Pagar" finds it too.
function overlapsInsensitive(column: typeof outlets.area | typeof outlets.name, value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? sql`(position(lower(${trimmed}) in lower(${column})) > 0 or position(lower(${column}) in lower(${trimmed})) > 0)` : undefined;
}

export async function searchPublishedOutlets(db: Db, search: OutletSearch, limit = 10): Promise<PublishedOutletSummary[]> {
  return db
    .select({ id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture })
    .from(outlets)
    .where(and(isNotNull(outlets.publishedMenuRevisionId), overlapsInsensitive(outlets.area, search.area), overlapsInsensitive(outlets.name, search.name)))
    .orderBy(asc(outlets.name), asc(outlets.id))
    .limit(limit);
}

export async function listPublishedItemNames(db: Db, area: string | null, limit = 50): Promise<PublishedItemName[]> {
  return db
    .select({ outletId: outlets.id, outletName: outlets.name, itemId: menuItems.id, name: menuItems.name })
    .from(outlets)
    .innerJoin(menuRevisions, and(eq(menuRevisions.id, outlets.publishedMenuRevisionId), eq(menuRevisions.status, "confirmed")))
    .innerJoin(menuItems, eq(menuItems.menuRevisionId, menuRevisions.id))
    .where(overlapsInsensitive(outlets.area, area))
    .orderBy(asc(outlets.name), asc(outlets.id), asc(menuItems.position))
    .limit(limit);
}
