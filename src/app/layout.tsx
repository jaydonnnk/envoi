import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Envoi",
  description: "Buy from participating Singapore shops with a payment method you already have. Test environment.",
  referrer: "no-referrer",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <div className="top">
            <a className="brand" href="/buy">
              <span className="mark" aria-hidden="true">↗</span>envoi
            </a>
            <span className="badge">Test environment</span>
          </div>
        </header>
        <div className="notice" role="note">
          Demo fixture shops, PayPal sandbox test money and Solana devnet test tokens only. No real money moves.
        </div>
        {children}
        <footer>Envoi test build. Shops shown here are labeled demo fixtures, not real merchants, and payments use PayPal sandbox accounts or Solana devnet test tokens.</footer>
      </body>
    </html>
  );
}
