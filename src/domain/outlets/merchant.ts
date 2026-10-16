import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { getMenuDraft } from "@/domain/menu/draft";
import type { MenuDraft } from "@/domain/menu/types";
import { getPayPalConnection, type PayPalConnection } from "@/domain/outlets/destination";
import { publicationStatus, type PublicationStatus } from "@/domain/outlets/publish";
import { decodeEmvcoTlv, type SupportedScheme } from "@/domain/sgqr/decode";
import { isMappable, mappableIdentifier } from "@/domain/sgqr/validate";
import { enrollments, merchantMemberships, outletIdentifiers, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";

// Merchant-side outlet drafts (Gate 2 "POST /merchant/outlets, PATCH /merchant/outlets/{id}").
// An outlet created here is unpublished: buyers read only outlets with a published revision.

export const OUTLET_LIMITS = { maxTextChars: 80, maxIdentifiers: 5 } as const;

// S9: a business identifier the merchant submitted for this outlet, and whether the operator has
// approved the mapping. Only an approved mapping can identify the outlet to a buyer's scan (S10).
export type OutletIdentifier = {
  id: string;
  scheme: "paynow_uen";
  identifier: string;
  distinguisher: string;
  source: "sticker" | "corrected" | "manual";
  checksumValid: boolean | null;
  approved: boolean;
};

export type MerchantOutlet = {
  id: string;
  name: string;
  area: string;
  isDemoFixture: boolean;
  published: boolean;
  enrollment: "pending" | "approved" | null;
  // S7: the merchant confirmed exactly the current name and area.
  detailsConfirmed: boolean;
  paypal: PayPalConnection | null;
  publication: PublicationStatus;
  identifiers: OutletIdentifier[];
};

export type MerchantOutlets = { outlets: MerchantOutlet[]; canCreateOutlet: boolean };

const merchantActor = (userId: string) => `merchant:${userId}`;

const outletColumns = {
  id: outlets.id,
  name: outlets.name,
  area: outlets.area,
  isDemoFixture: outlets.isDemoFixture,
  publishedMenuRevisionId: outlets.publishedMenuRevisionId,
  detailsConfirmedAt: outlets.detailsConfirmedAt,
  enrollment: enrollments.status,
};

type OutletRow = {
  id: string;
  name: string;
  area: string;
  isDemoFixture: boolean;
  publishedMenuRevisionId: string | null;
  detailsConfirmedAt: Date | null;
  enrollment: string | null;
};

async function listIdentifiers(db: Pick<Db, "select">, outletId: string): Promise<OutletIdentifier[]> {
  const rows = await db
    .select({
      id: outletIdentifiers.id,
      identifier: outletIdentifiers.identifier,
      distinguisher: outletIdentifiers.distinguisher,
      source: outletIdentifiers.source,
      checksumValid: outletIdentifiers.checksumValid,
      approvedAt: outletIdentifiers.approvedAt,
    })
    .from(outletIdentifiers)
    .where(eq(outletIdentifiers.outletId, outletId))
    .orderBy(asc(outletIdentifiers.submittedAt), asc(outletIdentifiers.id));
  return rows.map((row) => ({
    id: row.id,
    scheme: "paynow_uen",
    identifier: row.identifier,
    distinguisher: row.distinguisher,
    source: row.source === "sticker" || row.source === "corrected" ? row.source : "manual",
    checksumValid: row.checksumValid,
    approved: row.approvedAt !== null,
  }));
}

async function toMerchantOutlet(db: Pick<Db, "select">, row: OutletRow): Promise<MerchantOutlet> {
  const publication = await publicationStatus(db, row.id);
  if (!publication) throw new Error("an outlet read in this transaction has no publication status");
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    isDemoFixture: row.isDemoFixture,
    published: row.publishedMenuRevisionId !== null,
    enrollment: row.enrollment === "approved" ? "approved" : row.enrollment === "pending" ? "pending" : null,
    detailsConfirmed: row.detailsConfirmedAt !== null,
    paypal: await getPayPalConnection(db, row.id),
    publication,
    identifiers: await listIdentifiers(db, row.id),
  };
}

// One outlet as its merchant sees it. The caller has already checked the membership.
export async function describeOutlet(db: Pick<Db, "select">, outletId: string): Promise<MerchantOutlet | null> {
  const [row] = await db.select(outletColumns).from(outlets).leftJoin(enrollments, eq(enrollments.outletId, outlets.id)).where(eq(outlets.id, outletId));
  return row ? toMerchantOutlet(db, row) : null;
}

// The outlets this account holds a live membership for, and whether an approved, unbound membership
// lets it create one more.
export async function listMerchantOutlets(db: Pick<Db, "select">, userId: string): Promise<MerchantOutlets> {
  const rows = await db
    .select(outletColumns)
    .from(merchantMemberships)
    .innerJoin(outlets, eq(outlets.id, merchantMemberships.outletId))
    .leftJoin(enrollments, eq(enrollments.outletId, outlets.id))
    .where(and(eq(merchantMemberships.userId, userId), isNull(merchantMemberships.revokedAt), isNotNull(merchantMemberships.outletId)))
    .orderBy(asc(outlets.createdAt), asc(outlets.id));
  const [unbound] = await db
    .select({ id: merchantMemberships.id })
    .from(merchantMemberships)
    .where(and(eq(merchantMemberships.userId, userId), isNull(merchantMemberships.revokedAt), isNull(merchantMemberships.outletId)))
    .limit(1);
  const described: MerchantOutlet[] = [];
  for (const row of rows) described.push(await toMerchantOutlet(db, row));
  return { outlets: described, canCreateOutlet: unbound !== undefined };
}

export type OutletInput = { name: string; area: string };

// detailsConfirmed: the merchant declares they reviewed exactly these details. Saving without it
// clears any earlier confirmation, so a confirmation always names the current name and area.
export type OutletUpdate = OutletInput & { detailsConfirmed: boolean };

export type CreatedOutlet = { outlet: MerchantOutlet; draft: MenuDraft };

// Uses up the account's approved, unbound membership: in one transaction it creates the unpublished
// outlet, its pending enrollment and an empty draft revision, and binds the membership to the new
// outlet. It returns that empty draft, so the setup page shows the menu editor without a second
// request. Without such a membership nothing is created. Two concurrent creations cannot share one
// membership, because the second waits on the row lock and then finds it bound.
export async function createMerchantOutlet(db: Db, input: OutletInput & { userId: string; now: Date }): Promise<CreatedOutlet | AppError> {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ id: merchantMemberships.id, isDemo: merchantMemberships.isDemo })
      .from(merchantMemberships)
      .where(and(eq(merchantMemberships.userId, input.userId), isNull(merchantMemberships.revokedAt), isNull(merchantMemberships.outletId)))
      .limit(1)
      .for("update");
    if (!membership) {
      return appError("forbidden_membership", "This account has no approved membership for a new shop. Ask the Envoi operator.");
    }

    const outletId = newId("out");
    const menuRevisionId = newId("mrv");
    // The web role may insert only these columns (migration 0013), and Drizzle's insert names every
    // column, so these three rows are written with explicit column lists. The database then refuses
    // an outlet born published, an enrollment born approved and a revision born confirmed.
    const createdAt = input.now.toISOString();
    await tx.execute(sql`insert into outlets (id, name, area, is_demo_fixture, created_at) values (${outletId}, ${input.name}, ${input.area}, ${membership.isDemo}, ${createdAt})`);
    await tx.execute(sql`insert into enrollments (id, outlet_id, is_demo, created_at) values (${newId("enr")}, ${outletId}, ${membership.isDemo}, ${createdAt})`);
    await tx.execute(sql`insert into menu_revisions (id, outlet_id, status, version, created_at) values (${menuRevisionId}, ${outletId}, 'draft', 1, ${createdAt})`);
    await tx.update(merchantMemberships).set({ outletId }).where(eq(merchantMemberships.id, membership.id));
    await recordAudit(tx, {
      at: input.now,
      actor: merchantActor(input.userId),
      action: "outlet_created",
      outletId,
      operatorVisible: true,
      details: { membershipId: membership.id, menuRevisionId, isDemo: membership.isDemo },
    });
    const draft = await getMenuDraft(tx, outletId);
    const outlet = await describeOutlet(tx, outletId);
    if (!draft || !outlet) throw new Error("The new outlet or its draft revision was not found in its own transaction.");
    return { outlet, draft };
  });
}

// Edits the name and area of an unpublished outlet, and sets or clears its outlet confirmation. A
// published outlet is not edited here.
export async function updateMerchantOutlet(db: Db, input: OutletUpdate & { outletId: string; userId: string; now: Date }): Promise<MerchantOutlet | AppError> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select(outletColumns)
      .from(outlets)
      .leftJoin(enrollments, eq(enrollments.outletId, outlets.id))
      .where(eq(outlets.id, input.outletId))
      .for("update", { of: outlets });
    if (!current) return appError("not_found", "Shop not found.");
    if (current.publishedMenuRevisionId !== null) {
      return appError("validation_failed", "A published shop's details cannot be edited here.", { details: { reason: "outlet_published" } });
    }
    await tx
      .update(outlets)
      .set({ name: input.name, area: input.area, detailsConfirmedAt: input.detailsConfirmed ? input.now : null })
      .where(eq(outlets.id, input.outletId));
    await recordAudit(tx, {
      at: input.now,
      actor: merchantActor(input.userId),
      action: "outlet_updated",
      outletId: input.outletId,
      operatorVisible: false,
      details: { nameChanged: current.name !== input.name, areaChanged: current.area !== input.area, detailsConfirmed: input.detailsConfirmed },
    });
    const outlet = await describeOutlet(tx, input.outletId);
    if (!outlet) throw new Error("the outlet vanished in its own transaction");
    return outlet;
  });
}

// S9: the identifier the merchant reviewed, with the sticker payload when one was decoded. The payload
// is decoded again here, so the stored source and checksum are the server's, never the browser's
// claim, and it lives only in this request's memory: it is never stored, logged or audited.
export type IdentifierSubmission = { scheme: SupportedScheme; identifier: string; distinguisher: string; payload: string | null };

const identifierRefused = (reason: string, message: string) => appError("validation_failed", message, { details: { reason } });

// Records a pending mapping for the outlet. A personal PayNow proxy or a malformed UEN is refused
// before any write. A published outlet may submit one too: a pending mapping changes nothing a buyer
// sees, and only the operator approves it.
export async function submitOutletIdentifier(db: Db, input: IdentifierSubmission & { outletId: string; userId: string; now: Date }): Promise<MerchantOutlet | AppError> {
  const mappable = mappableIdentifier(input);
  if (!isMappable(mappable)) return identifierRefused(mappable.reason, mappable.message);

  let source: OutletIdentifier["source"] = "manual";
  let checksumValid: boolean | null = null;
  if (input.payload !== null) {
    const decoded = decodeEmvcoTlv(input.payload);
    if (decoded.kind === "not_emvco") return identifierRefused("not_emvco", "That QR code is not an SGQR payment code. Enter the UEN by hand instead.");
    checksumValid = decoded.checksumValid;
    const onSticker = decoded.recognized.some((field) => {
      const candidate = mappableIdentifier(field);
      return isMappable(candidate) && candidate.identifier === mappable.identifier;
    });
    source = onSticker ? "sticker" : "corrected";
  }

  return db.transaction(async (tx) => {
    // The outlet row lock serializes submissions, so two at once cannot pass the count together.
    const [outlet] = await tx.select({ id: outlets.id }).from(outlets).where(eq(outlets.id, input.outletId)).for("update");
    if (!outlet) return appError("not_found", "Shop not found.");
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(outletIdentifiers).where(eq(outletIdentifiers.outletId, input.outletId)) as [{ count: number }];
    if (count >= OUTLET_LIMITS.maxIdentifiers) {
      return identifierRefused("identifier_limit", `A shop can submit at most ${OUTLET_LIMITS.maxIdentifiers} identifiers. Ask the Envoi operator about the ones already submitted.`);
    }

    const id = newId("oid");
    // The web role may insert only these columns (migration 0021); approved_at stays null. The
    // unique index on outlet, scheme and identifier turns a repeat into no row.
    const inserted = await tx.execute(sql`
      insert into outlet_identifiers (id, outlet_id, scheme, identifier, distinguisher, source, checksum_valid, submitted_by_user_id, submitted_at)
      values (${id}, ${input.outletId}, ${mappable.scheme}, ${mappable.identifier}, ${input.distinguisher}, ${source}, ${checksumValid}, ${input.userId}, ${input.now.toISOString()})
      on conflict do nothing
      returning id`);
    if (inserted.length === 0) return identifierRefused("identifier_exists", "This shop already submitted that UEN.");

    await recordAudit(tx, {
      at: input.now,
      actor: merchantActor(input.userId),
      action: "identifier_submitted",
      outletId: input.outletId,
      operatorVisible: true,
      details: { identifierId: id, source, checksumValid },
    });
    const described = await describeOutlet(tx, input.outletId);
    if (!described) throw new Error("the outlet vanished in its own transaction");
    return described;
  });
}
