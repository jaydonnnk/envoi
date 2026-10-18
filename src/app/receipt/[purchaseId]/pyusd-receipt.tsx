// The PYUSD receipt copy (S16; Gate 2 step 6). A confirmed receipt says "Transferred and finalized on
// Solana devnet" with the signature, recipient and amount, and never that tokens are kept, settled
// or live money, or an SGD settlement. Every other state says plainly that it is not paid.

export type ReceiptStatus = { title: string; chip: string; tone: "ok" | "warn"; body: string };

export const PYUSD_PAID_LINE = "Transferred and finalized on Solana devnet";

// S17: how a PYUSD attempt ended, for the receipt of a purchase that is not paid.
export type PyusdClosure = { attemptState: string | null; closedBy: "operator" | "release" | null };

export function pyusdReceiptStatus(state: string, reviewOpenUntil: string, closure: PyusdClosure = { attemptState: null, closedBy: null }): ReceiptStatus {
  if (state === "uncertain" && closure.attemptState === "held_no_match") {
    return {
      title: "Checking payment",
      chip: "Not confirmed",
      tone: "warn",
      body: "Envoi checked every devnet transaction that could carry this payment and found no matching transfer, but it does not close a payment as unpaid on its own yet. Do not pay again; it is flagged for the operator.",
    };
  }
  if (state === "unpaid_closed" && closure.closedBy === "operator") {
    return {
      title: "Not paid",
      chip: "Not paid",
      tone: "warn",
      body: "A devnet transaction for this purchase did not match it, so it was never shown as paid. The Envoi operator reviewed it and closed this purchase as unpaid, with recorded evidence. Anything that reached the shop is settled with the shop outside Envoi.",
    };
  }
  if (state === "unpaid_closed" && closure.closedBy === "release") {
    return {
      title: "Not paid",
      chip: "Not paid",
      tone: "warn",
      body: "Envoi checked every devnet transaction that could carry this payment and found none, so it closed this purchase as unpaid. Nothing was charged.",
    };
  }
  switch (state) {
    case "paid":
      return {
        title: "Paid",
        chip: "Paid",
        tone: "ok",
        body: `${PYUSD_PAID_LINE}. PYUSD devnet test tokens only: they have no value, and this is not an SGD payment.`,
      };
    case "pending_payment":
      return {
        title: "Checking payment",
        chip: "Not confirmed",
        tone: "warn",
        body: "Your wallet may have sent this transfer. Envoi shows it as paid only after it verifies a finalized devnet transaction, so do not pay again. Check status reads Solana devnet.",
      };
    case "uncertain":
      return {
        title: "Checking payment",
        chip: "Not confirmed",
        tone: "warn",
        body: "A devnet transaction for this purchase did not match it exactly, so it is not shown as paid. Do not pay again; it is flagged for the operator.",
      };
    case "review_open":
      return { title: "Not paid", chip: "Not paid", tone: "warn", body: `No payment has started. This review stays open until ${reviewOpenUntil} Singapore time.` };
    default:
      return { title: "Not paid", chip: "Not paid", tone: "warn", body: "This review closed before any payment started. Nothing was charged." };
  }
}

export type PyusdReceipt = {
  amount: string; // exact six-place PYUSD
  pyusdPerSgd: string;
  rateDate: string;
  recipientTokenAccount: string | null;
  signature: string | null; // only once paid
};

export function explorerTransactionUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export function PyusdReceiptDetails({ pyusd, paid }: { pyusd: PyusdReceipt; paid: boolean }) {
  return (
    <>
      <div className="row">
        <span className="muted">Method</span>
        <span>PYUSD on Solana devnet, test tokens</span>
      </div>
      {paid && pyusd.signature && (
        <div className="row stacked">
          <span className="muted">Status</span>
          <span>{PYUSD_PAID_LINE}</span>
        </div>
      )}
      <div className="row">
        <span className="muted">{paid ? "Amount transferred" : "Amount reviewed"}</span>
        <span className="money">{pyusd.amount} PYUSD</span>
      </div>
      <div className="row stacked">
        <span className="muted">Shop&apos;s rate</span>
        <span>
          {pyusd.pyusdPerSgd} PYUSD per S$1, set on {pyusd.rateDate}
        </span>
      </div>
      {pyusd.recipientTokenAccount && (
        <div className="row address">
          <span className="muted">Recipient (shop&apos;s devnet PYUSD account)</span>
          <span className="mono">{pyusd.recipientTokenAccount}</span>
        </div>
      )}
      {paid && pyusd.signature && (
        <div className="row address">
          <span className="muted">Devnet transaction signature</span>
          <a className="mono" href={explorerTransactionUrl(pyusd.signature)} rel="noreferrer" target="_blank">
            {pyusd.signature}
          </a>
        </div>
      )}
    </>
  );
}

// S17, Gate 2 fix M: an extra transfer is a separate status beside the receipt's payment state. It
// says what was detected and who arranges any refund, and never that anything was refunded.
export type PyusdExtraTransferView = { signature: string; amount: string | null };

export function extraTransferLine(transfer: PyusdExtraTransferView): string {
  const amount = transfer.amount === null ? "of an unknown amount" : `of ${transfer.amount} PYUSD`;
  return `An extra transfer ${amount} carrying this purchase's reference was detected on Solana devnet. It does not change the status above. Any refund is arranged with the shop outside Envoi.`;
}

export function PyusdExtraTransfers({ transfers }: { transfers: readonly PyusdExtraTransferView[] }) {
  if (transfers.length === 0) return null;
  return (
    <section className="card extra-transfers" aria-labelledby="extra-transfer-heading">
      <h2 id="extra-transfer-heading">{transfers.length === 1 ? "Extra transfer detected" : `${transfers.length} extra transfers detected`}</h2>
      {transfers.map((transfer) => (
        <div className="row address" key={transfer.signature}>
          <span>{extraTransferLine(transfer)}</span>
          <a className="mono" href={explorerTransactionUrl(transfer.signature)} rel="noreferrer" target="_blank">
            {transfer.signature}
          </a>
        </div>
      ))}
      <p className="fine muted">Devnet test tokens only. Envoi cannot move tokens, so it does not return them itself.</p>
    </section>
  );
}
