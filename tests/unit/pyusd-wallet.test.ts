import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PyusdReceiptDetails, pyusdReceiptStatus } from "@/app/receipt/[purchaseId]/pyusd-receipt";
import { PyusdPayView } from "@/app/review/[purchaseId]/pyusd-pay";
import { buildPhantomBrowseLink } from "@/lib/wallet/phantom-browse";
import { choosePayMode, devnetWallets, oneShot, signAndSendOnce, type StandardAccount, type StandardWallet, type WalletRegistry } from "@/lib/wallet/standard";
import { fixtureKey } from "../support/fake-solana";

// S16, Gate 3 group "browser wallet handoff" (4 cases) and the standalone tests "phone without a
// wallet gets the Phantom link, not a pay button" and "PYUSD receipt says transferred and finalized
// on devnet". The browser wallet modules with a FIXTURE Wallet Standard registry; no database and
// no network. Screens at 390px and 1280px are checked in a real browser separately.

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const APP = "https://envoi.example.test";

type SendInput = { account: StandardAccount; chain: string; transaction: Uint8Array };

// FIXTURE: a Wallet Standard wallet whose sign-and-send resolves, rejects or throws as told.
function fakeWallet(input: { name: string; chains: string[]; features: string[]; outcome?: "resolve" | "reject" | "throw" }) {
  const sent: SendInput[] = [];
  const account = { address: fixtureKey(1), publicKey: new Uint8Array(32).fill(1), chains: input.chains, features: input.features } as unknown as StandardAccount;
  const features: Record<string, unknown> = {};
  if (input.features.includes("solana:signAndSendTransaction")) {
    features["solana:signAndSendTransaction"] = {
      version: "1.0.0",
      supportedTransactionVersions: [0],
      signAndSendTransaction: (...outputs: SendInput[]) => {
        sent.push(...outputs);
        if (input.outcome === "reject") return Promise.reject(new Error("FIXTURE: the buyer rejected"));
        if (input.outcome === "throw") throw new Error("FIXTURE: the wallet threw");
        return Promise.resolve([{ signature: new Uint8Array(64).fill(9) }]);
      },
    };
  }
  if (input.features.includes("solana:signMessage")) features["solana:signMessage"] = { version: "1.0.0", signMessage: async () => [] };
  const wallet = { version: "1.0.0", name: input.name, icon: "data:image/svg+xml;base64,", chains: input.chains, features, accounts: [account] } as unknown as StandardWallet;
  return { wallet, account, sent };
}

const registryOf = (wallets: StandardWallet[]): WalletRegistry => ({ get: () => wallets, on: () => () => {} });

const view = (props: Partial<Parameters<typeof PyusdPayView>[0]>) =>
  renderToStaticMarkup(
    PyusdPayView({
      mode: "pay",
      wallets: [],
      stage: { kind: "ready" },
      amount: "1.335807",
      validUntil: "11:05",
      phantomLink: buildPhantomBrowseLink(APP, "out_fixture", [{ menuItemId: "itm_fixture", quantity: 1 }]),
      receiptHref: "/receipt/pur_fixture",
      onPay: () => {},
      ...props,
    }),
  );

describe("browser wallet handoff", () => {
  it("wallet is asked for solana:devnet", async () => {
    const { wallet, account, sent } = fakeWallet({ name: "FIXTURE Phantom", chains: ["solana:devnet"], features: ["solana:signAndSendTransaction"] });
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    expect(await signAndSendOnce(oneShot(bytes), wallet, account)).toMatchObject({ kind: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.chain).toBe("solana:devnet");
    expect([...sent[0]!.transaction]).toEqual([...bytes]);
  });

  it("wallet without devnet sign-and-send is not offered", () => {
    const offered = fakeWallet({ name: "FIXTURE devnet wallet", chains: ["solana:mainnet", "solana:devnet"], features: ["solana:signAndSendTransaction"] }).wallet;
    const mainnetOnly = fakeWallet({ name: "FIXTURE mainnet wallet", chains: ["solana:mainnet"], features: ["solana:signAndSendTransaction"] }).wallet;
    const signOnly = fakeWallet({ name: "FIXTURE message wallet", chains: ["solana:devnet"], features: ["solana:signMessage"] }).wallet;
    expect(devnetWallets(registryOf([mainnetOnly, offered, signOnly]), "solana:signAndSendTransaction").map((wallet) => wallet.name)).toEqual(["FIXTURE devnet wallet"]);
  });

  it("Phantom link carries only public outlet and item ids", () => {
    const link = new URL(buildPhantomBrowseLink(APP, "out_fixture", [{ menuItemId: "itm_kopi", quantity: 2 }, { menuItemId: "itm_toast", quantity: 1 }]));
    expect(link.origin + link.pathname.slice(0, "/ul/browse/".length)).toBe("https://phantom.com/ul/browse/");
    expect([...link.searchParams.keys()]).toEqual(["ref"]);
    expect(link.searchParams.get("ref")).toBe(APP);
    const target = new URL(decodeURIComponent(link.pathname.slice("/ul/browse/".length)));
    expect(target.origin + target.pathname).toBe(`${APP}/buy`);
    expect([...target.searchParams.entries()]).toEqual([
      ["outlet", "out_fixture"],
      ["items", "itm_kopi:2,itm_toast:1"],
    ]);
  });

  it("the wallet is asked once per released transaction", async () => {
    for (const outcome of ["resolve", "reject", "throw"] as const) {
      const { wallet, account, sent } = fakeWallet({ name: "FIXTURE Phantom", chains: ["solana:devnet"], features: ["solana:signAndSendTransaction"], outcome });
      const holder = oneShot(new Uint8Array([7, 7, 7]));
      await signAndSendOnce(holder, wallet, account);
      expect(await signAndSendOnce(holder, wallet, account), outcome).toEqual({ kind: "checking", reason: "already_asked" });
      expect(sent, outcome).toHaveLength(1);
    }
    const page = view({ wallets: [fakeWallet({ name: "FIXTURE Phantom", chains: ["solana:devnet"], features: ["solana:signAndSendTransaction"] }).wallet], stage: { kind: "checking", detail: "The wallet did not confirm sending." } });
    expect(page).toContain("Checking payment");
    expect(page).not.toContain("<button");
  });
});

describe("PYUSD wallet and receipt standalone tests", () => {
  it("phone without a wallet gets the Phantom link, not a pay button", () => {
    const mode = choosePayMode({ userAgent: IPHONE, wallets: [] });
    const page = view({ mode, wallets: [] });
    expect(page).toContain(">Open in Phantom</a>");
    expect(page).toContain('href="https://phantom.com/ul/browse/');
    expect(page).not.toContain("<button");
    // Fixture self-check: a desktop with no wallet gets neither, and a wallet gets the pay button.
    expect(view({ mode: choosePayMode({ userAgent: DESKTOP, wallets: [] }) })).not.toContain("Open in Phantom");
    const wallet = fakeWallet({ name: "FIXTURE Phantom", chains: ["solana:devnet"], features: ["solana:signAndSendTransaction"] }).wallet;
    expect(view({ mode: choosePayMode({ userAgent: IPHONE, wallets: [wallet] }), wallets: [wallet] })).toContain("<button");
  });

  it("PYUSD receipt says transferred and finalized on devnet", () => {
    const signature = "5FXTRsignatureFixture1111111111111111111111111111111111111111111111111111111111111111";
    const recipient = fixtureKey(3);
    const status = pyusdReceiptStatus("paid", "11:05");
    const details = renderToStaticMarkup(PyusdReceiptDetails({ paid: true, pyusd: { amount: "1.335807", pyusdPerSgd: "0.742115", rateDate: "27 Oct 2026", recipientTokenAccount: recipient, signature } }));
    const copy = `${status.title} ${status.body} ${details}`;
    expect(status.body.startsWith("Transferred and finalized on Solana devnet.")).toBe(true);
    expect(details).toContain(">Transferred and finalized on Solana devnet<");
    expect(details).toContain(signature);
    expect(details).toContain(recipient);
    expect(details).toContain("1.335807 PYUSD");
    expect(copy).not.toMatch(/\bkept\b|\bkeeps\b|settled|settlement|received/i);
  });
});
