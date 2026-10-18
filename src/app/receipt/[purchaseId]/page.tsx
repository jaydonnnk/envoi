import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SINGAPORE_CLOCK, SINGAPORE_TIME } from "@/app/purchase-copy";
import { getOwnPurchase, type OwnPurchase } from "@/domain/purchases/review";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatSgd, sgdFromCents } from "@/lib/money";
import { formatPyusdAtomic, formatPyusdPerSgd } from "@/domain/pyusd/rate";
import { OPERATOR_RESOLUTION } from "@/domain/pyusd/state";
import { LiveStatus } from "./live-status";
import { PyusdExtraTransfers, PyusdReceiptDetails, pyusdReceiptStatus } from "./pyusd-receipt";

const SINGAPORE_DATE = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" });

export const dynamic = "force-dynamic";

type Status = { title: string; chip: string; tone: "ok" | "warn"; body: string };

// A capture was sent, or may have been: only a provider read can decide it now.
const CAPTURE_IN_FLIGHT = new Set(["capture_dispatched", "capture_unknown"]);

const CHECKING: Status = {
  title: "Checking payment",
  chip: "Not confirmed",
  tone: "warn",
  body: "PayPal's answer has not arrived or did not match this purchase, so it is not shown as paid. Do not pay again. Check status asks PayPal for its record, and the payment is flagged for the operator.",
};

// Only a verified capture reads as paid. Every other state says plainly that it is not.
function statusOf(purchase: OwnPurchase): Status {
  if (purchase.entryPoint === "fixture_tracer") {
    return { title: "No payment was attempted", chip: "Not paid", tone: "warn", body: "This is a tracer receipt. Envoi sent nothing to any payment provider, and no money moved." };
  }
  const deadline = SINGAPORE_CLOCK.format(purchase.reviewExpiresAt);
  if (purchase.rail === "pyusd") {
    const attempt = purchase.attempt?.rail === "pyusd" ? purchase.attempt : null;
    const closedBy = attempt?.state !== "closed_unpaid" ? null : attempt.outcomeReason === OPERATOR_RESOLUTION ? "operator" : "release";
    return pyusdReceiptStatus(purchase.view.state, deadline, { attemptState: attempt?.state ?? null, closedBy });
  }
  switch (purchase.view.state) {
    case "paid":
      return { title: "Paid", chip: "Paid", tone: "ok", body: "PayPal sandbox confirmed this capture to the shop's sandbox seller. Test money only: no real money moved." };
    case "pending_payment":
      if (purchase.view.paypalAttempt && CAPTURE_IN_FLIGHT.has(purchase.view.paypalAttempt)) return CHECKING;
      if (purchase.view.paypalAttempt === "create_unknown") {
        return {
          title: "Not paid yet",
          chip: "Order not confirmed",
          tone: "warn",
          body: `PayPal did not confirm the order, so nothing has been charged. Go back to the review to try PayPal again before ${deadline} Singapore time.`,
        };
      }
      return {
        title: "Not paid yet",
        chip: "Waiting for PayPal",
        tone: "warn",
        body: `Nothing has been charged. Approve in PayPal before ${deadline} Singapore time, or this purchase closes unpaid.`,
      };
    case "uncertain":
      return CHECKING;
    case "unpaid_closed":
      return {
        title: "Not paid",
        chip: "Not paid",
        tone: "warn",
        body:
          purchase.attempt?.state === "capture_failed"
            ? "PayPal refused this payment and its record shows no capture. Nothing was charged."
            : purchase.attempt?.outcomeReason === "buyer_canceled"
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
  const pyusd = purchase.rail === "pyusd" ? purchase.pyusd : null;
  const pyusdPaid = pyusd !== null && purchase.view.state === "paid" && purchase.attempt?.rail === "pyusd" && purchase.attempt.pyusdFinalizedSignature !== null;
  const paid = purchase.view.state === "paid" && purchase.attempt?.captureId;
  const attemptState = purchase.rail === "pyusd" ? purchase.view.pyusdAttempt : purchase.view.paypalAttempt;
  const canContinue =
    purchase.view.state === "review_open" ||
    (purchase.rail !== "pyusd" && purchase.view.state === "pending_payment" && (attemptState === "order_created" || attemptState === "create_unknown"));
  // A prepared or scanning PYUSD attempt is checked against devnet; a PayPal one only once a capture
  // may have been sent.
  const canCheck =
    purchase.view.state === "uncertain" ||
    (purchase.view.state === "pending_payment" &&
      attemptState !== null &&
      (purchase.rail === "pyusd" ? attemptState === "prepared" || attemptState === "expired_scanning" : CAPTURE_IN_FLIGHT.has(attemptState)));

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
        {pyusd && (
          <PyusdReceiptDetails
            paid={pyusdPaid}
            pyusd={{
              amount: formatPyusdAtomic(pyusd.atomicAmount),
              pyusdPerSgd: formatPyusdPerSgd(pyusd.atomicPerSgd),
              rateDate: SINGAPORE_DATE.format(pyusd.rateConfirmedAt),
              recipientTokenAccount: purchase.attempt?.rail === "pyusd" ? purchase.attempt.pyusdDestinationTokenAccount : pyusd.tokenAccount,
              signature: pyusdPaid ? (purchase.attempt?.pyusdFinalizedSignature ?? null) : null,
            }}
          />
        )}
        {purchase.sellerMerchantId && (
          <div className="row stacked">
            <span className="muted">{paid ? "Paid to (sandbox seller)" : "Recipient (sandbox seller)"}</span>
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
      {pyusd && (
        <PyusdExtraTransfers
          transfers={purchase.extraTransfers.map((transfer) => ({ signature: transfer.signature, amount: transfer.destinationDelta === null ? null : formatPyusdAtomic(transfer.destinationDelta) }))}
        />
      )}
      {purchase.view.state === "paid" && (
        <section className="card acknowledgment" aria-labelledby="acknowledgment-heading">
          <h2 id="acknowledgment-heading">Shop acknowledgment</h2>
          {purchase.acknowledgedAt ? (
            <p>
              <span className="chip ok">Acknowledged</span> The shop acknowledged this order on {SINGAPORE_TIME.format(purchase.acknowledgedAt)} Singapore time.
            </p>
          ) : (
            <p>
              <span className="chip">Awaiting the shop</span> The shop has not acknowledged this order yet. Reload this page to see when it does.
            </p>
          )}
          <p className="fine muted">Acknowledgment is separate from payment: it never changes the paid status above.</p>
        </section>
      )}
      {purchase.entryPoint !== "fixture_tracer" && (
        <LiveStatus
          purchaseId={purchase.id}
          rail={purchase.rail === "pyusd" ? "pyusd" : "paypal"}
          state={purchase.view.state}
          attemptState={attemptState}
          settled={purchase.attempt?.rail === "pyusd" ? purchase.attempt.pyusdScan?.reachedBeforePreparation === true : undefined}
          canCheck={canCheck}
        />
      )}
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
