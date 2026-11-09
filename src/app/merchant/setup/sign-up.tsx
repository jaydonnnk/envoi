"use client";

import { useState } from "react";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import { VerificationPrompt } from "./verification-prompt";

const SELLER_HINT = "The admin reviews this before connecting it. It is not used until then.";

type Step = "shop" | "seller";

async function createAccount(email: string, password: FormDataEntryValue | null): Promise<string | null> {
  const response = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Merchant" }),
  }).catch(() => null);
  if (response === null) return "The account could not be created. Check your connection and try again.";
  if (response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  const code = body && typeof body === "object" && "code" in body ? body.code : null;
  if (response.status === 429) return "Too many sign-ups for now. Try again later.";
  if (code === "PASSWORD_TOO_SHORT") return "Use a password of at least 8 characters.";
  if (code === "PASSWORD_TOO_LONG") return "Use a password of at most 128 characters.";
  return "The account could not be created. Check the email and password and try again.";
}

async function createShopAndRequest(form: FormData): Promise<{ step: Step; error: string } | null> {
  const created = await requestJson<{ outlet: { id: string } }>("POST", "/api/v1/merchant/outlets", { name: form.get("name"), area: form.get("area") });
  if (!created.ok || !created.data) return { step: "shop", error: created.error?.message ?? "The shop could not be created. Try again." };
  const requested = await requestSeller(created.data.outlet.id, form.get("seller"));
  return requested ? { step: "seller", error: requested } : null;
}

export async function requestSeller(outletId: string, seller: FormDataEntryValue | null): Promise<string | null> {
  const result = await requestJson("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/destinations/paypal/request`, { sellerMerchantId: seller });
  return result.ok ? null : (result.error?.message ?? "The seller id could not be sent. Try again.");
}

function ShopFields({ prefix }: { prefix: string }) {
  return (
    <>
      <label htmlFor={`${prefix}-name`}>Shop name</label>
      <input id={`${prefix}-name`} name="name" maxLength={80} required />
      <label htmlFor={`${prefix}-area`}>Area</label>
      <input id={`${prefix}-area`} name="area" maxLength={80} placeholder="For example Tanjong Pagar" required />
      <label htmlFor={`${prefix}-seller`}>PayPal sandbox seller id</label>
      <input id={`${prefix}-seller`} name="seller" maxLength={13} autoComplete="off" spellCheck={false} aria-describedby={`${prefix}-seller-hint`} required />
      <small id={`${prefix}-seller-hint`} className="field-hint">
        {SELLER_HINT}
      </small>
    </>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

export function SignUpForm() {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    setBusy(true);
    setError(null);
    const refused = await createAccount(email, form.get("password"));
    setBusy(false);
    if (refused) setError(refused);
    else setCheckEmail(email);
  }

  if (checkEmail !== null) {
    return (
      <VerificationPrompt
        email={checkEmail}
        message="If confirmation is needed, check your email. Open the link, confirm your email, then sign in."
        onBack={() => setCheckEmail(null)}
        backLabel="Use a different email"
      />
    );
  }

  return (
    <form method="post" onSubmit={submit}>
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      <label htmlFor="signup-password">Password</label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-describedby="signup-confirmation-hint" required />
      <small id="signup-confirmation-hint" className="field-hint">
        Confirm your email before you create a shop. Password reset is unavailable in this test environment.
      </small>
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Creating" : "Create account"}
        </button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

// Shop details and seller request follow confirmation and sign-in.
export function ShopSignUpForm() {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const failed = await createShopAndRequest(form);
    if (failed?.step === "shop") {
      setError(failed.error);
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <form method="post" onSubmit={submit}>
      <ShopFields prefix="shop" />
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Creating" : "Create shop"}
        </button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}
