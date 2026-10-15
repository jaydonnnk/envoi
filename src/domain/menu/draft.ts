import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { menuItems, menuRevisions, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { sgdFromCents } from "@/lib/money";
import { MENU_LIMITS, type DraftItemSuggestion, type DraftMerge, type MenuCompleteness, type MenuDraft, type MenuItemDraft, type MenuItemInput } from "./types";

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
    published: revision.publishedAt !== null,
    items,
    completeness: assessMenuCompleteness(items),
  };
}

// The outlet's draft is its newest revision that was never published. A published revision is never
// edited in place, and the database refuses any write to one (migration 0017).
export async function currentDraftRevision(db: Pick<Db, "select">, outletId: string, lock: boolean): Promise<RevisionRow | null> {
  const query = db
    .select()
    .from(menuRevisions)
    .where(and(eq(menuRevisions.outletId, outletId), isNull(menuRevisions.publishedAt)))
    .orderBy(desc(menuRevisions.createdAt), desc(menuRevisions.id))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

async function publishedRevision(db: Pick<Db, "select">, outletId: string): Promise<RevisionRow | null> {
  const [row] = await db
    .select({ revision: menuRevisions })
    .from(outlets)
    .innerJoin(menuRevisions, eq(menuRevisions.id, outlets.publishedMenuRevisionId))
    .where(eq(outlets.id, outletId));
  return row?.revision ?? null;
}

// The menu the merchant edits: the unpublished draft if there is one, otherwise the published menu
// itself, marked published. Saving changes to the published menu creates a new draft revision.
export async function getMenuDraft(db: Pick<Db, "select">, outletId: string): Promise<MenuDraft | null> {
  const revision = (await currentDraftRevision(db, outletId, false)) ?? (await publishedRevision(db, outletId));
  return revision ? draftOf(revision, await itemsOf(db, revision.id)) : null;
}

// Serializes every menu write of one outlet with its publication. FOR NO KEY UPDATE does not block
// buyers' purchases, which reference the outlet.
export async function lockOutlet(tx: Pick<Db, "select">, outletId: string): Promise<boolean> {
  const [row] = await tx.select({ id: outlets.id }).from(outlets).where(eq(outlets.id, outletId)).for("no key update");
  return row !== undefined;
}

export type DraftWrite = { outletId: string; revisionId: string; baseVersion: number; items: readonly MenuItemInput[]; actorUserId: string; now: Date };

export const revisionConflict = (current: RevisionRow): AppError =>
  appError("revision_conflict", "This menu changed since you loaded it. Reload it and make your changes again.", {
    details: { revisionId: current.id, currentVersion: current.version },
  });

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const unknownItem = () => appError("validation_failed", "An item does not belong to this menu draft.", { details: { reason: "unknown_item" } });

// The first edit of a published menu (S7): a new, unpublished revision holding the written items.
// Items carried over from the published revision get new ids but keep their item keys, so a basket
// of them is the same basket on the republished menu. Buyers keep reading the published revision.
async function draftFromPublished(tx: Tx, published: RevisionRow, write: DraftWrite): Promise<MenuDraft | AppError> {
  const base = new Map((await itemsOf(tx, published.id)).map((row) => [row.id, row]));
  const seen = new Set<string>();
  for (const item of write.items) {
    if (item.id === undefined) continue;
    if (!base.has(item.id) || seen.has(item.id)) return unknownItem();
    seen.add(item.id);
  }

  const revisionId = newId("mrv");
  // The web role may insert only these columns (migration 0013).
  await tx.execute(
    sql`insert into menu_revisions (id, outlet_id, status, version, created_at) values (${revisionId}, ${write.outletId}, 'draft', 1, ${write.now.toISOString()})`,
  );
  for (const [position, item] of write.items.entries()) {
    const before = item.id === undefined ? undefined : base.get(item.id);
    const id = newId("itm");
    const values = { position, name: item.name, portion: item.portion, unitSgdCents: item.priceSgdCents, available: availableColumn(item.availability) };
    const edited = !before || before.name !== values.name || before.portion !== values.portion || before.unitSgdCents !== values.unitSgdCents || before.available !== values.available;
    await tx.insert(menuItems).values({ id, menuRevisionId: revisionId, itemKey: before?.itemKey ?? id, source: before && !edited ? before.source : "merchant", ...values });
  }
  await recordAudit(tx, {
    at: write.now,
    actor: `merchant:${write.actorUserId}`,
    action: "menu_draft_saved",
    outletId: write.outletId,
    operatorVisible: false,
    details: { revisionId, version: 1, itemCount: write.items.length, fromPublishedRevisionId: published.id },
  });
  const created = await currentDraftRevision(tx, write.outletId, false);
  if (!created || created.id !== revisionId) throw new Error("the new draft revision is not the outlet's draft in its own transaction");
  return draftOf(created, await itemsOf(tx, revisionId));
}

// Locks the outlet and the draft revision, refuses a write based on any other revision or version,
// then replaces the item list, bumps the version and invalidates any confirmation, all in one
// transaction. A write based on the published menu, while no draft exists, creates the draft. A
// refused write changes nothing.
export async function saveMenuDraft(db: Db, write: DraftWrite): Promise<MenuDraft | AppError> {
  return db.transaction(async (tx) => {
    if (!(await lockOutlet(tx, write.outletId))) return appError("not_found", "Shop not found.");
    const revision = await currentDraftRevision(tx, write.outletId, true);
    if (!revision) {
      const published = await publishedRevision(tx, write.outletId);
      if (!published) return appError("not_found", "This shop has no menu draft.");
      if (published.id !== write.revisionId || published.version !== write.baseVersion) return revisionConflict(published);
      return draftFromPublished(tx, published, write);
    }
    if (revision.id !== write.revisionId || revision.version !== write.baseVersion) return revisionConflict(revision);

    const existing = await itemsOf(tx, revision.id);
    const byId = new Map(existing.map((row) => [row.id, row]));
    const seen = new Set<string>();
    for (const item of write.items) {
      if (item.id === undefined) continue;
      if (!byId.has(item.id) || seen.has(item.id)) return unknownItem();
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
        const id = newId("itm");
        await tx.insert(menuItems).values({ id, menuRevisionId: revision.id, itemKey: id, source: "merchant", ...values });
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

const itemKeyOf = (item: { name: string; portion: string | null }) => `${item.name.trim().toLowerCase()}\u0000${(item.portion ?? "").trim().toLowerCase()}`;

// Adds import suggestions to a draft without changing any existing item (Gate 3 "non-clobbering
// suggestion merge"). Pure: the caller writes the result. A suggestion for an item the draft already
// has, by name and portion, is dropped, so a merchant's corrected name or price is never replaced by
// what the photo says. Every added item is an unconfirmed import suggestion with unknown
// availability, which the merchant must choose before confirming.
export function mergeImportSuggestions(
  current: readonly MenuItemDraft[],
  suggestions: readonly DraftItemSuggestion[],
  baseRevisionId: string,
  currentRevisionId: string,
): DraftMerge {
  if (baseRevisionId !== currentRevisionId) return { applied: false, reason: "base_revision_changed" };
  const existing = new Map(current.filter((item) => item.name.trim() !== "").map((item) => [itemKeyOf(item), item]));
  const added: MenuItemDraft[] = [];
  const preserved = new Set<string>();
  let skippedForCapacity = 0;
  for (const suggestion of suggestions) {
    const match = suggestion.name.trim() === "" ? undefined : existing.get(itemKeyOf(suggestion));
    if (match) {
      if (match.source === "merchant") preserved.add(match.id);
      continue;
    }
    if (current.length + added.length >= MENU_LIMITS.maxItems) {
      skippedForCapacity += 1;
      continue;
    }
    added.push({
      id: newId("itm"),
      name: suggestion.name,
      portion: suggestion.portion,
      priceSgdCents: suggestion.priceSgdCents,
      availability: "unknown",
      source: "import_suggestion",
    });
  }
  return { applied: true, added, addedItemIds: added.map((item) => item.id), preservedMerchantEditIds: [...preserved], skippedForCapacity };
}
