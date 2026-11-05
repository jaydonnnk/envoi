// The landing page at the site's root address (Gate 1, reopened and re-approved 2026-10-21; S15
// amendment; reopened and re-approved 2026-11-04 for the third build plan, so it leads with the
// approved pitch and offers Ask Envoi first). It reads no database. It reads the environment only to
// offer Ask Envoi while the assistant is on, as /buy does (S25), because /buy/ask answers 404 when it
// is off.

import { assistantEnabled } from "@/integrations/ai/openai";

const SOURCE_URL = "https://github.com/jaydonnnk/envoi";
const EVIDENCE_URL = "https://github.com/jaydonnnk/envoi/blob/main/docs/plans/envoi/evidence-pack.md";

const STEPS = [
  { title: "Scan", text: "The shop's QR opens that shop. It is never a payment code." },
  { title: "Ask", text: "AI explains the menu and builds your order." },
  { title: "Approve", text: "You see the exact total and who gets paid, then approve in PayPal." },
];

export const dynamic = "force-dynamic";

export default function Home() {
  const askEnabled = assistantEnabled();
  return (
    <main id="main" className="landing">
      <div className="landing-hero">
        <h1>Japanese, Spanish or Malay. One scan. PayPal.</h1>
        <p className="lead">
          Scan the shop&apos;s QR, say what you want in Japanese, Spanish or Malay, and approve the exact amount in PayPal. AI reads the menu with you. It never sets a price and never pays.
        </p>
        <div className="actions">
          {askEnabled && (
            <a className="button" href="/buy/ask">
              Ask Envoi
            </a>
          )}
          <a className={askEnabled ? "button secondary" : "button"} href="/buy">
            Find a shop
          </a>
          <a className="button secondary" href="/merchant/setup">
            I run a shop
          </a>
        </div>
      </div>
      <section className="card" aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <ol className="landing-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p className="muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <nav className="landing-links" aria-label="About this project">
        <a href={SOURCE_URL}>GitHub</a>
        <a href={EVIDENCE_URL}>Evidence</a>
      </nav>
    </main>
  );
}
