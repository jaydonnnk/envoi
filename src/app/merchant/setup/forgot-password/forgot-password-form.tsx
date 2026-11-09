"use client";

import { useState } from "react";
import { useRestoreFocus } from "@/lib/browser/focus";

// The page answers the same way whether or not an account uses the email (Gate 1).
export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    setBusy(true);
    setError("");
    setResult("");
    const response = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (response?.status === 429) {
      setError("Too many requests. Try again later.");
      return;
    }
    if (!response?.ok) {
      setError("The reset link could not be requested. Try again.");
      return;
    }
    setResult("If an Envoi merchant account uses this email, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder.");
  }

  return (
    <form method="post" onSubmit={submit}>
      <label htmlFor="reset-email">Email</label>
      <input id="reset-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Sending" : "Send reset link"}
        </button>
        <a href="/merchant/setup">Back to sign in</a>
      </div>
      <p className="fine" role="status">{result}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
