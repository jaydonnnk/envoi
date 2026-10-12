import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnPurchase } from "@/domain/purchases/review";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const SINGAPORE_TIME = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });

export default async function ReceiptPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchaseId } = await params;
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId);
  if (!purchase) notFound();

  return (
    <main>
      <p className="eyebrow">Receipt</p>
      <h1>No payment was attempted</h1>
      <div className="status">
        <p>
          <span className="chip warn">Not paid</span> This is a tracer receipt. Envoi sent nothing to any payment provider, and no money
          moved.
        </p>
      </div>
      <section className="card slip" aria-labelledby="receipt-heading">
        <h2 id="receipt-heading">
          {purchase.outletName} {purchase.outletIsDemoFixture && <span className="chip warn">Demo fixture</span>}
        </h2>
        {purchase.lines.map((line) => (
          <div className="row" key={line.menuItemId}>
            <span>
              {line.quantity} × {line.name}
            </span>
            <span className="money">{formatSgd(sgdFromCents(line.lineSgdCents))}</span>
          </div>
        ))}
        <div className="row total-row">
          <strong>Reviewed total</strong>
          <span className="total money">{formatSgd(sgdFromCents(purchase.totalSgdCents))}</span>
        </div>
        <div className="row">
          <span className="muted">Reviewed</span>
          <span>{SINGAPORE_TIME.format(purchase.createdAt)}</span>
        </div>
        <div className="row stacked">
          <span className="muted">Reference</span>
          <span className="mono">{purchase.id}</span>
        </div>
      </section>
    </main>
  );
}
