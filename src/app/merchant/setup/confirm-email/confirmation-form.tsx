"use client";

import { useEffect, useRef, useState } from "react";
import { useRestoreFocus } from "@/lib/browser/focus";
import { postJson } from "@/lib/browser/session";
import { VerificationPrompt } from "../verification-prompt";

export function ConfirmationForm() {
  const token = useRef<string | null>(null);
  const [state, setState] = useState<"ready" | "invalid" | "confirmed">("ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useRestoreFocus(busy);

  useEffect(() => {
    const { hash, pathname, search } = window.location;
    if (!hash) return;
    token.current = new URLSearchParams(hash.slice(1)).get("token");
    window.history.replaceState(window.history.state, "", pathname + search);
  }, []);

  async function confirm() {
    if (!token.current) {
      setState("invalid");
      return;
    }
    setBusy(true);
    setError("");
    const response = await postJson("/api/v1/merchant/email/confirm", { token: token.current }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      token.current = null;
      setState("confirmed");
    } else if (response?.status === 400) {
      token.current = null;
      setState("invalid");
    } else {
      setError("Confirmation is temporarily unavailable. Try again.");
    }
  }

  return (
    <>
      {state === "ready" && (
        <>
          <p>Confirm this address to create a shop with your Envoi account. Continue only if you created this account.</p>
          <button className="button" type="button" onClick={confirm} disabled={busy}>
            {busy ? "Confirming" : "Confirm my email"}
          </button>
        </>
      )}
      {state === "invalid" && <VerificationPrompt message="This confirmation link is invalid or expired. Request a new one." />}
      {state === "confirmed" && <p role="status">Email confirmed. Sign in to set up your shop.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><a href="/merchant/setup">Return to sign in</a></div>
    </>
  );
}
