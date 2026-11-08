import { describe, expect, it } from "vitest";
import { countryText, feeText, methodRows, netText, ordersCsv } from "@/app/merchant/orders/order-copy";
import { applyOrderFilter, isOverseas, parseOrderFilter } from "@/domain/purchases/order-filter";
import type { MerchantOrder } from "@/domain/purchases/orders";
import { decideCaptureOutcome, saleFigures, type ExpectedPurchase } from "@/domain/purchases/reconcile";
import { mapOrder } from "@/integrations/paypal/map";

// S46, the Tourist Sales Desk: the pure parts of named tests 73, 74, 76 and 77. Every order and
// PayPal body here is a FIXTURE; no model or provider is called.

const expected: ExpectedPurchase = {
  purchaseId: "pur_FIXTURE",
  outletId: "out_FIXTURE",
  payeeId: "FXTRSELLER2AB",
  totalMinor: 980,
  currency: "SGD",
  lines: [{ menuItemId: "itm_FIXTURE", name: "FIXTURE Chicken rice", quantity: 1, unitMinor: 980, lineMinor: 980 }],
  correlationId: "pur_FIXTURE",
};

// FIXTURE: the shape of the sandbox order read recorded in S46's first step, with no payer name or email.
function paypalBody(capture: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    id: "FIXTURE-ORDER",
    status: "COMPLETED",
    payment_source: { paypal: { address: { country_code: "US" } } },
    purchase_units: [
      {
        payee: { merchant_id: "FXTRSELLER2AB" },
        amount: { currency_code: "SGD", value: "9.80" },
        custom_id: "pur_FIXTURE",
        items: [{ name: "FIXTURE Chicken rice", quantity: "1", unit_amount: { currency_code: "SGD", value: "9.80" } }],
        payments: {
          captures: [
            {
              id: "FIXTURE-CAPTURE",
              status: "COMPLETED",
              amount: { currency_code: "SGD", value: "9.80" },
              seller_receivable_breakdown: { gross_amount: { currency_code: "SGD", value: "9.80" }, paypal_fee: { currency_code: "SGD", value: "0.83" }, net_amount: { currency_code: "SGD", value: "8.97" } },
              ...capture,
            },
          ],
        },
      },
    ],
    ...extra,
  };
}

const AT = new Date("2026-11-08T04:00:00.000Z");

describe("73 a missing fee shows as unknown, never zero", () => {
  it("reads PayPal's fee, net and country from the order read", () => {
    expect(saleFigures(mapOrder(paypalBody())!)).toEqual({ captureFeeMinor: 83, captureNetMinor: 897, payerCountry: "US" });
  });

  it("keeps a missing, unreadable, negative or other-currency figure null", () => {
    const fee = (breakdown: unknown) => saleFigures(mapOrder(paypalBody({ seller_receivable_breakdown: breakdown }))!);
    expect(fee(undefined)).toMatchObject({ captureFeeMinor: null, captureNetMinor: null });
    expect(fee({ paypal_fee: { currency_code: "SGD", value: "abc" } }).captureFeeMinor).toBeNull();
    expect(fee({ paypal_fee: { currency_code: "SGD", value: "-0.83" } }).captureFeeMinor).toBeNull();
    expect(fee({ paypal_fee: { currency_code: "USD", value: "0.62" }, net_amount: { currency_code: "USD", value: "7.00" } })).toMatchObject({ captureFeeMinor: null, captureNetMinor: null });
  });

  it("keeps a missing or malformed payer country null, and falls back to the older payer address", () => {
    const country = (extra: Record<string, unknown>) => mapOrder(paypalBody({}, extra))!.payerCountry;
    expect(country({ payment_source: {} })).toBeNull();
    expect(country({ payment_source: { paypal: { address: { country_code: "usa" } } } })).toBeNull();
    expect(country({ payment_source: {}, payer: { address: { country_code: "GB" } } })).toBe("GB");
  });

  it("writes Unknown for a paid PayPal order without PayPal's figures, and nothing for an unpaid one", () => {
    const base = { rail: "paypal", currency: "SGD", totalMinor: 980, payment: { captureFeeMinor: null, captureNetMinor: null, payerCountry: null } };
    const paid = { ...base, state: "paid" } as unknown as MerchantOrder;
    const pending = { ...base, state: "pending_payment" } as unknown as MerchantOrder;
    expect([feeText(paid), netText(paid), countryText(paid)]).toEqual(["Unknown", "Unknown", "Unknown"]);
    expect([feeText(pending), netText(pending), countryText(pending)]).toEqual(["", "", ""]);
  });

  it("names unknown fees in the by-method table instead of adding them as zero", () => {
    const [row] = methodRows({ currency: "SGD", paidMinor: 1960, paidCount: 2, knownFeeMinor: 83, knownNetMinor: 897, unknownFeeCount: 1, byRail: [{ rail: "paypal", paidMinor: 1960, paidCount: 2, knownFeeMinor: 83, knownNetMinor: 897, unknownFeeCount: 1 }] });
    expect(row!.fees).toBe("S$0.83 known, 1 unknown");
  });
});

describe("74 a missing fee never blocks Paid", () => {
  it("decides the same capture the same way with or without PayPal's breakdown and country", () => {
    const full = decideCaptureOutcome(mapOrder(paypalBody())!, expected, AT);
    const bare = decideCaptureOutcome(mapOrder(paypalBody({ seller_receivable_breakdown: undefined }, { payment_source: undefined }))!, expected, AT);
    const odd = decideCaptureOutcome(mapOrder(paypalBody({ seller_receivable_breakdown: { paypal_fee: { currency_code: "USD", value: "-1" } } }))!, expected, AT);
    expect(full.decision).toBe("confirmed");
    expect(bare).toEqual(full);
    expect(odd).toEqual(full);
  });
});

const answering = (answer: unknown) => () => Promise.resolve(answer);

describe("76 the model's answer can change only filters, sort and view", () => {
  it("accepts a sort and a view from the fixed lists", async () => {
    const answer = { states: ["paid"], sort: { column: "total", direction: "desc" }, view: "overseas" };
    expect(await parseOrderFilter("FIXTURE", "2026-11-08", answering(answer))).toEqual(answer);
  });

  it("makes any other field or value no filter", async () => {
    const answers = [
      { sort: { column: "fee", direction: "desc" }, setFee: 0 },
      { view: "paid", orders: [] },
      { sort: { column: "price", direction: "desc" } },
      { sort: { column: "total", direction: "down" } },
      { sort: { column: "total", direction: "desc", feeMinor: 0 } },
      { view: "refunded" },
      { view: "paid", state: "paid" },
    ];
    for (const answer of answers) expect(await parseOrderFilter("FIXTURE", "2026-11-08", answering(answer))).toBeNull();
  });
});

describe("77 an order is called overseas only from PayPal's country", () => {
  const order = (id: string, state: string, payerCountry: string | null, currency = "SGD") =>
    ({ id, state, currency, rail: "paypal", createdAt: "2026-11-08T02:00:00.000Z", lines: [], totalMinor: 980, payment: { payerCountry }, pyusd: null, refund: null }) as unknown as MerchantOrder;

  it("needs PayPal's country, and one other than the shop's own", () => {
    expect(isOverseas(order("us", "paid", "US"), "SG")).toBe(true);
    expect(isOverseas(order("none", "paid", null), "SG")).toBe(false);
    expect(isOverseas(order("home", "paid", "SG"), "SG")).toBe(false);
    expect(isOverseas(order("us-shop", "paid", "US"), "US")).toBe(false);
    // A US dollar order without PayPal's country is not overseas: currency never decides it.
    expect(isOverseas(order("usd", "paid", null, "USD"), "SG")).toBe(false);
  });

  it("is what the overseas view shows", () => {
    const rows = [order("us", "paid", "US"), order("none", "paid", null), order("home", "paid", "SG"), order("usd", "paid", null, "USD")];
    expect(applyOrderFilter(rows, { view: "overseas" }, "SG").map((row) => row.id)).toEqual(["us"]);
  });
});

describe("the CSV export", () => {
  it("never lets a menu item's name run as a spreadsheet formula", () => {
    const evil = { id: "x", state: "paid", rail: "paypal", currency: "SGD", totalMinor: 980, createdAt: "2026-11-08T02:00:00.000Z", lines: [{ name: "=HYPERLINK(\"x\")", quantity: 1 }], payment: { captureGrossMinor: 980, captureFeeMinor: 83, captureNetMinor: 897, payerCountry: "US", attemptState: "capture_confirmed" }, pyusd: null, refund: null } as unknown as MerchantOrder;
    const csv = ordersCsv([{ time: "8 Nov 10:00", order: evil }], []);
    const line = csv.split("\r\n")[1]!;
    expect(line).toContain('"1 × =HYPERLINK(""x"")"');
    const formula = ordersCsv([{ time: "=1+1", order: evil }], []).split("\r\n")[1]!;
    expect(formula.startsWith("'=1+1,")).toBe(true);
  });
});
