import { getPublishedMenu } from "@/domain/outlets/search";
import type { Db } from "@/lib/db/web";
import { log } from "@/lib/log";
import { getOrCreateTranslation, type MenuTranslator } from "./translate";

// Tourist-ready (S50; Gate 2 "Flow: Tourist-ready Workflow", Gate 3 S50 amendment). After a publish
// commits, one Render flow run stores the menu in the five tourist languages, so the first visitor
// does not wait on a model call. It only calls getOrCreateTranslation, which stores one row per
// revision and language; the buyer's on-demand translation is unchanged and covers any miss.

export const TOURIST_LANGUAGES = ["en", "zh", "ms", "es", "ja"] as const;

export type TouristReadyInput = { outletId: string; revisionId: string };

// Starts one run; throws on any failure. Aborted by the signal.
export type WorkflowTrigger = (input: TouristReadyInput, signal: AbortSignal) => Promise<void>;

export const TRIGGER_TIMEOUT_MS = 3_000;

// The publish route waits only for the start request, never for the run, and at most
// TRIGGER_TIMEOUT_MS. Publication has already committed, so a failure is logged and nothing else.
export async function triggerTouristReady(input: TouristReadyInput, trigger: WorkflowTrigger): Promise<void> {
  try {
    await trigger(input, AbortSignal.timeout(TRIGGER_TIMEOUT_MS));
  } catch (err) {
    log("warn", "tourist_ready_trigger_failed", {
      outletId: input.outletId,
      revisionId: input.revisionId,
      reason: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error",
    });
  }
}

export type PrepareResult = "ready" | "superseded" | "not_found";

// One step of the flow. A revision other than the run's is left to the newer publish's own run, so
// it makes no call. Throws only when the translation is unavailable, so the step retries.
export async function prepareLanguage(db: Db, input: TouristReadyInput, language: string, now: Date, translator: MenuTranslator): Promise<PrepareResult> {
  const menu = await getPublishedMenu(db, input.outletId);
  if (!menu) return "not_found";
  if (menu.menuRevisionId !== input.revisionId) return "superseded";
  const result = await getOrCreateTranslation(db, input.outletId, language, now, translator);
  if (result.kind === "unavailable") throw new Error(`translation unavailable: ${language}`);
  return result.kind === "ok" ? "ready" : "not_found";
}
