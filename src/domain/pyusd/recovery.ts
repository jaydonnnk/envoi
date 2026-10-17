import type { PYUSD_PROOFS } from "@/domain/pyusd/constants";
import type { PyusdAttempt } from "@/domain/pyusd/state";

// PYUSD recovery decisions (Gate 3 "PYUSD recovery"). Pure: no RPC. S16 builds only the hint branch:
// a prepared attempt verifies its readable signature hint and otherwise waits, on both sides of its
// lastValidBlockHeight bound. S17 adds the expiry branch, the post-expiry window scan, candidate
// classification and extra transfers; until then nothing moves a prepared attempt past its bound,
// so it stays locked, which is why PYUSD_ENABLED stays off outside recorded proof runs.

export type SignatureEntry = { signature: string; slot: bigint; failed: boolean };

export type RecoveryStep =
  | { action: "verify_hints_then_wait" }
  | { action: "start_scan" }
  | { action: "continue_scan"; before: string | null }
  | { action: "close_unpaid" }
  | { action: "hold"; reason: "automatic_release_not_enabled" }
  | { action: "operator"; reason: "mismatch" }
  | { action: "done" };

// finalizedBlockHeight and proofs are part of the decision from S17 on; the hint branch needs neither.
export function decideRecoveryStep(attempt: Pick<PyusdAttempt, "state">, finalizedBlockHeight: bigint, proofs: typeof PYUSD_PROOFS): RecoveryStep {
  void finalizedBlockHeight;
  void proofs;
  switch (attempt.state) {
    case "prepared":
      return { action: "verify_hints_then_wait" };
    case "mismatch":
      return { action: "operator", reason: "mismatch" };
    case "held_no_match":
      return { action: "hold", reason: "automatic_release_not_enabled" };
    case "expired_scanning":
    case "confirmed":
    case "closed_unpaid":
      return { action: "done" };
  }
}
