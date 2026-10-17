import { ScanSticker } from "./scan-sticker";

export const dynamic = "force-dynamic";

// S10: the buyer scans or pastes a shop's SGQR sticker. This is the only page whose
// Permissions-Policy lets this site ask for the camera (next.config.ts).
export default function ScanPage() {
  return (
    <main>
      <p className="eyebrow">
        <a href="/buy">All shops</a>
      </p>
      <h1>Scan the sticker</h1>
      <p className="lead">At the counter, scan the shop&apos;s SGQR sticker to open that exact outlet. No area needed.</p>
      <ScanSticker />
    </main>
  );
}
