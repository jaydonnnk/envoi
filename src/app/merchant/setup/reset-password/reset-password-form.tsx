"use client";

import { useEffect, useRef, useState } from "react";
import { useRestoreFocus } from "@/lib/browser/focus";

export function ResetPasswordForm() {
  const token = useRef<string | null>(null);
  const [state, setState] = useState<"ready" | "invalid" | "saved">("ready");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useRestoreFocus(busy);

  // The token arrives in the fragment, so it never reaches a server or proxy log.
  useEffect(() => {
    const { hash, pathname, search } = window.location;
    const value = hash ? new URLSearchParams(hash.slice(1)).get("token") : null;
    token.current = value;
    if (hash) window.history.replaceState(window.history.state, "", pathname + search);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.current) {
      setState("invalid");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: form.get("password"), token: token.current }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      token.current = null;
      setState("saved");
      return;
    }
    const body: unknown = await response?.json().catch(() => null);
    const code = body && typeof body === "object" && "code" in body ? body.code : null;
    if (response?.status === 400 && code === "INVALID_TOKEN") {
      token.current = null;
      setState("invalid");
      return;
    }
    setError(code === "PASSWORD_TOO_SHORT" ? "Use a password of at least 8 characters." : "The password could not be saved. Try again.");
  }

  if (state === "invalid") {
    return (
      <>
        <p role="status">This reset link is invalid or expired. Request a new one.</p>
        <div className="actions">
          <a className="button" href="/merchant/setup/forgot-password">
            Reset your password
          </a>
        </div>
      </>
    );
  }

  if (state === "saved") {
    return (
      <>
        <p role="status">Password saved. Sign in with your new password.</p>
        <div className="actions">
          <a className="button" href="/merchant/setup">
            Sign in
          </a>
        </div>
      </>
    );
  }

  return (
    <form method="post" onSubmit={submit}>
      <label htmlFor="new-password">New password</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-describedby="new-password-hint" required />
      <small id="new-password-hint" className="field-hint">
        At least 8 characters. Every other signed-in browser is signed out.
      </small>
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Saving" : "Save new password"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
