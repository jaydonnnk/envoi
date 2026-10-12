"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Starts an anonymous buyer session if this browser has none, then asks the server to store a
// review of the fixture basket. The browser sends an outlet id only.
async function ensureBuyerSession(): Promise<void> {
  const current = await fetch("/api/auth/get-session", { cache: "no-store" });
  const session: unknown = current.ok ? await current.json() : null;
  if (session) return;
  const signIn = await fetch("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!signIn.ok) throw new Error("session");
}

export function ReviewButton({ outletId }: { outletId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function review() {
    setBusy(true);
    setFailed(false);
    try {
      await ensureBuyerSession();
      const response = await fetch("/api/v1/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId }),
      });
      if (!response.ok) throw new Error("review");
      const body = (await response.json()) as { data: { purchaseId: string } };
      router.push(`/review/${encodeURIComponent(body.data.purchaseId)}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button full" type="button" onClick={review} disabled={busy}>
        {busy ? "Preparing review…" : "Review"}
      </button>
      {failed && (
        <p className="error" role="alert">
          The review could not be created. Try again.
        </p>
      )}
    </>
  );
}
