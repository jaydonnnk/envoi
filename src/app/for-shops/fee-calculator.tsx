"use client";

import { useState } from "react";
import { feeOn, PAYPAL_FEES_PAGE, PAYPAL_SG_DOMESTIC, PAYPAL_SG_INTERNATIONAL, PAYPAL_SG_MICROPAYMENT_INTERNATIONAL, readRate, type PayPalRate } from "@/domain/fees/paypal-rates";
import { formatMoney, fromDecimalString, money } from "@/lib/money";

// S44: the fee on one order, from the reviewed rate constants. Nothing here is sent anywhere.
const sgd = (minor: number) => formatMoney(money("SGD", minor));

function feeText(orderMinor: number, rate: PayPalRate): { fee: string; keep: string } {
  const fee = feeOn(orderMinor, rate);
  if (fee.kind === "unknown") return { fee: "Unknown", keep: "Unknown" };
  return { fee: sgd(fee.feeMinor), keep: sgd(fee.netMinor) };
}

function rateLine(account: string, rate: PayPalRate): string {
  const read = readRate(rate);
  if (read === null) return `${account}: rate unknown.`;
  return `${account}: ${(read.percentBasisPoints / 100).toFixed(2)}% of the order + ${sgd(read.fixedMinor)} per sale.`;
}

export function FeeCalculator({
  international = PAYPAL_SG_INTERNATIONAL,
  domestic = PAYPAL_SG_DOMESTIC,
  micropayment = PAYPAL_SG_MICROPAYMENT_INTERNATIONAL,
}: {
  international?: PayPalRate;
  domestic?: PayPalRate;
  micropayment?: PayPalRate;
}) {
  const [text, setText] = useState("15.00");
  const order = fromDecimalString("SGD", text.trim());
  const orderMinor = order !== null && order.minor > 0 ? order.minor : null;
  const visitor = orderMinor === null ? null : feeText(orderMinor, international);
  const micro = orderMinor === null ? null : feeText(orderMinor, micropayment);

  return (
    <aside className="card" aria-labelledby="fee-heading">
      <h2 id="fee-heading">Fee on one order</h2>
      <label htmlFor="fee-order">Order total (S$)</label>
      <input id="fee-order" inputMode="decimal" autoComplete="off" value={text} aria-invalid={orderMinor === null} onChange={(event) => setText(event.target.value)} />
      <div aria-live="polite">
        {visitor === null || micro === null ? (
          <p className="muted fine">Enter an order total, such as 15.00.</p>
        ) : (
          <div className="fee-result">
            <div className="row total-row">
              <span>You keep</span>
              <strong className="total money">{visitor.keep}</strong>
            </div>
            <div className="row">
              <span className="muted">PayPal fee</span>
              <span className="money">{visitor.fee}</span>
            </div>
            <div className="row">
              <span className="muted">On the micropayment rate</span>
              <span className="money">{micro.fee}</span>
            </div>
          </div>
        )}
      </div>
      <details className="fee-details">
        <summary>How PayPal works out the fee</summary>
        <small className="fee-source">{rateLine("Visitor with an overseas PayPal account", international)}</small>
        <small className="fee-source">{rateLine("Buyer with a Singapore PayPal account", domestic)}</small>
        <small className="fee-source">{rateLine("Micropayment rate, overseas account", micropayment)}</small>
        <small className="fee-source">
          Above is the overseas fee. Rates are from <a href={PAYPAL_FEES_PAGE}>PayPal’s Singapore fees page</a>. This is an estimate: PayPal’s record decides the actual fee.
        </small>
      </details>
    </aside>
  );
}
