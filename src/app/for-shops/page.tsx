// S44: the public page a shop owner reaches from "I run a shop", before any sign-in (Gate 1 fourth
// build plan, mockups/for-shops.html). It reads no database. Until S43 exists it promises no public
// sign-up, and until S49 exists it does not list the counter poster.
import { FeeCalculator } from "./fee-calculator";

const WHAT_YOU_GET = [
  "A menu visitors can understand, with AI explanations, free.",
  "Orders already priced from your menu, shown to you in your language.",
  "Paid means PayPal confirmed it. Anything else never reads Paid.",
];

export default function ForShopsPage() {
  return (
    <main id="main" className="for-shops">
      <p className="eyebrow">For shops</p>
      <h1>Take PayPal from visitors whose cards do not work at your stall.</h1>
      <p className="lead">Keep your SGQR. Visitors scan it in Envoi and pay your own PayPal. Envoi never holds your money. It adds no hardware.</p>
      <div className="layout">
        <div className="stack">
          <section className="card slip">
            <h2>What you get</h2>
            <ul className="plain-list">
              {WHAT_YOU_GET.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="actions">
              <a className="button" href="/merchant/setup">
                Set up my shop
              </a>
            </div>
            <p className="muted fine">Shops on this test build use an account made by Envoi’s operator. There is no public sign-up yet.</p>
          </section>
          <section className="card warning">
            <h2>What it costs you</h2>
            <p>PayPal charges you per sale. Envoi adds nothing. On small orders the fee is large, so compare it with your margin, and set a minimum order if you need to.</p>
          </section>
        </div>
        <FeeCalculator />
      </div>
    </main>
  );
}
