import type { Metadata } from "next";
import { SINGAPORE_CLOCK } from "@/app/purchase-copy";
import { previewPurchaseRequest } from "@/domain/handoffs/redeem";
import { webDb } from "@/lib/db/web";
import { RedeemHandoff } from "./redeem-handoff";

export const dynamic = "force-dynamic";

// The link is a bearer of the buyer's next step until it is used or expires: no referrer (set for
// every page in the root layout and next.config.ts), no analytics, no indexing.
export const metadata: Metadata = { title: "Review a suggested basket · Envoi", robots: { index: false, follow: false } };

const CLOSED = {
  expired: {
    title: "This link has expired",
    body: "Links from an assistant work for 10 minutes after they are created. Ask your assistant for a new link. Nothing was charged.",
  },
  already_redeemed: {
    title: "This link was already used",
    body: "Each link opens one review, once. If you opened it before, continue in that browser; otherwise ask your assistant for a new link. Nothing was charged.",
  },
  invalid: {
    title: "This link is not valid",
    body: "Check that the whole link was copied, or ask your assistant for a new one. Nothing was charged.",
  },
} as const;

export default async function ApprovePage({ params }: { params: Promise<{ handoffToken: string }> }) {
  const { handoffToken } = await params;
  const preview = await previewPurchaseRequest(webDb(), handoffToken, new Date());

  if (preview.kind !== "open") {
    const closed = CLOSED[preview.kind];
    return (
      <main>
        <p className="eyebrow">From your assistant</p>
        <h1>{closed.title}</h1>
        <p className="lead">{closed.body}</p>
        <div className="actions">
          <a className="button" href="/buy">
            Choose a shop yourself
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">From your assistant</p>
      <h1>Check the basket your assistant suggested</h1>
      <p className="lead">An assistant suggested these items. It set no price and cannot pay. Envoi prices the basket from the shop&apos;s published menu, and you approve any payment yourself.</p>
      <div className="layout">
        <section className="card slip" aria-labelledby="basket-heading">
          <h2 id="basket-heading">
            {preview.outlet.name} {preview.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
          </h2>
          <small>{preview.outlet.area}</small>
          {preview.lines.map((line, index) => (
            <div className="row" key={index}>
              <span>
                {line.quantity} × {line.name}
              </span>
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="next-heading">
          <h2 id="next-heading">Next: the price</h2>
          <p className="muted">
            This link works once, until {SINGAPORE_CLOCK.format(preview.expiresAt)} Singapore time. Opening the review shows the total and who is paid. Nothing is charged until you approve in PayPal&apos;s sandbox.
          </p>
          <RedeemHandoff token={handoffToken} />
          <p className="fine muted">Your assistant cannot see your receipt.</p>
        </section>
      </div>
    </main>
  );
}
