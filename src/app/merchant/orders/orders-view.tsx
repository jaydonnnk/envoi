"use client";

import { useEffect, useState } from "react";
import { SINGAPORE_TIME } from "@/app/purchase-copy";
import type { MerchantOrder, OutletOrders } from "@/domain/purchases/orders";
import { requestJson } from "@/lib/browser/session";
import { formatSgd, sgdFromCents } from "@/lib/money";
import { mayStillBePaid, orderStatus } from "./order-copy";
import { startOrdersPolling, type PolledOrder } from "./polling";

const polled = (orders: readonly MerchantOrder[]): PolledOrder[] =>
  orders.map((order) => ({ id: order.id, state: order.state, attemptState: order.payment?.attemptState ?? null, acknowledgedAt: order.acknowledgedAt }));

async function fetchOrders(outletId: string): Promise<OutletOrders | null> {
  const result = await requestJson<OutletOrders>("GET", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/orders`);
  return result.ok && result.data ? result.data : null;
}

function OrderCard({ order, onAcknowledged }: { order: MerchantOrder; onAcknowledged: (order: MerchantOrder) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = orderStatus(order);
  const paid = order.state === "paid";

  async function acknowledge() {
    setBusy(true);
    setError(null);
    const result = await requestJson<{ order: MerchantOrder }>("POST", `/api/v1/merchant/orders/${encodeURIComponent(order.id)}/acknowledge`);
    setBusy(false);
    if (result.ok && result.data) onAcknowledged(result.data.order);
    else setError(result.error?.message ?? "Envoi could not record the acknowledgment. Nothing changed; try again.");
  }

  return (
    <article className="card slip order" aria-label={`Order ${order.id}`}>
      <div className="row order-head">
        <div>
          {order.lines.map((line) => (
            <p className="order-line" key={line.menuItemId}>
              {line.quantity} × {line.name}
            </p>
          ))}
          <small>{SINGAPORE_TIME.format(new Date(order.createdAt))}</small>
        </div>
        <strong className="money">{formatSgd(sgdFromCents(paid ? (order.payment?.captureGrossSgdCents ?? order.totalSgdCents) : order.totalSgdCents))}</strong>
      </div>
      <div className="row">
        <strong>Payment</strong>
        <span className={`chip${status.tone === "plain" ? "" : ` ${status.tone}`}`}>{status.chip}</span>
      </div>
      <p className="muted order-note">{status.body}</p>
      {order.rail === "paypal" && (
        <div className="row">
          <span className="muted">Method</span>
          <span>PayPal sandbox, test money</span>
        </div>
      )}
      <div className="row stacked">
        <span className="muted">PayPal sandbox capture</span>
        {paid && order.payment?.captureId ? <span className="mono">{order.payment.captureId}</span> : <span>None, not paid</span>}
      </div>
      <div className="row stacked">
        <span className="muted">Envoi reference</span>
        <span className="mono">{order.id}</span>
      </div>
      <div className="row">
        <strong>Shop acknowledgment</strong>
        {order.acknowledgedAt ? <span className="chip ok">Acknowledged</span> : <span className="chip">Not acknowledged</span>}
      </div>
      {order.acknowledgedAt && <p className="muted order-note">Acknowledged on {SINGAPORE_TIME.format(new Date(order.acknowledgedAt))}. The payment status above is unchanged.</p>}
      {order.canAcknowledge && (
        <div className="actions">
          <button className="button" type="button" onClick={acknowledge} disabled={busy}>
            {busy ? "Acknowledging" : "Acknowledge order"}
          </button>
        </div>
      )}
      {!paid && mayStillBePaid(order) && (
        <div className="actions">
          <button className="button" type="button" disabled>
            Acknowledge after confirmed payment
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

// One outlet's orders, kept current within the S3 polling bounds. "Check for new orders" re-reads
// the list once and starts a fresh bounded polling run.
export function OrdersView({ initial }: { initial: OutletOrders }) {
  const [data, setData] = useState(initial);
  const [run, setRun] = useState(0);
  const [checking, setChecking] = useState(false);
  const outletId = data.outlet.id;

  useEffect(
    () =>
      startOrdersPolling(polled(data.orders), {
        fetchState: async () => {
          const next = await fetchOrders(outletId);
          if (next) setData(next);
          return next ? polled(next.orders) : null;
        },
        onChange: () => {},
        schedule: (tick, ms) => window.setTimeout(tick, ms),
        cancel: (handle) => window.clearTimeout(handle as number),
        now: () => Date.now(),
      }),
    // A new run starts only from the page load or "Check for new orders", not from each poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outletId, run],
  );

  async function checkNow() {
    setChecking(true);
    const next = await fetchOrders(outletId);
    setChecking(false);
    if (next) setData(next);
    setRun((count) => count + 1);
  }

  const replace = (order: MerchantOrder) => setData((current) => ({ ...current, orders: current.orders.map((each) => (each.id === order.id ? order : each)) }));

  return (
    <section className="orders" aria-labelledby={`orders-${outletId}`}>
      <div className="rail-head wrap">
        <h2 id={`orders-${outletId}`} className="list-heading">
          {data.outlet.name}
        </h2>
        <span className="chips">
          {data.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
          <span className="chip warn">Sandbox: test money only</span>
        </span>
      </div>
      {data.orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <div className="order-list">
          {data.orders.map((order) => (
            <OrderCard key={order.id} order={order} onAcknowledged={replace} />
          ))}
        </div>
      )}
      <div className="actions">
        <button className="button secondary" type="button" onClick={checkNow} disabled={checking}>
          {checking ? "Checking" : "Check for new orders"}
        </button>
      </div>
    </section>
  );
}
