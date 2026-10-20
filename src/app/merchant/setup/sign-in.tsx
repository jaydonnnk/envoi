"use client";

import { useState } from "react";
import { postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

// Email and password sign-in through Better Auth. The password goes only to /api/auth and is never
// kept in state after the request.
export function SignInForm() {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await postJson("/api/auth/sign-in/email", { email: form.get("email"), password: form.get("password") }).catch(() => null);
    if (result?.status === 200) {
      window.location.reload();
      return;
    }
    setError(result?.status === 429 ? "Too many attempts. Wait a minute and try again." : "That email and password do not match a merchant account.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
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
