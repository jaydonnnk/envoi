import { eq } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { menuRevisions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { assessMenuCompleteness, currentDraftRevision, draftOf, itemsOf, revisionConflict, toDraftItem } from "./draft";
import type { MenuDraft } from "./types";

export type DraftConfirmation = { outletId: string; revisionId: string; version: number; actorUserId: string; now: Date };

// Confirms exactly the named version of the draft, and only when it is complete. A stale version is
// a revision_conflict; an incomplete menu is refused with the offending item ids. Either refusal
// changes nothing. Confirming an already confirmed version returns it unchanged.
export async function confirmMenuDraft(db: Db, confirmation: DraftConfirmation): Promise<MenuDraft | AppError> {
  return db.transaction(async (tx) => {
    const revision = await currentDraftRevision(tx, confirmation.outletId, true);
    if (!revision) return appError("not_found", "This shop has no menu draft.");
    if (revision.id !== confirmation.revisionId || revision.version !== confirmation.version) return revisionConflict(revision);

    const rows = await itemsOf(tx, revision.id);
    if (revision.status === "confirmed") return draftOf(revision, rows);
    if (rows.length === 0) return appError("validation_failed", "Add at least one item before confirming.", { details: { reason: "no_items" } });
    const completeness = assessMenuCompleteness(rows.map(toDraftItem));
    if (!completeness.complete) {
      return appError("validation_failed", "Every item needs a name, a price and your choice of availability before you confirm.", {
        details: { reason: completeness.reason, incompleteItemIds: completeness.incompleteItemIds.join(",") },
      });
    }

    const [confirmed] = await tx
      .update(menuRevisions)
      .set({ status: "confirmed", confirmedAt: confirmation.now })
      .where(eq(menuRevisions.id, revision.id))
      .returning();
    await recordAudit(tx, {
      at: confirmation.now,
      actor: `merchant:${confirmation.actorUserId}`,
      action: "menu_confirmed",
      outletId: confirmation.outletId,
      operatorVisible: false,
      details: { revisionId: revision.id, version: revision.version, itemCount: rows.length },
    });
    return draftOf(confirmed!, rows);
  });
}
