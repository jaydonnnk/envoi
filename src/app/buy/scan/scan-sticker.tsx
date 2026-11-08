"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublishedOutletSummary } from "@/domain/outlets/search";
import { SGQR_MAX_PAYLOAD_CHARS } from "@/domain/sgqr/decode";
import type { SgqrResolution } from "@/domain/sgqr/resolve";
import { drawShopQr, qrDetector } from "@/lib/browser/qr";
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
  if (resolution.kind === "no_match") return <UnenrolledStall />;
  return (
    <section className="card">
      <div className="status">
        <strong>Envoi cannot identify a shop from this code</strong>
        <small>It is not a shop&apos;s SGQR sticker, or it was misread. Scan or paste it again, or search by name.</small>
      </div>
    </section>
  );
}

// S48: the reviewed static card a visitor can show a stall that is not on Envoi (Gate 1 screen
// buyer-unenrolled-scan.html). No model is called. The Malay and Tamil lines were written without a
// native reader's review, so they say "Draft translation".
type CardLanguage = "en" | "zh" | "ms" | "ta";

const CARD_TEXT: Record<CardLanguage, { label: string; heading: string; body: string; draft: boolean }> = {
  en: { label: "English", heading: "A visitor wanted to pay you with PayPal.", body: "Scan to see how to join Envoi. Money goes straight to your own PayPal.", draft: false },
  zh: { label: "中文", heading: "有游客想用 PayPal 付款给您", body: "扫描二维码，了解如何加入 Envoi。您的款项直接进入您自己的 PayPal。", draft: false },
  ms: { label: "Melayu", heading: "Seorang pelawat ingin membayar anda dengan PayPal.", body: "Imbas untuk melihat cara menyertai Envoi. Wang terus masuk ke akaun PayPal anda sendiri.", draft: true },
  ta: {
    label: "தமிழ்",
    heading: "ஒரு பார்வையாளர் PayPal மூலம் உங்களுக்குப் பணம் செலுத்த விரும்பினார்.",
    body: "Envoi-இல் எப்படிச் சேர்வது என்பதைப் பார்க்க ஸ்கேன் செய்யுங்கள். பணம் நேரடியாக உங்கள் சொந்த PayPal கணக்கிற்குச் செல்லும்.",
    draft: true,
  },
};

const CARD_LANGUAGES: readonly CardLanguage[] = ["en", "zh", "ms", "ta"];

function UnenrolledStall() {
  const [language, setLanguage] = useState<CardLanguage>("zh");
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let live = true;
    drawShopQr(`${window.location.origin}/for-shops`)
      .then((png) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(png);
        setImage(objectUrl);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const text = CARD_TEXT[language];
  return (
    <section className="unenrolled" aria-labelledby="unenrolled-heading">
      <h2 id="unenrolled-heading">This stall isn&apos;t on Envoi yet</h2>
      <p className="lead">You cannot pay this stall through Envoi. Scanning did not add it. You can show the stall this card, and search for another shop.</p>
      <div className="layout">
        <section className="card unenrolled-card" aria-label="Card to show the stall">
          <h3 lang={language}>{text.heading}</h3>
          <p lang={language}>{text.body}</p>
          {language !== "en" && <p lang="en">{`${CARD_TEXT.en.heading} ${CARD_TEXT.en.body}`}</p>}
          {text.draft && <p className="muted fine">Draft translation</p>}
          {failed ? (
            <p className="muted fine">
              The QR code could not be drawn in this browser. The stall can open <a href="/for-shops">Envoi for shops</a> instead.
            </p>
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimizable asset
            <img src={image} alt="QR code that opens Envoi's page for shops" width={200} height={200} />
          ) : (
            <p className="muted fine">Drawing the QR code</p>
          )}
          <p className="stall-languages">
            {CARD_LANGUAGES.map((tag) => (
              <button key={tag} type="button" className="stall-language" lang={tag} aria-pressed={tag === language} onClick={() => setLanguage(tag)}>
                {CARD_TEXT[tag].label}
              </button>
            ))}
          </p>
        </section>
        <aside className="card">
          <h3>What Envoi keeps</h3>
          <p>Only a count of scans for this sticker, under a scrambled code. Not the stall&apos;s name, the sticker&apos;s text or anything about you.</p>
          <a className="button secondary full" href="/buy">
            Search for a shop
          </a>
          <p className="muted fine">
            Is this your shop? <a href="/for-shops">See how to join Envoi</a>.
          </p>
        </aside>
      </div>
    </section>
  );
}
