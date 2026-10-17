"use client";

import { getBase64Encoder } from "@solana/kit";
import { useEffect, useState } from "react";
import type { MerchantOutlet } from "@/domain/outlets/merchant";
import { requestJson } from "@/lib/browser/session";
import { browserWalletRegistry, connectDevnetAccount, devnetWallets, signMessageOnce, type StandardWallet } from "@/lib/wallet/standard";

// The shop's PYUSD devnet wallet and rate (S16; Gate 3 call stack "PYUSD merchant wallet and rate").
// The merchant asks for a five-minute challenge, has the wallet sign exactly those bytes, and sends
// only the challenge id and the signature: the server takes the wallet from the saved challenge and
// derives the receiving account. That proves key control and nothing else. The rate is the shop's
// own PYUSD per S$1, shown with the date it was set; after 30 days without re-confirming, PYUSD is
// unavailable at this shop while PayPal is unaffected.

type Saved = { outlet: MerchantOutlet };

const SINGAPORE_DATE = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" });

export function PyusdWalletCard({ outlet, onSaved }: { outlet: MerchantOutlet; onSaved: (saved: Saved) => void }) {
  const { pyusd } = outlet;
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(pyusd.rate?.pyusdPerSgd ?? "");

  useEffect(() => {
    const registry = browserWalletRegistry();
    const refresh = () => setWallets(devnetWallets(registry, "solana:signMessage"));
    refresh();
    // Extensions can register after the page loads.
    return registry.on("register", refresh);
  }, []);

  async function prove(wallet: StandardWallet) {
    setError(null);
    setBusy("Connecting to your wallet…");
    try {
      const account = await connectDevnetAccount(wallet);
      if (!account) throw new Error("The wallet did not connect.");
      const challenge = await requestJson<{ challengeId: string; messageBase64: string }>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}/destinations/pyusd/challenge`, {
        walletAddress: account.address,
      });
      if (!challenge.ok || !challenge.data) throw new Error(challenge.error?.message ?? "A wallet challenge could not be created.");
      setBusy("Sign the message in your wallet…");
      const signature = await signMessageOnce(wallet, account, new Uint8Array(getBase64Encoder().encode(challenge.data.messageBase64)));
      setBusy("Checking the signature and the devnet account…");
      const proof = await requestJson<Saved>("PUT", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}/destinations/pyusd`, {
        challengeId: challenge.data.challengeId,
        signature,
      });
      if (!proof.ok || !proof.data) throw new Error(proof.error?.message ?? "The wallet could not be verified.");
      onSaved(proof.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet could not be verified. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy("Saving the rate…");
    const result = await requestJson<Saved>("PUT", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}/pyusd-rate`, { pyusdPerSgd: rate.trim() });
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The rate could not be saved. Try again.");
      return;
    }
    onSaved(result.data);
  }

  return (
    <section className="card" aria-labelledby="pyusd-heading">
      <div className="rail-head wrap">
        <h2 id="pyusd-heading">PYUSD on Solana devnet (optional)</h2>
        <span className="chip warn">Devnet: test tokens only</span>
      </div>
      {!pyusd.enabled && (
        <div className="status">
          <strong>PYUSD is switched off in this test environment</strong>
          <small>Buyers see PYUSD as unavailable and pay with PayPal. Your wallet and rate below stay saved.</small>
        </div>
      )}
      <p className="muted">
        Buyers who hold PYUSD pay your own devnet wallet directly; Envoi never holds the tokens or any key. You receive PYUSD in your wallet, not SGD, at the rate you set here.
      </p>

      <h3>Wallet</h3>
      {pyusd.wallet ? (
        <div className="status ok">
          <strong className="mono">{pyusd.wallet.address}</strong>
          <small>
            Key control verified on {SINGAPORE_DATE.format(new Date(pyusd.wallet.verifiedAt))}. Payments go to its PYUSD devnet account <span className="mono">{pyusd.wallet.tokenAccount}</span>.
          </small>
        </div>
      ) : (
        <p className="muted">No wallet yet. The wallet needs a PYUSD devnet account: receive any amount of devnet PYUSD to it first.</p>
      )}
      {pyusd.enabled &&
        (wallets.length === 0 ? (
          <p className="muted">No Solana devnet wallet found in this browser. Install Phantom, turn on Testnet Mode, choose Solana Devnet and reload.</p>
        ) : (
          <div className="actions wallet-actions">
            {wallets.map((wallet) => (
              <button className="button secondary" type="button" key={wallet.name} onClick={() => void prove(wallet)} disabled={busy !== null}>
                {pyusd.wallet ? `Connect another wallet with ${wallet.name}` : `Connect ${wallet.name} by signing a message`}
              </button>
            ))}
          </div>
        ))}

      <h3>Rate</h3>
      {pyusd.rate ? (
        <div className={`status${pyusd.rate.expired ? "" : " ok"}`}>
          <strong>{pyusd.rate.pyusdPerSgd} PYUSD per S$1</strong>
          <small>
            Set on {SINGAPORE_DATE.format(new Date(pyusd.rate.confirmedAt))}.{" "}
            {pyusd.rate.expired ? "More than 30 days old: PYUSD is unavailable here until you confirm it again." : "Confirm it again within 30 days to keep PYUSD available."}
          </small>
        </div>
      ) : (
        <p className="muted">No rate yet. Buyers cannot pick PYUSD until you set one.</p>
      )}
      {pyusd.enabled && (
        <form className="actions" onSubmit={(event) => void saveRate(event)}>
          <label>
            PYUSD per S$1
            <input name="pyusdPerSgd" inputMode="decimal" autoComplete="off" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="0.742115" />
          </label>
          <button className="button" type="submit" disabled={busy !== null || rate.trim() === ""}>
            {pyusd.rate && rate.trim() === pyusd.rate.pyusdPerSgd ? "Confirm this rate today" : "Save rate"}
          </button>
        </form>
      )}
      {busy && (
        <p className="muted" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
