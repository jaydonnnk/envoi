import type { Metadata } from "next";
import { merchantMailSettings } from "@/env";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Choose a new password | Envoi", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  if (merchantMailSettings() === null) {
    return (
      <main>
        <p className="eyebrow">Merchant setup</p>
        <h1>Choose a new password</h1>
        <div className="layout">
          <section className="card" aria-label="Password reset unavailable">
            <p>Password reset is unavailable in this test environment.</p>
            <div className="actions">
              <a href="/merchant/setup">Back to sign in</a>
            </div>
          </section>
        </div>
      </main>
    );
  }
  return (
    <main>
      <p className="eyebrow">Merchant setup</p>
      <h1>Choose a new password</h1>
      <div className="layout">
        <section className="card slip" aria-label="New password">
          <ResetPasswordForm />
        </section>
      </div>
    </main>
  );
}
