import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteFooter, SiteNotice } from "./site-chrome";

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
            <Link className="brand" href="/">
              <span className="mark" aria-hidden="true">↗</span>envoi
            </Link>
            <span className="badge">Test environment</span>
          </div>
        </header>
        <SiteNotice />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
