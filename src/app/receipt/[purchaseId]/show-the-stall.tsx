"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { keepSafeTranslations } from "@/domain/menu/translation-rules";
import { postJson } from "@/lib/browser/session";

// Show the stall (S42): after a paid receipt, the order in large text in a language the visitor
// chooses, for the stall to read or hear. The translated text sits beside the shop's own names and
// the paid amount, which come only from the purchase: nothing here can change or state a payment.

export const STALL_LANGUAGES = [
  { tag: "en", label: "English" },
  { tag: "zh", label: "中文" },
  { tag: "ms", label: "Melayu" },
  { tag: "ta", label: "தமிழ்" },
] as const;

export type StallLanguage = (typeof STALL_LANGUAGES)[number]["tag"];
export type StallLine = { menuItemId: string; name: string; quantity: number };
export type StallRow = StallLine & { translated: string | null };
export type ProposedName = { itemId: string; name: string };

// Each line with its translated name, when one exists for that exact item and passes the menu's rules
// again here. A name carrying a digit or currency sign its original lacks is dropped, so the only
// amount on the card is the purchase's. A line from an older menu revision matches nothing and shows
// its original name alone.
export function stallRows(lines: readonly StallLine[], proposed: readonly ProposedName[]): StallRow[] {
  const original = lines.map((line) => ({ id: line.menuItemId, name: line.name }));
  const kept = keepSafeTranslations(original, proposed.map((item) => ({ itemId: item.itemId, name: item.name, explanation: null })));
  const names = new Map(kept.map((item) => [item.itemId, item.name]));
  return lines.map((line) => ({ ...line, translated: names.get(line.menuItemId) ?? null }));
}

// Any refusal or failure answers null, and the original names stay.
export async function fetchStallTranslation(outletId: string, language: StallLanguage, signal?: AbortSignal): Promise<ProposedName[] | null> {
  try {
    const answer = await postJson<{ items?: ProposedName[] }>("/api/v1/buyer/menu-translations", { outletId, language }, signal);
    return answer.ok && Array.isArray(answer.data?.items) ? answer.data.items : null;
  } catch {
    return null;
  }
}

// Browsers name voices "zh-CN" or, on some Android versions, "zh_CN".
// Tamil is never spoken: a listed ta voice was heard reading only the digits of an order, and a browser
// cannot tell in advance whether a voice can read the words.
export function voiceMatches(voiceLang: string, language: StallLanguage): boolean {
  if (language === "ta") return false;
  return voiceLang.toLowerCase().split(/[-_]/)[0] === language;
}

export function spokenOrder(rows: readonly StallRow[]): string {
  return rows.map((row) => `${row.quantity} ${row.translated ?? row.name}`).join(". ");
}

export type StallStatus = "original" | "translating" | "translated" | "failed";

export function StallCard({
  rows,
  language,
  choose,
  status,
  paidAmount,
  onPlay,
}: {
  rows: readonly StallRow[];
  language: StallLanguage;
  choose: ((language: StallLanguage) => void) | null;
  status: StallStatus;
  paidAmount: string;
  onPlay: (() => void) | null;
}) {
  return (
    <section className="card show-the-stall" aria-labelledby="show-the-stall-heading">
      <h2 id="show-the-stall-heading">Show the stall</h2>
      {choose && (
        <p className="muted stall-languages">
          <span>{status === "translated" && "AI translation. "}Language:</span>
          {STALL_LANGUAGES.map((choice) => (
            <button key={choice.tag} type="button" className="stall-language" lang={choice.tag} aria-pressed={choice.tag === language} onClick={() => choose(choice.tag)}>
              {choice.label}
            </button>
          ))}
        </p>
      )}
      <div className="stall-order" aria-live="polite">
        {rows.map((row) => (
          <p key={row.menuItemId} lang={row.translated === null ? undefined : language}>
            {row.translated ?? row.name} × {row.quantity}
          </p>
        ))}
      </div>
      {status === "translating" && <p className="muted">Translating the order.</p>}
      {status === "failed" && <p className="muted">A translation could not be made. The shop&apos;s own names are shown.</p>}
      {status === "translated" && (
        <p className="stall-originals">
          {rows.map((row) => (
            <span key={row.menuItemId}>
              {row.name} × {row.quantity}
            </span>
          ))}
        </p>
      )}
      <p className="stall-paid">
        <strong>{paidAmount} paid</strong>
      </p>
      {onPlay && (
        <div className="actions">
          <button className="button secondary" type="button" onClick={onPlay}>
            Play aloud
          </button>
        </div>
      )}
      <p className="muted stall-note">Payment confirmed does not mean the shop has accepted the order.</p>
    </section>
  );
}

function subscribeVoices(onChange: () => void): () => void {
  if (!("speechSynthesis" in window)) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

const voiceLangs = () => ("speechSynthesis" in window ? window.speechSynthesis.getVoices().map((voice) => voice.lang).join(" ") : "");
const noVoices = () => "";

export function ShowTheStall({
  outletId,
  lines,
  paidAmount,
  translationAvailable,
}: {
  outletId: string;
  lines: readonly StallLine[];
  paidAmount: string;
  translationAvailable: boolean;
}) {
  const [language, setLanguage] = useState<StallLanguage>("en");
  // The answer per language: names, or null when none could be made. Absent means not answered yet.
  const [answers, setAnswers] = useState<Partial<Record<StallLanguage, ProposedName[] | null>>>({});
  const voices = useSyncExternalStore(subscribeVoices, voiceLangs, noVoices);

  // English is the shop's own text: the route never rewrites an English name, so no request is made.
  const answer = language === "en" ? [] : answers[language];
  const answered = answer !== undefined;

  useEffect(() => {
    if (answered) return;
    const controller = new AbortController();
    void fetchStallTranslation(outletId, language, controller.signal).then((names) => {
      if (!controller.signal.aborted) setAnswers((current) => ({ ...current, [language]: names }));
    });
    return () => controller.abort();
  }, [outletId, language, answered]);

  // Speech stops with the text it was reading.
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [language],
  );

  const rows = stallRows(lines, answer ?? []);
  const status: StallStatus =
    language === "en" ? "original" : !answered ? "translating" : rows.some((row) => row.translated !== null) ? "translated" : "failed";
  // Audio plays only a whole order in the chosen language, on a voice that speaks it.
  const complete = status === "original" || (status === "translated" && rows.every((row) => row.translated !== null));
  const speakable = complete && voices.split(" ").some((voice) => voiceMatches(voice, language));

  function play() {
    const voice = window.speechSynthesis.getVoices().find((candidate) => voiceMatches(candidate.lang, language));
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(spokenOrder(rows));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <StallCard rows={rows} language={language} choose={translationAvailable ? setLanguage : null} status={status} paidAmount={paidAmount} onPlay={speakable ? play : null} />
  );
}
