import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnPurchase } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { CancelPayment } from "./cancel-payment";

export const dynamic = "force-dynamic";

// PayPal's cancel landing. Read-only: closing the purchase is a separate POST from the owning
// session.
export default async function PayPalCancelPage({ searchParams }: { searchParams: Promise<{ purchase?: string | string[] }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchase: purchaseId } = await searchParams;
  if (typeof purchaseId !== "string") notFound();
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId);
  if (!purchase) notFound();

  return (
    <main>
      <p className="eyebrow">PayPal sandbox</p>
      <h1>Payment canceled</h1>
      <p className="lead">You canceled at PayPal. Nothing was charged.</p>
      <section className="card">
        <CancelPayment purchaseId={purchase.id} />
      </section>
    </main>
  );
}
