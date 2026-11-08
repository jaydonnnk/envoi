"use client";

import type { MerchantOutlet } from "@/domain/outlets/merchant";

export function CounterPoster({ outlet }: { outlet: Pick<MerchantOutlet, "name" | "isDemoFixture"> }) {
  return (
    <>
      <section className="card counter-poster" aria-labelledby="poster-heading">
        <p className="poster-brand">Envoi</p>
        <h2 id="poster-heading">Visitors: scan to pay with PayPal</h2>
        <p lang="zh">游客:扫码用 PayPal 付款</p>
        <p lang="ms">Pelawat: imbas untuk bayar dengan PayPal</p>
        <p lang="ta">பார்வையாளர்கள்: PayPal மூலம் பணம் செலுத்த ஸ்கேன் செய்யவும்</p>
        <div className="poster-instructions">
          <h3>Use this stall&apos;s existing SGQR</h3>
          <ol>
            <li>Open Envoi in your browser:<br /><strong className="poster-address">envoi-helx.onrender.com/buy/scan</strong></li>
            <li>Scan the stall&apos;s SGQR beside this poster.</li>
            <li>Choose your order and review the exact amount. Approve the payment in PayPal.</li>
          </ol>
        </div>
        <p><strong>{outlet.name}</strong></p>
        <p className="fine muted">For shops enrolled in Envoi. PayPal is not a payment option on SGQR. Envoi identifies the shop. You approve payment to the shop&apos;s PayPal.</p>
        <p className="chip warn">{outlet.isDemoFixture ? "Test shop · test money only" : "Test money only"}</p>
      </section>
      <div className="actions poster-controls">
        <button className="button" type="button" onClick={() => window.print()}>Print</button>
      </div>
    </>
  );
}
