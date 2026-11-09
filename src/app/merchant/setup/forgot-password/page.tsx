import type { Metadata } from "next";
import { merchantMailSettings } from "@/env";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reset your password | Envoi", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  if (merchantMailSettings() === null) {
    return (
      <main>
        <p className="eyebrow">Merchant setup</p>
        <h1>Reset your password</h1>
        <section className="card" aria-label="Password reset unavailable">
          <p>Password reset is unavailable in this test environment.</p>
          <div className="actions">
            <a href="/merchant/setup">Back to sign in</a>
          </div>
        </section>
      </main>
    );
  }
  return (
    <main>
      <p className="eyebrow">Merchant setup</p>
      <h1>Reset your password</h1>
      <section className="card slip" aria-label="Request a reset link">
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
