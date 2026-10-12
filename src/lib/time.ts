// Named clocks (Gate 3, Named clocks). S1 uses only T_REVIEW; later slices add their durations here.
export type ClockName = "T_REVIEW";

const DURATION_MS: Record<ClockName, number> = {
  T_REVIEW: 5 * 60_000,
};

export type Now = () => Date;
export const systemNow: Now = () => new Date();

export function deadlineOf(clock: ClockName, startedAt: Date): Date {
  return new Date(startedAt.getTime() + DURATION_MS[clock]);
}

export function isExpired(clock: ClockName, startedAt: Date, now: Date): boolean {
  return now.getTime() >= deadlineOf(clock, startedAt).getTime();
}

export function remainingMs(clock: ClockName, startedAt: Date, now: Date): number {
  return Math.max(0, deadlineOf(clock, startedAt).getTime() - now.getTime());
}
