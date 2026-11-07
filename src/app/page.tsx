// The landing page at the site's root address (Gate 1, reopened and re-approved 2026-10-21; S15
// amendment; reopened and re-approved 2026-11-04 for the third build plan, so it leads with the
// approved pitch and offers Ask Envoi first). It reads no database. It reads the environment only to
// offer Ask Envoi while the assistant is on, as /buy does (S25), because /buy/ask answers 404 when it
// is off. S44, 2026-11-07 (Gate 1 fourth build plan, mockups/landing-tourist.html): it speaks to the
// visitor whose card does not work at the stall, leads with the scan, and "I run a shop" opens /for-shops
// instead of a sign-in form.

import { assistantEnabled } from "@/integrations/ai/openai";

const SOURCE_URL = "https://github.com/jaydonnnk/envoi";
const EVIDENCE_URL = "https://github.com/jaydonnnk/envoi/blob/main/docs/plans/envoi/evidence-pack.md";

const STEPS = [
  { title: "Scan", text: "Open Envoi and scan the sticker. It identifies the shop. It is never a payment code, and only enrolled shops can be paid." },
  { title: "Ask", text: "AI explains unfamiliar dishes and builds your order within your budget. Prices come only from the shop's menu." },
  { title: "Approve", text: "You see the total and who gets paid, then approve in PayPal. The money goes to the shop's own PayPal." },
  { title: "Show the stall", text: "After Paid, show your order in the stall's language, so they know what to make." },
];

export const dynamic = "force-dynamic";

export default function Home() {
  const askEnabled = assistantEnabled();
  return (
    <main id="main" className="landing">
      <div className="landing-hero">
        <h1>Scan the stall&apos;s SGQR. Pay with the PayPal you already have.</h1>
        <p className="lead">At a participating shop, scan its SGQR sticker in Envoi. AI explains the dishes and helps you order. You see the exact amount and approve it in PayPal.</p>
        <div className="actions">
          <a className="button" href="/buy/scan">
            Scan a sticker
          </a>
          {askEnabled && (
            <a className="button secondary" href="/buy/ask">
              Ask Envoi
            </a>
          )}
          <a className="button secondary" href="/for-shops">
            I run a shop
          </a>
        </div>
      </div>
      <div className="landing-cards">
        {STEPS.map((step) => (
          <section className="card" key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </section>
        ))}
      </div>
      <p className="muted landing-languages">Also available in Japanese, Malay, Spanish and Chinese.</p>
      <nav className="landing-links" aria-label="More">
        <a href="/buy">See all shops</a>
        <a href={SOURCE_URL}>GitHub</a>
        <a href={EVIDENCE_URL}>Evidence</a>
      </nav>
    </main>
  );
}
