import { and, eq, isNotNull } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { currentDraftRevision, lockOutlet, revisionConflict } from "@/domain/menu/draft";
import { enrollments, menuRevisions, outlets, paymentDestinations } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";

// Publication (Gate 3 "POST /merchant/outlets/{id}/publish"; S7). One transaction rechecks all four
// preconditions under locks and switches the published pointer; the database then marks the
// revision published and refuses any later write to it (migration 0017). Buyers keep reading the
// previously published revision until the switch commits.

export type PublicationCheck = "enrollment" | "outlet_details" | "menu_confirmation" | "destination";

export type PublicationFacts = {
  enrollmentApproved: boolean;
  detailsConfirmed: boolean;
  draft: typeof menuRevisions.$inferSelect | null; // the unpublished revision that would be published
  destinationAccepted: boolean; // an active PayPal sandbox destination the merchant accepted
};

// Each precondition blocks on its own.
export function missingPreconditions(facts: PublicationFacts): PublicationCheck[] {
  const missing: PublicationCheck[] = [];
  if (!facts.enrollmentApproved) missing.push("enrollment");
  if (!facts.detailsConfirmed) missing.push("outlet_details");
  if (facts.draft?.status !== "confirmed") missing.push("menu_confirmation");
  if (!facts.destinationAccepted) missing.push("destination");
  return missing;
}

type Conn = Pick<Db, "select">;

// With lock, inside the publish transaction: the outlet is already locked by the caller, the draft
// revision is locked FOR UPDATE and the destination FOR SHARE, so neither changes before the switch.
async function publicationFacts(db: Conn, outletId: string, lock: boolean): Promise<PublicationFacts | null> {
  const [outlet] = await db.select({ detailsConfirmedAt: outlets.detailsConfirmedAt }).from(outlets).where(eq(outlets.id, outletId));
  if (!outlet) return null;
  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.outletId, outletId), eq(enrollments.status, "approved")));
  const destinationQuery = db
    .select({ id: paymentDestinations.id })
    .from(paymentDestinations)
    .where(
      and(
        eq(paymentDestinations.outletId, outletId),
        eq(paymentDestinations.rail, "paypal"),
        eq(paymentDestinations.status, "active"),
        isNotNull(paymentDestinations.acceptedAt),
      ),
    );
  const [destination] = lock ? await destinationQuery.for("share") : await destinationQuery;
  return {
    enrollmentApproved: enrollment !== undefined,
    detailsConfirmed: outlet.detailsConfirmedAt !== null,
    draft: await currentDraftRevision(db, outletId, lock),
    destinationAccepted: destination !== undefined,
  };
}

export type PublicationStatus = { missing: PublicationCheck[]; draftRevisionId: string | null; draftVersion: number | null };

// What the merchant still needs before publishing, for display. Publication rechecks it all.
export async function publicationStatus(db: Conn, outletId: string): Promise<PublicationStatus | null> {
  const facts = await publicationFacts(db, outletId, false);
  if (!facts) return null;
  return { missing: missingPreconditions(facts), draftRevisionId: facts.draft?.id ?? null, draftVersion: facts.draft?.version ?? null };
}

const CHECK_COPY: Record<PublicationCheck, string> = {
  enrollment: "the Envoi operator has not approved this shop's enrollment",
  outlet_details: "confirm the shop details",
  menu_confirmation: "confirm the menu",
  destination: "use the PayPal sandbox connection",
};

export type PublishInput = { outletId: string; revisionId: string; version: number; actorUserId: string; now: Date };

// Publishes exactly the reviewed version of the unpublished revision, only while every precondition
// holds. A refusal changes nothing.
export async function publishOutlet(db: Db, input: PublishInput): Promise<{ revisionId: string; replacedRevisionId: string | null } | AppError> {
  return db.transaction(async (tx) => {
    if (!(await lockOutlet(tx, input.outletId))) return appError("not_found", "Shop not found.");
    const facts = await publicationFacts(tx, input.outletId, true);
    if (!facts) return appError("not_found", "Shop not found.");
    if (!facts.draft) {
      return appError("validation_failed", "There are no menu changes to publish.", { details: { reason: "nothing_to_publish" } });
    }
    if (facts.draft.id !== input.revisionId || facts.draft.version !== input.version) return revisionConflict(facts.draft);

    const missing = missingPreconditions(facts);
    if (missing.length > 0) {
      return appError("validation_failed", `Not published yet: ${missing.map((check) => CHECK_COPY[check]).join("; ")}.`, {
        details: { reason: "preconditions", missing: missing.join(",") },
      });
    }

    const [before] = await tx.select({ published: outlets.publishedMenuRevisionId }).from(outlets).where(eq(outlets.id, input.outletId));
    await tx.update(outlets).set({ publishedMenuRevisionId: facts.draft.id }).where(eq(outlets.id, input.outletId));
    const replacedRevisionId = before?.published ?? null;
    await recordAudit(tx, {
      at: input.now,
      actor: `merchant:${input.actorUserId}`,
      action: "outlet_published",
      outletId: input.outletId,
      operatorVisible: true,
      details: { revisionId: facts.draft.id, version: facts.draft.version, replacedRevisionId },
    });
    return { revisionId: facts.draft.id, replacedRevisionId };
  });
}
