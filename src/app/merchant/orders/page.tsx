import type { Metadata } from "next";
import { headers } from "next/headers";
import { listMerchantOutlets } from "@/domain/outlets/merchant";
import { listOutletOrders, type OutletOrders } from "@/domain/purchases/orders";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { isAppError } from "@/lib/errors";
import { OrdersView } from "./orders-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Merchant orders | Envoi", robots: { index: false, follow: false } };

export default async function MerchantOrdersPage() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  // No permanent session: no order data, only the way to sign in.
  if (!session || session.user.isAnonymous === true) {
    return (
      <main>
        <p className="eyebrow">Merchant orders</p>
        <h1>Sign in to see your orders</h1>
        <p className="lead">Orders are shown only to the shop&apos;s merchant account. Demo merchant accounts are created by the Envoi operator.</p>
        <div className="actions">
          <a className="button" href="/merchant/setup">
            Merchant sign-in
          </a>
        </div>
      </main>
    );
  }

  const principal = await requireMerchantMembership(getAuth(), webDb(), requestHeaders);
  if (!isMerchantAccount(principal)) {
    return (
      <main>
        <p className="eyebrow">Merchant orders</p>
        <h1>No approved membership</h1>
        <p className="lead">This account is signed in but holds no operator-approved shop membership, so it has no orders to show. Ask the Envoi operator.</p>
      </main>
    );
  }

  // Each outlet's orders are read only because the account holds that outlet's live membership.
  const { outlets } = await listMerchantOutlets(webDb(), principal.userId);
  const now = new Date();
  const shops: OutletOrders[] = [];
  for (const outlet of outlets) {
    const orders = await listOutletOrders(webDb(), outlet.id, now);
    if (orders && !isAppError(orders)) shops.push(orders);
  }

  return (
    <main>
      <p className="eyebrow">Merchant orders</p>
      <h1>See the payment. Acknowledge the order.</h1>
      <p className="lead">A buyer&apos;s payment and your acknowledgment are different facts. Only a payment PayPal sandbox confirmed shows as paid, and you can acknowledge only a paid order.</p>
      {shops.length === 0 && (
        <section className="card">
          <h2>No shop yet</h2>
          <p>Set up and publish your shop first; its orders appear here.</p>
        </section>
      )}
      {shops.map((shop) => (
        <OrdersView key={shop.outlet.id} initial={shop} />
      ))}
      <div className="actions">
        <a className="button secondary" href="/merchant/setup">
          Shop setup and menu
        </a>
      </div>
    </main>
  );
}
