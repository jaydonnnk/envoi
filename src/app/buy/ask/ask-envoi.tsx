"use client";

import { useRef, useState } from "react";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

const MAX_TEXT = 280;
// The browser sends at most the last 8 turns (Gate 2 second build plan amendment).
const MAX_TURNS = 8;
// The server answers within the agent's 60-second turn budget plus its own reads. A dropped
// connection can leave the request open with no answer, so the page gives up after 75 seconds.
const CLIENT_TIMEOUT_MS = 75_000;

type Turn = { role: "buyer" | "assistant"; text: string };
type Step = { operation: "listOutlets" | "getOutletMenu" | "createPurchaseRequest"; status: number | null; outletId: string | null; itemIds: string[]; expiresAt: string | null; ms: number };
type Answer = { reply: string; steps: Step[]; link: { url: string; expiresAt: string } | null };

// What each generated-client call did, written from the call's own operation and status, never from
// the model's words.
function stepSummary(step: Step): string {
  if (step.status === null) return "No answer from Envoi's API.";
  const ok = step.status >= 200 && step.status < 300;
  if (step.operation === "listOutlets") return ok ? "Read the shops published on Envoi." : `Envoi's API refused the call (${step.status}).`;
  if (step.operation === "getOutletMenu") return ok ? "Read this shop's published menu." : step.status === 404 ? "That shop is not published on Envoi." : `Envoi's API refused the call (${step.status}).`;
  return ok
    ? `Asked Envoi for a one-time review of ${step.itemIds.length === 1 ? "1 item" : `${step.itemIds.length} items`}. The assistant sent no price.`
    : `Envoi refused the review request (${step.status}).`;
}

// The turns the server accepts: text only, at most the last 8, each cut to 280 characters. The buyer
// still sees every reply in full; an empty one is left out of the history.
function history(turns: Turn[]): Turn[] {
  return turns
    .filter((turn) => turn.text.trim().length > 0)
    .slice(-MAX_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_TEXT) }));
}

export function AskEnvoi() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [link, setLink] = useState<Answer["link"]>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const message = useRef<HTMLTextAreaElement>(null);
  useRestoreFocus(busy);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const said = text.trim();
    if (said.length === 0) return;
    const next = [...turns, { role: "buyer" as const, text: said }];
    setTurns(next);
    setText("");
    setBusy(true);
    setFailure(null);
    setLink(null);
    try {
      await ensureBuyerSession();
      const result = await postJson<Answer>("/api/v1/buyer/assistant", { turns: history(next) }, AbortSignal.timeout(CLIENT_TIMEOUT_MS));
      if (!result.ok || !result.data) {
        setFailure(result.error?.message ?? "Ask Envoi is not available right now. Pick a shop from the list instead.");
        return;
      }
      const answer = result.data;
      setSteps(answer.steps);
      setLink(answer.link);
      setTurns([...next, { role: "assistant", text: answer.reply }]);
    } catch (err) {
      setFailure(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Ask Envoi took too long. No review was created. Pick a shop from the list instead."
          : "Ask Envoi is not available right now. Pick a shop from the list instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeBasket() {
    setLink(null);
    message.current?.focus();
  }

  return (
    <div className="layout">
      <section className="card" aria-labelledby="conversation-heading">
        <h2 id="conversation-heading">Conversation</h2>
        <div className="chat" aria-live="polite">
          {turns.map((turn, index) => (
            <div key={index} className={`bubble ${turn.role === "buyer" ? "me" : "bot"}`}>
              {turn.text}
            </div>
          ))}
          {busy && <div className="bubble bot muted">Reading Envoi…</div>}
        </div>
        {link && (
          <div className="actions">
            <a className="button" href={link.url}>
              Review and pay
            </a>
            <button type="button" className="button secondary" onClick={changeBasket}>
              Change the basket
            </button>
          </div>
        )}
        {failure && (
          <div className="status" role="alert">
            <strong>Pick a shop instead</strong>
            <small>
              {failure} <a href="/buy">See all shops</a>
            </small>
          </div>
        )}
        <form onSubmit={submit}>
          <label htmlFor="ask">Message</label>
          <textarea
            id="ask"
            ref={message}
            value={text}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder="For example: one Kopi C and a kaya toast at Lorong Demo Kopi"
            onChange={(event) => setText(event.target.value)}
          />
          <button className="button full" type="submit" disabled={busy || text.trim().length === 0}>
            {busy ? "Asking…" : "Send"}
          </button>
        </form>
        <p className="muted fine">The menu prices above are a guide. The review shows Envoi&apos;s own price, and you approve the payment in PayPal sandbox yourself.</p>
      </section>
      <aside className="card tint" aria-labelledby="steps-heading">
        <h2 id="steps-heading">What the assistant did</h2>
        <p className="muted">Each step is a call to Envoi&apos;s published API, made through the client APIMatic generated from it.</p>
        {steps.length === 0 && <p className="muted fine">No calls yet in this turn.</p>}
        {steps.map((step, index) => (
          <div className="call" key={index}>
            <span className="call-head">
              <code>{step.operation}</code>
              <span className={`chip ${step.status !== null && step.status < 300 ? "ok" : "warn"}`}>{step.status ?? "no answer"}</span>
            </span>
            <small>{stepSummary(step)}</small>
          </div>
        ))}
        <ol className="ask-rules">
          <li>The assistant cannot pay, approve or read your receipt.</li>
          <li>Only published, available items can enter the basket.</li>
          <li>If the assistant fails or times out, the shop list and menu stay available.</li>
        </ol>
      </aside>
    </div>
  );
}
