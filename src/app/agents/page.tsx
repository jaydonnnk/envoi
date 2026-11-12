import type { Metadata } from "next";

// Bring your own assistant (S37; Gate 1 third build plan). A public page that reads no database and
// no environment, so it has no way to hold a token value. A judge's token reaches them only through
// the submission form (test 48).
export const metadata: Metadata = { title: "Bring your own assistant | Envoi" };

const MCP_URL = "https://envoi-helx.onrender.com/mcp";

export default function AgentsPage() {
  return (
    <main id="main">
      <span className="eyebrow">Agents</span>
      <h1>Bring your own assistant</h1>
      <p className="lead">Connect an AI assistant to Envoi. It can find shops, read menus and hand you a one-time link. It cannot pay, approve or read your receipt.</p>
      <section className="card">
        <h2>Connect</h2>
        <ol className="steps">
          <li>
            Add this MCP server to your assistant: <code>{MCP_URL}</code>
          </li>
          <li>Use your test token as the bearer token. Judges: it is in the submission form.</li>
          <li>Ask: &quot;Two Kopi O at Lorong Demo Kopi.&quot;</li>
          <li>Open the link it gives you, check the price and approve in PayPal sandbox yourself.</li>
        </ol>
        <p className="muted">Test environment. Demo fixture shops and test money only.</p>
      </section>
    </main>
  );
}
