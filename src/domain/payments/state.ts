import type { ATTEMPT_STATES, PAYPAL_FUNDINGS } from "@/lib/db/schema";

// PayPal attempt lifecycle (Gate 3, State transitions: Payment attempt).

export type AttemptState = (typeof ATTEMPT_STATES)[number];
export type PayPalFunding = (typeof PAYPAL_FUNDINGS)[number];

// States before any capture was dispatched. Once T_REVIEW passes, an attempt here can never send
// a capture, because dispatch is a compare-and-set that requires the review deadline in the
// future; so it reads abandoned, and a buyer cancel may also close it.
export const PRE_CAPTURE_STATES = ["created", "create_unknown", "order_created", "externally_approved"] as const satisfies readonly AttemptState[];

export const TERMINAL_ATTEMPT_STATES = ["abandoned", "capture_failed", "capture_confirmed"] as const satisfies readonly AttemptState[];

const ATTEMPT_TRANSITIONS: Record<AttemptState, readonly AttemptState[]> = {
  created: ["order_created", "create_unknown", "abandoned"],
  create_unknown: ["order_created", "abandoned"],
  order_created: ["externally_approved", "abandoned"],
  externally_approved: ["capture_dispatched", "capture_failed", "abandoned"],
  // A declined capture still lands in capture_unknown: only a later provider read (S3) may record
  // capture_failed, as Gate 3's table allows.
  capture_dispatched: ["capture_confirmed", "capture_unknown"],
  // Never abandoned and never a new capture request id: the most important illegal transition.
  capture_unknown: ["capture_confirmed", "capture_failed"],
  capture_confirmed: [],
  capture_failed: [],
  abandoned: [],
};

// Crypto funding only, each from a PayPal read (Gate 3 reopening 2026-11-06). PayPal captures on
// the buyer's approval with no call from Envoi, so T_REVIEW cannot stop the money: an abandoned
// crypto attempt can still be settled by a later read. A PayPal-funded attempt never takes these.
export const CRYPTO_SETTLEABLE_STATES = ["order_created", "abandoned", "capture_unknown"] as const satisfies readonly AttemptState[];
const CRYPTO_READ_OUTCOMES: readonly AttemptState[] = ["capture_confirmed", "capture_unknown", "capture_failed"];

export function canTransitionAttempt(from: AttemptState, to: AttemptState, funding: PayPalFunding = "paypal"): boolean {
  if (ATTEMPT_TRANSITIONS[from].includes(to)) return true;
  return funding === "crypto" && (from === "order_created" || from === "abandoned") && CRYPTO_READ_OUTCOMES.includes(to);
}

export function isPreCapture(state: AttemptState): boolean {
  return (PRE_CAPTURE_STATES as readonly AttemptState[]).includes(state);
}
