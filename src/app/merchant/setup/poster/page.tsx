import type { Metadata } from "next";
import { headers } from "next/headers";
import { listMerchantOutlets } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { CounterPoster } from "./poster";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your counter poster | Envoi", robots: { index: false, follow: false } };

export default async function PosterPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const principal = await requireMerchantMembership(getAuth(), webDb(), await headers());
  if (!isMerchantAccount(principal)) {
    return <main><h1>Sign in with an approved merchant account</h1><p><a href="/merchant/setup">Go to merchant sign-in</a></p></main>;
  }
  const { outlets } = await listMerchantOutlets(webDb(), principal.userId);
  const { outlet: selected } = await searchParams;
  const outlet = selected === undefined ? outlets.find((shop) => shop.published) : outlets.find((shop) => shop.id === selected);
  if (!outlet) {
    return <main><h1>Shop not available</h1><p><a href="/merchant/setup">Back to your shops</a></p></main>;
  }
  if (!outlet.published) {
    return <main><h1>Publish your shop before printing its poster</h1><p><a href="/merchant/setup">Back to setup</a></p></main>;
  }
  return (
    <main className="poster-page">
      <div className="poster-controls">
        <p className="eyebrow">Merchant setup</p>
        <h1>Your counter poster</h1>
        <p className="lead">Print this and place it beside your existing SGQR.</p>
        <p><a href="/merchant/setup">Back to your shop</a></p>
      </div>
      <CounterPoster key={outlet.id} outlet={{ name: outlet.name, isDemoFixture: outlet.isDemoFixture }} />
    </main>
  );
}
