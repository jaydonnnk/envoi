"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SINGAPORE_TIME } from "@/app/purchase-copy";
import { applyOrderFilter, type OrderFilter } from "@/domain/purchases/order-filter";
import type { MerchantOrder, OutletOrders } from "@/domain/purchases/orders";
import { requestJson } from "@/lib/browser/session";
import { archivedCountLine, DELETE_COPY, extraTransferNote, filterWords, mayStillBePaid, needsReading, orderStatus, orderTotal } from "./order-copy";
import { OrdersGrid } from "./orders-grid";
import { startOrdersPolling, withNewest, withOlder, type PolledOrder } from "./polling";
import { useRestoreFocus } from "@/lib/browser/focus";

const polled = (orders: readonly MerchantOrder[]): PolledOrder[] =>
  orders.map((order) => ({ id: order.id, state: order.state, attemptState: order.payment?.attemptState ?? null, acknowledgedAt: order.acknowledgedAt }));

async function fetchOrders(outletId: string, before: string | null = null): Promise<OutletOrders | null> {
  const query = before === null ? "" : `?before=${encodeURIComponent(before)}`;
  const result = await requestJson<OutletOrders>("GET", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/orders${query}`);
  return result.ok && result.data ? result.data : null;
}

const ACKNOWLEDGE_FAILED = "Envoi could not record the acknowledgment. Nothing changed; try again.";

const postAcknowledge = (orderId: string) => requestJson<{ order: MerchantOrder }>("POST", `/api/v1/merchant/orders/${encodeURIComponent(orderId)}/acknowledge`);

function OrderCard({
  order,
  onAcknowledged,
  onArchived,
}: {
  order: MerchantOrder;
  onAcknowledged: (order: MerchantOrder) => void;
  onArchived: (order: MerchantOrder, changed: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  useRestoreFocus(busy);
  const status = orderStatus(order);
  const paid = order.state === "paid";

  // Delete (S18) archives the order: the confirmation says the record and the payment stay.
  async function archive() {
    setDeleting(true);
    setError(null);
    const result = await requestJson<{ order: MerchantOrder; changed: boolean }>("POST", `/api/v1/merchant/orders/${encodeURIComponent(order.id)}/archive`);
    setDeleting(false);
    confirmRef.current?.close();
    if (result.ok && result.data) onArchived(result.data.order, result.data.changed);
    else setError(result.error?.message ?? DELETE_COPY.failed);
  }

  async function acknowledge() {
    setBusy(true);
    setError(null);
    const result = await postAcknowledge(order.id);
    setBusy(false);
    if (result.ok && result.data) onAcknowledged(result.data.order);
    else setError(result.error?.message ?? ACKNOWLEDGE_FAILED);
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
        <strong className="money">{orderTotal(order)}</strong>
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
      {order.pyusd ? (
        <>
          <div className="row">
            <span className="muted">Method</span>
            <span>PYUSD on Solana devnet, test tokens</span>
          </div>
          <div className="row">
            <span className="muted">Amount</span>
            <span className="money">{order.pyusd.amount} PYUSD</span>
          </div>
          <div className={paid && order.pyusd.signature ? "row address" : "row stacked"}>
            <span className="muted">Finalized devnet transfer</span>
            {paid && order.pyusd.signature ? <span className="mono">{order.pyusd.signature}</span> : <span>None, not paid</span>}
          </div>
          {order.pyusd.extraTransfers.map((transfer) => (
            <div className="row address extra-transfer" key={transfer.signature}>
              <span>
                <span className="chip warn">Extra transfer</span> {extraTransferNote(transfer.amount)}
              </span>
              <span className="mono">{transfer.signature}</span>
            </div>
          ))}
        </>
      ) : (
        <div className="row stacked">
          <span className="muted">PayPal sandbox capture</span>
          {paid && order.payment?.captureId ? <span className="mono">{order.payment.captureId}</span> : <span>None, not paid</span>}
        </div>
      )}
      <div className="row stacked">
        <span className="muted">Envoi reference</span>
        <span className="mono">{order.id}</span>
      </div>
      <div className="row">
        <strong>Shop acknowledgment</strong>
        {order.acknowledgedAt ? <span className="chip ok">Acknowledged</span> : <span className="chip">Not acknowledged</span>}
      </div>
      {order.acknowledgedAt && <p className="muted order-note">Acknowledged on {SINGAPORE_TIME.format(new Date(order.acknowledgedAt))}. The payment status above is unchanged.</p>}
      <div className="actions">
        {order.canAcknowledge && (
          <button className="button" type="button" onClick={acknowledge} disabled={busy}>
            {busy ? "Acknowledging" : "Acknowledge order"}
          </button>
        )}
        {!paid && mayStillBePaid(order) && (
          <button className="button" type="button" disabled>
            Acknowledge after confirmed payment
          </button>
        )}
        <button className="button danger" type="button" onClick={() => confirmRef.current?.showModal()} disabled={deleting}>
          {DELETE_COPY.button}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <dialog ref={confirmRef} className="confirm" aria-labelledby={`delete-${order.id}`}>
        <h2 id={`delete-${order.id}`}>{DELETE_COPY.heading}</h2>
        <p>{DELETE_COPY.body}</p>
        {!paid && mayStillBePaid(order) && <p className="note">{DELETE_COPY.stillChecking}</p>}
        <div className="actions">
          <button className="button secondary" type="button" onClick={() => confirmRef.current?.close()} disabled={deleting}>
            {DELETE_COPY.keep}
          </button>
          <button className="button danger-solid" type="button" onClick={archive} disabled={deleting}>
            {deleting ? "Deleting" : DELETE_COPY.confirm}
          </button>
        </div>
      </dialog>
    </article>
  );
}

// One outlet's orders, kept current within the S3 polling bounds. Polls and "Check for new orders"
// re-read the newest page; "Show older orders" adds the page before the oldest order shown.
export function OrdersView({ initial, askEnabled }: { initial: OutletOrders; askEnabled: boolean }) {
  const [data, setData] = useState(initial);
  // Whether the list holds every order back to the oldest. A poll only adds newer orders, and no
  // order shown is ever dropped, so only loading the last older page completes it.
  const [complete, setComplete] = useState(initial.nextBefore === null);
  const [run, setRun] = useState(0);
  const [checking, setChecking] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useRestoreFocus(checking || loadingOlder);
  const [olderError, setOlderError] = useState(false);
  const [sentence, setSentence] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  // What the model chose, or null while no filter is set. An answer that chose nothing sets none.
  const [filter, setFilter] = useState<OrderFilter | null>(null);
  const [nothingChosen, setNothingChosen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [acknowledgeError, setAcknowledgeError] = useState<string | null>(null);
  const recordRef = useRef<HTMLDivElement>(null);
  const outletId = data.outlet.id;

  const showNewest = (next: OutletOrders) => setData((current) => ({ ...next, orders: withNewest(current.orders, next.orders) }));

  useEffect(
    () =>
      startOrdersPolling(polled(data.orders), {
        fetchState: async () => {
          const next = await fetchOrders(outletId);
          if (next) showNewest(next);
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
    if (next) showNewest(next);
    setRun((count) => count + 1);
  }

  async function showOlder() {
    setLoadingOlder(true);
    setOlderError(false);
    const older = await fetchOrders(outletId, data.orders.at(-1)?.id ?? null);
    setLoadingOlder(false);
    if (!older) return setOlderError(true);
    setData((current) => ({ ...current, orders: withOlder(current.orders, older.orders) }));
    setComplete(older.nextBefore === null);
  }

  const replace = (order: MerchantOrder) => setData((current) => ({ ...current, orders: current.orders.map((each) => (each.id === order.id ? order : each)) }));
  // An archived order leaves the list at once; a repeat (already archived elsewhere) does not count twice.
  const removeArchived = (order: MerchantOrder, changed: boolean) =>
    setData((current) => ({
      ...current,
      orders: current.orders.filter((each) => each.id !== order.id),
      archivedCount: current.archivedCount + (changed ? 1 : 0),
    }));

  const acknowledgeRow = useCallback(async (order: MerchantOrder) => {
    setAcknowledgingId(order.id);
    setAcknowledgeError(null);
    const result = await postAcknowledge(order.id);
    setAcknowledgingId(null);
    if (result.ok && result.data) {
      const updated = result.data.order;
      setData((current) => ({ ...current, orders: current.orders.map((each) => (each.id === updated.id ? updated : each)) }));
    } else setAcknowledgeError(result.error?.message ?? ACKNOWLEDGE_FAILED);
  }, []);

  const selectRow = useCallback((order: MerchantOrder) => setSelectedId(order.id), []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = sentence.trim();
    if (text === "") return;
    setAsking(true);
    setAskError(null);
    setNothingChosen(false);
    const result = await requestJson<{ filter: OrderFilter }>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/orders/filter`, { text });
    setAsking(false);
    if (!result.ok || !result.data) return setAskError(result.error?.message ?? "Envoi could not read that sentence. No filter changed.");
    if (filterWords(result.data.filter).length === 0) return setNothingChosen(true);
    setFilter(result.data.filter);
  }

  function clearFilter() {
    setFilter(null);
    setSentence("");
    setAskError(null);
    setNothingChosen(false);
  }

  const shown = filter ? applyOrderFilter(data.orders, filter) : data.orders;
  const selected = shown.find((order) => order.id === selectedId) ?? null;
  const toRead = data.orders.filter((order) => needsReading(order) && order.id !== selectedId);

  // The record opens below the table, so it comes into view and takes focus when a row is chosen.
  useEffect(() => {
    if (!selectedId) return;
    recordRef.current?.focus({ preventScroll: true });
    recordRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section className="orders" aria-labelledby={`orders-${outletId}`}>
      <div className="rail-head wrap">
        <h2 id={`orders-${outletId}`} className="list-heading">
          {data.outlet.name}
        </h2>
        <span className="chips">
          {data.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
          <span className="chip warn">Sandbox: test money only</span>
          {data.orders.some((order) => order.pyusd) && <span className="chip warn">Devnet: test tokens only</span>}
        </span>
      </div>
      {data.orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <div className="card orders-card">
          <h3>Ask your orders</h3>
          {askEnabled ? (
            <form className="ask-orders" onSubmit={ask}>
              <label htmlFor={`ask-${outletId}`}>What do you want to see?</label>
              <div className="ask-row">
                <input id={`ask-${outletId}`} type="text" value={sentence} maxLength={300} placeholder="paid PayPal orders this week" onChange={(event) => setSentence(event.target.value)} />
                <button className="button" type="submit" disabled={asking || sentence.trim() === ""}>
                  {asking ? "Asking" : "Ask"}
                </button>
              </div>
            </form>
          ) : (
            <p className="muted">Asking is off here. Sort and filter the table instead.</p>
          )}
          <div aria-live="polite">
            {filter && (
              <p className="muted filters-set">
                Filters set: {filterWords(filter).join(" · ")}.{" "}
                <button className="link-button" type="button" onClick={clearFilter}>
                  Clear
                </button>
              </p>
            )}
            {nothingChosen && <p className="muted filters-set">That sentence names no filter, so no filter changed. Try a payment state, a method or a date.</p>}
            {filter && !complete && <p className="muted filters-set">This covers the orders loaded so far. Show older orders to include more.</p>}
          </div>
          {askError && (
            <p className="error" role="alert">
              {askError}
            </p>
          )}
          {acknowledgeError && (
            <p className="error" role="alert">
              {acknowledgeError}
            </p>
          )}
          <OrdersGrid orders={shown} selectedId={selectedId} busyId={acknowledgingId} onSelect={selectRow} onAcknowledge={acknowledgeRow} />
          <p className="muted fine">Sandbox test money. Pending and checking orders are never shown as Paid.</p>
          <p className="muted fine">Paid and acknowledged are separate facts, and you can acknowledge only a paid order. Select an order to see its full record or delete it.</p>
        </div>
      )}
      {selected && (
        <div className="order-record" ref={recordRef} tabIndex={-1}>
          <OrderCard key={selected.id} order={selected} onAcknowledged={replace} onArchived={removeArchived} />
          <button className="link-button" type="button" onClick={() => setSelectedId(null)}>
            Close this record
          </button>
        </div>
      )}
      {toRead.length > 0 && (
        <div className="order-record">
          <h3>Read these orders</h3>
          {toRead.map((order) => (
            <OrderCard key={order.id} order={order} onAcknowledged={replace} onArchived={removeArchived} />
          ))}
        </div>
      )}
      {data.archivedCount > 0 && <p className="muted">{archivedCountLine(data.archivedCount)}</p>}
      {olderError && (
        <p className="error" role="alert">
          Envoi could not load older orders. Try again.
        </p>
      )}
      <div className="actions">
        <button className="button secondary" type="button" onClick={checkNow} disabled={checking}>
          {checking ? "Checking" : "Check for new orders"}
        </button>
        {!complete && data.orders.length > 0 && (
          <button className="button secondary" type="button" onClick={showOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading" : "Show older orders"}
          </button>
        )}
      </div>
    </section>
  );
}
