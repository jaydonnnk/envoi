"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/browser/session";

// PayPal's approval window over the review page (S31). The server decides everything about the
// order: the create step only posts to paypal/start, the approve step only posts to paypal/complete,
// and neither sends anything PayPal or the page supplied.

type PayPalButtonsInstance = { isEligible(): boolean; render(container: HTMLElement): Promise<void>; close(): Promise<void> };
type PayPalButtonsOptions = {
  fundingSource: string;
  style: { color: string; label: string };
  createOrder(): Promise<string>;
  onApprove(): Promise<void>;
  onCancel(): Promise<void>;
  onError(): void;
};
export type PayPalSdk = { FUNDING: { PAYPAL: string }; Buttons(options: PayPalButtonsOptions): PayPalButtonsInstance };

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

const SDK_SCRIPT_ID = "paypal-sdk";
const SDK_LOAD_TIMEOUT_MS = 10_000;

export function paypalSdkUrl(clientId: string, currency: string): string {
  return `https://www.paypal.com/sdk/js?${new URLSearchParams({ "client-id": clientId, currency, intent: "capture" })}`;
}

let loading: { src: string; sdk: Promise<PayPalSdk> } | null = null;

// One script per page. The SDK is bound to one currency, so a review in another currency, reached
// without a full page load, replaces it. A script that fails or hangs rejects and is removed.
export function loadPayPalSdk(src: string, timeoutMs = SDK_LOAD_TIMEOUT_MS): Promise<PayPalSdk> {
  if (loading?.src === src) return loading.sdk;
  document.getElementById(SDK_SCRIPT_ID)?.remove();
  delete window.paypal;
  const sdk = new Promise<PayPalSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = src;
    script.async = true;
    const timer = setTimeout(() => reject(new Error("paypal_sdk_timeout")), timeoutMs);
    script.onload = () => {
      clearTimeout(timer);
      if (window.paypal) resolve(window.paypal);
      else reject(new Error("paypal_sdk_missing"));
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("paypal_sdk_failed"));
    };
    document.head.appendChild(script);
  });
  const current = { src, sdk };
  loading = current;
  sdk.catch(() => {
    if (loading !== current) return;
    loading = null;
    document.getElementById(SDK_SCRIPT_ID)?.remove();
  });
  return sdk;
}

type Stage = "loading" | "ready" | "completing" | "closing";

type HandlerCallbacks = {
  onUnavailable: () => void;
  onRefused: (refusal?: { code: string; message: string }) => void;
  onStage: (stage: Stage) => void;
  onFailure: (message: string) => void;
  showReceipt: () => void;
  isStopped: () => boolean;
};

// What the SDK calls. Once the buyer approved or closed the window the server decides, so a late SDK
// error must not offer a second way to pay.
export function paypalButtonHandlers(purchaseId: string, callbacks: HandlerCallbacks) {
  const purchasePath = `/api/v1/purchases/${encodeURIComponent(purchaseId)}`;
  let settled = false;
  return {
    async createOrder() {
      const result = await postJson<{ orderId: string }>(`${purchasePath}/paypal/start`);
      if (result.ok && result.data) return result.data.orderId;
      callbacks.onRefused(result.error);
      throw new Error("paypal_start_refused");
    },
    async onApprove() {
      settled = true;
      callbacks.onStage("completing");
      const result = await postJson(`${purchasePath}/paypal/complete`).catch(() => null);
      if (result?.ok) callbacks.showReceipt();
      else callbacks.onFailure(result?.error?.message ?? "The payment could not be finished.");
    },
    async onCancel() {
      settled = true;
      callbacks.onStage("closing");
      const result = await postJson(`${purchasePath}/cancel`).catch(() => null);
      // payment_uncertain: a capture was already dispatched; the receipt shows "Checking payment".
      if (result?.ok || result?.error?.code === "payment_uncertain") callbacks.showReceipt();
      else callbacks.onFailure(result?.error?.message ?? "The purchase could not be closed.");
    },
    onError() {
      if (!settled && !callbacks.isStopped()) callbacks.onUnavailable();
    },
  };
}

export function PayPalButtons({
  purchaseId,
  clientId,
  currency,
  onUnavailable,
  onRefused,
}: {
  purchaseId: string;
  clientId: string;
  currency: string;
  onUnavailable: () => void;
  onRefused: (refusal?: { code: string; message: string }) => void;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [failure, setFailure] = useState<string | null>(null);
  const receipt = `/receipt/${encodeURIComponent(purchaseId)}`;

  useEffect(() => {
    let stopped = false;
    let buttons: PayPalButtonsInstance | null = null;
    const handlers = paypalButtonHandlers(purchaseId, {
      onUnavailable,
      onRefused,
      onStage: setStage,
      onFailure: setFailure,
      showReceipt: () => router.replace(receipt),
      isStopped: () => stopped,
    });

    loadPayPalSdk(paypalSdkUrl(clientId, currency))
      .then(async (sdk) => {
        if (stopped || !container.current) return;
        buttons = sdk.Buttons({ fundingSource: sdk.FUNDING.PAYPAL, style: { color: "gold", label: "paypal" }, ...handlers });
        if (!buttons.isEligible()) return handlers.onError();
        await buttons.render(container.current);
        if (!stopped) setStage("ready");
      })
      .catch(handlers.onError);

    return () => {
      stopped = true;
      void buttons?.close().catch(() => undefined);
    };
  }, [clientId, currency, onRefused, onUnavailable, purchaseId, receipt, router]);

  if (failure) {
    return (
      <>
        <p className="error" role="alert">
          {failure}
        </p>
        <a className="button" href={receipt}>
          See the receipt
        </a>
      </>
    );
  }

  const working = stage === "completing" || stage === "closing";
  return (
    <>
      {stage === "loading" && <p className="muted" role="status">Loading PayPal…</p>}
      {stage === "completing" && <p className="muted" role="status">Checking the order with PayPal…</p>}
      {stage === "closing" && <p className="muted" role="status">Closing the purchase…</p>}
      <div className="paypal-buttons" ref={container} hidden={working} />
      {!working && <small>Opens PayPal sandbox in a window over this page. Closing it keeps the purchase unpaid.</small>}
    </>
  );
}
