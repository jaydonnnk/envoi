import { createHash } from "node:crypto";
import { and, count, eq, gt, gte, isNotNull, isNull, lt, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@/domain/audit/events";
import { MENU_VISION_PROMPT_VERSION, MenuVisionOutput } from "@/integrations/ai/menu-vision";
import { menuImportAdmission, menuImports } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { deadlineOf, utcDayStart } from "@/lib/time";
import { boundsFor, reserveUsdMicros, type AdmissionLimits, type ImportAdmission, type MenuModelBounds, type MenuSpendPolicy } from "./types";

// Serialized import admission (Gate 3 "Menu and imports"). One transaction locks the singleton
// admission row first, so every check below sees one consistent view and two admissions can never
// both pass. It runs before the route reads a single byte of the upload.

const SCHEMA_DIGEST = createHash("sha256").update(JSON.stringify(z.toJSONSchema(MenuVisionOutput))).digest("hex");

// Identifies the model, its reviewed bounds, the prompt and the output schema together: usage above a
// reservation stops imports for this configuration until one of them changes in a reviewed diff.
export function modelConfigVersion(bounds: MenuModelBounds): string {
  return createHash("sha256").update(JSON.stringify({ bounds, prompt: MENU_VISION_PROMPT_VERSION, schema: SCHEMA_DIGEST })).digest("hex").slice(0, 32);
}

const DAY_MS = 24 * 60 * 60_000;

export async function admitMenuImport(
  db: Db,
  input: {
    outletId: string;
    actorUserId: string;
    consentVersion: string; // the route has already checked it equals MENU_CONSENT_VERSION
    baseRevisionId: string;
    model: string; // AI_MENU_MODEL
    limits: AdmissionLimits;
    policy: MenuSpendPolicy;
    now: Date;
  },
): Promise<ImportAdmission> {
  const { now, limits, policy } = input;
  return db.transaction(async (tx) => {
    await tx.select({ id: menuImportAdmission.id }).from(menuImportAdmission).where(eq(menuImportAdmission.id, "global")).for("update");

    if (policy.dailyCeilingUsdMicros === null) return { ok: false, reason: "spend_ceiling_unset" };
    const bounds = boundsFor(policy, input.model);
    if (!bounds) return { ok: false, reason: "model_bounds_missing" };
    const configVersion = modelConfigVersion(bounds);

    const [overrun] = await tx
      .select({ id: menuImports.id })
      .from(menuImports)
      .where(and(eq(menuImports.modelConfigVersion, configVersion), gt(menuImports.actualUsdMicros, menuImports.reservedUsdMicros)))
      .limit(1);
    if (overrun) return { ok: false, reason: "model_bounds_exceeded" };

    // Live means open and before its deadline; an open row past its deadline reads as expired.
    const live = and(isNull(menuImports.closedAt), gt(menuImports.deadlineAt, now));
    const [outletLive] = await tx.select({ n: count() }).from(menuImports).where(and(live, eq(menuImports.outletId, input.outletId)));
    if (outletLive!.n >= limits.outletInFlight) return { ok: false, reason: "in_flight_outlet" };
    const [globalLive] = await tx.select({ n: count() }).from(menuImports).where(live);
    if (globalLive!.n >= limits.globalInFlight) return { ok: false, reason: "in_flight_global" };

    // Every admitted attempt of the UTC day counts, whatever its outcome.
    const dayStart = utcDayStart(now);
    const today = and(gte(menuImports.admittedAt, dayStart), lt(menuImports.admittedAt, new Date(dayStart.getTime() + DAY_MS)));
    const [outletDay] = await tx.select({ n: count() }).from(menuImports).where(and(today, eq(menuImports.outletId, input.outletId)));
    if (outletDay!.n >= limits.outletDaily) return { ok: false, reason: "daily_cap_outlet" };
    const [globalDay] = await tx.select({ n: count() }).from(menuImports).where(today);
    if (globalDay!.n >= limits.globalDaily) return { ok: false, reason: "daily_cap_global" };

    // A reservation is held unless its attempt provably never dispatched the model call: held when
    // the dispatch mark is set, or while the attempt is still live.
    const reserved = reserveUsdMicros(bounds);
    const [held] = await tx
      .select({ total: sum(menuImports.reservedUsdMicros).mapWith(Number) })
      .from(menuImports)
      .where(and(today, or(isNotNull(menuImports.modelDispatchedAt), live)));
    if ((held!.total ?? 0) + reserved > policy.dailyCeilingUsdMicros) return { ok: false, reason: "spend_ceiling_reached" };

    const importId = newId("imp");
    const deadlineAt = deadlineOf("T_MENU_REQUEST", now);
    await tx.insert(menuImports).values({
      id: importId,
      outletId: input.outletId,
      actorUserId: input.actorUserId,
      baseRevisionId: input.baseRevisionId,
      consentVersion: input.consentVersion,
      modelConfigVersion: configVersion,
      admittedAt: now,
      deadlineAt,
      reservedUsdMicros: reserved,
    });
    await tx.update(menuImportAdmission).set({ lastAdmittedAt: now }).where(eq(menuImportAdmission.id, "global"));
    await recordAudit(tx, {
      at: now,
      actor: `merchant:${input.actorUserId}`,
      action: "menu_import_admitted",
      outletId: input.outletId,
      operatorVisible: false,
      details: { importId, baseRevisionId: input.baseRevisionId, reservedUsdMicros: reserved, modelConfigVersion: configVersion },
    });
    return { ok: true, importId, admittedAt: now, deadlineAt, reservedUsdMicros: reserved };
  });
}

// The UTC day's held reservations and recorded spend, for the operator health view.
export async function importSpendToday(db: Pick<Db, "select">, now: Date): Promise<{ heldUsdMicros: number; actualUsdMicros: number }> {
  const dayStart = utcDayStart(now);
  const today = and(gte(menuImports.admittedAt, dayStart), lt(menuImports.admittedAt, new Date(dayStart.getTime() + DAY_MS)));
  const live = and(isNull(menuImports.closedAt), gt(menuImports.deadlineAt, now));
  const [row] = await db
    .select({
      held: sql<number>`coalesce(sum(${menuImports.reservedUsdMicros}) filter (where ${or(isNotNull(menuImports.modelDispatchedAt), live)}), 0)`.mapWith(Number),
      actual: sql<number>`coalesce(sum(${menuImports.actualUsdMicros}), 0)`.mapWith(Number),
    })
    .from(menuImports)
    .where(today);
  return { heldUsdMicros: row?.held ?? 0, actualUsdMicros: row?.actual ?? 0 };
}
