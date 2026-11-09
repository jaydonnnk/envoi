import type { Metadata } from "next";
import { ConfirmationForm } from "./confirmation-form";

export const metadata: Metadata = { title: "Confirm your email | Envoi", robots: { index: false, follow: false } };

export default function ConfirmEmailPage() {
  return (
    <main>
      <p className="eyebrow">Merchant setup</p>
      <h1>Confirm your Envoi email</h1>
      <section className="card slip" aria-label="Email confirmation">
        <ConfirmationForm />
      </section>
    </main>
  );
}
