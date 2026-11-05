import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { menuItems, menuRevisions, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { isId } from "@/lib/ids";
import { CURRENCY_BY_COUNTRY, type Country, type Currency } from "@/lib/money";

// The shop's country and its currency travel with the outlet, so every price read beside it has one.
export type PublishedOutletSummary = { id: string; name: string; area: string; isDemoFixture: boolean; country: Country; currency: Currency };

export type PublishedMenuItem = { id: string; name: string; unitMinor: number | null; available: boolean | null };

export type PublishedMenu = { outlet: PublishedOutletSummary; menuRevisionId: string; currency: Currency; items: PublishedMenuItem[] };

const withCurrency = <T extends { country: Country }>(outlet: T): T & { currency: Currency } => ({ ...outlet, currency: CURRENCY_BY_COUNTRY[outlet.country] });

// Only outlets with a published, confirmed revision are buyer-readable.
export async function listPublishedOutlets(db: Db, limit = 50): Promise<PublishedOutletSummary[]> {
  const rows = await db
    .select({ id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture, country: outlets.country })
    .from(outlets)
    .where(isNotNull(outlets.publishedMenuRevisionId))
    .orderBy(asc(outlets.name), asc(outlets.id))
    .limit(limit);
  return rows.map(withCurrency);
}

export async function getPublishedMenu(db: Pick<Db, "select">, outletId: string): Promise<PublishedMenu | null> {
  // S14 review fix 1: an id no outlet can have answers like an unknown shop, before any query.
  if (!isId("out", outletId)) return null;
  const rows = await db
    .select({
      outlet: { id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture, country: outlets.country },
      menuRevisionId: menuRevisions.id,
      item: { id: menuItems.id, name: menuItems.name, unitMinor: menuItems.unitMinor, available: menuItems.available },
    })
    .from(outlets)
    .innerJoin(menuRevisions, and(eq(menuRevisions.id, outlets.publishedMenuRevisionId), eq(menuRevisions.status, "confirmed")))
    .leftJoin(menuItems, eq(menuItems.menuRevisionId, menuRevisions.id))
    .where(eq(outlets.id, outletId))
    .orderBy(asc(menuItems.position));
  const first = rows[0];
  if (!first) return null;
  const outlet = withCurrency(first.outlet);
  return {
    outlet,
    menuRevisionId: first.menuRevisionId,
    currency: outlet.currency,
    items: rows.flatMap((row) => (row.item ? [row.item] : [])),
  };
}

// S33: the one shop a shop-scoped assistant turn is about, or null for an id that is malformed,
// unknown or not published. The name is merchant text, so it reaches the model only as data.
export async function shopContext(db: Pick<Db, "select">, outletId: string): Promise<{ id: string; name: string } | null> {
  if (!isId("out", outletId)) return null;
  const rows = await db
    .select({ id: outlets.id, name: outlets.name })
    .from(outlets)
    .innerJoin(menuRevisions, and(eq(menuRevisions.id, outlets.publishedMenuRevisionId), eq(menuRevisions.status, "confirmed")))
    .where(eq(outlets.id, outletId))
    .limit(1);
  return rows[0] ?? null;
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
  const rows = await db
    .select({ id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture, country: outlets.country })
    .from(outlets)
    .where(and(isNotNull(outlets.publishedMenuRevisionId), overlapsInsensitive(outlets.area, search.area), overlapsInsensitive(outlets.name, search.name)))
    .orderBy(asc(outlets.name), asc(outlets.id))
    .limit(limit);
  return rows.map(withCurrency);
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
