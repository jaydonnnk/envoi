import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnPurchase } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { CompletePayment } from "./complete-payment";

export const dynamic = "force-dynamic";

// PayPal's return landing. Read-only: a GET and its query values (token, PayerID) can never
// capture. Completion is a separate POST from the owning session, which re-reads the bound order.
export default async function PayPalReturnPage({ searchParams }: { searchParams: Promise<{ purchase?: string | string[] }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchase: purchaseId } = await searchParams;
  if (typeof purchaseId !== "string") notFound();
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId);
  if (!purchase) notFound();

  return (
    <main>
      <p className="eyebrow">PayPal sandbox</p>
      <h1>Finishing your payment</h1>
      <p className="lead">PayPal sent you back. Envoi checks the order with PayPal before anything is charged, then shows your receipt.</p>
      <section className="card">
        <CompletePayment purchaseId={purchase.id} />
      </section>
    </main>
  );
}
