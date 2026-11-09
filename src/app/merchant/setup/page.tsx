import type { Metadata } from "next";
import { headers } from "next/headers";
import { importJson, latestImport } from "@/domain/imports/lifecycle";
import { menuImportsOpen, webImportsOpen } from "@/domain/imports/request";
import { getMenuDraft } from "@/domain/menu/draft";
import { draftJson } from "@/domain/menu/serialize";
import { listMerchantOutlets } from "@/domain/outlets/merchant";
import { PAYPAL_PYUSD_REWARDS } from "@/domain/rewards/paypal-pyusd";
import { merchantMailSettings, merchantSignupOpen } from "@/env";
import { getAuth } from "@/lib/auth";
import { isMerchantAccount, requireMerchantMembership } from "@/lib/auth-context";
import { webDb } from "@/lib/db/web";
import { SignInForm, SignOutButton } from "./sign-in";
import { ShopSignUpForm, SignUpForm } from "./sign-up";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Merchant setup | Envoi", robots: { index: false, follow: false } };

const SIGNUP_LEAD = "Test environment. Nothing here takes real money. An Envoi admin approves every shop before it can sell.";

export default async function MerchantSetupPage() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  // Public signup requires the switch and configured confirmation mail.
  const signupOpen = merchantSignupOpen();
  // Password reset is offered only while mail settings exist (Gate 2 decision 6).
  const resetAvailable = merchantMailSettings() !== null;

  // No permanent session: only the sign-in form (and, with sign-up open, the sign-up form), with no
  // shop data. A buyer session holds no membership, so it reaches nothing here.
  if (!session || session.user.isAnonymous === true) {
    const buyerSession = session && (
      <aside className="card warning first-on-phone" aria-labelledby="buyer-session-heading">
        <h2 id="buyer-session-heading">This browser has a buyer session</h2>
        <p>Signing in here replaces it. Receipts opened in this browser will no longer open in it, although Envoi keeps the purchases.</p>
        <p className="fine">To keep them, sign in from a private window instead. Signing in grants the merchant account nothing from the buyer session.</p>
      </aside>
    );
    if (signupOpen) {
      return (
        <main>
          <p className="eyebrow">Merchant setup</p>
          <h1>Set up your shop</h1>
          <p className="lead">{SIGNUP_LEAD}</p>
          <div className="layout paired">
            <section className="card slip" aria-labelledby="sign-up-heading">
              <h2 id="sign-up-heading">Create your account</h2>
              <SignUpForm />
            </section>
            <div className="stack">
              {buyerSession}
              <section className="card" aria-labelledby="sign-in-heading">
                <h2 id="sign-in-heading">Already have an account?</h2>
                <SignInForm resetAvailable={resetAvailable} />
              </section>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main>
        <p className="eyebrow">Merchant setup</p>
        <h1>Sign in to set up your shop</h1>
        <p className="lead">Demo merchant accounts are created by the Envoi operator. There is no public sign-up.</p>
        <div className="layout">
          <section className="card" aria-labelledby="sign-in-heading">
            <h2 id="sign-in-heading">Merchant sign-in</h2>
            <SignInForm resetAvailable={resetAvailable} />
          </section>
          {buyerSession}
        </div>
      </main>
    );
  }

  const principal = await requireMerchantMembership(getAuth(), webDb(), requestHeaders);
  if (!isMerchantAccount(principal)) {
    // With sign-up open, a permanent account with no shop creates its one test shop here; the
    // database refuses one that holds any membership row.
    if (signupOpen) {
      return (
        <main>
          <p className="eyebrow">Merchant setup</p>
          <h1>Set up your shop</h1>
          <p className="lead">{SIGNUP_LEAD}</p>
          <div className="layout">
            <section className="card slip" aria-labelledby="shop-heading">
              <h2 id="shop-heading">Create your shop</h2>
              <p className="muted">Signed in as {session.user.email}. One shop per account.</p>
              <ShopSignUpForm />
            </section>
          </div>
          <div className="actions">
            <SignOutButton />
          </div>
        </main>
      );
    }
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
  // S43 decision 9: the imports refuse a self-created shop until it is approved, so none is offered.
  const pendingSelfSignup = first !== undefined && first.selfSignup && first.enrollment !== "approved";
  return (
    <main>
      <p className="eyebrow">Merchant setup</p>
      <h1>Your shop</h1>
      <p className="lead">Signed in as {session.user.name}. Buyers see only what you publish; drafts stay invisible to them.</p>
      <Workspace initial={initial} rewardsTerms={PAYPAL_PYUSD_REWARDS} importsOpen={menuImportsOpen() && !pendingSelfSignup} webImportsOpen={webImportsOpen() && !pendingSelfSignup} initialDraft={draft ? { ...draftJson(draft), latestImport: latest ? importJson(latest) : null } : null} />
      <div className="actions">
        <a className="button secondary" href="/merchant/orders">
          See orders
        </a>
        <SignOutButton />
      </div>
    </main>
  );
}
