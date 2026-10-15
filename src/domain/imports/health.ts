import { desc, gte, sql } from "drizzle-orm";
import { menuImports } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { utcDayStart } from "@/lib/time";
import { importSpendToday } from "./admission";
import { deriveImportOutcome, toImportRow } from "./lifecycle";
import { MENU_SPEND_POLICY, boundsFor, type ImportOutcome } from "./types";

// Menu import figures for the operator health view (S11): outcomes, latency, spend reservations and
// decoder memory. Counts and timings only; no import row holds an image.

export type ImportHealth = {
  enabled: boolean;
  model: string | null;
  boundsReviewed: boolean;
  ceilingUsdMicros: number | null;
  today: { admitted: number; outcomes: Partial<Record<ImportOutcome, number>>; heldUsdMicros: number; actualUsdMicros: number; maxLatencyMs: number | null; maxPeakRssBytes: number | null };
  recent: { id: string; outletId: string; outcome: ImportOutcome; admittedAt: string; latencyMs: number | null; reservedUsdMicros: number; actualUsdMicros: number | null; peakRssBytes: number | null }[];
};

const RECENT_SHOWN = 10;

export async function readImportHealth(db: Pick<Db, "select">, now: Date, config: { enabled: boolean; model: string | null }): Promise<ImportHealth> {
  const todayRows = await db
    .select({ closedOutcome: menuImports.closedOutcome, deadlineAt: menuImports.deadlineAt, latencyMs: menuImports.latencyMs, peakRssBytes: menuImports.peakRssBytes })
    .from(menuImports)
    .where(gte(menuImports.admittedAt, utcDayStart(now)));
  const outcomes: Partial<Record<ImportOutcome, number>> = {};
  for (const row of todayRows) {
    const outcome = deriveImportOutcome({ closedOutcome: row.closedOutcome as ReturnType<typeof toImportRow>["closedOutcome"], deadlineAt: row.deadlineAt }, now);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  const max = (values: (number | null)[]) => values.reduce<number | null>((best, value) => (value === null ? best : best === null ? value : Math.max(best, value)), null);
  const spend = await importSpendToday(db, now);
  const recent = await db.select().from(menuImports).orderBy(desc(menuImports.admittedAt), sql`${menuImports.id} desc`).limit(RECENT_SHOWN);
  return {
    enabled: config.enabled,
    model: config.model,
    boundsReviewed: config.model !== null && boundsFor(MENU_SPEND_POLICY, config.model) !== null,
    ceilingUsdMicros: MENU_SPEND_POLICY.dailyCeilingUsdMicros,
    today: {
      admitted: todayRows.length,
      outcomes,
      heldUsdMicros: spend.heldUsdMicros,
      actualUsdMicros: spend.actualUsdMicros,
      maxLatencyMs: max(todayRows.map((row) => row.latencyMs)),
      maxPeakRssBytes: max(todayRows.map((row) => row.peakRssBytes)),
    },
    recent: recent.map((row) => {
      const imported = toImportRow(row);
      return {
        id: row.id,
        outletId: row.outletId,
        outcome: deriveImportOutcome(imported, now),
        admittedAt: row.admittedAt.toISOString(),
        latencyMs: row.latencyMs,
        reservedUsdMicros: row.reservedUsdMicros,
        actualUsdMicros: row.actualUsdMicros,
        peakRssBytes: row.peakRssBytes,
      };
    }),
  };
}
