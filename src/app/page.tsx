// The landing page at the site's root address (Gate 1, reopened and re-approved 2026-10-21; S15
// amendment; reopened and re-approved 2026-11-04 for the third build plan, so it leads with the
// approved pitch and offers Ask Envoi first). It reads no database. It reads the environment only to
// offer Ask Envoi while the assistant is on, as /buy does (S25), because /buy/ask answers 404 when it
// is off. S44, 2026-11-07 (Gate 1 fourth build plan, mockups/landing-tourist.html): it speaks to the
// visitor whose card does not work at the stall, leads with the scan, and "I run a shop" opens /for-shops
// instead of a sign-in form. S55, 2026-11-10 (Gate 1 pre-approved by the user, mockup
// design/landing-mock.html): the hero is a scroll stage, a drawn stall counter with a phone that plays
// the four steps. Every word stays server-rendered; LandingMotion only moves decorative elements.

import { assistantEnabled } from "@/integrations/ai/openai";
import { LandingMotion } from "./landing-motion";
import { LandingSticker } from "./landing-sticker";

const SOURCE_URL = "https://github.com/jaydonnnk/envoi";
const EVIDENCE_URL = "https://github.com/jaydonnnk/envoi/blob/main/docs/plans/envoi/evidence-pack.md";

const STEPS = [
  { title: "Scan", text: "Open Envoi and scan the sticker. It identifies the shop. It is never a payment code, and only enrolled shops can be paid." },
  { title: "Ask", text: "AI explains unfamiliar dishes and builds your order within your budget. Prices come only from the shop's menu." },
  { title: "Approve", text: "You see the total and who gets paid, then approve in PayPal. The money goes to the shop's own PayPal." },
  { title: "Show the stall", text: "After Paid, show your order in the stall's language, so they know what to make." },
];

export const dynamic = "force-dynamic";

export default function Home() {
  const askEnabled = assistantEnabled();
  return (
    <main id="main" className="landing">
      <div className="lp-track" id="lp-track">
        <section className="lp-stage" aria-label="Envoi in four steps">
          <div className="lp-copy-band">
            <div className="landing-hero">
              <p className="lp-eyebrow">For visitors whose card does not work at the stall</p>
              <h1>Scan the stall&apos;s SGQR. Pay with the PayPal you already have.</h1>
              <p className="lead">At a participating shop, scan its SGQR sticker in Envoi. AI explains the dishes and helps you order. You see the exact amount and approve it in PayPal.</p>
              <div className="actions">
                <a className="button" href="/buy/scan">
                  Scan a sticker
                </a>
                {askEnabled && (
                  <a className="button secondary" href="/buy/ask">
                    Ask Envoi
                  </a>
                )}
                <a className="button secondary" href="/for-shops">
                  I run a shop
                </a>
              </div>
            </div>
          </div>

          <div className="lp-scene" aria-hidden="true">
            <div className="lp-awning" />
            <div className="lp-counter" />
            <span className="lp-plate-label">Drawn stall counter, not a photo</span>
            <div className="lp-sticker" id="lp-sticker">
              <LandingSticker />
            </div>
            <div className="lp-phone" id="lp-phone">
              <div className="lp-phone-body">
                <div className="lp-screen">
                  <span className="lp-notch" />
                  <div className="lp-act-screen" data-act="0">
                    <span className="lp-tag">Step 1</span>
                    <h3>Scan</h3>
                    <div className="lp-viewfinder">Point at the sticker</div>
                    <div className="lp-shop">
                      <b>Sample shop</b>
                      <span>Identified from the sticker. Only enrolled shops can be paid.</span>
                    </div>
                  </div>
                  <div className="lp-act-screen" data-act="1">
                    <span className="lp-tag">Step 2</span>
                    <h3>Ask Envoi</h3>
                    <div className="lp-dish"><b>Kopi</b><span className="lp-price">S$1.80</span><span>Strong local coffee, explained in your language.</span></div>
                    <div className="lp-dish"><b>Kaya toast</b><span className="lp-price">S$3.50</span><span>Coconut jam on toast, and what to expect.</span></div>
                    <div className="lp-dish"><b>Soft-boiled eggs</b><span className="lp-price">S$1.20</span><span>Prices come only from the shop&apos;s menu.</span></div>
                    <p className="lp-fine">Illustration. Sample dishes and prices.</p>
                  </div>
                  <div className="lp-act-screen" data-act="2">
                    <span className="lp-tag">Step 3</span>
                    <h3>Approve</h3>
                    <div className="lp-amount">S$6.50</div>
                    <p>To the shop&apos;s own PayPal.</p>
                    <span className="lp-chip lp-wait">Not Paid yet</span>
                    <span className="lp-approve">Approve in PayPal</span>
                    <p className="lp-fine">Test money only. Nothing is Paid until you approve.</p>
                  </div>
                  <div className="lp-act-screen" data-act="3">
                    <span className="lp-tag">Step 4</span>
                    <h3>Show the stall</h3>
                    <span className="lp-chip lp-ok">Paid, test money</span>
                    <p className="lp-big">Your order, shown large in the stall&apos;s language.</p>
                    <p>So they know what to make. Only shown after Paid.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lp-hud" aria-hidden="true">
            <b className="lp-act" id="lp-act">Act 3 of 4</b>
            <span className="lp-bar"><i id="lp-bar" /></span>
            <span id="lp-act-name">Approve</span>
            <span className="lp-hint">Scroll to play</span>
          </div>
        </section>
      </div>

      <div className="lp-below">
        <div className="landing-cards">
          {STEPS.map((step, index) => (
            <section className="card" key={step.title}>
              <span className="lp-step">Step {index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </section>
          ))}
        </div>
        <p className="muted landing-languages">Also available in Japanese, Malay, Spanish and Chinese.</p>
        <nav className="landing-links" aria-label="More">
          <a href="/buy">See all shops</a>
          <a href={SOURCE_URL}>GitHub</a>
          <a href={EVIDENCE_URL}>Evidence</a>
        </nav>
      </div>
      <LandingMotion />
    </main>
  );
}
