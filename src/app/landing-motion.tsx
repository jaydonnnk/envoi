"use client";

// The landing scroll stage's motion (S55). The server renders every word of the page; this only turns
// the stage into a pinned, scroll-played scene by adding a class and setting transform and opacity on
// decorative, aria-hidden elements. With JavaScript off or reduced motion on, the stage stays a static
// hero that shows the Approve step.
import { useEffect } from "react";

const ACTS = ["Scan", "Ask", "Approve", "Show the stall"];
const FADE = 0.035;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function segment(progress: number, from: number, to: number): number {
  return clamp((progress - from) / (to - from));
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function LandingMotion() {
  useEffect(() => {
    const track = document.getElementById("lp-track");
    const phone = document.getElementById("lp-phone");
    const sticker = document.getElementById("lp-sticker");
    const label = document.getElementById("lp-act");
    const name = document.getElementById("lp-act-name");
    const bar = document.getElementById("lp-bar");
    const screens = Array.from(document.querySelectorAll<HTMLElement>(".lp-act-screen"));
    if (!track || !phone || !sticker || !label || !name || !bar || screens.length !== ACTS.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    track.classList.add("lp-playing");
    let frame = 0;

    function render() {
      frame = 0;
      const box = track!.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      const progress = travel > 0 ? clamp(-box.top / travel) : 0;

      const rise = ease(segment(progress, 0, 0.3));
      phone!.style.transform = `translateY(${28 * (1 - rise)}%) scale(${0.9 + 0.1 * rise}) rotate(${-4 * (1 - rise)}deg)`;
      phone!.style.opacity = String(0.6 + 0.4 * segment(progress, 0, 0.1));
      sticker!.style.transform = `rotate(-4deg) translateY(${-10 * ease(segment(progress, 0, 0.25))}px) scale(${1 - 0.1 * ease(segment(progress, 0.35, 0.7))})`;
      sticker!.style.opacity = String(1 - 0.3 * segment(progress, 0.5, 0.9));

      // One screen at a time: the old one fades out before the new one fades in.
      screens.forEach((screen, index) => {
        let opacity = 1;
        const start = index / ACTS.length;
        const end = (index + 1) / ACTS.length;
        if (index > 0) opacity = Math.min(opacity, segment(progress, start, start + FADE));
        if (index < ACTS.length - 1) opacity = Math.min(opacity, 1 - segment(progress, end - FADE, end));
        screen.style.opacity = String(opacity);
        screen.style.transform = `translateY(${8 * (1 - opacity)}px)`;
      });

      const act = Math.min(ACTS.length - 1, Math.floor(progress * ACTS.length));
      label!.textContent = `Act ${act + 1} of ${ACTS.length}`;
      name!.textContent = ACTS[act]!;
      bar!.style.width = `${progress * 100}%`;
    }

    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(render);
    }

    render();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      track.classList.remove("lp-playing");
    };
  }, []);

  return null;
}
