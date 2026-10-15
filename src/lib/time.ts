// Named clocks (Gate 3, Named clocks). Later slices add their durations here.
export type ClockName =
  | "T_REVIEW" | "T_LEASE" | "T_PROVIDER_READ_DEBOUNCE" | "T_HANDOFF" | "T_MAINT_RUN" | "T_MAINT_OVERDUE"
  | "T_MENU_REQUEST" | "T_MENU_UPLOAD_READ" | "T_MENU_MODEL";

const DURATION_MS: Record<ClockName, number> = {
  T_REVIEW: 5 * 60_000,
  T_LEASE: 5 * 60_000,
  T_PROVIDER_READ_DEBOUNCE: 30_000,
  // From agent request creation; enforced by the redeem route.
  T_HANDOFF: 10 * 60_000,
  // From maintenance job start; the runner stops taking work at this deadline and exits (S5).
  T_MAINT_RUN: 2 * 60_000,
  // From the last successful heartbeat; past it the operator health view shows maintenance overdue.
  // An operator alert only: no import or payment admission depends on it.
  T_MAINT_OVERDUE: 90 * 60_000,
  // From import admission (S11): commitImport writes only before this deadline, and readers derive
  // an open attempt past it as expired, with no write and no task.
  T_MENU_REQUEST: 90_000,
  // From import admission: the counted upload read stops here, well inside T_MENU_REQUEST.
  T_MENU_UPLOAD_READ: 30_000,
  // From the vision call's start, and never past the commit reserve (menuModelBudgetMs).
  T_MENU_MODEL: 60_000,
};

export type Now = () => Date;

export const systemNow: Now = () => new Date();

export function durationMs(clock: ClockName): number {
  return DURATION_MS[clock];
}

export function deadlineOf(clock: ClockName, startedAt: Date): Date {
  return new Date(startedAt.getTime() + DURATION_MS[clock]);
}

export function isExpired(clock: ClockName, startedAt: Date, now: Date): boolean {
  return now.getTime() >= deadlineOf(clock, startedAt).getTime();
}

export function remainingMs(clock: ClockName, startedAt: Date, now: Date): number {
  return Math.max(0, deadlineOf(clock, startedAt).getTime() - now.getTime());
}

// The part of T_MENU_REQUEST kept for commitImport after the vision call returns.
export const MENU_COMMIT_RESERVE_MS = 5_000;

// The vision call's abort budget: T_MENU_MODEL, cut short so the commit reserve stays inside
// T_MENU_REQUEST, and never below zero.
export function menuModelBudgetMs(admittedAt: Date, now: Date): number {
  const beforeReserve = remainingMs("T_MENU_REQUEST", admittedAt, now) - MENU_COMMIT_RESERVE_MS;
  return Math.max(0, Math.min(DURATION_MS.T_MENU_MODEL, beforeReserve));
}

// The import admission day: the UTC calendar day, never the Singapore day.
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
