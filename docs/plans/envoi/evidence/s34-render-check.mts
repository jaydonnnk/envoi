// S34 Render screen check: the deployed shop-scoped Ask Envoi at 390 px and 1280 px, driven over the
// Chrome DevTools Protocol so the viewport width is real and not a CSS inference.
// CLI: npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s34-render-check.mts
// It makes real model calls on the deployed site, on a FIXTURE shop, with test money only. No payment
// is approved: the run stops at the one-time link and never opens it.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "https://envoi-helx.onrender.com";
// Lorong Demo Kopi on Render, a published demo FIXTURE shop [verified 2026-11-07 from the public API].
const OUTLET = "out_wgoyp6kgg75472b6s772dplgoq";
const PAGE = `${SITE}/buy/ask?outlet=${OUTLET}`;
const ADVICE = "What should I try under S$6? Is it halal?";
const ACCEPT = "Yes, make that basket.";
const WIDTHS = [
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "1280", width: 1280, height: 900, mobile: false },
] as const;
// The agent's own turn budget is 60 seconds and the page gives up at 75, so wait longer than either.
const REPLY_TIMEOUT_MS = 110_000;
const PORT = 9333;

type Cdp = { send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>; close(): void };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A page that stops answering must end the run with recorded evidence, not hang it. Every CDP
// command is bounded, so waitForTurn's own deadline can always be reached.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// /json/version gives the browser-level socket, which answers no Page domain. A page target is
// needed, so read /json/list and fall back to opening one.
async function pageSocketUrl(port: number, attempts = 60): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (list.ok) {
        const targets = (await list.json()) as { type?: string; webSocketDebuggerUrl?: string }[];
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome is still opening its debug port.
    }
    await sleep(500);
  }
  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = created.ok ? ((await created.json()) as { webSocketDebuggerUrl?: string }) : {};
  if (!target.webSocketDebuggerUrl) throw new Error(`Chrome opened no page target on ${port}`);
  return target.webSocketDebuggerUrl;
}

function connect(url: string): Promise<Cdp> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (reason: Error) => void }>();
    socket.addEventListener("open", () =>
      resolve({
        send: (method, params = {}) =>
          withTimeout(
            new Promise((innerResolve, innerReject) => {
              nextId += 1;
              pending.set(nextId, { resolve: innerResolve, reject: innerReject });
              socket.send(JSON.stringify({ id: nextId, method, params }));
            }),
            30_000,
            `CDP ${method}`,
          ),
        close: () => socket.close(),
      }),
    );
    socket.addEventListener("error", () => reject(new Error("the CDP socket failed to open")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; error?: { message: string }; result?: Record<string, unknown> };
      if (message.id === undefined) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message}`));
      else waiter.resolve(message.result ?? {});
    });
  });
}

async function evaluate(cdp: Cdp, expression: string): Promise<unknown> {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  const payload = result.result as { value?: unknown } | undefined;
  if (result.exceptionDetails) throw new Error(`page evaluation failed: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`);
  return payload?.value;
}

// React owns this textarea's value, so setting it directly is overwritten on the next render. The
// prototype setter plus a bubbling input event is what makes React see the typing.
function typeInto(selector: string, text: string): string {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(element, ${JSON.stringify(text)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`;
}

async function waitForTurn(cdp: Cdp, expectedBubbles: number): Promise<void> {
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  const expression = `JSON.stringify({
    bubbles: document.querySelectorAll(".chat .bubble").length,
    reading: !!Array.from(document.querySelectorAll(".chat .bubble")).find((node) => node.textContent.includes("Reading Envoi")),
    link: !!document.querySelector('a.button[href]'),
    alert: document.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
    sendDisabled: !!document.querySelector('form button[type="submit"]')?.disabled,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  })`;
  for (;;) {
    const parsed = JSON.parse(String(await evaluate(cdp, expression))) as {
      bubbles: number;
      reading: boolean;
      link: boolean;
      alert: string | null;
      sendDisabled: boolean;
      innerWidth: number;
      scrollWidth: number;
    };
    if (parsed.alert) throw new Error(`the page reported a failure: ${parsed.alert}`);
    if (!parsed.reading && parsed.bubbles >= expectedBubbles) return;
    if (Date.now() > deadline) throw new Error(`no assistant reply within ${REPLY_TIMEOUT_MS} ms; last state ${JSON.stringify(parsed)}`);
    await sleep(1000);
  }
}

async function shoot(cdp: Cdp, file: string): Promise<void> {
  const result = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 82, captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(String(result.data), "base64"));
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "s34-render-"));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderr: string[] = [];
  chrome.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const metrics: Record<string, unknown> = { label: "S34 Render screen check; FIXTURE shop; real model; test money only; no payment approved", site: SITE, page: PAGE, outletId: OUTLET, startedAt: new Date().toISOString(), widths: [] as Record<string, unknown>[] };
  let cdp: Cdp | null = null;
  try {
    const socketUrl = await pageSocketUrl(PORT);
    cdp = await connect(socketUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    for (const size of WIDTHS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: size.mobile ? 2 : 1, mobile: size.mobile });
      await cdp.send("Page.navigate", { url: PAGE });
      await sleep(size.name === "390" ? 12_000 : 4_000);
      // A free Render instance wakes on the first request, so retry the navigation once after a wait.
      const ready = await evaluate(cdp, `!!document.querySelector('#ask')`);
      if (!ready) {
        await sleep(45_000);
        await cdp.send("Page.navigate", { url: PAGE });
        await sleep(8_000);
      }
      if (!(await evaluate(cdp, `!!document.querySelector('#ask')`))) throw new Error("the Ask Envoi message field never rendered");

      const badge = await evaluate(
        cdp,
        `JSON.stringify({ badge: document.body.innerText.includes("TEST ENVIRONMENT"), fixture: document.body.innerText.includes("fixture") || document.body.innerText.includes("test money"), heading: document.querySelector("h1,h2")?.textContent?.trim() ?? null })`,
      );

      // Turn one: advice, which must create no link.
      if (!(await evaluate(cdp, typeInto("#ask", ADVICE)))) throw new Error("could not fill the message field");
      await evaluate(cdp, `document.querySelector('form button[type="submit"]').click(); true`);
      await waitForTurn(cdp, 2);
      const afterAdvice = JSON.parse(String(await evaluate(cdp, `JSON.stringify({ link: !!document.querySelector('a.button[href]'), bubbles: document.querySelectorAll('.chat .bubble').length, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, reply: Array.from(document.querySelectorAll('.chat .bubble.bot')).map((n) => n.textContent.trim()) })`))) as Record<string, unknown>;
      const adviceShot = join(HERE, `s34-render-${size.name}-advice.jpg`);
      await shoot(cdp, adviceShot);

      // Turn two: the visitor accepts, and only now may a link appear.
      if (!(await evaluate(cdp, typeInto("#ask", ACCEPT)))) throw new Error("could not fill the acceptance");
      await evaluate(cdp, `document.querySelector('form button[type="submit"]').click(); true`);
      await waitForTurn(cdp, 4);
      // The link's own value is a one-time payment token, so only its shape is recorded: Envoi's own
      // same-origin approve path, and never a URL the model wrote.
      const afterAccept = JSON.parse(String(await evaluate(cdp, `JSON.stringify({ link: !!document.querySelector('a.button[href]'), linkIsEnvoiApprove: (() => { const href = document.querySelector('a.button[href]')?.getAttribute('href') ?? ''; if (!href) return false; try { const url = new URL(href, location.origin); return url.origin === location.origin && url.pathname.startsWith('/approve/') && url.pathname.length > '/approve/'.length; } catch { return false; } })(), bubbles: document.querySelectorAll('.chat .bubble').length, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, reply: Array.from(document.querySelectorAll('.chat .bubble.bot')).map((n) => n.textContent.trim()) })`))) as Record<string, unknown>;
      const acceptShot = join(HERE, `s34-render-${size.name}-accept.jpg`);
      await shoot(cdp, acceptShot);

      metrics.widths.push({
        width: size.name,
        ...JSON.parse(String(badge)),
        advice: afterAdvice,
        accept: afterAccept,
        noOverflowOnAdvice: afterAdvice.innerWidth === afterAdvice.scrollWidth,
        noOverflowOnAccept: afterAccept.innerWidth === afterAccept.scrollWidth,
        adviceScreenshot: `evidence/s34-render-${size.name}-advice.jpg`,
        acceptScreenshot: `evidence/s34-render-${size.name}-accept.jpg`,
      });
    }
    metrics.finishedAt = new Date().toISOString();
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : String(error);
    metrics.chromeStderrTail = stderr.join("").slice(-800);
    throw error;
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    writeFileSync(join(HERE, "s34-render-check.json"), JSON.stringify(metrics, null, 2) + "\n");
    // The throwaway profile is this script's own scratch, so it does not stay behind in the temp dir.
    await sleep(1500);
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
