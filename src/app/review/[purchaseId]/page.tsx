import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnPurchase } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchaseId } = await params;
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId);
  if (!purchase) notFound();

  return (
    <main>
      <p className="eyebrow">Review</p>
      <h1>Check the basket</h1>
      <div className="stack">
        <section className="card slip" aria-labelledby="basket-heading">
          <h2 id="basket-heading">
            {purchase.outletName} {purchase.outletIsDemoFixture && <span className="chip warn">Demo fixture</span>}
          </h2>
          {purchase.lines.map((line) => (
            <div className="row" key={line.menuItemId}>
              <span>
                {line.quantity} × {line.name}
                <small>{formatSgd(sgdFromCents(line.unitSgdCents))} each</small>
              </span>
              <span className="money">{formatSgd(sgdFromCents(line.lineSgdCents))}</span>
            </div>
          ))}
          <div className="row total-row">
            <strong>Total</strong>
            <span className="total money">{formatSgd(sgdFromCents(purchase.totalSgdCents))}</span>
          </div>
          <small>Prices come from the shop&apos;s published menu, read by the server. Currency: {purchase.currency}.</small>
        </section>
        <section className="card warning" aria-labelledby="payment-heading">
          <h2 id="payment-heading">No payment in this build</h2>
          <p>This tracer build connects no payment method. Continuing shows a receipt and attempts no payment.</p>
          <a className="button full" href={`/receipt/${encodeURIComponent(purchase.id)}`}>
            Continue
          </a>
        </section>
      </div>
    </main>
  );
}
