import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SINGAPORE_CLOCK } from "@/app/purchase-copy";
import { getOwnPurchase } from "@/domain/purchases/review";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";
import { ContinueToPayPal } from "./continue-to-paypal";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchaseId } = await params;
  const now = new Date();
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId, now);
  if (!purchase) notFound();
  if (purchase.view.state !== purchase.state) await applyDerivedTransitions(webDb(), purchase.id, now);

  const receiptHref = `/receipt/${encodeURIComponent(purchase.id)}`;
  const payable = purchase.view.state === "review_open" || (purchase.view.state === "pending_payment" && (purchase.view.paypalAttempt === "order_created" || purchase.view.paypalAttempt === "create_unknown"));
  const total = formatSgd(sgdFromCents(purchase.totalSgdCents));

  return (
    <main>
      <p className="eyebrow">Review</p>
      <h1>Check the purchase</h1>
      <p className="lead">This is the last Envoi review before you approve in PayPal. Changed items, amount, recipient, currency or payment method need a fresh review.</p>
      <div className="layout">
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
              <span className="total money">{total}</span>
            </div>
            <small>Prices come from the shop&apos;s published menu, read by the server. Currency: {purchase.currency}.</small>
          </section>
          <section className="card" aria-labelledby="recipient-heading">
            <h2 id="recipient-heading">Paid to</h2>
            <div className="row stacked">
              <span>
                {purchase.outletName}&apos;s PayPal sandbox seller account
                <small>A sandbox test account assigned to this demo shop. Envoi&apos;s own account never receives the money.</small>
              </span>
              <span className="mono">{purchase.sellerMerchantId ?? "Not connected"}</span>
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="card" aria-labelledby="method-heading">
            <h2 id="method-heading">Payment method</h2>
            <div className="rail" aria-current="true">
              <span className="rail-head">
                <strong>PayPal sandbox, test money</strong>
                <span className="chip ok">Selected</span>
              </span>
              <small>Purchase price {total}. Funding currency and any conversion are confirmed in PayPal.</small>
            </div>
            <div className="rail unavailable" aria-disabled="true">
              <span className="rail-head">
                <strong>PYUSD on Solana devnet</strong>
                <span className="chip">Unavailable</span>
              </span>
              <small>PYUSD has not passed its tests yet.</small>
            </div>
            <div className="row">
              <span className="muted">Buyer conversion and funding costs</span>
              <span>Unknown</span>
            </div>
            <div className="row">
              <span className="muted">Merchant fees</span>
              <span>Not quoted</span>
            </div>
          </section>
          {payable ? (
            <ContinueToPayPal purchaseId={purchase.id} outletId={purchase.outletId} validUntil={SINGAPORE_CLOCK.format(purchase.reviewExpiresAt)} />
          ) : (
            <section className="card warning" aria-labelledby="closed-heading">
              <h2 id="closed-heading">{purchase.view.state === "paid" ? "Already paid" : "Payment cannot start here"}</h2>
              <p>
                {purchase.view.state === "paid"
                  ? "This purchase is paid."
                  : purchase.view.state === "review_expired" || purchase.view.state === "unpaid_closed"
                    ? "This review closed without payment. Nothing was charged."
                    : purchase.view.state === "review_invalidated" || purchase.view.state === "superseded"
                      ? "The shop changed its menu, prices or payment details since this review, so it closed. Nothing was charged."
                      : "This purchase is already with PayPal or being checked. Do not pay again."}
              </p>
              <div className="actions">
                <a className="button" href={receiptHref}>
                  See the receipt
                </a>
                <a className="button secondary" href={`/buy?outlet=${encodeURIComponent(purchase.outletId)}`}>
                  Review the basket again
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
