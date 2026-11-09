"use client";

import { useState } from "react";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

// S43 (Gate 3 S43 amendment decision 10): a stranger's account, one pending test shop and the
// sandbox seller id submitted for the admin's review. The password goes only to /api/auth and is
// never kept in state. Each step is its own request, so a later failure leaves the account signed in
// and the page then shows the shop form without the account fields.

const NO_RECOVERY_LINE = "No confirmation email is sent, and a lost password cannot be reset in this test environment.";
const SELLER_HINT = "The admin reviews this before connecting it. It is not used until then.";

type Step = "account" | "shop" | "seller";

async function createAccount(email: FormDataEntryValue | null, password: FormDataEntryValue | null, name: FormDataEntryValue | null): Promise<string | null> {
  const response = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  }).catch(() => null);
  if (response === null) return "The account could not be created. Check your connection and try again.";
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (response.status === 429) return body?.message ?? "Too many sign-ups for now. No account was created.";
  if (body?.code === "USER_ALREADY_EXISTS" || body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "An account with this email already exists. Sign in instead.";
  if (body?.code === "PASSWORD_TOO_SHORT") return "Use a password of at least 8 characters.";
  if (body?.code === "PASSWORD_TOO_LONG") return "Use a password of at most 128 characters.";
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const refused = await createAccount(form.get("email"), form.get("password"), form.get("name"));
    if (refused) {
      setError(refused);
      setBusy(false);
      return;
    }
    // The account exists and is signed in from here on; the page shows whatever step is left.
    await createShopAndRequest(form);
    window.location.reload();
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="signup-password">Password</label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-describedby="signup-recovery" required />
      <small id="signup-recovery" className="field-hint">
        {NO_RECOVERY_LINE}
      </small>
      <ShopFields prefix="signup" />
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Creating" : "Create account and shop"}
        </button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

// A signed-in account with no shop yet, such as one whose shop step failed after sign-up.
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
    <form onSubmit={submit}>
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
