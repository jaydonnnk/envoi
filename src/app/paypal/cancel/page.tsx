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

  const receipt = `/receipt/${encodeURIComponent(purchase.id)}`;
  // Once a capture was dispatched, leaving PayPal is not a cancellation: only a provider read can
  // decide the payment, so this page never says canceled (Gate 3 Races: cancel races capture).
  const attempt = purchase.view.paypalAttempt;
  if (purchase.view.state === "uncertain" || purchase.view.state === "paid" || attempt === "capture_dispatched" || attempt === "capture_unknown") {
    return (
      <main>
        <p className="eyebrow">PayPal sandbox</p>
        <h1>{purchase.view.state === "paid" ? "Already paid" : "Checking payment"}</h1>
        <p className="lead">
          {purchase.view.state === "paid"
            ? "PayPal sandbox already confirmed this payment, so it cannot be canceled here."
            : "PayPal may already be completing this payment, so Envoi keeps checking it until PayPal answers. Do not pay again; the receipt shows PayPal's answer."}
        </p>
        <section className="card">
          <a className="button" href={receipt}>
            See the receipt
          </a>
        </section>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">PayPal sandbox</p>
      <h1>Closing your purchase</h1>
      <p className="lead">You left PayPal without paying. Envoi checks that no payment started, then shows your receipt.</p>
      <section className="card">
        <CancelPayment purchaseId={purchase.id} />
      </section>
    </main>
  );
}
