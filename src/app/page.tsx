// The landing page at the site's root address (Gate 1, reopened and re-approved 2026-10-21; S15
// amendment). Static: it reads nothing and calls nothing.

const SOURCE_URL = "https://github.com/jaydonnnk/envoi";
const EVIDENCE_URL = "https://github.com/jaydonnnk/envoi/blob/main/docs/plans/envoi/evidence-pack.md";

const STEPS = [
  { title: "Find", text: "Type what you want or scan the sticker." },
  { title: "Check", text: "See the exact total and who gets paid." },
  { title: "Pay", text: "Approve in PayPal or your wallet." },
];

export default function Home() {
  return (
    <main id="main" className="landing">
      <div className="landing-hero">
        <h1>Pay the shop with what you already have.</h1>
        <p className="lead">PayPal or PYUSD. Straight to the shop.</p>
        <div className="actions">
          <a className="button" href="/buy">
            Find a shop
          </a>
          <a className="button secondary" href="/merchant/setup">
            I run a shop
          </a>
        </div>
      </div>
      <ol className="landing-steps">
        {STEPS.map((step) => (
          <li className="card" key={step.title}>
            <h2>{step.title}</h2>
            <p className="muted">{step.text}</p>
          </li>
        ))}
      </ol>
      <nav className="landing-links" aria-label="About this project">
        <a href={SOURCE_URL}>GitHub</a>
        <a href={EVIDENCE_URL}>Evidence</a>
      </nav>
    </main>
  );
}
