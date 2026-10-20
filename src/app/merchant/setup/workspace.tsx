"use client";

import { useState } from "react";
import type { DraftJson } from "@/domain/menu/serialize";
import type { MerchantOutlet, MerchantOutlets } from "@/domain/outlets/merchant";
import type { PublicationCheck } from "@/domain/outlets/publish";
import { requestJson } from "@/lib/browser/session";
import { MenuEditor } from "./menu-editor";
import type { DraftWithImport } from "./menu-import";
import { PyusdWalletCard } from "./pyusd-wallet";
import { SgqrSticker } from "./sgqr-sticker";
import { useRestoreFocus } from "@/lib/browser/focus";

function OutletChips({ outlet }: { outlet: MerchantOutlet }) {
  return (
    <span className="chips">
      {outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
      <span className={`chip${outlet.published ? " ok" : ""}`}>{outlet.published ? "Published" : "Unpublished"}</span>
      <span className="chip">{outlet.enrollment === "approved" ? "Enrollment approved" : "Enrollment pending"}</span>
      <span className="chip">{outlet.detailsConfirmed ? "Details confirmed" : "Details not confirmed"}</span>
    </span>
  );
}

// Name and area for a new shop, or for editing an unpublished one. Editing asks again whether the
// merchant reviewed the details; saving without that clears the shop's details confirmation.
type Saved = { outlet: MerchantOutlet; draft?: DraftJson };

function OutletForm({ outlet, submitLabel, onSaved, onCancel }: { outlet?: MerchantOutlet; submitLabel: string; onSaved: (saved: Saved) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), area: form.get("area") };
    setBusy(true);
    setError(null);
    const result = outlet
      ? await requestJson<Saved>("PATCH", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}`, { ...body, detailsConfirmed: form.get("confirmed") === "on" })
      : await requestJson<Saved>("POST", "/api/v1/merchant/outlets", body);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The shop could not be saved. Try again.");
      return;
    }
    onSaved(result.data);
  }

  const prefix = outlet ? `outlet-${outlet.id}` : "new-outlet";
  return (
    <form onSubmit={submit}>
      <label htmlFor={`${prefix}-name`}>Shop name</label>
      <input id={`${prefix}-name`} name="name" defaultValue={outlet?.name} maxLength={80} required />
      <label htmlFor={`${prefix}-area`}>Outlet area</label>
      <input id={`${prefix}-area`} name="area" defaultValue={outlet?.area} maxLength={80} placeholder="For example Tanjong Pagar" required />
      {outlet && (
        <label className="check">
          <input type="checkbox" name="confirmed" />I reviewed the shop name and area.
        </label>
      )}
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Saving" : submitLabel}
        </button>
        {onCancel && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ConfirmDetails({ outlet, onSaved }: { outlet: MerchantOutlet; onSaved: (saved: Saved) => void }) {
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await requestJson<Saved>("PATCH", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}`, { name: outlet.name, area: outlet.area, detailsConfirmed: true });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The details could not be confirmed. Try again.");
      return;
    }
    onSaved(result.data);
  }

  return (
    <>
      <label className="check">
        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the shop name and area.
      </label>
      <div className="actions">
        <button className="button" type="button" onClick={confirm} disabled={!reviewed || busy}>
          {busy ? "Confirming" : "Confirm details"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

// The PayPal sandbox connection the Envoi operator prepared for this shop. The merchant can only
// use that one; no seller id can be typed here.
function PayPalCard({ outlet, onSaved }: { outlet: MerchantOutlet; onSaved: (saved: Saved) => void }) {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  const connection = outlet.paypal;

  async function use() {
    if (!connection) return;
    setBusy(true);
    setError(null);
    const result = await requestJson<Saved>("PUT", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}/destinations/paypal`, { sellerMerchantId: connection.sellerMerchantId });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The connection could not be used. Try again.");
      return;
    }
    onSaved(result.data);
  }

  return (
    <section className="card" aria-labelledby="paypal-heading">
      <div className="rail-head wrap">
        <h2 id="paypal-heading">3. PayPal sandbox</h2>
        <span className="chip warn">Sandbox: test money only</span>
      </div>
      {!connection ? (
        <p className="muted">The Envoi operator has not prepared a PayPal sandbox connection for this shop yet. Buyers pay this shop&apos;s own PayPal sandbox account, never Envoi&apos;s.</p>
      ) : (
        <>
          <div className={`status${connection.accepted && connection.status === "active" ? " ok" : ""}`}>
            <strong>Sandbox seller {connection.sellerMerchantId}</strong>
            <small>
              {connection.status !== "active"
                ? "Disconnected. Ask the Envoi operator."
                : connection.accepted
                  ? "In use. Buyers' payments go straight to this sandbox seller account."
                  : "Prepared for this shop by the Envoi operator. Buyers' payments will go straight to this sandbox seller account."}
            </small>
          </div>
          {connection.status === "active" && !connection.accepted && (
            <button className="button" type="button" onClick={use} disabled={busy}>
              {busy ? "Saving" : "Use this connection"}
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const CHECKS: { check: PublicationCheck; label: string }[] = [
  { check: "enrollment", label: "Enrollment approved by the Envoi operator" },
  { check: "outlet_details", label: "Shop details confirmed" },
  { check: "menu_confirmation", label: "Menu confirmed" },
  { check: "destination", label: "PayPal sandbox connection in use, or a verified PYUSD devnet wallet while PYUSD is on" },
];

function PublishCard({ outlet, onPublished }: { outlet: MerchantOutlet; onPublished: (saved: Saved) => void }) {
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  const { publication } = outlet;
  const pending = publication.draftRevisionId !== null && publication.draftVersion !== null;
  const ready = pending && publication.missing.length === 0;

  async function publish() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await requestJson<Saved>("POST", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}/publish`, {
      revisionId: publication.draftRevisionId,
      version: publication.draftVersion,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? "The menu could not be published. Try again.");
      return;
    }
    onPublished(result.data);
  }

  return (
    <section className="card" aria-labelledby="publish-heading">
      <h2 id="publish-heading">4. Publish</h2>
      {outlet.published && !pending ? (
        <div className="status ok">
          <strong>Published</strong>
          <small>Buyers see this shop and its menu. Edit the menu to prepare a new version; buyers keep this one until you publish again.</small>
        </div>
      ) : (
        <>
          <p className="muted">
            {outlet.published
              ? "Buyers still see the menu you published last. Publishing replaces it; anyone holding an older review is asked to review again."
              : "Buyers cannot see this shop until you publish. Every check below must hold."}
          </p>
          <ul className="checklist">
            {CHECKS.map(({ check, label }) => {
              const done = !publication.missing.includes(check);
              return (
                <li key={check} className={done ? "done" : undefined}>
                  <span className={`chip ${done ? "ok" : "warn"}`}>{done ? "Done" : "Needed"}</span>
                  {label}
                </li>
              );
            })}
          </ul>
          <div className="actions">
            <button className="button" type="button" onClick={publish} disabled={!ready || busy}>
              {busy ? "Publishing" : outlet.published ? "Publish this new version" : "Publish shop"}
            </button>
          </div>
        </>
      )}
      {outlet.published && (
        <p className="fine">
          <a href={`/buy?outlet=${encodeURIComponent(outlet.id)}`}>See the shop as a buyer</a>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// A draft that cannot be loaded, including on a network failure, is null: the menu editor then shows
// its error with "Try again".
const fetchDraft = async (outletId: string) => (await requestJson<DraftWithImport>("GET", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/menu-draft`)).data ?? null;

export function Workspace({ initial, initialDraft, importsOpen }: { initial: MerchantOutlets; initialDraft: DraftWithImport | null; importsOpen: boolean }) {
  const [outlets, setOutlets] = useState(initial.outlets);
  const [canCreate, setCanCreate] = useState(initial.canCreateOutlet);
  const [selected, setSelected] = useState<{ id: string; draft: DraftWithImport | null } | null>(
    initial.outlets[0] ? { id: initial.outlets[0].id, draft: initialDraft } : null,
  );
  const [editing, setEditing] = useState(false);
  // Remounts the menu editor with the published menu after a publication.
  const [editorGeneration, setEditorGeneration] = useState(0);
  const outlet = outlets.find((candidate) => candidate.id === selected?.id) ?? null;

  async function select(outletId: string) {
    setEditing(false);
    setSelected({ id: outletId, draft: await fetchDraft(outletId) });
  }

  const replace = (next: MerchantOutlet) => setOutlets((current) => current.map((candidate) => (candidate.id === next.id ? next : candidate)));

  // Publication checks depend on the menu, so they are read again after each menu save or confirmation.
  async function refreshOutlets() {
    const result = await requestJson<MerchantOutlets>("GET", "/api/v1/merchant/outlets");
    if (result.ok && result.data) setOutlets(result.data.outlets);
  }

  // The creation response carries the new outlet's empty draft, so its editor shows at once.
  function created({ outlet, draft }: Saved) {
    setOutlets((current) => [...current, outlet]);
    setCanCreate(false);
    setEditing(false);
    setSelected({ id: outlet.id, draft: draft ?? null });
  }

  function updated({ outlet }: Saved) {
    replace(outlet);
    setEditing(false);
  }

  function published({ outlet, draft }: Saved) {
    replace(outlet);
    setSelected({ id: outlet.id, draft: draft ?? null });
    setEditorGeneration((generation) => generation + 1);
  }

  return (
    <div className="stack">
      {outlets.length > 1 && (
        <nav className="card" aria-label="Your shops">
          {outlets.map((candidate) => (
            <button key={candidate.id} type="button" className={`button ${candidate.id === selected?.id ? "" : "secondary"}`} onClick={() => select(candidate.id)}>
              {candidate.name}
            </button>
          ))}
        </nav>
      )}

      {outlet && (
        <section className="card" aria-labelledby="outlet-heading">
          <div className="rail-head">
            <h2 id="outlet-heading">1. Shop details</h2>
            {!editing && !outlet.published && (
              <button className="button secondary" type="button" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <OutletForm outlet={outlet} submitLabel="Save details" onSaved={updated} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <p>
                <strong>{outlet.name}</strong>
                <small>{outlet.area}</small>
              </p>
              <OutletChips outlet={outlet} />
              {!outlet.published && !outlet.detailsConfirmed && <ConfirmDetails key={`${outlet.name}|${outlet.area}`} outlet={outlet} onSaved={updated} />}
            </>
          )}
          <SgqrSticker key={outlet.id} outlet={outlet} onSaved={replace} />
        </section>
      )}

      {canCreate && (
        <section className="card" aria-labelledby="create-heading">
          <h2 id="create-heading">{outlets.length === 0 ? "1. Create your shop" : "Create another shop"}</h2>
          <p className="muted">The shop starts unpublished. Buyers cannot see it or its menu.</p>
          <OutletForm submitLabel="Create shop" onSaved={created} />
        </section>
      )}

      {outlets.length === 0 && !canCreate && <p className="card">This account has no shop and no approved membership for a new one.</p>}

      {outlet && selected && (
        <MenuEditor
          key={`${outlet.id}:${editorGeneration}`}
          outletId={outlet.id}
          outletPublished={outlet.published}
          importsOpen={importsOpen}
          initialDraft={selected.draft}
          onDraftChange={refreshOutlets}
        />
      )}
      {outlet && <PayPalCard outlet={outlet} onSaved={updated} />}
      {outlet && <PyusdWalletCard key={outlet.id} outlet={outlet} onSaved={updated} />}
      {outlet && <PublishCard outlet={outlet} onPublished={published} />}
    </div>
  );
}
