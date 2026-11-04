import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S31: PayPal's buttons over the review page. There is no DOM environment here, so the window, focus
// and the switch to the redirect link are browser evidence recorded in 00-status.md. These tests
// cover the source of the component, the script loader against a fake document, and the first paint.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => undefined }) }));

const { loadPayPalSdk, paypalButtonHandlers, paypalSdkUrl } = await import("@/app/review/[purchaseId]/paypal-buttons");
const { ContinueToPayPal } = await import("@/app/review/[purchaseId]/continue-to-paypal");

const REVIEW_DIR = join(process.cwd(), "src/app/review/[purchaseId]");
const source = (file: string) => readFileSync(join(REVIEW_DIR, file), "utf8");

// Names that would let the browser describe an order. Matched against every identifier, property
// name and string literal, never comments, so the component can still explain itself.
const ORDER_FIELDS = /^(amount|value|payee|payer|merchant[-_]?id|items?|purchase_units|unit_amount|total\w*|price\w*|actions|order)$/i;

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("component.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function forbiddenNames(text: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    // A CSS class is not an order field: the card's own "actions" row reuses that name.
    if (ts.isJsxAttribute(node) && node.name.getText() === "className") return;
    if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && ORDER_FIELDS.test(node.text)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return found;
}

function calls(text: string, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return found;
}

function propertyText(text: string, name: string): string | null {
  let value: string | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === name) value = node.initializer.getText();
    ts.forEachChild(node, visit);
  };
  visit(parse(text));
  return value;
}

// A promise's rejection message, so a wrong outcome fails on an assertion of its own.
const failureOf = (promise: Promise<unknown>) => promise.then(
  () => "no failure",
  (err: Error) => err.message,
);

describe("the PayPal buttons set no amount, payee or item", () => {
  it("the scanner finds a planted amount, payee and item", () => {
    expect(forbiddenNames(`const o = { amount: { value: "1.80" } };`)).toEqual(["amount", "value"]);
    expect(forbiddenNames(`const o = { payee: { merchant_id: "X" } };`)).toEqual(["payee", "merchant_id"]);
    expect(forbiddenNames(`const o = { items: [] };`)).toEqual(["items"]);
    expect(forbiddenNames(`// the amount, payee and items\nconst o = 1;`)).toEqual([]);
  });

  it("the component names none of them", () => {
    expect(forbiddenNames(source("paypal-buttons.tsx"))).toEqual([]);
  });

  it("every server call posts only an empty body", () => {
    const posts = calls(source("paypal-buttons.tsx"), "postJson");
    expect(posts.map((post) => post.arguments[0]!.getText())).toEqual(["`${purchasePath}/paypal/start`", "`${purchasePath}/paypal/complete`", "`${purchasePath}/cancel`"]);
    expect(posts.map((post) => post.arguments.length)).toEqual([1, 1, 1]);
  });

  it("the script carries only the client id, the currency and intent=capture", () => {
    const url = new URL(paypalSdkUrl("public-client-id", "USD"));
    expect(url.origin + url.pathname).toBe("https://www.paypal.com/sdk/js");
    expect(Object.fromEntries(url.searchParams)).toEqual({ "client-id": "public-client-id", currency: "USD", intent: "capture" });
  });

  it("only PayPal itself is offered as funding", () => {
    expect(propertyText(source("paypal-buttons.tsx"), "fundingSource")).toBe("sdk.FUNDING.PAYPAL");
  });

  it("the review page passes the public client id and never the secret", () => {
    const page = source("page.tsx");
    expect(page).toContain("clientId={webEnv().PAYPAL_CLIENT_ID}");
    expect(page).toContain("currency={purchase.currency}");
    for (const file of ["page.tsx", "continue-to-paypal.tsx", "paypal-buttons.tsx"]) expect(source(file)).not.toContain("CLIENT_SECRET");
  });
});

describe("PayPal script loading", () => {
  type FakeScript = { id: string; src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null; remove(): void };

  function fakeDocument() {
    const scripts: FakeScript[] = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      head: { appendChild: (script: FakeScript) => scripts.push(script) },
      getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
      createElement: (): FakeScript => {
        const script: FakeScript = { id: "", src: "", async: false, onload: null, onerror: null, remove: () => void scripts.splice(scripts.indexOf(script), 1) };
        return script;
      },
    });
    return scripts;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a blocked script rejects and leaves nothing behind", async () => {
    const scripts = fakeDocument();
    const loading = loadPayPalSdk("https://www.paypal.com/sdk/js?blocked");
    scripts[0]!.onerror!();
    expect(await failureOf(loading)).toBe("paypal_sdk_failed");
    expect(scripts).toEqual([]);

    // A later review can try again.
    void loadPayPalSdk("https://www.paypal.com/sdk/js?blocked");
    expect(scripts).toHaveLength(1);
  });

  it("an older script failing late leaves the newer script alone", async () => {
    const scripts = fakeDocument();
    const older = loadPayPalSdk("https://www.paypal.com/sdk/js?older");
    const olderScript = scripts[0]!;
    void loadPayPalSdk("https://www.paypal.com/sdk/js?newer");
    olderScript.onerror!();
    expect(await failureOf(older)).toBe("paypal_sdk_failed");
    expect(scripts.map((script) => script.src)).toEqual(["https://www.paypal.com/sdk/js?newer"]);
  });

  it("a script that hangs rejects at the timeout", async () => {
    vi.useFakeTimers();
    const scripts = fakeDocument();
    const loading = loadPayPalSdk("https://www.paypal.com/sdk/js?hangs", 1_000);
    const outcome = failureOf(loading);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await outcome).toBe("paypal_sdk_timeout");
    expect(scripts).toEqual([]);
  });

  it("a script that loads without the SDK rejects", async () => {
    const scripts = fakeDocument();
    const loading = loadPayPalSdk("https://www.paypal.com/sdk/js?empty");
    scripts[0]!.onload!();
    expect(await failureOf(loading)).toBe("paypal_sdk_missing");
  });

  it("a second currency replaces the first currency's script and SDK", async () => {
    const scripts = fakeDocument();
    const sgd = loadPayPalSdk("https://www.paypal.com/sdk/js?sgd");
    const sgdSdk = { FUNDING: { PAYPAL: "paypal" }, Buttons: vi.fn() };
    (window as unknown as { paypal: unknown }).paypal = sgdSdk;
    scripts[0]!.onload!();
    await expect(sgd).resolves.toBe(sgdSdk);
    expect(loadPayPalSdk("https://www.paypal.com/sdk/js?sgd")).toBe(sgd);

    void loadPayPalSdk("https://www.paypal.com/sdk/js?usd");
    expect(scripts.map((script) => script.src)).toEqual(["https://www.paypal.com/sdk/js?usd"]);
    expect((window as unknown as { paypal?: unknown }).paypal).toBeUndefined();
  });
});

describe("what PayPal's window calls", () => {
  const replies: Array<{ status: number; body: unknown } | "network"> = [];
  const posts: Array<{ url: string; body: unknown }> = [];

  function handlers(stopped = false) {
    const seen = { unavailable: 0, receipt: 0, refused: [] as unknown[], stages: [] as string[], failures: [] as string[], codes: [] as unknown[] };
    const value = paypalButtonHandlers("pur_1", {
      onUnavailable: () => seen.unavailable++,
      onRefused: (refusal) => seen.refused.push(refusal),
      onStage: (stage) => seen.stages.push(stage),
      onFailure: (message, code) => {
        seen.failures.push(message);
        seen.codes.push(code);
      },
      showReceipt: () => seen.receipt++,
      isStopped: () => stopped,
    });
    return { value, seen };
  }

  beforeEach(() => {
    replies.length = 0;
    posts.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      posts.push({ url, body: JSON.parse(init.body) });
      const reply = replies.shift();
      if (!reply || reply === "network") throw new TypeError("network");
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const refusal = (code: string, message: string) => ({ status: 409, body: { ok: false, error: { code, message } } });

  it("the create step asks paypal/start and returns its order id", async () => {
    const { value } = handlers();
    replies.push({ status: 200, body: { ok: true, data: { attemptId: "att_1", approvalUrl: "https://x", orderId: "ORDER-1" } } });
    expect(await value.createOrder()).toBe("ORDER-1");
    expect(posts).toEqual([{ url: "/api/v1/purchases/pur_1/paypal/start", body: {} }]);
  });

  it("a refused start reports the refusal and opens nothing", async () => {
    const { value, seen } = handlers();
    replies.push(refusal("review_invalidated", "Closed."));
    expect(await failureOf(value.createOrder())).toBe("paypal_start_refused");
    expect(seen.refused).toEqual([{ code: "review_invalidated", message: "Closed." }]);
  });

  it("approving asks paypal/complete, then shows the receipt the server decided", async () => {
    const { value, seen } = handlers();
    replies.push({ status: 200, body: { ok: true, data: { status: "paid" } } });
    await value.onApprove();
    expect(posts).toEqual([{ url: "/api/v1/purchases/pur_1/paypal/complete", body: {} }]);
    expect(seen.stages).toEqual(["completing"]);
    expect(seen.receipt).toBe(1);
  });

  it("a refused completion shows the server's message and no receipt redirect", async () => {
    const { value, seen } = handlers();
    replies.push(refusal("payment_uncertain", "Do not pay again."));
    await value.onApprove();
    expect(seen.failures).toEqual(["Do not pay again."]);
    expect(seen.receipt).toBe(0);
  });

  it("an expired completion passes its code on, so the card can offer a fresh review", async () => {
    const { value, seen } = handlers();
    replies.push(refusal("review_expired", "This review has expired."));
    await value.onApprove();
    expect(seen.codes).toEqual(["review_expired"]);
  });

  it("a completion that never answers says so instead of throwing", async () => {
    const { value, seen } = handlers();
    replies.push("network");
    expect(await failureOf(value.onApprove())).toBe("no failure");
    expect(seen.failures).toEqual(["The payment could not be finished."]);
  });

  it("closing the window asks the cancel route, then shows the receipt", async () => {
    const { value, seen } = handlers();
    replies.push({ status: 200, body: { ok: true, data: {} } });
    await value.onCancel();
    expect(posts).toEqual([{ url: "/api/v1/purchases/pur_1/cancel", body: {} }]);
    expect(seen.stages).toEqual(["closing"]);
    expect(seen.receipt).toBe(1);
  });

  it("closing during a capture goes to the receipt, not an error", async () => {
    const { value, seen } = handlers();
    replies.push(refusal("payment_uncertain", "Checking."));
    await value.onCancel();
    expect(seen.receipt).toBe(1);
    expect(seen.failures).toEqual([]);
  });

  it("a cancel the server refuses shows its message", async () => {
    const { value, seen } = handlers();
    replies.push(refusal("validation_failed", "Cannot close."));
    await value.onCancel();
    expect(seen.failures).toEqual(["Cannot close."]);
    expect(seen.receipt).toBe(0);
  });

  it("an SDK error before approval offers the redirect", () => {
    const { value, seen } = handlers();
    value.onError();
    expect(seen.unavailable).toBe(1);
  });

  it("an SDK error after approval never offers a second way to pay", async () => {
    const { value, seen } = handlers();
    replies.push({ status: 200, body: { ok: true, data: { status: "paid" } } });
    await value.onApprove();
    value.onError();
    expect(seen.unavailable).toBe(0);
  });

  it("an SDK error after closing the window never offers a second way to pay", async () => {
    const { value, seen } = handlers();
    replies.push({ status: 200, body: { ok: true, data: {} } });
    await value.onCancel();
    value.onError();
    expect(seen.unavailable).toBe(0);
  });

  it("an SDK error after leaving the page does nothing", () => {
    const { value, seen } = handlers(true);
    value.onError();
    expect(seen.unavailable).toBe(0);
  });
});

describe("the review's PayPal card", () => {
  const props = { purchaseId: "pur_1", outletId: "out_1", validUntil: "10:05", clientId: "public-client-id", currency: "SGD" };

  it("first paints the buttons' place and the approved wording, not the redirect", () => {
    const html = renderToStaticMarkup(createElement(ContinueToPayPal, props));
    expect(html).toContain('class="paypal-buttons"');
    expect(html).toContain("Opens PayPal sandbox in a window over this page. Closing it keeps the purchase unpaid.");
    expect(html).not.toContain("Continue to PayPal");
  });

  it("keeps the redirect wired to the buttons' failure", () => {
    const card = source("continue-to-paypal.tsx");
    expect(card).toContain("window.location.assign(result.data.approvalUrl)");
    expect(card).toContain("onUnavailable={showRedirect}");
    expect(source("paypal-buttons.tsx")).toContain("...handlers });");
    expect(source("paypal-buttons.tsx")).toContain(".catch(handlers.onError)");
    expect(source("paypal-buttons.tsx")).toContain("if (!buttons.isEligible()) return handlers.onError();");
  });

  it("passes the buttons only these props", () => {
    const usage = /<PayPalButtons ([^/]*)\/>/.exec(source("continue-to-paypal.tsx"))![1]!;
    expect([...usage.matchAll(/(\w+)=\{/g)].map((match) => match[1])).toEqual(["purchaseId", "outletId", "clientId", "currency", "onUnavailable", "onRefused"]);
  });
});
