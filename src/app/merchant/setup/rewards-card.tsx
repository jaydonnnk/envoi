import type { PAYPAL_PYUSD_REWARDS, RewardsCard } from "@/domain/rewards/paypal-pyusd";
import { formatMoney } from "@/lib/money";

// S28: PayPal's PYUSD rewards beside what the shop was paid through Envoi this month. The rate is
// PayPal's advertised one [vendor claim], read on a stated date; the illustration is labeled as one
// and never a promised return. Envoi converts, holds and invests nothing: the merchant opts in
// inside PayPal. The server page passes the reviewed constant down, so this card, imported by the
// client workspace, pulls no database code into the browser and makes no network call.

export type RewardsTerms = typeof PAYPAL_PYUSD_REWARDS;

function checkedOn(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function RewardsCardView({ card, terms }: { card: RewardsCard; terms: RewardsTerms }) {
  const paid = formatMoney(card.paidThisMonth);
  const rate = `${terms.advertisedAnnualRateBasisPoints / 100}%`;
  return (
    <section className="card slip" aria-labelledby="rewards-heading">
      <h2 id="rewards-heading">Paid through Envoi this month</h2>
      <p className="total money">{paid}</p>
      <p className="fine muted">Sandbox test money, from paid orders only.</p>
      <h3 className="rewards-subhead">PayPal PYUSD rewards</h3>
      {card.eligible && card.illustration ? (
        <>
          <p>PayPal advertises rewards of about {rate} a year on PYUSD that US businesses hold in PayPal. The rate is PayPal&apos;s and it changes.</p>
          <p className="muted">
            Illustration only: {paid} held as PYUSD for a year at {rate} would earn about {formatMoney(card.illustration)}.
          </p>
          <p className="fine muted">Rate as shown on PayPal&apos;s page on {checkedOn(terms.checkedOn)}.</p>
          <div className="actions">
            <a className="button secondary" href={terms.sourceUrl} target="_blank" rel="noopener noreferrer">
              Read PayPal&apos;s terms
            </a>
          </div>
          <p className="fine muted">Not available in this test environment. Envoi never converts, holds or invests your money, and you opt in inside PayPal, not here.</p>
        </>
      ) : (
        <>
          <p>PayPal offers PYUSD rewards to US businesses. Singapore businesses cannot earn them yet.</p>
          <p className="muted">Envoi shows no illustration for a shop that cannot earn it.</p>
        </>
      )}
    </section>
  );
}
