"use client";

import { useState } from "react";
import { postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import { VerificationPrompt } from "./verification-prompt";

// Email and password sign-in through Better Auth. The password goes only to /api/auth and is never
// kept in state after the request.
export function SignInForm({ resetAvailable }: { resetAvailable: boolean }) {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const result = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: form.get("password") }),
    }).catch(() => null);
    if (result?.status === 200) {
      window.location.reload();
      return;
    }
    const response: unknown = await result?.json().catch(() => null);
    setBusy(false);
    if (result?.status === 403 && response && typeof response === "object" && "code" in response && response.code === "EMAIL_NOT_VERIFIED") {
      setCheckEmail(email);
      return;
    }
    setError(result?.status === 429 ? "Too many attempts. Wait a minute and try again." : "That email and password do not match a merchant account.");
  }

  if (checkEmail !== null) {
    return (
      <VerificationPrompt
        email={checkEmail}
        message="Confirm your email before signing in. Open the link in your inbox or request a new one."
        onBack={() => setCheckEmail(null)}
        backLabel="Back to sign in"
      />
    );
  }

  return (
    <>
      <form method="post" onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="button full" type="submit" disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      {resetAvailable && (
        <p className="fine">
          <a href="/merchant/setup/forgot-password">Forgot your password?</a>
        </p>
      )}
    </>
  );
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  async function signOut() {
    setBusy(true);
    await postJson("/api/auth/sign-out").catch(() => null);
    window.location.reload();
  }
  return (
    <button className="button secondary" type="button" onClick={signOut} disabled={busy}>
      Sign out
    </button>
  );
}
