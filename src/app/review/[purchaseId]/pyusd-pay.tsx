"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/browser/session";
import { buildPhantomBrowseLink, type BrowseLine } from "@/lib/wallet/phantom-browse";
import {
  browserWalletRegistry,
  choosePayMode,
  connectDevnetAccount,
  devnetWallets,
  oneShot,
  signAndSendOnce,
  type PayMode,
  type StandardWallet,
} from "@/lib/wallet/standard";

// Pays a PYUSD review from a devnet wallet (S16; Gate 3 call stack "PYUSD purchase"). The server
// prepares and locks the attempt and returns the unsigned transfer once; the exact bytes go to the
// wallet once through a one-shot holder, and the signature it returns is posted as a hint. After a
// wallet error, a rejection or a lost response the page shows "checking payment" and never asks the
// wallet again. A phone with no wallet gets the Phantom link and never a pay button.

type Stage = { kind: "ready" } | { kind: "working"; step: string } | { kind: "checking"; detail: string } | { kind: "error"; message: string };

export type PyusdPayProps = {
  purchaseId: string;
  outletId: string;
  lines: BrowseLine[];
  appBaseUrl: string;
  amount: string;
  validUntil: string;
  // Rendering without a browser (tests, and the first paint) can pass what the browser would report.
  environment?: { userAgent: string; wallets: StandardWallet[] };
};

export function PyusdPayView({
  mode,
  wallets,
  stage,
  amount,
  validUntil,
  phantomLink,
  receiptHref,
  onPay,
}: {
  mode: PayMode | "discovering";
  wallets: StandardWallet[];
  stage: Stage;
  amount: string;
  validUntil: string;
  phantomLink: string;
  receiptHref: string;
  onPay: (wallet: StandardWallet) => void;
}) {
  if (stage.kind === "checking") {
    return (
      <section className="card warning" aria-labelledby="pyusd-heading">
        <h2 id="pyusd-heading">Checking payment</h2>
        <p role="status">{stage.detail} Do not pay again.</p>
        <div className="actions">
          <a className="button" href={receiptHref}>
            See the receipt
          </a>
        </div>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="pyusd-heading">
      <h2 id="pyusd-heading">Pay with a devnet wallet</h2>
      <p className="muted">
        Your wallet asks you once to approve exactly {amount} PYUSD devnet test tokens to the shop&apos;s devnet account. This review is valid until {validUntil} Singapore time.
      </p>
      {mode === "discovering" && <p className="muted">Looking for a Solana devnet wallet in this browser…</p>}
      {mode === "phantom_link" && (
        <>
          <p className="muted">No wallet is available in this browser. Open this basket in Phantom&apos;s own browser and review it there.</p>
          <a className="button full" href={phantomLink}>
            Open in Phantom
          </a>
        </>
      )}
      {mode === "need_wallet" && (
        <p className="muted">
          No Solana devnet wallet was found in this browser. Install Phantom, turn on Testnet Mode and choose Solana Devnet, then reload this page.
        </p>
      )}
      {mode === "pay" &&
        wallets.map((wallet) => (
          <button className="button full" type="button" key={wallet.name} onClick={() => onPay(wallet)} disabled={stage.kind === "working"}>
            {stage.kind === "working" ? stage.step : `Pay ${amount} PYUSD with ${wallet.name}`}
          </button>
        ))}
      {stage.kind === "error" && (
        <p className="error" role="alert">
          {stage.message}
        </p>
      )}
    </section>
  );
}

export function PyusdPay({ purchaseId, outletId, lines, appBaseUrl, amount, validUntil, environment }: PyusdPayProps) {
  const router = useRouter();
  const initial = environment ? { mode: choosePayMode(environment), wallets: environment.wallets } : null;
  const [mode, setMode] = useState<PayMode | "discovering">(initial?.mode ?? "discovering");
  const [wallets, setWallets] = useState<StandardWallet[]>(initial?.wallets ?? []);
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  // Set once the server released the bytes: from then on this page never offers payment again.
  const released = useRef(false);
  const receiptHref = `/receipt/${encodeURIComponent(purchaseId)}`;

  useEffect(() => {
    if (environment) return;
    const registry = browserWalletRegistry();
    const refresh = () => {
      const found = devnetWallets(registry, "solana:signAndSendTransaction");
      setWallets(found);
      setMode(choosePayMode({ userAgent: navigator.userAgent, wallets: found }));
    };
    refresh();
    // Extensions can register after the page loads.
    const off = registry.on("register", refresh);
    return off;
  }, [environment]);

  async function pay(wallet: StandardWallet) {
    if (released.current) return;
    setStage({ kind: "working", step: "Connecting to your wallet…" });
    let account;
    try {
      account = await connectDevnetAccount(wallet);
    } catch {
      account = null;
    }
    if (!account) {
      setStage({ kind: "error", message: "The wallet did not connect. Nothing was charged; try again." });
      return;
    }
    setStage({ kind: "working", step: "Preparing the transfer…" });
    const prepared = await postJson<{ attemptId: string; transactionBase64: string; chain: string }>(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/pyusd/prepare`, {
      walletAddress: account.address,
    }).catch(() => null);
    if (!prepared) {
      // The response was lost: the server may have saved and released an attempt.
      released.current = true;
      setStage({ kind: "checking", detail: "Envoi's answer did not arrive, so a transfer may have been prepared." });
      return;
    }
    if (!prepared.ok || !prepared.data) {
      if (prepared.error?.code === "wallet_attempt_locked") {
        released.current = true;
        setStage({ kind: "checking", detail: "This payment was already prepared." });
        return;
      }
      setStage({ kind: "error", message: prepared.error?.message ?? "PYUSD could not be prepared. Nothing was charged." });
      return;
    }
    released.current = true;
    const holder = oneShot(Uint8Array.from(atob(prepared.data.transactionBase64), (c) => c.charCodeAt(0)));
    setStage({ kind: "working", step: "Approve in your wallet…" });
    const sent = await signAndSendOnce(holder, wallet, account);
    if (sent.kind !== "sent") {
      setStage({ kind: "checking", detail: "The wallet did not confirm sending, but it may still have sent the transfer." });
      return;
    }
    setStage({ kind: "working", step: "Checking Solana devnet…" });
    await postJson(`/api/v1/purchases/${encodeURIComponent(purchaseId)}/pyusd/submitted`, { attemptId: prepared.data.attemptId, signature: sent.signature }).catch(() => null);
    router.push(receiptHref);
  }

  return (
    <PyusdPayView
      mode={mode}
      wallets={wallets}
      stage={stage}
      amount={amount}
      validUntil={validUntil}
      phantomLink={buildPhantomBrowseLink(appBaseUrl, outletId, lines)}
      receiptHref={receiptHref}
      onPay={(wallet) => void pay(wallet)}
    />
  );
}
