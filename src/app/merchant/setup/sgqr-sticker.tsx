"use client";

import { useState } from "react";
import type { MerchantOutlet, OutletIdentifier } from "@/domain/outlets/merchant";
import { decodeEmvcoTlv, type SgqrDecode, type SgqrField } from "@/domain/sgqr/decode";
import { isMappable, mappableIdentifier } from "@/domain/sgqr/validate";
import { qrDetector } from "@/lib/browser/qr";
import { requestJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

// S9: the merchant selects a photo of their SGQR sticker and it is decoded here, in the browser.
// The image never leaves the browser. The decoded text is sent only with a submission, so the
// server can check it again, and is never stored or logged. File selection only: the camera stays
// off on this page (Permissions-Policy allows it on the buyer scan page alone).

type Reading =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "unreadable" }
  | { kind: "not_sgqr" }
  | { kind: "decoded"; payload: string; decode: Extract<SgqrDecode, { kind: "decoded" }> };

async function readQr(file: File): Promise<string | null> {
  const detector = await qrDetector();
  const bitmap = await createImageBitmap(file);
  try {
    const found = await detector.detect(bitmap);
    return found[0]?.rawValue ?? null;
  } finally {
    bitmap.close();
  }
}

const SOURCE_LABEL: Record<OutletIdentifier["source"], string> = {
  sticker: "From the sticker",
  corrected: "Corrected from the sticker",
  manual: "Entered by hand",
};

function checksumLabel(checksumValid: boolean | null): string | null {
  if (checksumValid === null) return null;
  return checksumValid ? "Checksum valid" : "Checksum does not match";
}

function Submitted({ identifiers }: { identifiers: OutletIdentifier[] }) {
  if (identifiers.length === 0) return null;
  return (
    <ul className="identifiers">
      {identifiers.map((entry) => (
        <li key={entry.id} className="row">
          <div>
            <strong className="mono">UEN {entry.identifier}</strong>
            <small>{entry.distinguisher}</small>
            <small>
              {SOURCE_LABEL[entry.source]}
              {checksumLabel(entry.checksumValid) ? `, ${checksumLabel(entry.checksumValid)!.toLowerCase()}` : ""}
            </small>
          </div>
          <span className={`chip ${entry.approved ? "ok" : "warn"}`}>{entry.approved ? "Approved by the Envoi operator" : "Waiting for the Envoi operator"}</span>
        </li>
      ))}
    </ul>
  );
}

function FieldLine({ field }: { field: SgqrField }) {
  const mappable = isMappable(mappableIdentifier(field));
  return (
    <li className="row">
      <div>
        <strong>{field.label}</strong>
        <small className="mono">{field.identifier}</small>
        {!mappable && <small className="hint">Not a business identifier, so it cannot identify your shop.</small>}
      </div>
      <span className={`chip${mappable ? " ok" : " warn"}`}>{mappable ? "Recognized" : "Cannot be used"}</span>
    </li>
  );
}

export function SgqrSticker({ outlet, onSaved }: { outlet: MerchantOutlet; onSaved: (outlet: MerchantOutlet) => void }) {
  const [reading, setReading] = useState<Reading>({ kind: "idle" });
  const [manual, setManual] = useState(false);
  const [uen, setUen] = useState("");
  const [distinguisher, setDistinguisher] = useState("");
  const [busy, setBusy] = useState(false);
  useRestoreFocus(busy);
  const [error, setError] = useState<string | null>(null);
  // Remounts the file input after a submission, so it no longer names the photo just used.
  const [photoInput, setPhotoInput] = useState(0);
  const prefix = `sgqr-${outlet.id}`;

  async function select(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setManual(false);
    if (!file) return setReading({ kind: "idle" });
    setReading({ kind: "reading" });
    const payload = await readQr(file).catch(() => null);
    if (payload === null) return setReading({ kind: "unreadable" });
    const decode = decodeEmvcoTlv(payload);
    if (decode.kind === "not_emvco") return setReading({ kind: "not_sgqr" });
    const firstUen = decode.recognized.map(mappableIdentifier).find(isMappable);
    setUen(firstUen?.identifier ?? "");
    setReading({ kind: "decoded", payload, decode });
  }

  function enterByHand() {
    setManual(true);
    setReading({ kind: "idle" });
    setUen("");
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = mappableIdentifier({ scheme: "paynow_uen", identifier: uen });
    if (!isMappable(checked)) return setError(checked.message);
    setBusy(true);
    setError(null);
    const payload = reading.kind === "decoded" ? reading.payload : null;
    const result = await requestJson<{ outlet: MerchantOutlet }>("PATCH", `/api/v1/merchant/outlets/${encodeURIComponent(outlet.id)}`, {
      identifier: { scheme: "paynow_uen", identifier: uen, distinguisher, payload },
    });
    setBusy(false);
    if (!result.ok || !result.data) return setError(result.error?.message ?? "The identifier could not be submitted. Try again.");
    setReading({ kind: "idle" });
    setManual(false);
    setUen("");
    setDistinguisher("");
    setPhotoInput((generation) => generation + 1);
    onSaved(result.data.outlet);
  }

  const showForm = manual || reading.kind === "decoded";
  return (
    <div className="sgqr" aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>SGQR sticker</h3>
      <p className="muted">
        <strong>SGQR contains no menu and does not prove ownership.</strong> Decoding happens in this browser; the photo is not uploaded. A UEN may be absent, and different outlets may share one.
      </p>
      <Submitted identifiers={outlet.identifiers} />
      <label htmlFor={`${prefix}-photo`}>Sticker photo</label>
      <input key={photoInput} id={`${prefix}-photo`} type="file" accept="image/*" onChange={select} disabled={busy} />

      {reading.kind === "reading" && (
        <p className="fine" role="status">
          Reading the sticker
        </p>
      )}
      {(reading.kind === "unreadable" || reading.kind === "not_sgqr") && (
        <div className="status" role="status">
          <strong>{reading.kind === "unreadable" ? "No QR code could be read from this photo." : "This QR code is not an SGQR payment code."}</strong>
          <small>Try a sharper, straight-on photo, or enter the UEN by hand.</small>
        </div>
      )}
      {reading.kind === "decoded" && (
        <div className="decoded">
          <p className="chips">
            <span className={`chip ${reading.decode.checksumValid ? "ok" : "warn"}`}>{checksumLabel(reading.decode.checksumValid)}</span>
          </p>
          {!reading.decode.checksumValid && <p className="hint">The code may be damaged or misread. Check every value against the sticker. A buyer who scans a code that fails this check is told Envoi cannot identify the shop and is sent to search by name.</p>}
          {reading.decode.recognized.length === 0 ? (
            <p className="muted">No PayNow identifier was found on this sticker. Enter the UEN by hand if it has one.</p>
          ) : (
            <ul>{reading.decode.recognized.map((field, index) => <FieldLine key={index} field={field} />)}</ul>
          )}
          {reading.decode.unrecognized.length > 0 && (
            <details>
              <summary>
                {reading.decode.unrecognized.length} other {reading.decode.unrecognized.length === 1 ? "tag" : "tags"} Envoi does not read
              </summary>
              <ul>
                {reading.decode.unrecognized.map((tag, index) => (
                  <li key={index} className="row">
                    <span className="mono">Tag {tag.tagId}</span>
                    <span className="mono">{tag.value}</span>
                  </li>
                ))}
              </ul>
              <small>Listed as found, not interpreted.</small>
            </details>
          )}
        </div>
      )}
      {!manual && reading.kind !== "decoded" && (
        <div className="actions">
          <button className="button secondary" type="button" onClick={enterByHand}>
            Enter the UEN by hand
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit}>
          <label htmlFor={`${prefix}-uen`}>Business UEN</label>
          <input id={`${prefix}-uen`} value={uen} onChange={(event) => setUen(event.target.value)} maxLength={13} autoComplete="off" required />
          <small>Correct it if it differs from your business registration. A valid format does not prove ownership.</small>
          <label htmlFor={`${prefix}-distinguisher`}>What distinguishes this outlet</label>
          <input
            id={`${prefix}-distinguisher`}
            value={distinguisher}
            onChange={(event) => setDistinguisher(event.target.value)}
            maxLength={80}
            placeholder="For example: stall 12, level 1"
            required
          />
          <small>Buyers see this if several outlets share the UEN.</small>
          <div className="actions">
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Submitting" : "Submit for operator approval"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
