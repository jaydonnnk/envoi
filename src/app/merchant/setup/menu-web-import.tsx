"use client";

import { useState } from "react";
import { WEB_MENU_CONSENT_TEXT, WEB_MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import type { DraftItemSuggestion } from "@/domain/menu/types";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";
import type { DraftWithImport } from "./menu-import";

// Menu from the shop's own page (S24; mockup merchant-web-import.html). Rendered only while web
// imports are open. The merchant pastes one https link, ticks that the page is their shop's own and
// taps "Read my page"; the answer is a filled draft table, a picture menu or a page not opened.

export type BlankPrice = { name: string; portion: string | null; basis: DraftItemSuggestion["priceBasis"] };

type Imported = { import: { rowsDrafted: number; rowsBlankPrice: number; droppedNames: number; added: number; blankPrices: BlankPrice[] }; draft: DraftWithImport };

type Answer =
  | { kind: "drafted"; host: string; drafted: number; blank: number }
  | { kind: "picture" }
  | { kind: "not_opened" }
  | { kind: "error"; text: string };

export function MenuWebImport({
  outletId,
  draft,
  dirty,
  onImported,
}: {
  outletId: string;
  draft: DraftWithImport;
  dirty: boolean;
  onImported: (draft: DraftWithImport, blankPrices: BlankPrice[]) => void;
}) {
  const [link, setLink] = useState("");
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const confirmed = draft.status === "confirmed" && !dirty;

  async function read(event: React.FormEvent) {
    event.preventDefault();
    if (!owned || link.trim() === "") return;
    setBusy(true);
    setAnswer(null);
    const result = await requestJson<Imported>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/menu-imports/web`, {
      url: link.trim(),
      consentVersion: WEB_MENU_CONSENT_VERSION,
      baseRevisionId: draft.revisionId,
    });
    setBusy(false);
    if (result.ok && result.data) {
      let host = "";
      try {
        host = new URL(link.trim()).hostname;
      } catch {
        // The server accepted the link, so this does not happen; the answer then names no host.
      }
      setAnswer({ kind: "drafted", host, drafted: result.data.import.rowsDrafted, blank: result.data.import.rowsBlankPrice });
      onImported(result.data.draft, result.data.import.blankPrices);
      return;
    }
    const error = result.error;
    if (error?.details?.outcome === "picture_menu") setAnswer({ kind: "picture" });
    else if (error?.code === "validation_failed" || ["page_refused", "page_timeout", "page_unreachable"].includes(String(error?.details?.outcome))) setAnswer({ kind: "not_opened" });
    else setAnswer({ kind: "error", text: error?.message ?? "The connection was lost. Reload the draft to check whether it finished before trying again." });
  }

  return (
    <div className="web-import">
      <h3>Already have your menu online?</h3>
      <p className="muted">Paste the link to your shop&apos;s own menu page. Envoi reads the text on that page once and drafts your items. You check every price in the table, then confirm the menu yourself. Nothing is published by the draft.</p>
      <form onSubmit={read}>
        <label htmlFor="menu-page-link">Link to your shop&apos;s menu page</label>
        <input id="menu-page-link" type="url" inputMode="url" autoComplete="url" placeholder="https://" value={link} maxLength={2048} onChange={(event) => setLink(event.target.value)} required />
        <label className="check">
          <input type="checkbox" checked={owned} onChange={(event) => setOwned(event.target.checked)} />
          {WEB_MENU_CONSENT_TEXT.short[0]}
        </label>
        <details className="fine">
          <summary>Details</summary>
          {[...WEB_MENU_CONSENT_TEXT.short.slice(1), ...WEB_MENU_CONSENT_TEXT.details].map((line) => (
            <p key={line}>{line}</p>
          ))}
        </details>
        <div className="actions">
          <button className="button" type="submit" disabled={!owned || link.trim() === "" || busy || dirty || confirmed}>
            {busy ? "Reading your page" : "Read my page"}
          </button>
        </div>
        <p className="fine">Public pages only. Envoi does not sign in, follow links or read pictures on the page. Photo import is still not available.</p>
        {dirty && <p className="fine">Save your changes before reading a page.</p>}
        {confirmed && <p className="fine">Change the menu to unconfirm it before reading a page.</p>}
      </form>
      <div aria-live="polite">
        {answer?.kind === "drafted" && (
          <p className="status ok">
            <strong>
              {answer.drafted} {answer.drafted === 1 ? "item" : "items"} drafted{answer.host ? ` from ${answer.host}` : ""} · {answer.blank} {answer.blank === 1 ? "price" : "prices"} to fill in
            </strong>
            <small>Check every row in the table below, then save and confirm.</small>
          </p>
        )}
        {answer?.kind === "picture" && (
          <div className="status warn" role="alert">
            <strong>Your page shows its menu as a picture</strong>
            <small>Envoi reads text only, so nothing was drafted. Type the menu instead.</small>
          </div>
        )}
        {answer?.kind === "not_opened" && (
          <div className="status warn" role="alert">
            <strong>We could not open that page</strong>
            <small>It needs a sign-in, did not load in time, or is not a public https link. Nothing was drafted, and your menu is unchanged.</small>
          </div>
        )}
        {answer?.kind === "error" && (
          <p className="error" role="alert">
            {answer.text}
          </p>
        )}
      </div>
    </div>
  );
}
