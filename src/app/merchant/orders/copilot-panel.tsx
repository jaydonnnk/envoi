"use client";

import { useRef, useState, type FormEvent } from "react";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import { formatMoney, money, type Currency } from "@/lib/money";
import type { MerchantOrder } from "@/domain/purchases/orders";
import { orderTime } from "./orders-grid";

// The merchant copilot (S45; Gate 1 mockup merchant-copilot.html). Shown only for the labeled demo
// shop. The conversation lives in this page only: the server stores no message. A refund proposal
// is a card here, and only the member's tap on Confirm calls the refund route; the model cannot.

const MAX_TEXT = 300;
const MAX_TURNS = 8;

type Turn = { role: "merchant" | "copilot"; text: string };
type Step = { operation: string; status: number | null; ms: number };
type Proposal = { orderId: string; amountMinor: number; currency: Currency };
type Answer = { reply: string; steps: Step[]; refund: Proposal | null };
type RefundAnswer = { refund: { state: "sent" | "completed" | "failed" | "checking"; paypalRefundId: string | null } };

const LABELS: Record<string, string> = {
  list_orders: "Envoi order records",
  get_order: "PayPal order record",
  list_transactions: "PayPal transactions",
  list_disputes: "PayPal disputes",
  get_dispute: "PayPal dispute",
  propose_refund: "Refund check",
};

// What each call did, from its own operation and status, never from the model's words.
function stepNote(step: Step): string {
  if (step.operation === "propose_refund") return step.status === 200 ? "checked, nothing sent" : "refused, nothing sent";
  if (step.status === null) return "not read";
  return step.status >= 200 && step.status < 300 ? "read" : `refused (${step.status})`;
}

const REFUND_RESULT: Record<RefundAnswer["refund"]["state"], string> = {
  completed: "Refund completed in PayPal sandbox. The order stays recorded as Paid, with this refund beside it.",
  sent: "Refund sent to PayPal sandbox. It is not completed yet.",
  checking: "PayPal's answer did not arrive. Confirm again to check: the same request is resent, so the customer is never refunded twice.",
  failed: "PayPal refused this refund, so no money went back.",
};

export function CopilotPanel({ outletId, orders, onRefunded }: { outletId: string; orders: readonly MerchantOrder[]; onRefunded: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useRestoreFocus(busy || refunding);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const message = text.trim().slice(0, MAX_TEXT);
    if (message === "" || busy) return;
    const next: Turn[] = [...turns, { role: "merchant", text: message }];
    setTurns(next);
    setText("");
    setBusy(true);
    setError(null);
    setProposal(null);
    setRefundResult(null);
    const history = next.slice(-MAX_TURNS).map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_TEXT) }));
    const result = await requestJson<Answer>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/copilot`, { turns: history });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The copilot could not answer. Nothing was sent.");
      return;
    }
    const answer = result.data;
    setTurns((current) => [...current, { role: "copilot", text: answer.reply }]);
    setSteps(answer.steps);
    setProposal(answer.refund);
  }

  async function confirmRefund() {
    if (!proposal) return;
    setRefunding(true);
    setError(null);
    const result = await requestJson<RefundAnswer>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/orders/${encodeURIComponent(proposal.orderId)}/refund`);
    setRefunding(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "Envoi could not send the refund. Nothing changed; try again.");
      return;
    }
    setRefundResult(REFUND_RESULT[result.data.refund.state]);
    if (result.data.refund.state !== "checking") setProposal(null);
    onRefunded();
  }

  function notNow() {
    setProposal(null);
    inputRef.current?.focus();
  }

  const proposed = proposal ? orders.find((order) => order.id === proposal.orderId) : undefined;

  return (
    <section className="copilot" aria-labelledby={`copilot-${outletId}`}>
      <h3 id={`copilot-${outletId}`}>Ask about your payments</h3>
      <p className="muted copilot-lead">It reads your sandbox PayPal records and answers. It can suggest a refund. It cannot send one, and it cannot take a payment.</p>
      <div className="layout copilot-layout">
        <section className="card chat" aria-label="Conversation">
          {turns.map((turn, index) => (
            <div key={index} className={`bubble ${turn.role === "merchant" ? "me" : "bot"}`}>
              {turn.text}
            </div>
          ))}
          {busy && <div className="bubble bot muted">Checking your records…</div>}
          {proposal && (
            <div className="card warning refund-card" role="group" aria-labelledby={`refund-${outletId}`}>
              <h3 id={`refund-${outletId}`}>Refund {formatMoney(money(proposal.currency, proposal.amountMinor))} to the customer?</h3>
              <p>{proposed ? `Order of ${orderTime(proposed.createdAt)}, capture on PayPal sandbox.` : "Capture on PayPal sandbox."} Test money. The order stays recorded as Paid, with this refund beside it.</p>
              <div className="actions">
                <button className="button" type="button" onClick={confirmRefund} disabled={refunding}>
                  {refunding ? "Sending refund" : "Confirm refund"}
                </button>
                <button className="button secondary" type="button" onClick={notNow} disabled={refunding}>
                  Not now
                </button>
              </div>
            </div>
          )}
          <div aria-live="polite">{refundResult && <p className="status ok">{refundResult}</p>}</div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={ask}>
            <label htmlFor={`copilot-message-${outletId}`}>Message</label>
            <textarea
              id={`copilot-message-${outletId}`}
              ref={inputRef}
              value={text}
              maxLength={MAX_TEXT}
              placeholder="For example: what did I earn this week?"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="actions">
              <button className="button" type="submit" disabled={busy || text.trim() === ""}>
                {busy ? "Asking" : "Ask"}
              </button>
            </div>
          </form>
        </section>
        <aside className="card" aria-labelledby={`checked-${outletId}`}>
          <h3 id={`checked-${outletId}`}>What it checked</h3>
          {steps.length === 0 ? (
            <p className="muted">Nothing yet. Each record it reads is listed here.</p>
          ) : (
            steps.map((step, index) => (
              <div className="call" key={index}>
                <code>{LABELS[step.operation] ?? step.operation}</code>
                <small>{stepNote(step)}</small>
              </div>
            ))
          )}
          <ul className="ask-rules">
            <li>It sees only your shop&apos;s orders.</li>
            <li>Every amount comes from PayPal or Envoi&apos;s records.</li>
            <li>Only you can confirm a refund.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
