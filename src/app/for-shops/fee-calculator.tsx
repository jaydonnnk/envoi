"use client";

import { useState } from "react";
import { feeOn, feePercentLabel, PAYPAL_FEES_PAGE, PAYPAL_FEES_PAGE_UPDATED_ON, PAYPAL_SG_DOMESTIC, PAYPAL_SG_INTERNATIONAL, readRate, type PayPalRate } from "@/domain/fees/paypal-rates";
import { formatMoney, fromDecimalString, money } from "@/lib/money";

// S44: the fee on one order, from the reviewed rate constants. Nothing here is sent anywhere.
const EXAMPLE_ORDERS = [450, 1500, 5000];
const sgd = (minor: number) => formatMoney(money("SGD", minor));

function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

function FeeCells({ orderMinor, rate }: { orderMinor: number; rate: PayPalRate }) {
  const fee = feeOn(orderMinor, rate);
  if (fee.kind === "unknown") {
    return (
      <>
        <td>Unknown</td>
        <td>Unknown</td>
      </>
    );
  }
  return (
    <>
      <td className="money">
        {sgd(fee.feeMinor)} ({feePercentLabel(orderMinor, rate)})
      </td>
      <td className="money">{sgd(fee.netMinor)}</td>
    </>
  );
}

function rateLine(name: string, rate: PayPalRate): string {
  const read = readRate(rate);
  if (read === null) return `${name}: rate unknown.`;
  return `${name}: ${(read.percentBasisPoints / 100).toFixed(2)}% + ${sgd(read.fixedMinor)}, read on ${dayLabel(rate.readOn)}.`;
}

export function FeeCalculator({ international = PAYPAL_SG_INTERNATIONAL, domestic = PAYPAL_SG_DOMESTIC }: { international?: PayPalRate; domestic?: PayPalRate }) {
  const [text, setText] = useState("15.00");
  const order = fromDecimalString("SGD", text.trim());
  const orderMinor = order !== null && order.minor > 0 ? order.minor : null;

  return (
    <aside className="card" aria-labelledby="fee-heading">
      <h2 id="fee-heading">Fee on one order</h2>
      <label htmlFor="fee-order">Order total (S$)</label>
      <input id="fee-order" inputMode="decimal" autoComplete="off" value={text} aria-invalid={orderMinor === null} onChange={(event) => setText(event.target.value)} />
      <div aria-live="polite">
        {orderMinor === null ? (
          <p className="muted fine">Enter an order total, such as 15.00.</p>
        ) : (
          <table className="fee-table">
            <caption>On {sgd(orderMinor)}</caption>
            <thead>
              <tr>
                <th scope="col">Buyer</th>
                <th scope="col">PayPal fee</th>
                <th scope="col">You keep</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Visitor’s PayPal</th>
                <FeeCells orderMinor={orderMinor} rate={international} />
              </tr>
              <tr>
                <th scope="row">Singapore PayPal</th>
                <FeeCells orderMinor={orderMinor} rate={domestic} />
              </tr>
            </tbody>
          </table>
        )}
      </div>
      <table className="fee-table">
        <caption>Visitors, by order size</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Visitor’s PayPal</th>
            <th scope="col">You keep</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_ORDERS.map((example) => (
            <tr key={example}>
              <th scope="row" className="money">
                {sgd(example)}
              </th>
              <FeeCells orderMinor={example} rate={international} />
            </tr>
          ))}
        </tbody>
      </table>
      <small className="fee-source">{rateLine("Visitor’s PayPal", international)}</small>
      <small>{rateLine("Singapore PayPal", domestic)}</small>
      <small className="fee-source">
        From <a href={PAYPAL_FEES_PAGE}>PayPal’s Singapore merchant fees page</a>, last updated {dayLabel(PAYPAL_FEES_PAGE_UPDATED_ON)}. This is an estimate: the fee is rounded to the cent, and the percentage is before
        rounding. PayPal’s own record decides what a sale costs. A rate that cannot be confirmed shows as unknown.
      </small>
    </aside>
  );
}
