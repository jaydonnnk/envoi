"use client";

import { useEffect, useState } from "react";
import { MENU_CONSENT_TEXT, MENU_CONSENT_VERSION } from "@/domain/imports/consent";
import type { ImportJson } from "@/domain/imports/lifecycle";
import type { DraftJson } from "@/domain/menu/serialize";

// Menu photo import on the setup page (S11). The merchant reads and accepts the versioned OpenAI
// notice, picks a photo, and this tab shrinks it to one JPEG of at most 2,048 pixels per side and
// 2 MiB before anything is sent. The original stays only in this tab, for side-by-side review; it
// is never written to localStorage or IndexedDB. Manual entry below stays available throughout.

export type DraftWithImport = DraftJson & { latestImport?: ImportJson | null };

const MAX_EDGE = 2_048;
const MAX_BYTES = 2_097_152;
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5];

async function shrinkToJpeg(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  return null;
}

const SINGAPORE_TIME = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", timeStyle: "short" });

const OUTCOME_COPY: Record<ImportJson["outcome"], string> = {
  in_flight: "A photo import is still running for this shop.",
  completed: "Your last photo import finished and its items are in the draft below.",
  conflict_base_revision: "Your last photo import added nothing because the menu changed while it was drafted.",
  conflict_confirmed: "Your last photo import added nothing because the menu was confirmed while it was drafted.",
  membership_revoked: "Your last photo import added nothing because this account lost its membership for the shop.",
  rejected_upload: "Your last photo upload was refused, so nothing was added.",
  rejected_photo: "Your last photo could not be used, so nothing was added.",
  model_failed: "Drafting your last photo failed, so nothing was added.",
  model_timeout: "Drafting your last photo took too long, so nothing was added.",
  output_invalid: "The draft from your last photo was unusable, so nothing was added.",
  aborted: "Your last photo import stopped before it finished, so nothing was added.",
  expired: "Your last photo import did not finish in time, so nothing was added.",
};

type ApiError = { code: string; message: string; details?: Record<string, string | number | boolean> };

export function MenuPhotoImport({
  outletId,
  open,
  draft,
  dirty,
  onImported,
  onReload,
}: {
  outletId: string;
  open: boolean;
  draft: DraftWithImport;
  dirty: boolean;
  onImported: (draft: DraftWithImport) => void;
  onReload: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [photo, setPhoto] = useState<{ original: string; jpeg: Blob } | null>(null);
  const [busy, setBusy] = useState<"shrink" | "draft" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string; reload?: boolean } | null>(null);

  // The original photo's object URL is released when it is replaced or the editor goes away.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.original);
  }, [photo]);

  if (!open) {
    return (
      <div className="import-panel">
        <div className="rail-head wrap">
          <h3>Draft from a menu photo</h3>
          <span className="chip">Not available yet</span>
        </div>
        <p className="muted">Photo import is switched off on this Envoi demo, so no photo is sent anywhere. Enter your menu by hand below.</p>
      </div>
    );
  }

  const latest = draft.latestImport ?? null;
  const live = latest?.outcome === "in_flight";
  const confirmed = draft.status === "confirmed" && !dirty;

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    setBusy("shrink");
    const jpeg = await shrinkToJpeg(file);
    setBusy(null);
    if (!jpeg) {
      setPhoto(null);
      setMessage({ tone: "error", text: "This browser could not read that photo or fit it under 2 MiB. Choose another photo, or enter the menu by hand below." });
      return;
    }
    setPhoto({ original: URL.createObjectURL(file), jpeg });
  }

  async function importPhoto() {
    if (!photo) return;
    setBusy("draft");
    setMessage(null);
    const form = new FormData();
    form.append("photo", photo.jpeg, "menu.jpg");
    const response = await fetch(`/api/v1/merchant/outlets/${encodeURIComponent(outletId)}/menu-imports`, {
      method: "POST",
      cache: "no-store",
      headers: { "Envoi-Consent-Version": MENU_CONSENT_VERSION, "Envoi-Base-Revision": draft.revisionId },
      body: form,
    }).catch(() => null);
    const envelope = response ? ((await response.json().catch(() => null)) as { ok?: boolean; data?: { import: { added: number; rowsBlankPrice: number; preservedMerchantEdits: number; skippedForCapacity: number }; draft: DraftWithImport }; error?: ApiError } | null) : null;
    setBusy(null);
    if (!response || !envelope) {
      setMessage({ tone: "error", text: "The connection was lost. Reload the draft to check whether it finished before trying again.", reload: true });
      return;
    }
    if (envelope.ok && envelope.data) {
      const { import: result, draft: merged } = envelope.data;
      const parts = [`Added ${result.added} ${result.added === 1 ? "item" : "items"} from the photo.`];
      if (result.rowsBlankPrice > 0) parts.push(`${result.rowsBlankPrice} ${result.rowsBlankPrice === 1 ? "price was" : "prices were"} unreadable or unclear and ${result.rowsBlankPrice === 1 ? "stays" : "stay"} blank: fill them from your menu.`);
      if (result.preservedMerchantEdits > 0) parts.push(`${result.preservedMerchantEdits} of your own items were kept as you wrote them.`);
      if (result.skippedForCapacity > 0) parts.push(`${result.skippedForCapacity} more did not fit: a menu holds at most 100 items.`);
      parts.push("Check every name and price, and choose availability for each item.");
      onImported({ ...merged, latestImport: null });
      setMessage({ tone: "ok", text: parts.join(" ") });
      return;
    }
    const error = envelope.error;
    setMessage({ tone: "error", text: error?.message ?? "The photo import failed. Try again or enter the menu by hand.", reload: error?.code === "import_base_revision_changed" || error?.details?.outcome === "aborted" });
  }

  return (
    <div className="import-panel">
      <div className="rail-head wrap">
        <h3>Draft from a menu photo</h3>
        <span className="chip warn">AI draft: check every value</span>
      </div>
      <div className="consent">
        {MENU_CONSENT_TEXT.short.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        <details>
          <summary>Details</summary>
          {MENU_CONSENT_TEXT.details.map((sentence) => (
            <p key={sentence} className="fine">
              {sentence}
            </p>
          ))}
        </details>
      </div>
      <label className="check">
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I read this notice and agree to send my menu photo to OpenAI.
      </label>

      {latest && latest.outcome !== "completed" && (
        <p className={live ? "muted" : "error"} role={live ? undefined : "status"}>
          {OUTCOME_COPY[latest.outcome]}
          {live && ` It ends by ${SINGAPORE_TIME.format(new Date(latest.deadlineAt))}; reload the draft then to see its result.`}
        </p>
      )}

      <label htmlFor={`${outletId}-menu-photo`}>Menu photo</label>
      <input id={`${outletId}-menu-photo`} type="file" accept="image/*" onChange={choose} disabled={!accepted || busy !== null} />
      <small className="fine">This tab shrinks the photo to at most 2,048 pixels per side before sending it.</small>

      {photo && (
        <figure className="photo-preview">
          {/* An object URL of the photo held in this tab only; next/image would send it through the server optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.original} alt="Your menu photo, kept only in this browser tab" />
          <figcaption className="fine">Kept only in this tab for side-by-side review. Reloading the page removes it.</figcaption>
        </figure>
      )}

      <div className="actions">
        <button className="button" type="button" onClick={importPhoto} disabled={!accepted || !photo || busy !== null || dirty || live || confirmed}>
          {busy === "draft" ? "Drafting, up to 90 seconds" : busy === "shrink" ? "Preparing photo" : "Draft menu from photo"}
        </button>
        {photo && busy === null && (
          <button className="button secondary" type="button" onClick={() => setPhoto(null)}>
            Remove photo
          </button>
        )}
      </div>
      {dirty && <small className="hint">Save your changes before importing, so the photo adds to the menu you see.</small>}
      {confirmed && <small className="hint">This menu is confirmed. Change and save it first; importing adds items that need checking.</small>}
      {busy === "draft" && <p className="muted">Drafting can take up to 90 seconds. You can keep this tab open; manual entry stays available below.</p>}

      <div aria-live="polite">
        {message && (
          <p className={message.tone === "error" ? "error" : "muted"} role={message.tone === "error" ? "alert" : undefined}>
            {message.text}
          </p>
        )}
        {message?.reload && (
          <button className="button secondary" type="button" onClick={onReload}>
            Reload draft
          </button>
        )}
      </div>
    </div>
  );
}
