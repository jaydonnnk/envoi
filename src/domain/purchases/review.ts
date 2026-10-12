import { and, eq } from "drizzle-orm";
import type { BuyerPrincipal } from "@/lib/auth-context";
import { outlets, purchases, type StoredLine } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { deadlineOf } from "@/lib/time";
import { getPublishedMenu } from "@/domain/outlets/search";

// S1 tracer only. The client sends no lines: the server stores this fixed fixture basket,
// priced from the published revision. S2 replaces this module's entry point with priceBasket.
export const TRACER_BASKET: ReadonlyArray<{ position: number; quantity: number }> = [
  { position: 0, quantity: 1 },
  { position: 1, quantity: 2 },
];

export type TracerReview = { purchaseId: string; expiresAt: Date };

export async function createTracerReview(db: Db, principal: BuyerPrincipal, outletId: string, now: Date): Promise<TracerReview | AppError> {
  const menu = await getPublishedMenu(db, outletId);
  if (!menu) return appError("not_found", "That shop is not on Envoi.");
  if (!menu.outlet.isDemoFixture) return appError("validation_failed", "The tracer basket exists only for the demo fixture.");

  const lines: StoredLine[] = [];
  for (const { position, quantity } of TRACER_BASKET) {
    const item = menu.items[position];
    if (!item || item.unitSgdCents === null) return appError("validation_failed", "The fixture basket does not match the published menu.");
    lines.push({ menuItemId: item.id, name: item.name, quantity, unitSgdCents: item.unitSgdCents, lineSgdCents: item.unitSgdCents * quantity });
  }

  const purchaseId = newId("pur");
  const expiresAt = deadlineOf("T_REVIEW", now);
  await db.insert(purchases).values({
    id: purchaseId,
    buyerUserId: principal.userId,
    outletId: menu.outlet.id,
    menuRevisionId: menu.menuRevisionId,
    state: "review_open",
    entryPoint: "fixture_tracer",
    lines,
    totalSgdCents: lines.reduce((sum, line) => sum + line.lineSgdCents, 0),
    currency: "SGD",
    reviewExpiresAt: expiresAt,
    createdAt: now,
  });
  return { purchaseId, expiresAt };
}

export type OwnPurchase = {
  id: string;
  outletId: string;
  outletName: string;
  outletIsDemoFixture: boolean;
  state: string;
  lines: StoredLine[];
  totalSgdCents: number;
  currency: string;
  reviewExpiresAt: Date;
  createdAt: Date;
};

// Owner predicate: a purchase is readable only by the session that created it. Anything else is
// indistinguishable from a missing purchase.
export async function getOwnPurchase(db: Db, principal: BuyerPrincipal, purchaseId: string): Promise<OwnPurchase | null> {
  const [row] = await db
    .select({
      id: purchases.id,
      outletId: purchases.outletId,
      outletName: outlets.name,
      outletIsDemoFixture: outlets.isDemoFixture,
      state: purchases.state,
      lines: purchases.lines,
      totalSgdCents: purchases.totalSgdCents,
      currency: purchases.currency,
      reviewExpiresAt: purchases.reviewExpiresAt,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(outlets, eq(outlets.id, purchases.outletId))
    .where(and(eq(purchases.id, purchaseId), eq(purchases.buyerUserId, principal.userId)))
    .limit(1);
  return row ?? null;
}
