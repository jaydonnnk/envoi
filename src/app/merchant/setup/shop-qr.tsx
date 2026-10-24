"use client";

import { useEffect, useState } from "react";
import type { MerchantOutlet } from "@/domain/outlets/merchant";
import { drawShopQr } from "@/lib/browser/qr";

// The merchant's Envoi shop QR (S18): the shop's public buy link drawn in this browser, shown only
// once the shop is published, because buyers cannot open an unpublished shop. It is not the
// merchant's SGQR, which Envoi never stores, and it carries no payment data.
export function ShopQr({ outlet }: { outlet: MerchantOutlet }) {
  const [link, setLink] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!outlet.published) return;
    const url = `${window.location.origin}/buy?outlet=${encodeURIComponent(outlet.id)}`;
    let objectUrl: string | null = null;
    let live = true;
    drawShopQr(url)
      .then((png) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(png);
        setLink(url);
        setImage(objectUrl);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [outlet.id, outlet.published]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="shop-qr" aria-labelledby={`shop-qr-${outlet.id}`}>
      <h3 id={`shop-qr-${outlet.id}`}>Your Envoi shop QR</h3>
      {!outlet.published ? (
        <p className="muted">Your shop QR appears here after you publish. Buyers cannot open an unpublished shop.</p>
      ) : failed ? (
        <p className="error" role="alert">
          The QR code could not be drawn in this browser. Reload the page to try again.
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset */}
          {image ? <img src={image} alt={`QR code that opens ${outlet.name} on Envoi`} width={220} height={220} /> : <p className="fine">Drawing the QR code</p>}
          <small>Opens {outlet.name} on Envoi so a buyer can pick items. It is not a payment code and is not your SGQR; nobody can pay with it in a bank app.</small>
          <div className="actions">
            <a className="button" href={image ?? undefined} download={`envoi-shop-qr-${outlet.id}.png`} aria-disabled={!image}>
              Download QR (PNG)
            </a>
            <button className="button secondary" type="button" onClick={copy} disabled={!link}>
              {copied ? "Link copied" : "Copy shop link"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
