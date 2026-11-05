import { describe, expect, it } from "vitest";
import { filterWords, needsReading, orderStatus, paidVia } from "@/app/merchant/orders/order-copy";
import { orderTime } from "@/app/merchant/orders/orders-grid";
import { applyOrderFilter, OrderFilterSchema, parseOrderFilter, singaporeDate, type OrderFilter } from "@/domain/purchases/order-filter";
import type { MerchantOrder } from "@/domain/purchases/orders";

// S35, Ask your orders: named tests 42 and 44 and the rules beside them. Every order here is a FIXTURE
// shaped like the orders route's answer; no model is called.
const fixtureOrder = (id: string, overrides: Partial<MerchantOrder>): MerchantOrder =>
  ({
    id,
    createdAt: "2026-11-04T02:12:00.000Z",
    entryPoint: "FIXTURE",
    rail: "paypal",
    lines: [{ menuItemId: "FIXTURE-item", name: "FIXTURE Kopi C", quantity: 1 }],
    totalMinor: 180,
    currency: "SGD",
    state: "pending_payment",
    recipient: null,
    pyusd: null,
    payment: { environment: "sandbox", attemptState: "order_created", orderId: "FIXTURE-order", captureId: null, captureGrossMinor: null, captureVerifiedAt: null },
    acknowledgedAt: null,
    canAcknowledge: false,
    ...overrides,
  }) as MerchantOrder;

const paid = fixtureOrder("paid", { state: "paid", canAcknowledge: true });
const pending = fixtureOrder("pending", {});
const checking = fixtureOrder("checking", { payment: { environment: "sandbox", attemptState: "capture_unknown", orderId: "FIXTURE-order", captureId: null, captureGrossMinor: null, captureVerifiedAt: null } });
const uncertain = fixtureOrder("uncertain", { state: "uncertain" });
const closed = fixtureOrder("closed", { state: "unpaid_closed" });
const notPaid = [pending, checking, uncertain, closed];
const answering = (answer: unknown) => () => Promise.resolve(answer);

describe("the orders filter", () => {
  it("the filter schema refuses any field but the five", async () => {
    const five = { states: ["paid"], rails: ["paypal"], currencies: ["SGD"], from: "2026-10-29", to: "2026-11-04" };
    expect(await parseOrderFilter("FIXTURE", "2026-11-04", answering(five))).toEqual(five);
    for (const extra of [{ id: "pur_FIXTURE" }, { state: "paid" }, { setState: "paid" }, { orders: [] }]) {
      expect(await parseOrderFilter("FIXTURE", "2026-11-04", answering({ ...five, ...extra }))).toBeNull();
    }
  });

  it("refuses a value the five fields do not allow", async () => {
    for (const answer of [{ states: ["review_open"] }, { rails: ["card"] }, { currencies: ["EUR"] }, { from: "last week" }, { to: "2026-02-30" }, { from: "2026-11-04", to: "2026-10-29" }, { states: [] }, null, "paid"]) {
      expect(await parseOrderFilter("FIXTURE", "2026-11-04", answering(answer))).toBeNull();
    }
    expect(OrderFilterSchema.safeParse({}).success).toBe(true);
  });

  it("gives the model the sentence and the date and nothing else", async () => {
    const received: unknown[] = [];
    await parseOrderFilter("paid orders", "2026-11-04", (input) => {
      received.push(input);
      return Promise.resolve({});
    });
    expect(received).toEqual([{ text: "paid orders", today: "2026-11-04" }]);
  });

  it("a filter never turns a pending order into a paid row", () => {
    const all = [paid, ...notPaid];
    expect(applyOrderFilter(all, { states: ["paid"] }).map((order) => order.id)).toEqual(["paid"]);
    const filters: OrderFilter[] = [{}, { rails: ["paypal"] }, { currencies: ["SGD"] }, { states: ["pending_payment", "uncertain", "unpaid_closed"] }];
    for (const filter of filters) {
      const rows = applyOrderFilter(notPaid, filter);
      expect(rows).toHaveLength(notPaid.length);
      for (const [index, row] of rows.entries()) {
        expect(row).toBe(notPaid[index]);
        expect(row.state).not.toBe("paid");
        expect(orderStatus(row).chip).not.toBe("Paid");
        expect(paidVia(row)).toBe("PayPal, not paid");
      }
    }
  });

  it("filters by rail, currency and inclusive Singapore dates", () => {
    const pyusd = fixtureOrder("pyusd", { rail: "pyusd" });
    const usd = fixtureOrder("usd", { currency: "USD" });
    const noRail = fixtureOrder("no-rail", { rail: null });
    const ids = (orders: MerchantOrder[]) => orders.map((order) => order.id);
    expect(ids(applyOrderFilter([pending, pyusd, noRail], { rails: ["pyusd"] }))).toEqual(["pyusd"]);
    expect(ids(applyOrderFilter([pending, usd], { currencies: ["USD"] }))).toEqual(["usd"]);

    // 16:30 UTC on 3 Nov is 00:30 on 4 Nov in Singapore; 15:30 UTC is still 3 Nov there.
    const early = fixtureOrder("early", { createdAt: "2026-11-03T16:30:00.000Z" });
    const late = fixtureOrder("late", { createdAt: "2026-11-03T15:30:00.000Z" });
    expect(singaporeDate(new Date(early.createdAt))).toBe("2026-11-04");
    expect(ids(applyOrderFilter([early, late], { from: "2026-11-04" }))).toEqual(["early"]);
    expect(ids(applyOrderFilter([early, late], { to: "2026-11-03" }))).toEqual(["late"]);
    expect(ids(applyOrderFilter([early, late], { from: "2026-11-03", to: "2026-11-04" }))).toEqual(["early", "late"]);
  });
});

describe("what the merchant reads", () => {
  it("shows which filters were chosen, in the mockup's words", () => {
    expect(filterWords({ states: ["paid"], rails: ["paypal"], from: "2026-10-29", to: "2026-11-04" }).join(" · ")).toBe("Paid · PayPal · 29 Oct to 4 Nov");
    expect(filterWords({ states: ["pending_payment", "uncertain"], currencies: ["USD"] })).toEqual(["Not paid yet", "Checking payment", "USD"]);
    expect(filterWords({ from: "2026-11-04", to: "2026-11-04" })).toEqual(["4 Nov"]);
    expect(filterWords({ from: "2026-11-04" })).toEqual(["From 4 Nov"]);
    expect(filterWords({ to: "2026-11-04" })).toEqual(["Up to 4 Nov"]);
    expect(filterWords({})).toEqual([]);
  });

  it("names a rail as how an order was paid only when it was paid", () => {
    expect(paidVia(paid)).toBe("PayPal");
    expect(paidVia(fixtureOrder("pyusd-paid", { rail: "pyusd", state: "paid" }))).toBe("PYUSD");
    expect(paidVia(fixtureOrder("pyusd-open", { rail: "pyusd" }))).toBe("PYUSD, not paid");
    expect(paidVia(fixtureOrder("no-rail", { rail: null }))).toBe("Not paid");
  });

  it("keeps a record open when tokens may have reached the shop outside the order", () => {
    const pyusd = { environment: "devnet", amount: "1", recipientTokenAccount: null, attemptState: null, signature: null, extraTransfers: [], closedBy: null } as NonNullable<MerchantOrder["pyusd"]>;
    expect(needsReading(pending)).toBe(false);
    expect(needsReading(fixtureOrder("plain", { rail: "pyusd", pyusd }))).toBe(false);
    expect(needsReading(fixtureOrder("extra", { rail: "pyusd", pyusd: { ...pyusd, extraTransfers: [{ signature: "FIXTURE", amount: "1" }] } }))).toBe(true);
    expect(needsReading(fixtureOrder("closed", { rail: "pyusd", pyusd: { ...pyusd, closedBy: "operator" } }))).toBe(true);
    expect(needsReading(fixtureOrder("released", { rail: "pyusd", pyusd: { ...pyusd, closedBy: "release" } }))).toBe(false);
  });

  it("shows the time in Singapore in the mockup's shape", () => {
    expect(orderTime("2026-11-04T02:12:00.000Z")).toBe("4 Nov 10:12");
    expect(orderTime("2026-11-03T16:30:00.000Z")).toBe("4 Nov 00:30");
  });
});
