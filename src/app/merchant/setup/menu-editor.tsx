"use client";

import { useState } from "react";
import type { DraftJson } from "@/domain/menu/serialize";
import type { MenuItemDraft } from "@/domain/menu/types";
import { requestJson } from "@/lib/browser/session";
import { MenuGrid, type GridRow } from "./menu-grid";
import { MenuPhotoImport, type DraftWithImport } from "./menu-import";
import { MenuWebImport, type BlankPrice } from "./menu-web-import";
import { useRestoreFocus } from "@/lib/browser/focus";

type Row = { key: string; id?: string; name: string; portion: string; price: string; availability: MenuItemDraft["availability"]; fromImport?: boolean };

// Why a web-imported price is blank, in the merchant's words (Gate 3 grid rules). Only a web import
// reports reasons, so a price the model found no digits for was not printed as text on the page.
const BLANK_REASON: Record<BlankPrice["basis"], string> = {
  not_on_page: "The price was not printed as text on your page",
  blank: "The price was not printed as text on your page",
  ambiguous: "The drafted price could not be read",
  other_currency: "The price was not in SGD",
  duplicate_variant: "Two rows share this name and portion",
  explicit: "Price needed",
};

const variantKey = (name: string, portion: string | null) => `${name.trim().toLowerCase()}\u0000${(portion ?? "").trim().toLowerCase()}`;

const SINGAPORE = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" });

function priceText(cents: number | null): string {
  return cents === null ? "" : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// "4", "4.5" and "4.50" are prices; blank is no price. Anything else is unreadable and is never
// guessed, so it cannot be saved.
function parsePrice(text: string): { cents: number | null } | { invalid: true } {
  const trimmed = text.trim().replace(/^S\$\s*/i, "");
  if (trimmed === "") return { cents: null };
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return { invalid: true };
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 && cents <= 100_000 ? { cents } : { invalid: true };
}

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

function rowsOf(draft: DraftJson): Row[] {
  return draft.items.map((item) => ({
    key: item.id,
    id: item.id,
    name: item.name,
    portion: item.portion ?? "",
    price: priceText(item.priceSgdCents),
    availability: item.availability,
    fromImport: item.source === "import_suggestion",
  }));
}

// The page renders the draft it loaded on the server; the editor reloads it only when asked. When the
// shop is published and has no unpublished changes, the editor shows the published menu; saving an
// edit of it creates a new draft, and buyers keep the published menu until the next publication.
export function MenuEditor({
  outletId,
  outletPublished,
  importsOpen,
  webImportsOpen,
  initialDraft,
  onDraftChange,
}: {
  outletId: string;
  outletPublished: boolean;
  importsOpen: boolean;
  webImportsOpen: boolean;
  initialDraft: DraftWithImport | null;
  onDraftChange: () => void;
}) {
  const url = `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}`;
  const [draft, setDraft] = useState<DraftWithImport | null>(initialDraft);
  const [rows, setRows] = useState<Row[]>(() => (initialDraft ? rowsOf(initialDraft) : []));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<"save" | "confirm" | null>(null);
  const busy = pending !== null;
  useRestoreFocus(busy);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [attested, setAttested] = useState(false);
  // The last web import's blank-price reasons, by name and portion; a reload forgets them.
  const [blankReasons, setBlankReasons] = useState<Map<string, string>>(new Map());

  async function load() {
    const result = await requestJson<DraftWithImport>("GET", `${url}/menu-draft`);
    if (!result.ok || !result.data) {
      setMessage({ tone: "error", text: result.error?.message ?? "The menu draft could not be loaded." });
      return;
    }
    setDraft(result.data);
    setRows(rowsOf(result.data));
    setDirty(false);
    setConflict(false);
    setAttested(false);
    setMessage(null);
    setBlankReasons(new Map());
  }

  function imported(merged: DraftWithImport, blankPrices: BlankPrice[] = []) {
    setBlankReasons(new Map(blankPrices.map((blank) => [variantKey(blank.name, blank.portion), BLANK_REASON[blank.basis]])));
    setDraft(merged);
    setRows(rowsOf(merged));
    setDirty(false);
    setConflict(false);
    setAttested(false);
    onDraftChange();
  }

  function edit(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, fromImport: false } : row)));
    setDirty(true);
    setAttested(false);
    setMessage(null);
  }

  function add() {
    setRows((current) => [...current, { key: newKey(), name: "", portion: "", price: "", availability: "unknown" }]);
    setDirty(true);
    setAttested(false);
  }

  function remove(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
    setDirty(true);
    setAttested(false);
  }

  const parsed = rows.map((row) => ({ row, price: parsePrice(row.price) }));
  const unreadable = parsed.filter(({ price }) => "invalid" in price).length;

  async function save() {
    if (!draft || unreadable > 0) return;
    setPending("save");
    setMessage(null);
    const items = parsed.map(({ row, price }) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name,
      portion: row.portion.trim() === "" ? null : row.portion,
      priceSgdCents: "cents" in price ? price.cents : null,
      availability: row.availability,
    }));
    const result = await requestJson<DraftJson>("PUT", `${url}/menu-draft`, { revisionId: draft.revisionId, version: draft.version, items });
    setPending(null);
    if (result.error?.code === "revision_conflict") {
      setConflict(true);
      setMessage({ tone: "error", text: "This menu was changed somewhere else since you loaded it, so your changes were not saved. Reload to see the latest version." });
      return;
    }
    if (!result.ok || !result.data) {
      setMessage({ tone: "error", text: result.error?.message ?? "The draft could not be saved. Try again." });
      return;
    }
    setDraft(result.data);
    setRows(rowsOf(result.data));
    setDirty(false);
    setMessage({ tone: "ok", text: `Draft saved as version ${result.data.version}.` });
    onDraftChange();
  }

  async function confirm() {
    if (!draft) return;
    setPending("confirm");
    setMessage(null);
    const result = await requestJson<DraftJson>("POST", `${url}/confirm`, { revisionId: draft.revisionId, version: draft.version });
    setPending(null);
    if (result.error?.code === "revision_conflict") {
      setConflict(true);
      setMessage({ tone: "error", text: "This menu was changed somewhere else since you loaded it, so nothing was confirmed. Reload to review the latest version." });
      return;
    }
    if (!result.ok || !result.data) {
      setMessage({ tone: "error", text: result.error?.message ?? "The menu could not be confirmed. Try again." });
      return;
    }
    setDraft(result.data);
    setAttested(false);
    onDraftChange();
  }

  if (!draft) {
    return (
      <section className="card" aria-labelledby="menu-heading">
        <h2 id="menu-heading">2. Menu</h2>
        <p className="error">{message?.text ?? "The menu draft could not be loaded."}</p>
        <button className="button secondary" type="button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  const incomplete = new Set(draft.completeness.complete ? [] : draft.completeness.incompleteItemIds);
  const origin = draft.latestImport?.source === "web_page" ? "On your page" : "From photo";
  const gridRows: GridRow[] = parsed.map(({ row, price }) => ({
    key: row.key,
    id: row.id,
    name: row.name,
    portion: row.portion,
    price: row.price,
    availability: row.availability,
    blankReason: row.fromImport ? blankReasons.get(variantKey(row.name, row.portion)) : undefined,
    origin: row.fromImport ? origin : undefined,
    priceInvalid: "invalid" in price,
    priceMissing: "cents" in price && price.cents === null,
    flagged: row.id !== undefined && incomplete.has(row.id),
  }));
  const confirmed = draft.status === "confirmed" && !dirty;
  const live = draft.published && !dirty;
  const canConfirm = !dirty && !confirmed && !conflict && rows.length > 0 && draft.completeness.complete && attested && !busy;

  return (
    <section className="card" aria-labelledby="menu-heading">
      <h2 id="menu-heading">2. Menu</h2>
      <p className="muted">Type each item with its SGD price. Leave a price blank if you do not know it yet: it stays blank, never zero, and blocks confirmation until you fill it.</p>
      {draft.published && (
        <p className="muted">Changes you save here become a new draft. Buyers keep seeing the published menu until you confirm and publish the new version.</p>
      )}

      <MenuPhotoImport outletId={outletId} open={importsOpen} draft={draft} dirty={dirty} onImported={imported} onReload={load} />

      {webImportsOpen && <MenuWebImport outletId={outletId} draft={draft} dirty={dirty} onImported={imported} />}

      <MenuGrid rows={gridRows} onEdit={edit} onRemove={remove} />
      <p className="fine">Every cell can be edited: use the arrow keys to move, Enter to edit and Enter again to keep the change. A blank price stays blank until you type it, and the menu cannot be confirmed while one is blank.</p>

      <div className="actions">
        <button className="button secondary" type="button" onClick={add} disabled={rows.length >= 100}>
          Add an item
        </button>
        <button className="button" type="button" onClick={save} disabled={!dirty || busy || unreadable > 0 || conflict}>
          {pending === "save" ? "Saving" : "Save draft"}
        </button>
        {conflict && (
          <button className="button secondary" type="button" onClick={load}>
            Reload latest
          </button>
        )}
      </div>

      <div aria-live="polite">
        {message && (
          <p className={message.tone === "error" ? "error" : "muted"} role={message.tone === "error" ? "alert" : undefined}>
            {message.text}
          </p>
        )}
      </div>

      <div className={`status draft-status${confirmed ? " ok" : ""}`}>
        {live ? (
          <>
            <strong>Published menu</strong>
            <small>This is the menu buyers see now.</small>
          </>
        ) : confirmed ? (
          <>
            <strong>Confirmed version {draft.version}</strong>
            <small>
              Confirmed {draft.confirmedAt ? SINGAPORE.format(new Date(draft.confirmedAt)) : ""}.{" "}
              {outletPublished ? "Not published yet: buyers still see the menu you published last." : "Not published: buyers cannot see this shop or its menu."} Any edit needs
              confirming again.
            </small>
          </>
        ) : (
          <>
            <strong>{dirty ? "Unsaved changes" : `Draft version ${draft.version}, not confirmed`}</strong>
            <small>
              {dirty
                ? "Save the draft before you confirm it."
                : rows.length === 0
                  ? "Add at least one item."
                  : draft.completeness.complete
                    ? "Every item has a name, a price and your availability choice."
                    : `${draft.completeness.incompleteItemIds.length} of ${rows.length} items still need a name, a price or your availability choice.`}
            </small>
          </>
        )}
      </div>

      {!confirmed && !live && (
        <>
          <label className="check">
            <input type="checkbox" checked={attested} disabled={dirty || !draft.completeness.complete || rows.length === 0} onChange={(event) => setAttested(event.target.checked)} />
            I checked every name, price and availability, and confirm this complete menu.
          </label>
          <button className="button full" type="button" onClick={confirm} disabled={!canConfirm}>
            {pending === "confirm" ? "Confirming" : "Confirm menu"}
          </button>
        </>
      )}
    </section>
  );
}
