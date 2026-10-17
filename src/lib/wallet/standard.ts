import { getBase58Decoder } from "@solana/kit";
import { SolanaSignAndSendTransaction, SolanaSignMessage, type SolanaSignAndSendTransactionFeature, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import { getWallets, type Wallets } from "@wallet-standard/app";

// Browser-only Wallet Standard handling (Gate 3 "Browser wallet modules"; Gate 2 step 4). Only wallets
// that list solana:devnet and offer the needed feature are offered. The prepared transaction bytes
// are handed to the wallet once, through a one-shot holder (fix L): after that one call resolves,
// rejects or throws, the bytes are gone, the wallet is never asked again, and the page shows
// "checking payment" rather than offering a second payment.

export const DEVNET_CHAIN = "solana:devnet";

export type StandardWallet = ReturnType<Wallets["get"]>[number];
export type StandardAccount = StandardWallet["accounts"][number];
type WalletFeature = typeof SolanaSignAndSendTransaction | typeof SolanaSignMessage;

// The registry is injectable so a test can use a fake one; the browser uses getWallets().
export type WalletRegistry = Pick<Wallets, "get" | "on">;

export function devnetWallets(registry: WalletRegistry, feature: WalletFeature): StandardWallet[] {
  return registry.get().filter((wallet) => wallet.chains.includes(DEVNET_CHAIN) && feature in wallet.features);
}

export function browserWalletRegistry(): WalletRegistry {
  return getWallets();
}

type ConnectFeature = { "standard:connect": { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StandardAccount[] }> } };

// Asks the wallet to connect and returns its devnet account, if it lists one.
export async function connectDevnetAccount(wallet: StandardWallet): Promise<StandardAccount | null> {
  const connect = (wallet.features as Partial<ConnectFeature>)["standard:connect"];
  const accounts = connect ? (await connect.connect()).accounts : wallet.accounts;
  return accounts.find((account) => account.chains.includes(DEVNET_CHAIN)) ?? accounts[0] ?? null;
}

export type OneShotBytes = { take(): Uint8Array | null };

// Gives its bytes to exactly one caller and drops them.
export function oneShot(bytes: Uint8Array): OneShotBytes {
  let held: Uint8Array | null = bytes;
  return {
    take() {
      const out = held;
      held = null;
      return out;
    },
  };
}

export type SendOutcome = { kind: "sent"; signature: string } | { kind: "checking"; reason: "rejected_or_failed" | "already_asked" };

// One signAndSendTransaction call with the exact prepared bytes on devnet. Any rejection or error is
// "checking", never "canceled": the wallet may still have sent the transaction.
export async function signAndSendOnce(holder: OneShotBytes, wallet: StandardWallet, account: StandardAccount): Promise<SendOutcome> {
  const bytes = holder.take();
  if (!bytes) return { kind: "checking", reason: "already_asked" };
  const feature = (wallet.features as Partial<SolanaSignAndSendTransactionFeature>)[SolanaSignAndSendTransaction];
  if (!feature) return { kind: "checking", reason: "rejected_or_failed" };
  try {
    const [output] = await feature.signAndSendTransaction({ account, chain: DEVNET_CHAIN, transaction: bytes });
    if (!output || output.signature.length !== 64) return { kind: "checking", reason: "rejected_or_failed" };
    return { kind: "sent", signature: getBase58Decoder().decode(output.signature) };
  } catch {
    return { kind: "checking", reason: "rejected_or_failed" };
  }
}

// Has the wallet sign exactly these message bytes (the merchant's wallet challenge) and returns the
// signature in base58.
export async function signMessageOnce(wallet: StandardWallet, account: StandardAccount, message: Uint8Array): Promise<string> {
  const feature = (wallet.features as Partial<SolanaSignMessageFeature>)[SolanaSignMessage];
  if (!feature) throw new Error("This wallet cannot sign messages.");
  const [output] = await feature.signMessage({ account, message });
  if (!output || output.signature.length !== 64) throw new Error("The wallet returned no signature.");
  return getBase58Decoder().decode(output.signature);
}

// A phone or tablet browser, where a wallet usually lives in its own app rather than as an extension.
// iPadOS Safari reports a Mac user agent, so a "Macintosh" with more than one touch point is an iPad.
export function isPhoneBrowser(userAgent: string, maxTouchPoints = 0): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export type PayMode = "pay" | "phantom_link" | "need_wallet";

// A phone with no devnet wallet gets the Phantom link and never a pay button; a desktop with none
// gets an explanation and no pay button.
export function choosePayMode(input: { userAgent: string; maxTouchPoints?: number; wallets: readonly StandardWallet[] }): PayMode {
  if (input.wallets.length > 0) return "pay";
  return isPhoneBrowser(input.userAgent, input.maxTouchPoints) ? "phantom_link" : "need_wallet";
}
