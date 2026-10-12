import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SINGAPORE_CLOCK, SINGAPORE_TIME } from "@/app/purchase-copy";
import { getOwnPurchase, type OwnPurchase } from "@/domain/purchases/review";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type Status = { title: string; chip: string; tone: "ok" | "warn"; body: string };

// Only a verified capture reads as paid. Every other state says plainly that it is not.
function statusOf(purchase: OwnPurchase): Status {
  if (purchase.entryPoint === "fixture_tracer") {
    return { title: "No payment was attempted", chip: "Not paid", tone: "warn", body: "This is a tracer receipt. Envoi sent nothing to any payment provider, and no money moved." };
  }
  const deadline = SINGAPORE_CLOCK.format(purchase.reviewExpiresAt);
  switch (purchase.view.state) {
    case "paid":
      return { title: "Paid", chip: "Paid", tone: "ok", body: "PayPal sandbox confirmed this capture to the shop's sandbox seller. Test money only: no real money moved." };
    case "pending_payment":
      return {
        title: "Not paid yet",
        chip: "Waiting for PayPal",
        tone: "warn",
        body: `Nothing has been charged. Approve in PayPal before ${deadline} Singapore time, or this purchase closes unpaid.`,
      };
    case "uncertain":
      return {
        title: "Checking payment",
        chip: "Not confirmed",
        tone: "warn",
        body: "PayPal's answer did not match this purchase or did not arrive, so it is not shown as paid. Do not pay again; the operator checks it.",
      };
    case "unpaid_closed":
      return {
        title: "Not paid",
        chip: "Not paid",
        tone: "warn",
        body:
          purchase.attempt?.outcomeReason === "buyer_canceled"
            ? "You canceled at PayPal. Nothing was charged."
            : "The review window closed before the payment finished. Nothing was charged.",
      };
    case "review_open":
      return { title: "Not paid", chip: "Not paid", tone: "warn", body: `No payment has started. This review stays open until ${deadline} Singapore time.` };
    default:
      return { title: "Not paid", chip: "Not paid", tone: "warn", body: "This review closed before any payment started. Nothing was charged." };
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const principal = await requireBuyerSession(getAuth(), await headers());
  if (!isPrincipal(principal)) notFound();
  const { purchaseId } = await params;
  const now = new Date();
  const purchase = await getOwnPurchase(webDb(), principal, purchaseId, now);
  if (!purchase) notFound();
  if (purchase.view.state !== purchase.state) await applyDerivedTransitions(webDb(), purchase.id, now);

  const status = statusOf(purchase);
  const paid = purchase.view.state === "paid" && purchase.attempt?.captureId;
  const canContinue = purchase.view.state === "review_open" || (purchase.view.state === "pending_payment" && purchase.view.paypalAttempt === "order_created");

  return (
    <main>
      <p className="eyebrow">Receipt</p>
      <h1>{status.title}</h1>
      <div className={`status ${status.tone}`}>
        <p>
          <span className={`chip ${status.tone}`}>{status.chip}</span> {status.body}
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
          <strong>{paid ? "Paid total" : "Reviewed total"}</strong>
          <span className="total money">{formatSgd(sgdFromCents(paid ? (purchase.attempt?.captureGrossSgdCents ?? purchase.totalSgdCents) : purchase.totalSgdCents))}</span>
        </div>
        {purchase.rail === "paypal" && (
          <div className="row">
            <span className="muted">Method</span>
            <span>PayPal sandbox, test money</span>
          </div>
        )}
        {purchase.sellerMerchantId && (
          <div className="row stacked">
            <span className="muted">Paid to (sandbox seller)</span>
            <span className="mono">{purchase.sellerMerchantId}</span>
          </div>
        )}
        {paid && (
          <>
            <div className="row stacked">
              <span className="muted">PayPal sandbox capture</span>
              <span className="mono">{purchase.attempt?.captureId}</span>
            </div>
            <div className="row stacked">
              <span className="muted">PayPal sandbox order</span>
              <span className="mono">{purchase.attempt?.orderId}</span>
            </div>
          </>
        )}
        <div className="row">
          <span className="muted">Reviewed</span>
          <span>{SINGAPORE_TIME.format(purchase.createdAt)}</span>
        </div>
        <div className="row stacked">
          <span className="muted">Reference</span>
          <span className="mono">{purchase.id}</span>
        </div>
      </section>
      {canContinue && (
        <div className="actions">
          <a className="button" href={`/review/${encodeURIComponent(purchase.id)}`}>
            Back to the review
          </a>
        </div>
      )}
    </main>
  );
}
