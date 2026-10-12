import { and, asc, eq, isNotNull } from "drizzle-orm";
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
