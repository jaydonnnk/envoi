import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { menuItems, menuRevisions, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { sgdFromCents } from "@/lib/money";
import type { MenuCompleteness, MenuDraft, MenuItemDraft, MenuItemInput } from "./types";

// A menu can be confirmed only when every item has a name, a price and a merchant-chosen
// availability. Unknown availability is never read as available, and a missing price is never read
// as zero. incompleteItemIds lists every incomplete item; reason names the first failing check in
// the order price, name, availability.
export function assessMenuCompleteness(items: readonly MenuItemDraft[]): MenuCompleteness {
  const missingPrice = items.filter((item) => item.priceSgdCents === null);
  const missingName = items.filter((item) => item.name.trim() === "");
  const missingAvailability = items.filter((item) => item.availability === "unknown");
  const incomplete = new Set([...missingPrice, ...missingName, ...missingAvailability].map((item) => item.id));
  if (incomplete.size === 0) return { complete: true, itemCount: items.length };
  const reason = missingPrice.length > 0 ? "missing_price" : missingName.length > 0 ? "missing_name" : "missing_availability";
  return { complete: false, incompleteItemIds: items.filter((item) => incomplete.has(item.id)).map((item) => item.id), reason };
}

type RevisionRow = typeof menuRevisions.$inferSelect;
type ItemRow = typeof menuItems.$inferSelect;

export function toDraftItem(row: ItemRow): MenuItemDraft {
  return {
    id: row.id,
    name: row.name,
    portion: row.portion,
    priceSgdCents: row.unitSgdCents === null ? null : sgdFromCents(row.unitSgdCents),
    availability: row.available === null ? "unknown" : row.available ? "available" : "unavailable",
    source: row.source === "import_suggestion" ? "import_suggestion" : "merchant",
  };
}

function availableColumn(availability: MenuItemDraft["availability"]): boolean | null {
  return availability === "unknown" ? null : availability === "available";
}

export async function itemsOf(db: Pick<Db, "select">, revisionId: string): Promise<ItemRow[]> {
  return db.select().from(menuItems).where(eq(menuItems.menuRevisionId, revisionId)).orderBy(asc(menuItems.position), asc(menuItems.id));
}

export function draftOf(revision: RevisionRow, rows: readonly ItemRow[]): MenuDraft {
  const items = rows.map(toDraftItem);
  return {
    outletId: revision.outletId,
    revisionId: revision.id,
    version: revision.version,
    status: revision.status === "confirmed" ? "confirmed" : "draft",
    confirmedAt: revision.confirmedAt,
    items,
    completeness: assessMenuCompleteness(items),
  };
}

// The outlet's draft is its newest revision that is not the published one. A published revision is
// never edited in place.
export async function currentDraftRevision(db: Pick<Db, "select">, outletId: string, lock: boolean): Promise<RevisionRow | null> {
  const query = db
    .select({ revision: menuRevisions })
    .from(menuRevisions)
    .innerJoin(outlets, eq(outlets.id, menuRevisions.outletId))
    .where(and(eq(menuRevisions.outletId, outletId), or(isNull(outlets.publishedMenuRevisionId), ne(outlets.publishedMenuRevisionId, menuRevisions.id))))
    .orderBy(desc(menuRevisions.createdAt), desc(menuRevisions.id))
    .limit(1);
  const [row] = lock ? await query.for("update", { of: menuRevisions }) : await query;
  return row?.revision ?? null;
}

export async function getMenuDraft(db: Pick<Db, "select">, outletId: string): Promise<MenuDraft | null> {
  const revision = await currentDraftRevision(db, outletId, false);
  return revision ? draftOf(revision, await itemsOf(db, revision.id)) : null;
}

export type DraftWrite = { outletId: string; revisionId: string; baseVersion: number; items: readonly MenuItemInput[]; actorUserId: string; now: Date };

export const revisionConflict = (current: RevisionRow): AppError =>
  appError("revision_conflict", "This menu changed since you loaded it. Reload it and make your changes again.", {
    details: { revisionId: current.id, currentVersion: current.version },
  });

// Locks the draft revision, refuses a write based on any other revision or version, then replaces
// the item list, bumps the version and invalidates any confirmation, all in one transaction.
// A refused write changes nothing.
export async function saveMenuDraft(db: Db, write: DraftWrite): Promise<MenuDraft | AppError> {
  return db.transaction(async (tx) => {
    const revision = await currentDraftRevision(tx, write.outletId, true);
    if (!revision) return appError("not_found", "This shop has no menu draft.");
    if (revision.id !== write.revisionId || revision.version !== write.baseVersion) return revisionConflict(revision);

    const existing = await itemsOf(tx, revision.id);
    const byId = new Map(existing.map((row) => [row.id, row]));
    const seen = new Set<string>();
    for (const item of write.items) {
      if (item.id === undefined) continue;
      if (!byId.has(item.id) || seen.has(item.id)) {
        return appError("validation_failed", "An item does not belong to this menu draft.", { details: { reason: "unknown_item" } });
      }
      seen.add(item.id);
    }

    const removed = existing.filter((row) => !seen.has(row.id)).map((row) => row.id);
    if (removed.length > 0) await tx.delete(menuItems).where(inArray(menuItems.id, removed));

    for (const [position, item] of write.items.entries()) {
      const values = {
        position,
        name: item.name,
        portion: item.portion,
        unitSgdCents: item.priceSgdCents,
        available: availableColumn(item.availability),
      };
      const before = item.id === undefined ? undefined : byId.get(item.id);
      if (!before) {
        await tx.insert(menuItems).values({ id: newId("itm"), menuRevisionId: revision.id, source: "merchant", ...values });
        continue;
      }
      // An import suggestion stays marked as one until the merchant changes it.
      const edited = before.name !== values.name || before.portion !== values.portion || before.unitSgdCents !== values.unitSgdCents || before.available !== values.available;
      await tx
        .update(menuItems)
        .set({ ...values, source: edited ? "merchant" : before.source })
        .where(eq(menuItems.id, before.id));
    }

    const [saved] = await tx
      .update(menuRevisions)
      .set({ version: revision.version + 1, status: "draft", confirmedAt: null })
      .where(eq(menuRevisions.id, revision.id))
      .returning();
    await recordAudit(tx, {
      at: write.now,
      actor: `merchant:${write.actorUserId}`,
      action: "menu_draft_saved",
      outletId: write.outletId,
      operatorVisible: false,
      details: { revisionId: revision.id, version: saved!.version, itemCount: write.items.length, confirmationInvalidated: revision.status === "confirmed" },
    });
    return draftOf(saved!, await itemsOf(tx, revision.id));
  });
}
