import { and, eq } from "drizzle-orm";
import { recordAudit } from "@/domain/audit/events";
import { paymentDestinations } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { appError, type AppError } from "@/lib/errors";

// The merchant selects the PayPal sandbox connection the operator prepared for this outlet (Gate 2
// "PUT /merchant/outlets/{id}/destinations/paypal"; S7). Only the operator writes a seller id, with
// assign-paypal-destination; a seller id named in the request must be exactly that one, so an
// arbitrary pasted merchant id can never connect. Accepting raises the destination's version.

export type PayPalConnection = {
  destinationId: string;
  sellerMerchantId: string;
  environment: "sandbox";
  status: "active" | "disconnected";
  accepted: boolean;
  version: number;
};

type DestinationRow = typeof paymentDestinations.$inferSelect;

function toConnection(row: DestinationRow): PayPalConnection {
  return {
    destinationId: row.id,
    sellerMerchantId: row.sellerMerchantId,
    environment: "sandbox",
    status: row.status === "active" ? "active" : "disconnected",
    accepted: row.acceptedAt !== null,
    version: row.version,
  };
}

export async function getPayPalConnection(db: Pick<Db, "select">, outletId: string): Promise<PayPalConnection | null> {
  const [row] = await db
    .select()
    .from(paymentDestinations)
    .where(and(eq(paymentDestinations.outletId, outletId), eq(paymentDestinations.rail, "paypal")));
  return row ? toConnection(row) : null;
}

export type AcceptInput = { outletId: string; sellerMerchantId: string; userId: string; now: Date };

// Accepts the operator-prepared connection once; accepting it again changes nothing. Any refusal
// changes nothing.
export async function acceptPayPalConnection(db: Db, input: AcceptInput): Promise<PayPalConnection | AppError> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentDestinations)
      .where(and(eq(paymentDestinations.outletId, input.outletId), eq(paymentDestinations.rail, "paypal")))
      .for("update");
    if (!row) {
      return appError("validation_failed", "The Envoi operator has not prepared a PayPal sandbox connection for this shop yet.", {
        details: { reason: "no_prepared_connection" },
      });
    }
    if (row.sellerMerchantId !== input.sellerMerchantId) {
      return appError("validation_failed", "Only the PayPal sandbox connection the Envoi operator prepared for this shop can be used.", {
        details: { reason: "connection_not_assigned" },
      });
    }
    if (row.status !== "active") {
      return appError("validation_failed", "This PayPal sandbox connection is disconnected. Ask the Envoi operator.", { details: { reason: "connection_inactive" } });
    }
    if (row.acceptedAt !== null) return toConnection(row);

    const [accepted] = await tx
      .update(paymentDestinations)
      .set({ acceptedAt: input.now, acceptedByUserId: input.userId, version: row.version + 1 })
      .where(eq(paymentDestinations.id, row.id))
      .returning();
    await recordAudit(tx, {
      at: input.now,
      actor: `merchant:${input.userId}`,
      action: "paypal_destination_accepted",
      outletId: input.outletId,
      operatorVisible: true,
      details: { destinationId: row.id, version: accepted!.version, environment: "sandbox" },
    });
    return toConnection(accepted!);
  });
}
