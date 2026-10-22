"use client";

// The test-environment notice and footer around every page. The landing page at the root address shows
// no shop, so it carries only the test-money line and no demo fixture wording (Gate 1, reopened and
// re-approved 2026-10-21); every other page keeps the full labels.
import { usePathname } from "next/navigation";

export const LANDING_NOTICE = "Test money only. No real money moves.";
export const SITE_NOTICE = "Demo fixture shops, PayPal sandbox test money and Solana devnet test tokens only. No real money moves.";
export const SITE_FOOTER =
  "Envoi test build. Shops shown here are labeled demo fixtures, not real merchants, and payments use PayPal sandbox accounts or Solana devnet test tokens.";

export function SiteNotice() {
  const landing = usePathname() === "/";
  return (
    <div className="notice" role="note">
      {landing ? LANDING_NOTICE : SITE_NOTICE}
    </div>
  );
}

export function SiteFooter() {
  if (usePathname() === "/") return null;
  return <footer>{SITE_FOOTER}</footer>;
}
