"use client";

import { useState } from "react";
import type { DigestAnswer, DigestLanguage } from "@/domain/purchases/digest";
import { requestJson } from "@/lib/browser/session";

// The weekly summary card (S47; Gate 1 mockup merchant-desk.html, Gate 3 S47 amendment). The text is
// written by AI from placeholder names, and every figure in it is filled in by Envoi's server. It is
// written only when the merchant asks, so a page view spends nothing, and it is kept in this page only.

const LANGUAGES: readonly { tag: DigestLanguage; label: string }[] = [
  { tag: "en", label: "English" },
  { tag: "zh", label: "中文" },
  { tag: "ms", label: "Melayu" },
  { tag: "ta", label: "தமிழ்" },
];

const DIGEST_EMPTY = "No paid orders this week, so there is nothing to summarize.";
const DIGEST_REFUSED = "Envoi did not show this summary because it held a figure Envoi did not compute. The totals above are unchanged.";

type Shown = { kind: "idle" } | { kind: "busy" } | { kind: "answer"; answer: DigestAnswer; language: DigestLanguage } | { kind: "failed"; message: string };

export function DigestCard({ outletId }: { outletId: string }) {
  const [language, setLanguage] = useState<DigestLanguage>("en");
  const [shown, setShown] = useState<Shown>({ kind: "idle" });

  // A new language clears the shown summary, so text in the old language never stays on screen. A
  // new summary is written only when the merchant presses the button.
  function choose(tag: DigestLanguage) {
    if (tag === language || shown.kind === "busy") return;
    setLanguage(tag);
    setShown({ kind: "idle" });
  }

  async function write() {
    setShown({ kind: "busy" });
    const result = await requestJson<DigestAnswer>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/digest`, { language });
    if (result.ok && result.data) setShown({ kind: "answer", answer: result.data, language });
    else setShown({ kind: "failed", message: result.error?.message ?? "Envoi could not write this week's summary. The totals above are unchanged." });
  }

  const digest = shown.kind === "answer" ? shown.answer.digest : null;
  return (
    <section className="card orders-card" aria-labelledby={`digest-${outletId}`}>
      <h3 id={`digest-${outletId}`}>This week, written by AI</h3>
      <p className="muted stall-languages">
        <span>Language:</span>
        {LANGUAGES.map((choice) => (
          <button key={choice.tag} type="button" className="stall-language" lang={choice.tag} aria-pressed={choice.tag === language} onClick={() => choose(choice.tag)}>
            {choice.label}
          </button>
        ))}
      </p>
      <div className="actions">
        <button className="button secondary" type="button" onClick={write} disabled={shown.kind === "busy"}>
          {shown.kind === "busy" ? "Writing" : "Write this week's summary"}
        </button>
      </div>
      <div aria-live="polite">
        {digest?.kind === "ok" && (
          <>
            <p className="chip warn">Written by AI</p>
            {digest.paragraphs.map((paragraph) => (
              <p key={paragraph.currency} lang={shown.kind === "answer" ? shown.language : undefined}>
                {paragraph.text}
              </p>
            ))}
          </>
        )}
        {digest?.kind === "empty" && <p className="muted">{DIGEST_EMPTY}</p>}
        {digest?.kind === "refused" && <p className="muted">{DIGEST_REFUSED}</p>}
        {shown.kind === "failed" && (
          <p className="error" role="alert">
            {shown.message}
          </p>
        )}
      </div>
      <p className="muted fine">The figures come from Envoi&apos;s records, not the AI. Sandbox test money.</p>
    </section>
  );
}
