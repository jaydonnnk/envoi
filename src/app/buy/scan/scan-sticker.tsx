"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublishedOutletSummary } from "@/domain/outlets/search";
import { SGQR_MAX_PAYLOAD_CHARS } from "@/domain/sgqr/decode";
import type { SgqrResolution } from "@/domain/sgqr/resolve";
import { qrDetector } from "@/lib/browser/qr";
import { ensureBuyerSession, postJson } from "@/lib/browser/session";
import { useRestoreFocus } from "@/lib/browser/focus";

const SCAN_INTERVAL_MS = 250;
// A camera left scanning, for example on a counter, turns itself off; "Scan again" restarts it.
const SCAN_IDLE_MS = 60_000;

type Camera =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "stopped" };

type Outcome =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "opening"; outlet: PublishedOutletSummary }
  | { kind: "resolved"; resolution: Exclude<SgqrResolution, { kind: "single" }> }
  | { kind: "failed"; message: string };

const outletHref = (outletId: string) => `/buy?${new URLSearchParams({ outlet: outletId }).toString()}`;

function DemoChip({ outlet }: { outlet: PublishedOutletSummary }) {
  return outlet.isDemoFixture ? <span className="chip warn">Demo fixture</span> : null;
}

// The camera frames are decoded in this browser and never leave it. Only the decoded sticker
// contents go to POST /api/v1/outlets/resolve-sgqr, which answers with outlets, never a payee or
// a payment. A denied or missing camera leaves the paste field, and text search is always offered.
export function ScanSticker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pasteRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<Camera>({ kind: "starting" });
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pasted, setPasted] = useState("");

  // Every camera start is a session; stopping or starting again ends the previous one, so a late
  // permission answer or scan loop from an ended session releases its camera and changes nothing.
  const sessionRef = useRef(0);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const resolve = useCallback(async (payload: string) => {
    setOutcome({ kind: "checking" });
    try {
      await ensureBuyerSession();
      const result = await postJson<{ resolution: SgqrResolution }>("/api/v1/outlets/resolve-sgqr", { payload });
      const resolution = result.data?.resolution;
      if (!result.ok || !resolution) return setOutcome({ kind: "failed", message: result.error?.message ?? "Envoi could not check this code. Try again, or search by name." });
      if (resolution.kind === "single") {
        setOutcome({ kind: "opening", outlet: resolution.outlet });
        window.location.assign(outletHref(resolution.outlet.id));
        return;
      }
      setOutcome({ kind: "resolved", resolution });
    } catch {
      setOutcome({ kind: "failed", message: "Envoi could not check this code. Try again, or search by name." });
    }
  }, []);

  const scan = useCallback(
    async (stream: MediaStream, live: () => boolean) => {
      const video = videoRef.current;
      if (!live() || !video) return stream.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (!live()) return;
      setCamera({ kind: "scanning" });

      const detector = await qrDetector().catch(() => null);
      if (!live()) return;
      if (!detector) {
        stopCamera();
        setCamera({ kind: "unavailable" });
        return;
      }
      const startedAt = Date.now();
      while (live()) {
        // A hidden page or an idle minute releases the camera instead of decoding unseen frames.
        if (document.visibilityState === "hidden" || Date.now() - startedAt > SCAN_IDLE_MS) {
          stopCamera();
          setCamera({ kind: "stopped" });
          return;
        }
        const found = await detector.detect(video).catch(() => []);
        const payload = found[0]?.rawValue;
        if (payload && live()) {
          stopCamera();
          setCamera({ kind: "stopped" });
          // The outcome is this sticker's, so an earlier paste no longer sits beside it.
          setPasted("");
          void resolve(payload);
          return;
        }
        await new Promise((done) => setTimeout(done, SCAN_INTERVAL_MS));
      }
    },
    [resolve, stopCamera],
  );

  // Asks for the camera; callers set the "starting" state first.
  const startCamera = useCallback(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    const live = () => sessionRef.current === session;
    const media = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      : Promise.reject(new DOMException("No camera API", "NotFoundError"));
    void media.then(
      (stream) => scan(stream, live),
      (err: unknown) => {
        if (!live()) return;
        setCamera({ kind: err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "unavailable" });
        pasteRef.current?.focus();
      },
    );
  }, [scan]);

  useEffect(() => {
    // Starting the camera on arrival asks for permission at once: the buyer tapped Scan to get here.
    // The first state is already "starting".
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  function turnCameraOff() {
    stopCamera();
    setCamera({ kind: "stopped" });
  }

  function retryCamera() {
    stopCamera();
    setCamera({ kind: "starting" });
    setOutcome({ kind: "idle" });
    startCamera();
  }

  function submitPaste(event: React.FormEvent) {
    event.preventDefault();
    const payload = pasted.trim();
    if (payload.length === 0) return;
    // A camera that is denied or missing keeps saying so; one that is scanning stops.
    if (camera.kind === "starting" || camera.kind === "scanning") {
      stopCamera();
      setCamera({ kind: "stopped" });
    }
    void resolve(payload);
  }

  const busy = outcome.kind === "checking" || outcome.kind === "opening";
  useRestoreFocus(busy);
  return (
    <div className="scan">
      <section className="card" aria-labelledby="camera-heading">
        <h2 id="camera-heading">Point the camera at the SGQR sticker</h2>
        <div className="viewfinder" hidden={camera.kind !== "scanning"}>
          <video ref={videoRef} muted playsInline aria-label="Camera view" />
        </div>
        {camera.kind === "starting" && <p className="muted">Starting the camera. Allow camera access if your browser asks.</p>}
        {camera.kind === "scanning" && <p className="muted fine">Hold the sticker inside the frame. The picture stays on this device.</p>}
        {camera.kind === "scanning" && (
          <button className="button secondary" type="button" onClick={turnCameraOff}>
            Turn the camera off
          </button>
        )}
        {camera.kind === "stopped" && <p className="muted">The camera is off.</p>}
        {(camera.kind === "denied" || camera.kind === "unavailable") && (
          <div className="status" role="status">
            <strong>{camera.kind === "denied" ? "Camera access is off" : "No camera is available"}</strong>
            <small>Paste the sticker contents below, or search for the shop by name.</small>
          </div>
        )}
        {camera.kind !== "starting" && camera.kind !== "scanning" && (
          <button className="button secondary" type="button" onClick={retryCamera} disabled={busy}>
            {camera.kind === "stopped" ? "Scan again" : "Try the camera again"}
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="paste-heading">
        <h2 id="paste-heading">Or paste the sticker contents</h2>
        <form onSubmit={submitPaste}>
          <label htmlFor="sticker-paste">Sticker contents</label>
          <input
            id="sticker-paste"
            ref={pasteRef}
            value={pasted}
            maxLength={SGQR_MAX_PAYLOAD_CHARS}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the code from the sticker"
            onChange={(event) => setPasted(event.target.value)}
          />
          <button className="button full" type="submit" disabled={busy || pasted.trim().length === 0}>
            Find the shop
          </button>
        </form>
      </section>

      {/* Takes no space while empty, so the cards keep one even gap. The one live region for every
          outcome: the blocks inside carry no role of their own, so nothing is announced twice. */}
      <div className="scan-outcome" aria-live="polite">
        {outcome.kind === "checking" && (
          <section className="card">
            <p className="muted">Checking the sticker</p>
          </section>
        )}
        {outcome.kind === "opening" && (
          <section className="card">
            <div className="status ok">
              <strong>Opening {outcome.outlet.name}</strong>
              <small>
                {outcome.outlet.area} <DemoChip outlet={outcome.outlet} />
              </small>
            </div>
          </section>
        )}
        {outcome.kind === "resolved" && <ScanResult resolution={outcome.resolution} />}
        {outcome.kind === "failed" && (
          <section className="card">
            <div className="status">
              <strong>Could not check this code</strong>
              <small>{outcome.message}</small>
            </div>
          </section>
        )}
      </div>

      <section className="card" aria-labelledby="text-heading">
        <h2 id="text-heading">Search by name instead</h2>
        <p className="muted">Describe what you want or pick a shop from the list.</p>
        <a className="button secondary" href="/buy">
          Search for a shop
        </a>
      </section>

      <p className="muted fine">A scan identifies the shop only. It is not payment authority, it is not where the money goes, and one business identifier can cover several outlets.</p>
    </div>
  );
}

export function ScanResult({ resolution }: { resolution: Exclude<SgqrResolution, { kind: "single" }> }) {
  if (resolution.kind === "ambiguous") {
    return (
      <section className="card" aria-labelledby="which-heading">
        <h2 id="which-heading">Which outlet?</h2>
        <p className="muted">This sticker&apos;s business identifier covers several outlets. Envoi does not know where you are, so choose the one you are at.</p>
        <div className="stack">
          {resolution.candidates.map((outlet) => (
            <a className="card shop" key={outlet.id} href={outletHref(outlet.id)}>
              <span>
                <strong>{outlet.name}</strong>
                <small>{outlet.area}</small>
                <small>{outlet.distinguisher}</small>
              </span>
              <DemoChip outlet={outlet} />
            </a>
          ))}
        </div>
        <p className="muted fine">Not listed? Search for it by name below.</p>
      </section>
    );
  }
  if (resolution.kind === "no_match") {
    return (
      <section className="card">
        <div className="status">
          <strong>This shop is not on Envoi</strong>
          <small>Nothing can be bought through Envoi with this sticker, and scanning it does not add the shop. Search by name instead.</small>
        </div>
        <p className="muted fine">
          Is this your shop? <a href="/merchant/setup">Enroll it in merchant setup</a>.
        </p>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="status">
        <strong>Envoi cannot identify a shop from this code</strong>
        <small>It is not a shop&apos;s SGQR sticker, or it was misread. Scan or paste it again, or search by name.</small>
      </div>
    </section>
  );
}
