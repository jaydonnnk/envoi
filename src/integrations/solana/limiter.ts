import { randomUUID } from "node:crypto";
import { and, count, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { rpcLimiterBackoff, rpcLimiterCalls, rpcLimiterSlots } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { RPC_BUDGET } from "@/lib/ratelimit";
import { durationMs, type Now } from "@/lib/time";

// The shared Solana RPC budget (Gate 3 RPC_BUDGET; Gate 2 "Lost-response recovery and RPC"). Every
// RPC call from the web app, and from S17 the runner, first takes an admission here, in the database,
// so separate processes share one budget. The numbers are RPC_BUDGET in src/lib/ratelimit.ts.

export { RPC_BUDGET };

export type RpcAdmission = { ok: true; release(): Promise<void> } | { ok: false; retryAfterMs: number; reason: "backoff" | "global" | "method" | "concurrency" };

export type RpcLimiter = {
  acquire(method: string): Promise<RpcAdmission>;
  reportRateLimited(): Promise<void>; // sets a shared backoff with full jitter
};

// random is injectable so a test can fix the jitter; production uses Math.random.
export function createDatabaseRpcLimiter(db: Db, now: Now, random: () => number = Math.random): RpcLimiter {
  return {
    async acquire(method) {
      const holder = randomUUID();
      const admission = await db.transaction(async (tx): Promise<{ ok: true; slot: number } | { ok: false; retryAfterMs: number; reason: "backoff" | "global" | "method" | "concurrency" }> => {
        // One transaction-scoped lock serializes admissions, so two callers cannot both take the
        // last call or the last slot.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('envoi:rpc-limiter'))`);
        const at = now();

        const [backoff] = await tx.select().from(rpcLimiterBackoff).where(eq(rpcLimiterBackoff.id, "global"));
        if (backoff?.until && backoff.until.getTime() > at.getTime()) return { ok: false, retryAfterMs: backoff.until.getTime() - at.getTime(), reason: "backoff" };
        // A quiet backoff maximum after the last backoff ended starts the escalation over.
        if (backoff && backoff.consecutive > 0 && (!backoff.until || backoff.until.getTime() + RPC_BUDGET.backoffMaxMs <= at.getTime())) {
          await tx.update(rpcLimiterBackoff).set({ consecutive: 0 }).where(eq(rpcLimiterBackoff.id, "global"));
        }

        const windowStart = new Date(at.getTime() - durationMs("T_RPC_WINDOW"));
        await tx.delete(rpcLimiterCalls).where(lte(rpcLimiterCalls.at, windowStart));
        const [all] = await tx.select({ n: count() }).from(rpcLimiterCalls).where(gt(rpcLimiterCalls.at, windowStart));
        if ((all?.n ?? 0) >= RPC_BUDGET.globalPerWindow) return { ok: false, retryAfterMs: durationMs("T_RPC_WINDOW"), reason: "global" };
        const [same] = await tx
          .select({ n: count() })
          .from(rpcLimiterCalls)
          .where(and(eq(rpcLimiterCalls.method, method), gt(rpcLimiterCalls.at, windowStart)));
        if ((same?.n ?? 0) >= RPC_BUDGET.perMethodPerWindow) return { ok: false, retryAfterMs: durationMs("T_RPC_WINDOW"), reason: "method" };

        // A slot is free when nobody holds it or its holder's lease passed (a crashed caller).
        const [free] = await tx
          .select({ slot: rpcLimiterSlots.slot })
          .from(rpcLimiterSlots)
          .where(or(isNull(rpcLimiterSlots.holder), lte(rpcLimiterSlots.leaseExpiresAt, at)))
          .orderBy(rpcLimiterSlots.slot)
          .limit(1);
        if (!free) return { ok: false, retryAfterMs: 1_000, reason: "concurrency" };
        await tx
          .update(rpcLimiterSlots)
          .set({ holder, leaseExpiresAt: new Date(at.getTime() + durationMs("T_RPC_SLOT_LEASE")) })
          .where(eq(rpcLimiterSlots.slot, free.slot));
        await tx.insert(rpcLimiterCalls).values({ id: newId("rpc"), method, at });
        return { ok: true, slot: free.slot };
      });
      if (!admission.ok) return admission;
      return {
        ok: true,
        release: async () => {
          await db
            .update(rpcLimiterSlots)
            .set({ holder: null, leaseExpiresAt: null })
            .where(and(eq(rpcLimiterSlots.slot, admission.slot), eq(rpcLimiterSlots.holder, holder)));
        },
      };
    },

    async reportRateLimited() {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('envoi:rpc-limiter'))`);
        const [row] = await tx.select().from(rpcLimiterBackoff).where(eq(rpcLimiterBackoff.id, "global"));
        const consecutive = (row?.consecutive ?? 0) + 1;
        // Full jitter over an exponential cap, never shorter than the base, so a 429 always pauses
        // every caller for at least a second.
        const cap = Math.min(RPC_BUDGET.backoffMaxMs, RPC_BUDGET.backoffBaseMs * 2 ** (consecutive - 1));
        const delay = Math.max(RPC_BUDGET.backoffBaseMs, Math.floor(random() * cap));
        await tx
          .update(rpcLimiterBackoff)
          .set({ consecutive, until: new Date(now().getTime() + delay) })
          .where(eq(rpcLimiterBackoff.id, "global"));
      });
    },
  };
}
