"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRestoreFocus } from "@/lib/browser/focus";
import { postJson } from "@/lib/browser/session";

type Props = {
  email?: string;
  message: string;
} & ({ onBack: () => void; backLabel: string } | { onBack?: never; backLabel?: never });

export function VerificationPrompt({ email, message, onBack, backLabel }: Props) {
  const fieldId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useRestoreFocus(busy);

  useEffect(() => { heading.current?.focus(); }, []);

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setResult("");
    const response = await postJson("/api/v1/merchant/email/resend", { email: form.get("email") }).catch(() => null);
    setBusy(false);
    setResult(response?.ok
      ? "If confirmation is needed, check your inbox and spam folder."
      : response?.status === 429
        ? "Too many requests. Try again later."
        : "Could not request a new link. Try again.");
  }

  return (
    <section>
      <h3 ref={heading} tabIndex={-1}>Check your email</h3>
      <p>{message}</p>
      <form method="post" onSubmit={resend}>
        <label htmlFor={fieldId}>Email for confirmation</label>
        <input id={fieldId} name="email" type="email" autoComplete="email" defaultValue={email} maxLength={254} required />
        <div className="actions">
          <button className="button secondary" type="submit" disabled={busy}>
            {busy ? "Requesting" : "Resend confirmation email"}
          </button>
          {onBack && <button className="link-button" type="button" onClick={onBack}>{backLabel}</button>}
        </div>
      </form>
      <p className="fine" role="status">{result}</p>
    </section>
  );
}
