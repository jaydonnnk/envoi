import { and, eq, inArray, isNull } from "drizzle-orm";
import { agentActor, buyerActor, recordAudit } from "@/domain/audit/events";
import type { HandoffPreview, HandoffRedemption, PurchaseRequestCreation, PurchaseRequestInput } from "@/domain/handoffs/types";
import { priceBasket } from "@/domain/purchases/price";
import { createReview } from "@/domain/purchases/review";
import { webEnv } from "@/env";
import type { AgentPrincipal, BuyerPrincipal } from "@/lib/auth-context";
import { menuItems, outlets, purchaseRequests } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { hashToken, newId, newSecretToken } from "@/lib/ids";
import { deadlineOf } from "@/lib/time";

// A handoff token is 256 random bits in base32: 52 characters from a-z and 2-7.
const HANDOFF_TOKEN = /^[a-z2-7]{52}$/;

// The agent proposes an outlet and item ids with quantities. The basket is priced once here only to
// refuse a request that could never be redeemed; the price is discarded and nothing about it is
// stored or returned. The token is returned once, inside the URL, and only its digest is kept.
export async function createPurchaseRequest(db: Db, agent: AgentPrincipal, input: PurchaseRequestInput, now: Date = new Date()): Promise<PurchaseRequestCreation> {
  const quote = await priceBasket(db, { outletId: input.outletId, lines: input.lines, rail: "paypal", now });
  if (!quote.ok) return { kind: "refused", error: quote.error };

  const handoffToken = newSecretToken();
  const id = newId("prq");
  const expiresAt = deadlineOf("T_HANDOFF", now);
  await db.transaction(async (tx) => {
    await tx.insert(purchaseRequests).values({
      id,
      agentTokenId: agent.agentTokenId,
      tokenHash: hashToken(handoffToken),
      outletId: quote.outletId,
      lines: input.lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      createdAt: now,
      expiresAt,
    });
    await recordAudit(tx, {
      at: now,
      actor: agentActor(agent.agentTokenId),
      action: "purchase_request_created",
      outletId: quote.outletId,
      operatorVisible: false,
      details: { purchaseRequestId: id, lineCount: input.lines.length },
    });
  });
  return { kind: "created", handoffToken, url: `${webEnv().APP_BASE_URL}/approve/${handoffToken}`, expiresAt };
}

// Read-only: what the approval page shows before the buyer chooses to redeem. Names come from the
// published registry by id; no price, total or agent text is shown.
export async function previewPurchaseRequest(db: Db, token: string, now: Date): Promise<HandoffPreview> {
  if (!HANDOFF_TOKEN.test(token)) return { kind: "invalid" };
  const [row] = await db
    .select({ request: purchaseRequests, outlet: { id: outlets.id, name: outlets.name, area: outlets.area, isDemoFixture: outlets.isDemoFixture } })
    .from(purchaseRequests)
    .innerJoin(outlets, eq(outlets.id, purchaseRequests.outletId))
    .where(eq(purchaseRequests.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return { kind: "invalid" };
  if (row.request.redeemedAt) return { kind: "already_redeemed" };
  if (now.getTime() >= row.request.expiresAt.getTime()) return { kind: "expired" };

  const ids = row.request.lines.map((line) => line.menuItemId);
  const names = new Map(
    (await db.select({ id: menuItems.id, name: menuItems.name }).from(menuItems).where(inArray(menuItems.id, ids))).map((item) => [item.id, item.name]),
  );
  return {
    kind: "open",
    outlet: row.outlet,
    lines: row.request.lines.map((line) => ({ name: names.get(line.menuItemId) ?? "An item no longer on the menu", quantity: line.quantity })),
    expiresAt: row.request.expiresAt,
  };
}

class Unbound extends Error {
  constructor(readonly outcome: HandoffRedemption) {
    super("redemption not bound");
  }
}

// The buyer redeems once, inside one transaction: the basket is priced afresh from the published
// menu, a review is created for this buyer, and the request is bound to both. The binding is a
// conditional update on an unredeemed row, so a second or concurrent redemption binds nothing and
// rolls its review back. T_HANDOFF is enforced here, from the stored creation-time deadline.
export async function redeemPurchaseRequest(db: Db, principal: BuyerPrincipal, token: string, now: Date): Promise<HandoffRedemption> {
  if (!HANDOFF_TOKEN.test(token)) return { kind: "invalid" };
  try {
    return await db.transaction(async (tx) => {
      const [request] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.tokenHash, hashToken(token))).limit(1);
      if (!request) return { kind: "invalid" } as const;
      if (now.getTime() >= request.expiresAt.getTime()) return request.redeemedAt ? ({ kind: "already_redeemed" } as const) : ({ kind: "expired" } as const);

      const quote = await priceBasket(tx, { outletId: request.outletId, lines: request.lines, rail: "paypal", now });
      if (!quote.ok) throw new Unbound(request.redeemedAt ? { kind: "already_redeemed" } : { kind: "refused", error: quote.error });
      const review = await createReview(tx, principal, quote, now, "agent_handoff");
      if (review.kind === "conflict") throw new Unbound(request.redeemedAt ? { kind: "already_redeemed" } : { kind: "refused", error: review.error });

      const bound = await tx
        .update(purchaseRequests)
        .set({ redeemedAt: now, redeemedByUserId: principal.userId, purchaseId: review.purchaseId })
        .where(and(eq(purchaseRequests.id, request.id), isNull(purchaseRequests.redeemedAt)))
        .returning({ id: purchaseRequests.id });
      if (bound.length === 0) throw new Unbound({ kind: "already_redeemed" });

      await recordAudit(tx, {
        at: now,
        actor: buyerActor(principal.userId),
        action: "purchase_request_redeemed",
        purchaseId: review.purchaseId,
        outletId: request.outletId,
        operatorVisible: false,
        details: { purchaseRequestId: request.id },
      });
      return { kind: "redeemed", purchaseId: review.purchaseId } as const;
    });
  } catch (err) {
    if (err instanceof Unbound) return err.outcome;
    throw err;
  }
}
