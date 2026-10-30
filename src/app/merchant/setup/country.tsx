"use client";

import { useState } from "react";
import type { MerchantOutlet } from "@/domain/outlets/merchant";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import type { Country } from "@/lib/money";

// S27: the shop's country, chosen before the SGQR step and before first publication. The country
// sets the menu's currency and the ways visitors can pay; once the shop has published it is locked,
// which the server enforces with country_locked and the database with its own trigger.

const CHOICES: { country: Country; label: string; body: string }[] = [
  { country: "SG", label: "Singapore", body: "Prices in SGD. PayPal, and PYUSD if you add a wallet. Upload your SGQR sticker so visitors can scan it." },
  { country: "US", label: "United States", body: "Prices in USD. PayPal only. No SGQR step; visitors find you by text, Ask Envoi or your Envoi shop QR." },
];

const LOCK_NOTE = "Your country cannot change after you publish, because published prices are in its currency.";

export function CountryChoice({ outlet, onSaved }: { outlet: MerchantOutlet; onSaved: (outlet: MerchantOutlet) => void }) {
  const [choice, setChoice] = useState<Country>(outlet.country);
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  const prefix = `country-${outlet.id}`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await requestJson<{ outlet: MerchantOutlet }>("PATCH", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}`, { country: choice });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The country could not be saved. Try again.");
      return;
    }
    onSaved(result.data.outlet);
  }

  if (outlet.published) {
    const current = CHOICES.find((entry) => entry.country === outlet.country);
    return (
      <div className="country">
        <h3>Where is your shop?</h3>
        <p>
          <strong>{current?.label}</strong> <span className="chip">Locked</span>
          <small>{current?.body}</small>
        </p>
        <p className="muted">{LOCK_NOTE}</p>
      </div>
    );
  }

  return (
    <form className="country" onSubmit={submit}>
      <fieldset>
        <legend>
          <h3>Where is your shop?</h3>
        </legend>
        <p className="muted">Envoi serves shops in Singapore and in the United States. Your country sets your menu&apos;s currency and the ways visitors can pay you.</p>
        {CHOICES.map((entry) => (
          <label key={entry.country} className="rail" htmlFor={`${prefix}-${entry.country}`}>
            <input id={`${prefix}-${entry.country}`} type="radio" name="country" value={entry.country} checked={choice === entry.country} onChange={() => setChoice(entry.country)} />
            <strong>{entry.label}</strong>
            <small>{entry.body}</small>
          </label>
        ))}
      </fieldset>
      <p className="muted">{LOCK_NOTE}</p>
      <div className="actions">
        <button className="button" type="submit" disabled={busy || choice === outlet.country}>
          {busy ? "Saving" : "Continue"}
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
