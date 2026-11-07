import type { Metadata } from "next";
import { headers } from "next/headers";
import { webEnv } from "@/env";
import { listMerchantOutlets } from "@/domain/outlets/merchant";
import { isDemoSellerOutlet } from "@/domain/payments/refunds";
import { listOutletOrders, type OutletOrders } from "@/domain/purchases/orders";
import { orderFilterEnabled } from "@/integrations/ai/openai";
import { demoSellerCopilot } from "@/integrations/assistant/merchant-copilot";
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
  const askEnabled = orderFilterEnabled();
  // S45: the copilot panel appears only for the labeled demo shop, and only while the copilot is on.
  const copilot = demoSellerCopilot(webEnv());
  const shops: { orders: OutletOrders; copilot: boolean }[] = [];
  for (const outlet of outlets) {
    const orders = await listOutletOrders(webDb(), outlet.id, now);
    if (orders && !isAppError(orders)) shops.push({ orders, copilot: copilot !== null && (await isDemoSellerOutlet(webDb(), outlet.id, copilot.merchantId)) });
  }

  return (
    <main>
      <p className="eyebrow">Merchant</p>
      <h1>Orders</h1>
      <p className="lead">{shops.some((shop) => shop.orders.orders.length > 0) ? "Ask in your own words, or sort and filter the table. Asking changes no order." : "Orders appear here once a buyer starts one at your shop."}</p>
      {shops.length === 0 && (
        <section className="card">
          <h2>No shop yet</h2>
          <p>Set up and publish your shop first; its orders appear here.</p>
        </section>
      )}
      {shops.map((shop) => (
        <OrdersView key={shop.orders.outlet.id} initial={shop.orders} askEnabled={askEnabled} copilot={shop.copilot} />
      ))}
      <div className="actions">
        <a className="button secondary" href="/merchant/setup">
          Shop setup and menu
        </a>
      </div>
    </main>
  );
}
