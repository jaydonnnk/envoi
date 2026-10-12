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
          Demo fixture shops only. No real money. This build attempts no payment.
        </div>
        {children}
        <footer>Envoi tracer build. Shops shown here are labeled demo fixtures, not real merchants.</footer>
      </body>
    </html>
  );
}
