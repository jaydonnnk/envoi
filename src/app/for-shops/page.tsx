// S44: the public page a shop owner reaches from "I run a shop", before any sign-in (Gate 1 fourth
// build plan, amended 2026-11-07, mockups/for-shops.html). It reads no database. Its sign-up line
// follows the effective public signup switch, including mail readiness (S51).
import { merchantSignupOpen } from "@/env";
import { FeeCalculator } from "./fee-calculator";

export const dynamic = "force-dynamic";

const WHY_ENVOI = [
  "Visitors whose cards and apps cannot pay your SGQR, can pay you with PayPal.",
  "No card terminal. Your SGQR sticker stays as it is.",
  "Money goes straight to your own PayPal. Envoi never holds it.",
  "AI explains your menu, so visitors know what to order.",
  "Paid means PayPal confirmed it.",
];

export default function ForShopsPage() {
  const signupOpen = merchantSignupOpen();
  return (
    <main id="main" className="for-shops">
      <p className="eyebrow">For shops</p>
      <h1>Take PayPal from visitors whose cards do not work at your stall.</h1>
      <p className="lead">Keep your SGQR. Add no hardware. Under S$26, PayPal’s micropayment rate costs less.</p>
      <div className="stack">
        <div className="layout paired">
          <section className="card slip">
            <h2>Why add Envoi</h2>
            <ul className="plain-list">
              {WHY_ENVOI.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="actions">
              <a className="button" href="/merchant/setup">
                Set up my shop
              </a>
            </div>
            <p className="muted fine">{signupOpen ? "Set up a test shop here. An Envoi admin approves every shop before it can sell." : "No public sign-up yet: Envoi’s operator makes test accounts."}</p>
          </section>
          <FeeCalculator />
        </div>
        <section className="card warning">
          <h2>What it costs you</h2>
          <p>PayPal takes a fee on each sale. Envoi adds nothing.</p>
          <p className="muted fine">The micropayment rate needs PayPal’s approval, and it then applies to every sale.</p>
        </section>
      </div>
    </main>
  );
}
