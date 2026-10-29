import type { Metadata } from "next";
import { headers } from "next/headers";
import { importJson, latestImport } from "@/domain/imports/lifecycle";
import { menuImportsOpen, webImportsOpen } from "@/domain/imports/request";
import { getMenuDraft } from "@/domain/menu/draft";
import { draftJson } from "@/domain/menu/serialize";
import { listMerchantOutlets } from "@/domain/outlets/merchant";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { SignInForm, SignOutButton } from "./sign-in";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Merchant setup | Envoi", robots: { index: false, follow: false } };

export default async function MerchantSetupPage() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  // No permanent session: only the sign-in form, with no shop data. A buyer session holds no
  // membership, so it reaches nothing here.
  if (!session || session.user.isAnonymous === true) {
    return (
      <main>
        <p className="eyebrow">Merchant setup</p>
        <h1>Sign in to set up your shop</h1>
        <p className="lead">Demo merchant accounts are created by the Envoi operator. There is no public sign-up.</p>
        <div className="layout">
          <section className="card" aria-labelledby="sign-in-heading">
            <h2 id="sign-in-heading">Merchant sign-in</h2>
            <SignInForm />
          </section>
          {session && (
            <aside className="card warning first-on-phone" aria-labelledby="buyer-session-heading">
              <h2 id="buyer-session-heading">This browser has a buyer session</h2>
              <p>Signing in here replaces it. Receipts opened in this browser will no longer open in it, although Envoi keeps the purchases.</p>
              <p className="fine">To keep them, sign in from a private window instead. Signing in grants the merchant account nothing from the buyer session.</p>
            </aside>
          )}
        </div>
      </main>
    );
  }

  const principal = await requireMerchantMembership(getAuth(), webDb(), requestHeaders);
  if (!isMerchantAccount(principal)) {
    return (
      <main>
        <p className="eyebrow">Merchant setup</p>
        <h1>No approved membership</h1>
        <p className="lead">This account is signed in but holds no operator-approved shop membership, so it cannot set up a shop. Ask the Envoi operator.</p>
        <SignOutButton />
      </main>
    );
  }

  const initial = await listMerchantOutlets(webDb(), principal.userId);
  // The first outlet's draft is read here only because the account holds that outlet's membership.
  const first = initial.outlets[0];
  const draft = first ? await getMenuDraft(webDb(), first.id) : null;
  const latest = first ? await latestImport(webDb(), first.id, new Date()) : null;
  return (
    <main>
      <p className="eyebrow">Merchant setup</p>
      <h1>Your shop</h1>
      <p className="lead">Signed in as {session.user.name}. Buyers see only what you publish; drafts stay invisible to them.</p>
      <Workspace initial={initial} importsOpen={menuImportsOpen()} webImportsOpen={webImportsOpen()} initialDraft={draft ? { ...draftJson(draft), latestImport: latest ? importJson(latest) : null } : null} />
      <div className="actions">
        <a className="button secondary" href="/merchant/orders">
          See orders
        </a>
        <SignOutButton />
      </div>
    </main>
  );
}
