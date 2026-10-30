import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SINGAPORE_CLOCK } from "@/app/purchase-copy";
import { outletRails } from "@/domain/outlets/destination";
import { outletPyusdAvailability } from "@/app/pyusd-availability";
import { formatPyusdAtomic, formatPyusdPerSgd } from "@/domain/pyusd/rate";
import { getOwnPurchase, type OwnPurchase } from "@/domain/purchases/review";
import { applyDerivedTransitions } from "@/domain/purchases/state";
import { webEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { formatMoney, money } from "@/lib/money";
import { ContinueToPayPal } from "./continue-to-paypal";
import { PyusdPay } from "./pyusd-pay";
import { SwitchRail } from "./switch-rail";

const SINGAPORE_DATE = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" });

const linesOf = (purchase: OwnPurchase) => purchase.lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity }));

// The PYUSD option on a PayPal review (S16; replaces D8's static option): selectable, as a fresh
// review of the same basket, only while the rail is on, the shop has a verified devnet wallet and a
// rate younger than 30 days, and the RPC reports the pinned devnet identity. It streams in after the
// rest of the page, so an unreachable RPC never delays the PayPal journey.
async function PyusdOption({ purchase, open }: { purchase: OwnPurchase; open: boolean }) {
  const { availability, rate } = await outletPyusdAvailability(purchase.outletId);
  return (
    <div className={`rail ${availability.available ? "choice" : "unavailable"}`} aria-disabled={!availability.available}>
      <span className="rail-head">
        <strong>PYUSD on Solana devnet, test tokens</strong>
        <span className="chip">{availability.available ? "Available" : "Unavailable"}</span>
      </span>
      {availability.available && rate ? (
        <>
          <small>
            The shop&apos;s rate: {formatPyusdPerSgd(rate.atomicPerSgd)} PYUSD per S$1, set on {SINGAPORE_DATE.format(rate.confirmedAt)}. Paying with PYUSD needs a new review.
          </small>
          {open && (
            <div className="actions">
              <SwitchRail outletId={purchase.outletId} lines={linesOf(purchase)} rail="pyusd" label="Review with PYUSD instead" />
            </div>
          )}
        </>
      ) : (
        <small>{availability.available ? "" : availability.message}</small>
      )}
    </div>
  );
}

const PyusdOptionPending = () => (
  <div className="rail unavailable" aria-disabled="true">
    <span className="rail-head">
      <strong>PYUSD on Solana devnet, test tokens</strong>
      <span className="chip">Checking</span>
    </span>
    <small>Checking whether this shop can take PYUSD…</small>
  </div>
);

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
  const pyusd = purchase.rail === "pyusd" ? purchase.pyusd : null;
  const open = purchase.view.state === "review_open";
  const payable = pyusd
    ? open
    : purchase.view.state === "review_open" || (purchase.view.state === "pending_payment" && (purchase.view.paypalAttempt === "order_created" || purchase.view.paypalAttempt === "create_unknown"));
  const total = formatMoney(money(purchase.currency, purchase.totalMinor));
  const pyusdAmount = pyusd ? formatPyusdAtomic(pyusd.atomicAmount) : null;
  const paypalRail = pyusd ? (await outletRails(webDb(), purchase.outletId)).paypal : true;

  return (
    <main>
      <p className="eyebrow">Review</p>
      <h1>Check the purchase</h1>
      <p className="lead">
        {pyusd
          ? "This is the last Envoi review before you approve in your wallet. Changed items, amount, recipient, currency or payment method need a fresh review."
          : "This is the last Envoi review before you approve in PayPal. Changed items, amount, recipient, currency or payment method need a fresh review."}
      </p>
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
                  <small>{formatMoney(money(purchase.currency, line.unitMinor))} each</small>
                </span>
                <span className="money">{formatMoney(money(purchase.currency, line.lineMinor))}</span>
              </div>
            ))}
            <div className="row total-row">
              <strong>Total</strong>
              <span className="total money">{total}</span>
            </div>
            {pyusd && (
              <div className="row total-row">
                <strong>You pay</strong>
                <span className="total money">{pyusdAmount} PYUSD</span>
              </div>
            )}
            <small>
              Prices come from the shop&apos;s published menu, read by the server. Currency: {purchase.currency}.
              {pyusd && " The PYUSD amount is the total at the shop's own rate, rounded up to the next 0.000001 PYUSD."}
            </small>
          </section>
          <section className="card" aria-labelledby="recipient-heading">
            <h2 id="recipient-heading">Paid to</h2>
            {pyusd ? (
              <div className="row address">
                <span>
                  {purchase.outletName}&apos;s PYUSD devnet account
                  <small>The shop&apos;s own devnet wallet, verified by a signed challenge. Envoi never holds the tokens or any key.</small>
                </span>
                <span className="mono">{pyusd.tokenAccount ?? "Not connected"}</span>
              </div>
            ) : (
              <div className="row stacked">
                <span>
                  {purchase.outletName}&apos;s PayPal sandbox seller account
                  <small>A sandbox test account assigned to this demo shop. Envoi&apos;s own account never receives the money.</small>
                </span>
                <span className="mono">{purchase.sellerMerchantId ?? "Not connected"}</span>
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="card" aria-labelledby="method-heading">
            <h2 id="method-heading">Payment method</h2>
            {pyusd ? (
              <>
                <div className="rail" aria-current="true">
                  <span className="rail-head">
                    <strong>PYUSD on Solana devnet, test tokens</strong>
                    <span className="chip ok">Selected</span>
                  </span>
                  <small>
                    {pyusdAmount} PYUSD devnet test tokens for {total}, at the shop&apos;s rate of {formatPyusdPerSgd(pyusd.atomicPerSgd)} PYUSD per S$1 set on{" "}
                    {SINGAPORE_DATE.format(pyusd.rateConfirmedAt)}. The shop receives PYUSD in its wallet, not SGD.
                  </small>
                </div>
                <div className={`rail ${paypalRail ? "choice" : "unavailable"}`} aria-disabled={!paypalRail}>
                  <span className="rail-head">
                    <strong>PayPal sandbox, test money</strong>
                    <span className="chip">{paypalRail ? "Available" : "Unavailable"}</span>
                  </span>
                  {paypalRail ? (
                    open && (
                      <div className="actions">
                        <SwitchRail outletId={purchase.outletId} lines={linesOf(purchase)} rail="paypal" label="Review with PayPal instead" />
                      </div>
                    )
                  ) : (
                    <small>This shop has no PayPal sandbox seller connected.</small>
                  )}
                </div>
                <div className="row">
                  <span className="muted nowrap">Network fee</span>
                  <span>Paid by your wallet in devnet SOL</span>
                </div>
                <div className="row">
                  <span className="muted">Buyer funding and off-ramp costs</span>
                  <span>Unknown</span>
                </div>
              </>
            ) : (
              <>
                <div className="rail" aria-current="true">
                  <span className="rail-head">
                    <strong>PayPal sandbox, test money</strong>
                    <span className="chip ok">Selected</span>
                  </span>
                  <small>Purchase price {total}. Funding currency and any conversion are confirmed in PayPal.</small>
                </div>
                <Suspense fallback={<PyusdOptionPending />}>
                  <PyusdOption purchase={purchase} open={open} />
                </Suspense>
                <div className="row">
                  <span className="muted">Buyer conversion and funding costs</span>
                  <span>Unknown</span>
                </div>
              </>
            )}
            <div className="row">
              <span className="muted">Merchant fees</span>
              <span>Not quoted</span>
            </div>
          </section>
          {payable && pyusd ? (
            <PyusdPay
              purchaseId={purchase.id}
              outletId={purchase.outletId}
              lines={linesOf(purchase)}
              appBaseUrl={webEnv().APP_BASE_URL}
              amount={pyusdAmount ?? ""}
              validUntil={SINGAPORE_CLOCK.format(purchase.reviewExpiresAt)}
            />
          ) : payable ? (
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
                      : pyusd
                        ? "This PYUSD payment was prepared and is being checked on Solana devnet. Do not pay again."
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
