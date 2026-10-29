// Menu photo import limits, spend policy and outcomes (S11; Gate 3 "Menu and imports"). Every value
// here is a reviewed code constant: changing one is a reviewed diff, never configuration.

export const MENU_IMPORT_LIMITS = {
  maxBodyBytes: 2_621_440, // 2.5 MiB whole multipart body, counted while streaming
  maxPhotoBytes: 2_097_152, // 2 MiB JPEG part
  maxEdgePixels: 2_048,
  maxRows: 100,
  maxTextChars: 120, // per name or portion
  maxResultBytes: 131_072, // 128 KiB serialized validated result
} as const;

export type AdmissionLimits = { outletInFlight: number; globalInFlight: number; outletDaily: number; globalDaily: number };

// Gate 2: one live import per outlet and one globally; 10 admitted attempts per outlet and 50 in all
// per UTC day, whatever their outcome. Tests inject other values to isolate one guard.
export const DEFAULT_ADMISSION_LIMITS: AdmissionLimits = { outletInFlight: 1, globalInFlight: 1, outletDaily: 10, globalDaily: 50 };

export type MenuModelBounds = {
  model: string; // must equal AI_MENU_MODEL, or AI_WEB_MENU_MODEL for a web import
  inputUsdMicrosPerMillionTokens: number;
  outputUsdMicrosPerMillionTokens: number;
  maxInputTokens: number; // reviewed worst case for one shrunk photo, or one cut page text, plus the prompt
  maxOutputTokens: number; // also sent as the call's maxOutputTokens
};

export type MenuSpendPolicy = {
  readonly dailyCeilingUsdMicros: number | null; // null fails closed
  readonly modelBounds: readonly MenuModelBounds[]; // no entry for AI_MENU_MODEL fails closed
};

// The daily ceiling is the user's decision of 2026-10-15: US$1 a UTC day across all imports. No vision
// model has passed its evaluation (R5), so no entry names one and photo admission stays refused with
// model_bounds_missing.
// gpt-6-luna passed the pre-registered S24 web evaluation on 2026-10-29 and the user added its entry
// ("Yes, 76,000 input"): S4's 2026-10-14 list prices, and an input bound of one token per byte of the
// 65,536-byte page cut plus its </page> escapes and the prompt, a reservation of US$0.0106.
export const MENU_SPEND_POLICY: MenuSpendPolicy = {
  dailyCeilingUsdMicros: 1_000_000,
  modelBounds: [{ model: "gpt-6-luna", inputUsdMicrosPerMillionTokens: 100_000, outputUsdMicrosPerMillionTokens: 500_000, maxInputTokens: 76_000, maxOutputTokens: 6_000 }],
};

// The integer ceiling of the worst-case input plus output cost of one call, in US$ micros.
export function reserveUsdMicros(bounds: MenuModelBounds): number {
  return Math.ceil(
    (bounds.maxInputTokens * bounds.inputUsdMicrosPerMillionTokens + bounds.maxOutputTokens * bounds.outputUsdMicrosPerMillionTokens) / 1_000_000,
  );
}

// The actual cost of one call from its reported usage; a missing count is charged at its bound.
export function actualUsdMicros(bounds: MenuModelBounds, usage: { inputTokens: number | null; outputTokens: number | null }): number {
  return Math.ceil(
    ((usage.inputTokens ?? bounds.maxInputTokens) * bounds.inputUsdMicrosPerMillionTokens +
      (usage.outputTokens ?? bounds.maxOutputTokens) * bounds.outputUsdMicrosPerMillionTokens) /
      1_000_000,
  );
}

export function boundsFor(policy: MenuSpendPolicy, model: string): MenuModelBounds | null {
  return policy.modelBounds.find((entry) => entry.model === model) ?? null;
}

export type ImportSource = "photo" | "web_page";

export type ImportRejection =
  | "imports_disabled" | "web_imports_disabled" | "consent_required"
  | "in_flight_outlet" | "in_flight_global" | "daily_cap_outlet" | "daily_cap_global"
  | "spend_ceiling_unset" | "model_bounds_missing" | "model_bounds_exceeded" | "spend_ceiling_reached";

export type ImportAdmission =
  | { ok: true; importId: string; admittedAt: Date; deadlineAt: Date; reservedUsdMicros: number }
  | { ok: false; reason: ImportRejection };

export type ImportOutcome =
  | "in_flight" | "completed" | "conflict_base_revision" | "conflict_confirmed" | "membership_revoked"
  | "rejected_upload" | "rejected_photo" | "model_failed" | "model_timeout" | "output_invalid"
  | "aborted" | "expired"
  // S24 web import: Kernel reached the host but the page needs a sign-in or answered an error
  // status; no visible text within PAGE_READ_BOUNDS.timeoutMs; DNS, TLS, connection or session
  // start failure; the text holds no SGD-like price, closed with no model call.
  | "page_refused" | "page_timeout" | "page_unreachable" | "picture_menu";

export type ClosedImportOutcome = Exclude<ImportOutcome, "in_flight" | "expired">;

export type MenuImportRow = {
  id: string;
  outletId: string;
  actorUserId: string;
  baseRevisionId: string;
  consentVersion: string;
  modelConfigVersion: string;
  admittedAt: Date;
  deadlineAt: Date;
  modelDispatchedAt: Date | null;
  closedAt: Date | null;
  closedOutcome: ClosedImportOutcome | null;
  reservedUsdMicros: number;
  actualUsdMicros: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  rowsDrafted: number | null;
  rowsBlankPrice: number | null;
  resultFingerprint: string | null;
  latencyMs: number | null;
  peakRssBytes: number | null;
  source: ImportSource;
  sourceHost: string | null;
};

// Gate 3's ImportUsage plus the call's actual cost, computed from its bounds entry, so the closing
// write records what admission later compares with the reservation.
export type ImportUsage = { inputTokens: number | null; outputTokens: number | null; actualUsdMicros: number | null; latencyMs: number; peakRssBytes: number | null };
