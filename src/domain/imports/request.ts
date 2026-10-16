import { admitMenuImport } from "@/domain/imports/admission";
import { MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import { closeImportFailed, commitImport, markModelDispatched, type ImportCommit } from "@/domain/imports/lifecycle";
import {
  DEFAULT_ADMISSION_LIMITS,
  MENU_IMPORT_LIMITS,
  MENU_SPEND_POLICY,
  actualUsdMicros,
  boundsFor,
  type AdmissionLimits,
  type ImportRejection,
  type ImportUsage,
  type MenuModelBounds,
  type MenuSpendPolicy,
} from "@/domain/imports/types";
import { parseSinglePhotoPart } from "@/domain/imports/upload";
import { validateVisionDraft } from "@/domain/imports/validate-result";
import { draftJson } from "@/domain/menu/serialize";
import { webEnv } from "@/env";
import { draftMenuFromPhoto } from "@/integrations/ai/menu-vision";
import { normalizeMenuJpeg } from "@/integrations/image/normalize";
import type { OutletMemberPrincipal } from "@/lib/auth-context";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { readCountedBody } from "@/lib/http/bounded-body";
import { httpErr, httpOk } from "@/lib/http/respond";
import { log, toSafeErrorRecord } from "@/lib/log";
import { durationMs, menuModelBudgetMs } from "@/lib/time";

// One synchronous menu photo import (Gate 3 call stack "Menu photo import"), after the route's
// membership guard and origin check: kill switch, consent version, admission, the counted upload,
// the in-memory photo checks, the dispatch mark, the one vision call, validation and the commit.
// The photo lives only in this request's memory and never reaches a log, a response, an audit row,
// a file or a database column.

// The clock, the vision call, the limits and the spend policy, replaceable by tests: the clock to
// stand in for elapsed upload time, the call to observe the budget it is given, and a FIXTURE bounds
// entry for the fake model. Production uses these defaults: the reviewed code constants.
export const importRuntime: {
  now: () => Date;
  draft: typeof draftMenuFromPhoto;
  limits: AdmissionLimits;
  policy: MenuSpendPolicy;
} = {
  now: () => new Date(),
  draft: draftMenuFromPhoto,
  limits: DEFAULT_ADMISSION_LIMITS,
  policy: MENU_SPEND_POLICY,
};

const peakRssBytes = () => process.resourceUsage().maxRSS * 1024;

const refused = (importId: string, code: AppError["code"], message: string, outcome: string, reason?: string, retryable = false) =>
  httpErr(appError(code, message, { retryable, details: { importId, outcome, ...(reason ? { reason } : {}) } }));

// Only a refusal that a later attempt can pass is retryable: a live import ends by its deadline, and
// the daily caps and the spend ceiling reset at UTC midnight. A missing ceiling or bounds entry, or
// usage above a reservation, holds until a reviewed code change.
const RETRYABLE_REJECTIONS: ReadonlySet<ImportRejection> = new Set(["in_flight_outlet", "in_flight_global", "daily_cap_outlet", "daily_cap_global", "spend_ceiling_reached"]);

const TIMEOUT_COPY =
  "Drafting took too long, so Envoi stopped waiting and did not apply a late result. Envoi did not store your photo; OpenAI's retention rules still apply. Your existing edits are unchanged. Try a clearer or closer photo, or enter the menu manually.";

// Whether a photo import could be admitted at all now: the kill switch is on, the key and the model
// are set, and the reviewed constants hold a ceiling and bounds for that model. The setup page uses
// it to show the closed state up front; admission still checks everything itself.
export function menuImportsOpen(): boolean {
  const env = webEnv();
  if (!env.MENU_IMPORTS_ENABLED || !env.OPENAI_API_KEY || !env.AI_MENU_MODEL) return false;
  return MENU_SPEND_POLICY.dailyCeilingUsdMicros !== null && boundsFor(MENU_SPEND_POLICY, env.AI_MENU_MODEL) !== null;
}

// The answer for a commit that merged nothing (Gate 3 "Menu import" state machine).
export function commitRefusal(importId: string, outcome: Extract<ImportCommit, { committed: false }>["outcome"]): AppError {
  const details = { importId, outcome };
  switch (outcome) {
    case "expired":
      return appError("import_expired", TIMEOUT_COPY, { details });
    case "membership_revoked":
      return appError("forbidden_membership", "This account no longer has a membership for that shop.", { details });
    case "conflict_base_revision":
      return appError("import_base_revision_changed", "The menu changed while the photo was drafted, so nothing was added. Reload the draft and import again.", { details });
    case "conflict_confirmed":
      return appError("import_base_revision_changed", "The menu was confirmed while the photo was drafted, so nothing was added. Change the menu to unconfirm it, then import again.", { details });
  }
}

export async function runMenuImport(db: Db, request: Request, principal: OutletMemberPrincipal): Promise<Response> {
  const env = webEnv();
  if (!env.MENU_IMPORTS_ENABLED || !env.OPENAI_API_KEY || !env.AI_MENU_MODEL) {
    return httpErr(appError("admission_rejected", "Menu photo import is not available in this release. You can still enter your menu by hand.", { details: { reason: "imports_disabled" } }));
  }
  if (request.headers.get("envoi-consent-version") !== MENU_CONSENT_VERSION) {
    return httpErr(appError("consent_required", "Read and accept the current photo notice before importing.", { details: { consentVersion: MENU_CONSENT_VERSION } }));
  }
  const baseRevisionId = request.headers.get("envoi-base-revision");
  if (!baseRevisionId) return httpErr(appError("validation_failed", "Reload the menu draft and try again.", { details: { reason: "base_revision_missing" } }));

  const admission = await admitMenuImport(db, {
    outletId: principal.outletId,
    actorUserId: principal.userId,
    consentVersion: MENU_CONSENT_VERSION,
    baseRevisionId,
    model: env.AI_MENU_MODEL,
    limits: importRuntime.limits,
    policy: importRuntime.policy,
    now: importRuntime.now(),
  });
  if (!admission.ok) {
    const retryable = RETRYABLE_REJECTIONS.has(admission.reason);
    const message = retryable
      ? "A photo import cannot start right now. You can still enter your menu by hand."
      : "Menu photo import is not available in this release. You can still enter your menu by hand.";
    return httpErr(appError("admission_rejected", message, { retryable, details: { reason: admission.reason } }));
  }
  const { importId, admittedAt } = admission;
  const bounds = boundsFor(importRuntime.policy, env.AI_MENU_MODEL) as MenuModelBounds;
  const usageAt = (tokens: { inputTokens: number | null; outputTokens: number | null } | null): ImportUsage => ({
    inputTokens: tokens?.inputTokens ?? null,
    outputTokens: tokens?.outputTokens ?? null,
    // No dispatched call means no spend: an attempt closed before dispatch records zero.
    actualUsdMicros: tokens === null ? 0 : actualUsdMicros(bounds, tokens),
    latencyMs: importRuntime.now().getTime() - admittedAt.getTime(),
    peakRssBytes: peakRssBytes(),
  });

  try {
    const readMs = Math.max(0, durationMs("T_MENU_UPLOAD_READ") - (importRuntime.now().getTime() - admittedAt.getTime()));
    const read = await readCountedBody(request.body, MENU_IMPORT_LIMITS.maxBodyBytes, readMs, request.signal);
    if (!read.ok) {
      await closeImportFailed(db, importId, read.reason === "aborted" ? "aborted" : "rejected_upload", usageAt(null), importRuntime.now());
      return refused(importId, "import_rejected", "The photo upload did not finish. Try again or enter the menu by hand.", "rejected_upload", read.reason);
    }
    const part = await parseSinglePhotoPart(read.bytes, request.headers.get("content-type"));
    if (!part.ok) {
      await closeImportFailed(db, importId, "rejected_upload", usageAt(null), importRuntime.now());
      return refused(importId, "import_rejected", "Upload exactly one menu photo of at most 2 MiB.", "rejected_upload", part.reason);
    }
    const photo = await normalizeMenuJpeg(part.jpeg);
    if (!photo.ok) {
      await closeImportFailed(db, importId, "rejected_photo", usageAt(null), importRuntime.now());
      return refused(importId, "import_rejected", "That photo could not be used. Choose a JPEG of at most 2,048 pixels per side, or enter the menu by hand.", "rejected_photo", photo.reason);
    }

    const { marked } = await markModelDispatched(db, importId, importRuntime.now());
    if (!marked) {
      await closeImportFailed(db, importId, "aborted", usageAt(null), importRuntime.now());
      return refused(importId, "import_expired", "This import ran out of time before drafting started. Try again.", "aborted");
    }

    const call = await importRuntime.draft({
      jpeg: photo.jpeg,
      model: env.AI_MENU_MODEL,
      apiKey: env.OPENAI_API_KEY,
      bounds,
      budgetMs: menuModelBudgetMs(admittedAt, importRuntime.now()),
      signal: request.signal,
    });
    // A dispatched call may be billed even when it failed, so its usage is charged at its bound.
    const usage = usageAt(call.kind === "ok" ? call : { inputTokens: null, outputTokens: null });
    if (call.kind === "timeout") {
      await closeImportFailed(db, importId, "model_timeout", usage, importRuntime.now());
      return refused(importId, "provider_unreachable", TIMEOUT_COPY, "model_timeout", undefined, true);
    }
    if (call.kind === "aborted") {
      await closeImportFailed(db, importId, "aborted", usage, importRuntime.now());
      return refused(importId, "import_rejected", "The connection was lost. Reload the draft to check whether it finished before trying again.", "aborted", "aborted");
    }
    if (call.kind === "provider_error") {
      await closeImportFailed(db, importId, "model_failed", usage, importRuntime.now());
      return refused(importId, "provider_unreachable", "Drafting failed, so no item was added. Try again or enter the menu by hand.", "model_failed", undefined, true);
    }

    const validated = validateVisionDraft(call.raw);
    if (!validated.ok) {
      await closeImportFailed(db, importId, "output_invalid", usage, importRuntime.now());
      return refused(importId, "import_rejected", "The drafted menu was unusable, so no item was added. Try another photo or enter the menu by hand.", "output_invalid", validated.reason);
    }

    const commit = await commitImport(db, importId, validated, usage, importRuntime.now());
    if (commit.committed) {
      return httpOk({
        import: {
          id: importId,
          outcome: "completed",
          rowsDrafted: validated.items.length,
          rowsBlankPrice: validated.blankPriceCount,
          added: commit.merge.addedItemIds.length,
          preservedMerchantEdits: commit.merge.preservedMerchantEditIds.length,
          skippedForCapacity: commit.merge.skippedForCapacity,
        },
        draft: draftJson(commit.draft),
      });
    }
    return httpErr(commitRefusal(importId, commit.outcome));
  } catch (err) {
    log("error", "menu_import_failed", { importId, error: toSafeErrorRecord(err, "internal") });
    await closeImportFailed(db, importId, "aborted", null, importRuntime.now()).catch(() => {});
    return refused(importId, "import_rejected", "The import stopped unexpectedly, so nothing was added. Reload the draft before trying again.", "aborted", "internal");
  }
}
