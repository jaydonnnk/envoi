import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StallCard, stallRows } from "@/app/receipt/[purchaseId]/show-the-stall";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { formatMoney, money } from "@/lib/money";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, replace() {}, push() {} }),
}));

// S42, Gate 3 third build plan named tests 54 and 55, on the real receipt page as envoi_web. PayPal is
// the labeled fixture fake, so every order and capture here is FIXTURE-*, never a sandbox record.
describe("show the stall on the receipt (fixture PayPal)", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    cancel: typeof import("@/app/api/v1/purchases/[id]/cancel/route");
    reconcile: typeof import("@/app/api/v1/purchases/[id]/reconcile/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("stall");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      cancel: await import("@/app/api/v1/purchases/[id]/cancel/route"),
      reconcile: await import("@/app/api/v1/purchases/[id]/reconcile/route"),
    };
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const act = (path: string, handler: (req: Request, ctx: ReturnType<typeof routeParams>) => Promise<Response>, cookie: string, id: string) =>
    handler(jsonPost(`/api/v1/purchases/${id}/${path}`, cookie), routeParams(id));

  async function review(): Promise<{ cookie: string; purchaseId: string }> {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const [first, second] = fixture.items;
    const created = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: first!.id, quantity: 2 }, { menuItemId: second!.id, quantity: 1 }] }),
    );
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { purchaseId: string } };
    return { cookie, purchaseId: data.purchaseId };
  }

  async function approved(): Promise<{ cookie: string; purchaseId: string }> {
    const opened = await review();
    expect((await act("paypal/start", routes.start.POST, opened.cookie, opened.purchaseId)).status).toBe(200);
    fake.approve(fake.calls[0]!.orderId!);
    return opened;
  }

  async function paid(): Promise<{ cookie: string; purchaseId: string }> {
    const opened = await approved();
    expect((await act("paypal/complete", routes.complete.POST, opened.cookie, opened.purchaseId)).status).toBe(200);
    return opened;
  }

  async function receipt(cookie: string, purchaseId: string): Promise<string> {
    const { default: ReceiptPage } = await import("@/app/receipt/[purchaseId]/page");
    request.cookie = cookie;
    return renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ purchaseId }) }));
  }

  async function expectState(purchaseId: string, state: string): Promise<void> {
    const [row] = await fixture.database.admin`select state from purchases where id = ${purchaseId}`;
    expect(row!.state).toBe(state);
  }

  it("show the stall renders only on a paid receipt", async () => {
    const open = await review();
    await expectState(open.purchaseId, "review_open");
    expect(await receipt(open.cookie, open.purchaseId)).not.toContain("Show the stall");

    const pending = await approved();
    await expectState(pending.purchaseId, "pending_payment");
    expect(await receipt(pending.cookie, pending.purchaseId)).not.toContain("Show the stall");

    const uncertain = await approved();
    fake.fail("captureOrder", "lose_request");
    expect((await act("paypal/complete", routes.complete.POST, uncertain.cookie, uncertain.purchaseId)).status).toBe(200);
    await expectState(uncertain.purchaseId, "uncertain");
    expect(await receipt(uncertain.cookie, uncertain.purchaseId)).not.toContain("Show the stall");

    const closed = await approved();
    expect((await act("cancel", routes.cancel.POST, closed.cookie, closed.purchaseId)).status).toBe(200);
    await expectState(closed.purchaseId, "unpaid_closed");
    expect(await receipt(closed.cookie, closed.purchaseId)).not.toContain("Show the stall");

    const done = await paid();
    await expectState(done.purchaseId, "paid");
    expect(await receipt(done.cookie, done.purchaseId)).toContain("Show the stall");
  });

  it("the stall card's amount comes from the purchase, and its text cannot supply one", async () => {
    const { cookie, purchaseId } = await paid();
    const [first, second] = fixture.items;
    const total = 2 * first!.unitMinor + second!.unitMinor;
    const [attempt] = await fixture.database.admin`select capture_gross_minor from payment_attempts where purchase_id = ${purchaseId}`;
    expect(attempt!.capture_gross_minor).toBe(total);

    const html = await receipt(cookie, purchaseId);
    const card = /<section class="card show-the-stall".*?<\/section>/s.exec(html)?.[0] ?? "";
    expect(card).toContain(`${formatMoney(money("SGD", total))} paid`);
    expect(card).toContain(`${first!.name} × 2`);
    expect(card).toContain(`${second!.name} × 1`);
    expect(card).toContain("Payment confirmed does not mean the shop has accepted the order.");

    // A translation holding an amount never reaches the card: the line keeps the shop's own name.
    const rows = stallRows(
      [{ menuItemId: first!.id, name: first!.name, quantity: 2 }, { menuItemId: second!.id, name: second!.name, quantity: 1 }],
      [{ itemId: first!.id, name: "S$99.00 paid" }, { itemId: second!.id, name: "９９ 元" }],
    );
    expect(rows.map((row) => row.translated)).toEqual([null, null]);
    const hostile = renderToStaticMarkup(createElement(StallCard, { rows, language: "zh", choose: () => undefined, status: "failed", paidAmount: formatMoney(money("SGD", total)), onPlay: null }));
    expect(hostile).not.toContain("99");
    expect(hostile).not.toContain("元");
    expect(hostile.match(/S\$[\d.]+/g)).toEqual([formatMoney(money("SGD", total))]);
  });
});
