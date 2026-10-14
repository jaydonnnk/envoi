"use client";

import { useState } from "react";
import type { DraftJson } from "@/domain/menu/serialize";
import type { MerchantOutlet, MerchantOutlets } from "@/domain/outlets/merchant";
import { requestJson } from "@/lib/browser/session";
import { MenuEditor } from "./menu-editor";

function OutletChips({ outlet }: { outlet: MerchantOutlet }) {
  return (
    <span className="chips">
      {outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
      <span className="chip">{outlet.published ? "Published" : "Unpublished"}</span>
      <span className="chip">{outlet.enrollment === "approved" ? "Enrollment approved" : "Enrollment pending"}</span>
    </span>
  );
}

// Name and area for a new shop, or for editing an unpublished one.
type Saved = { outlet: MerchantOutlet; draft?: DraftJson };

function OutletForm({ outlet, submitLabel, onSaved, onCancel }: { outlet?: MerchantOutlet; submitLabel: string; onSaved: (saved: Saved) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), area: form.get("area") };
    setBusy(true);
    setError(null);
    const result = outlet
      ? await requestJson<Saved>("PATCH", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}`, body)
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

// A draft that cannot be loaded, including on a network failure, is null: the menu editor then shows
// its error with "Try again".
const fetchDraft = async (outletId: string) => (await requestJson<DraftJson>("GET", `/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/menu-draft`)).data ?? null;

export function Workspace({ initial, initialDraft }: { initial: MerchantOutlets; initialDraft: DraftJson | null }) {
  const [outlets, setOutlets] = useState(initial.outlets);
  const [canCreate, setCanCreate] = useState(initial.canCreateOutlet);
  const [selected, setSelected] = useState<{ id: string; draft: DraftJson | null } | null>(
    initial.outlets[0] ? { id: initial.outlets[0].id, draft: initialDraft } : null,
  );
  const [editing, setEditing] = useState(false);
  const outlet = outlets.find((candidate) => candidate.id === selected?.id) ?? null;

  async function select(outletId: string) {
    setEditing(false);
    setSelected({ id: outletId, draft: await fetchDraft(outletId) });
  }

  // The creation response carries the new outlet's empty draft, so its editor shows at once.
  function created({ outlet, draft }: Saved) {
    setOutlets((current) => [...current, outlet]);
    setCanCreate(false);
    setEditing(false);
    setSelected({ id: outlet.id, draft: draft ?? null });
  }

  function updated({ outlet }: Saved) {
    setOutlets((current) => current.map((candidate) => (candidate.id === outlet.id ? outlet : candidate)));
    setEditing(false);
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
            </>
          )}
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

      {outlet && selected && <MenuEditor key={outlet.id} outletId={outlet.id} initialDraft={selected.draft} />}
    </div>
  );
}
