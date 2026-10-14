// Named clocks (Gate 3, Named clocks). Later slices add their durations here.
export type ClockName = "T_REVIEW" | "T_LEASE" | "T_PROVIDER_READ_DEBOUNCE" | "T_HANDOFF" | "T_MAINT_RUN" | "T_MAINT_OVERDUE";

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
