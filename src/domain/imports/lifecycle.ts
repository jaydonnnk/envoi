import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { currentDraftRevision, draftOf, getMenuDraft, itemsOf, lockOutlet, mergeImportSuggestions } from "@/domain/menu/draft";
import type { DraftMerge, MenuDraft } from "@/domain/menu/types";
import { menuImports, menuItems, menuRevisions, merchantMemberships, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import type { ClosedImportOutcome, ImportOutcome, ImportUsage, MenuImportRow } from "./types";
import type { VisionDraftValidation } from "./validate-result";

// The import attempt's life after admission (Gate 3 "Menu import" state machine): the dispatch mark,
// the one commit that merges, the best-effort failure close and the outcome derived on read. Nothing
// here ever writes "expired": an open attempt past its deadline reads as expired, with no task.

type Row = typeof menuImports.$inferSelect;

export function toImportRow(row: Row): MenuImportRow {
  return { ...row, closedOutcome: row.closedOutcome as ClosedImportOutcome | null, source: row.source as MenuImportRow["source"] };
}

export function deriveImportOutcome(row: Pick<MenuImportRow, "closedOutcome" | "deadlineAt">, now: Date): ImportOutcome {
  if (row.closedOutcome !== null) return row.closedOutcome;
  return now.getTime() >= row.deadlineAt.getTime() ? "expired" : "in_flight";
}

const usageColumns = (usage: ImportUsage | null) =>
  usage === null
    ? {}
    : {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        actualUsdMicros: usage.actualUsdMicros,
        latencyMs: usage.latencyMs,
        peakRssBytes: usage.peakRssBytes,
      };

// A short committed write before the vision call, only while the attempt is open and before its
// deadline. Without it there is no call; with it the reservation is never released.
export async function markModelDispatched(db: Db, importId: string, now: Date): Promise<{ marked: boolean }> {
  const rows = await db
    .update(menuImports)
    .set({ modelDispatchedAt: now })
    .where(and(eq(menuImports.id, importId), isNull(menuImports.closedAt), isNull(menuImports.modelDispatchedAt), gt(menuImports.deadlineAt, now)))
    .returning({ id: menuImports.id });
  return { marked: rows.length === 1 };
}

// Records usage without touching the outcome, for a call that returned after its attempt closed or
// expired, so admission still sees spend above a reservation.
export async function recordImportUsage(db: Pick<Db, "update">, importId: string, usage: ImportUsage): Promise<void> {
  await db.update(menuImports).set(usageColumns(usage)).where(eq(menuImports.id, importId));
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function closeIn(tx: Tx, row: Row, outcome: ClosedImportOutcome, usage: ImportUsage | null, now: Date, extra: Partial<Row> = {}, details: Record<string, string | number | boolean | null> = {}) {
  await tx
    .update(menuImports)
    .set({ closedAt: now, closedOutcome: outcome, ...usageColumns(usage), ...extra })
    .where(eq(menuImports.id, row.id));
  await recordAudit(tx, {
    at: now,
    actor: `merchant:${row.actorUserId}`,
    action: "menu_import_closed",
    outletId: row.outletId,
    operatorVisible: false,
    details: { importId: row.id, outcome, ...details },
  });
}

// Best effort: closes an open attempt before its deadline with a failure outcome. If it cannot, the
// attempt still reads as expired after its deadline; any usage is recorded either way.
export async function closeImportFailed(
  db: Db,
  importId: string,
  outcome: "rejected_upload" | "rejected_photo" | "model_failed" | "model_timeout" | "output_invalid" | "aborted" | "page_refused" | "page_timeout" | "page_unreachable" | "picture_menu",
  usage: ImportUsage | null,
  now: Date,
): Promise<{ closed: boolean }> {
  const closed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(menuImports).where(eq(menuImports.id, importId)).for("update");
    if (!row || row.closedAt !== null || now.getTime() >= row.deadlineAt.getTime()) return false;
    await closeIn(tx, row, outcome, usage, now);
    return true;
  });
  if (!closed && usage !== null) await recordImportUsage(db, importId, usage);
  return { closed };
}

export type ImportCommit =
  | { committed: true; merge: Extract<DraftMerge, { applied: true }>; draft: MenuDraft }
  | { committed: false; outcome: "expired" | "membership_revoked" | "conflict_base_revision" | "conflict_confirmed" };

async function publishedRevisionOf(tx: Tx, outletId: string) {
  const [row] = await tx
    .select({ revision: menuRevisions })
    .from(outlets)
    .innerJoin(menuRevisions, eq(menuRevisions.id, outlets.publishedMenuRevisionId))
    .where(eq(outlets.id, outletId));
  return row?.revision ?? null;
}

// Merges a validated draft in one transaction, only while the attempt is open and before its
// deadline, the actor still holds the outlet's membership and the base revision is current and
// unconfirmed. A late, unauthorized or conflicting commit merges nothing. When the base is the
// published menu and no draft exists, the merge creates a new unpublished draft from it, as any
// edit of a published menu does; the published revision itself is never written.
export async function commitImport(
  db: Db,
  importId: string,
  draft: Extract<VisionDraftValidation, { ok: true }>,
  usage: ImportUsage,
  now: Date,
): Promise<ImportCommit> {
  const result = await db.transaction(async (tx): Promise<ImportCommit | "late"> => {
    const [row] = await tx.select().from(menuImports).where(eq(menuImports.id, importId)).for("update");
    if (!row || row.closedAt !== null || now.getTime() >= row.deadlineAt.getTime()) return "late";

    const [membership] = await tx
      .select({ id: merchantMemberships.id })
      .from(merchantMemberships)
      .where(and(eq(merchantMemberships.userId, row.actorUserId), eq(merchantMemberships.outletId, row.outletId), isNull(merchantMemberships.revokedAt)));
    if (!membership) {
      await closeIn(tx, row, "membership_revoked", usage, now);
      return { committed: false, outcome: "membership_revoked" };
    }

    if (!(await lockOutlet(tx, row.outletId))) throw new Error("an admitted import names an outlet that does not exist");
    let revision = await currentDraftRevision(tx, row.outletId, true);
    let fromPublished = false;
    if (!revision) {
      revision = await publishedRevisionOf(tx, row.outletId);
      fromPublished = true;
    }
    if (!revision || revision.id !== row.baseRevisionId) {
      await closeIn(tx, row, "conflict_base_revision", usage, now);
      return { committed: false, outcome: "conflict_base_revision" };
    }
    if (!fromPublished && revision.status === "confirmed") {
      await closeIn(tx, row, "conflict_confirmed", usage, now);
      return { committed: false, outcome: "conflict_confirmed" };
    }

    const existingRows = await itemsOf(tx, revision.id);
    const merge = mergeImportSuggestions(draftOf(revision, existingRows).items, draft.items, row.baseRevisionId, revision.id);
    if (!merge.applied) throw new Error("the base revision was checked above");

    let targetId = revision.id;
    let version = revision.version + 1;
    if (fromPublished) {
      targetId = newId("mrv");
      version = 1;
      // The web role may insert only these columns (migration 0013).
      await tx.execute(sql`insert into menu_revisions (id, outlet_id, status, version, created_at) values (${targetId}, ${row.outletId}, 'draft', 1, ${now.toISOString()})`);
      for (const [position, item] of existingRows.entries()) {
        const { id: _id, menuRevisionId: _revision, ...rest } = item;
        void _id;
        void _revision;
        await tx.insert(menuItems).values({ ...rest, id: newId("itm"), menuRevisionId: targetId, position });
      }
    } else {
      await tx.update(menuRevisions).set({ version, status: "draft", confirmedAt: null }).where(eq(menuRevisions.id, revision.id));
    }
    for (const [offset, item] of merge.added.entries()) {
      await tx.insert(menuItems).values({
        id: item.id,
        menuRevisionId: targetId,
        itemKey: item.id,
        source: "import_suggestion",
        position: existingRows.length + offset,
        name: item.name,
        portion: item.portion,
        unitSgdCents: item.priceSgdCents,
        available: null,
      });
    }

    await closeIn(
      tx,
      row,
      "completed",
      usage,
      now,
      { rowsDrafted: draft.items.length, rowsBlankPrice: draft.blankPriceCount, resultFingerprint: draft.fingerprint },
      { revisionId: targetId, version, added: merge.addedItemIds.length, preserved: merge.preservedMerchantEditIds.length, skippedForCapacity: merge.skippedForCapacity },
    );
    const merged = await getMenuDraft(tx, row.outletId);
    if (!merged || merged.revisionId !== targetId) throw new Error("the merged draft is not the outlet's draft in its own transaction");
    return { committed: true, merge, draft: merged };
  });
  if (result !== "late") return result;
  await recordImportUsage(db, importId, usage);
  return { committed: false, outcome: "expired" };
}

// The outlet's latest import attempt with its outcome derived at `now`, for the draft reload.
export async function latestImport(db: Pick<Db, "select">, outletId: string, now: Date): Promise<(MenuImportRow & { outcome: ImportOutcome }) | null> {
  const [row] = await db.select().from(menuImports).where(eq(menuImports.outletId, outletId)).orderBy(desc(menuImports.admittedAt), desc(menuImports.id)).limit(1);
  if (!row) return null;
  const imported = toImportRow(row);
  return { ...imported, outcome: deriveImportOutcome(imported, now) };
}

// The latest import as the merchant's draft reload shows it: outcome, timing and counts only.
export type ImportJson = {
  id: string;
  outcome: ImportOutcome;
  admittedAt: string;
  deadlineAt: string;
  rowsDrafted: number | null;
  rowsBlankPrice: number | null;
  source: MenuImportRow["source"];
};

export function importJson(row: MenuImportRow & { outcome: ImportOutcome }): ImportJson {
  return {
    id: row.id,
    outcome: row.outcome,
    admittedAt: row.admittedAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    rowsDrafted: row.rowsDrafted,
    rowsBlankPrice: row.rowsBlankPrice,
    source: row.source,
  };
}
