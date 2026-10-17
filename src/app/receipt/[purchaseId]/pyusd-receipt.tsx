// The PYUSD receipt copy (S16; Gate 2 step 6). A confirmed receipt says "Transferred and finalized on
// Solana devnet" with the signature, recipient and amount, and never that tokens are kept, settled
// or live money, or an SGD settlement. Every other state says plainly that it is not paid.

export type ReceiptStatus = { title: string; chip: string; tone: "ok" | "warn"; body: string };

export const PYUSD_PAID_LINE = "Transferred and finalized on Solana devnet";

export function pyusdReceiptStatus(state: string, reviewOpenUntil: string): ReceiptStatus {
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
        <div className="row stacked">
          <span className="muted">Recipient (shop&apos;s devnet PYUSD account)</span>
          <span className="mono">{pyusd.recipientTokenAccount}</span>
        </div>
      )}
      {paid && pyusd.signature && (
        <div className="row stacked">
          <span className="muted">Devnet transaction signature</span>
          <a className="mono" href={explorerTransactionUrl(pyusd.signature)} rel="noreferrer" target="_blank">
            {pyusd.signature}
          </a>
        </div>
      )}
    </>
  );
}
