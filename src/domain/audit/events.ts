import { auditEvents } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";

// Append-only audit writes, performed inside the business transaction they describe. Details carry
// identifiers, states and reason codes only: never provider bodies, tokens or personal data.

export type AuditInput = {
  at: Date;
  actor: string;
  action: string;
  purchaseId?: string | null;
  attemptId?: string | null;
  outletId?: string | null;
  operatorVisible: boolean;
  details?: Record<string, string | number | boolean | null>;
};

type Writer = Pick<Db, "insert">;

export async function recordAudit(db: Writer, event: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId("aud"),
    at: event.at,
    actor: event.actor,
    action: event.action,
    purchaseId: event.purchaseId ?? null,
    attemptId: event.attemptId ?? null,
    outletId: event.outletId ?? null,
    operatorVisible: event.operatorVisible,
    details: event.details ?? {},
  });
}

export function buyerActor(userId: string): string {
  return `buyer:${userId}`;
}
