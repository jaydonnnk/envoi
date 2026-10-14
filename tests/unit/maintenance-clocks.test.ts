import { describe, expect, it } from "vitest";
import { isHeartbeatOverdue } from "@/domain/maintenance/due";
import { durationMs } from "@/lib/time";

// S5 clocks, asserted as the literal values Gate 3 approves, never as module constants.
describe("maintenance clocks", () => {
  it("maintenance clocks have their approved durations", () => {
    expect(durationMs("T_MAINT_RUN")).toBe(120_000);
    expect(durationMs("T_LEASE")).toBe(300_000);
    expect(durationMs("T_MAINT_OVERDUE")).toBe(5_400_000);
  });

  it("maintenance is overdue only after 90 minutes without a heartbeat", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");
    expect(isHeartbeatOverdue(null, now)).toBe(true);
    expect(isHeartbeatOverdue(new Date(now.getTime() - 5_400_000), now)).toBe(false);
    expect(isHeartbeatOverdue(new Date(now.getTime() - 5_400_001), now)).toBe(true);
  });
});
