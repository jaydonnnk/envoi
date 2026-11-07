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
type Answer = { reply: string; steps: Step[]; link: { url: string; expiresAt: string } | null; offer: boolean };

// S34: the accept button. Tapping it sends this text as the visitor's own turn; typing yes works too.
export const ACCEPT_TEXT = "Yes, make the basket";

export function AcceptOffer({ offer, busy, onAccept }: { offer: boolean; busy: boolean; onAccept: () => void }) {
  if (!offer) return null;
  return (
    <div className="actions">
      <button type="button" className="button" disabled={busy} onClick={onAccept}>
        {ACCEPT_TEXT}
      </button>
    </div>
  );
}

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

// S33: the one published shop this conversation is about. Only its id goes back to the server; the
// name and example item are the page's own display text.
type AskShop = { id: string; name: string; example?: string };

export function AskEnvoi({ shop }: { shop?: AskShop }) {
  const fallback = shop ? "Choose from this shop's menu instead." : "Pick a shop from the list instead.";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [link, setLink] = useState<Answer["link"]>(null);
  const [offer, setOffer] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const message = useRef<HTMLTextAreaElement>(null);
  useRestoreFocus(busy);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const said = text.trim();
    if (said.length === 0) return;
    setText("");
    void send(said);
  }

  async function send(said: string) {
    const next = [...turns, { role: "buyer" as const, text: said }];
    setTurns(next);
    setBusy(true);
    setFailure(null);
    setLink(null);
    setOffer(false);
    try {
      await ensureBuyerSession();
      const result = await postJson<Answer>("/api/v1/buyer/assistant", { turns: history(next), ...(shop ? { outletId: shop.id } : {}) }, AbortSignal.timeout(CLIENT_TIMEOUT_MS));
      if (!result.ok || !result.data) {
        setFailure(result.error?.message ?? `Ask Envoi is not available right now. ${fallback}`);
        return;
      }
      const answer = result.data;
      setSteps(answer.steps);
      setLink(answer.link);
      setOffer(answer.offer);
      setTurns([...next, { role: "assistant", text: answer.reply }]);
    } catch (err) {
      setFailure(
        err instanceof DOMException && err.name === "TimeoutError"
          ? `Ask Envoi took too long. No review was created. ${fallback}`
          : `Ask Envoi is not available right now. ${fallback}`,
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
    <section className="card" aria-label="Conversation">
      <div className="chat" aria-live="polite">
        {turns.map((turn, index) => (
          <div key={index} className={`bubble ${turn.role === "buyer" ? "me" : "bot"}`}>
            {turn.text}
          </div>
        ))}
        {busy && <div className="bubble bot muted">Reading Envoi…</div>}
      </div>
      <AcceptOffer offer={offer} busy={busy} onAccept={() => void send(ACCEPT_TEXT)} />
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
          <strong>{shop ? "Use the menu instead" : "Pick a shop instead"}</strong>
          <small>
            {failure} {shop ? <a href={`/buy?${new URLSearchParams({ outlet: shop.id }).toString()}`}>See this shop&apos;s menu</a> : <a href="/buy">See all shops</a>}
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
          placeholder="For example: one Kopi O and a kaya toast set at Lorong Demo Kopi"
          {...(shop ? { placeholder: shop.example ? `For example: one ${shop.example}` : `What would you like from ${shop.name}?` } : {})}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="button full" type="submit" disabled={busy || text.trim().length === 0}>
          {busy ? "Asking…" : "Send"}
        </button>
      </form>
      <p className="muted fine">The menu prices above are a guide. The review shows Envoi&apos;s own price, and you approve the payment in PayPal sandbox yourself.</p>
      {/* S44: the calls behind the answer stay readable, closed, under one plain summary. */}
      <details className="ask-checked">
        <summary>How this was checked</summary>
        <p>Each step reads the shop&apos;s published menu. The assistant cannot pay, approve or read your receipt.</p>
        <p className="muted">Each step is a call to Envoi&apos;s published API, made through Envoi&apos;s own MCP server with the official MCP client.</p>
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
          <li>Only published, available items can enter the basket.</li>
          <li>If the assistant fails or times out, the shop list and menu stay available.</li>
        </ol>
      </details>
    </section>
  );
}
