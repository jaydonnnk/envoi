import { randomBytes } from "node:crypto";
import type { PayPalOrder } from "@/domain/purchases/reconcile";
import type { CreateOrderInput, PayPalWriteClient, ProviderResult } from "@/integrations/paypal/orders";
import { sgdFromCents } from "@/lib/money";

// FIXTURE: a fake of the PayPal Orders v2 boundary (PayPalWriteClient). Nothing here talks to
// PayPal; order and capture ids are labeled FIXTURE so no output can pass for a sandbox record.

export type FakeCall = { op: "createOrder" | "readOrder" | "captureOrder"; orderId: string | null; requestId: string | null };

type FakeOrder = { input: CreateOrderInput; status: string; captureId: string | null };

export type Phase = "pre_capture" | "post_capture";

export type FakePayPal = {
  client: PayPalWriteClient;
  calls: FakeCall[];
  writes(): FakeCall[];
  captures(): FakeCall[];
  approve(orderId: string): void;
  // Rewrites what a read returns, to model a provider record that differs from what Envoi sent.
  tamper: ((order: PayPalOrder, phase: Phase) => PayPalOrder) | null;
  // Runs inside readOrder before it answers, for example to move an injected clock.
  onRead: ((phase: Phase) => void) | null;
};

const SANDBOX_APPROVAL = "https://www.sandbox.paypal.com/checkoutnow?token=";

function view(id: string, order: FakeOrder): PayPalOrder {
  const total = sgdFromCents(order.input.totalSgdCents);
  return {
    id,
    status: order.status,
    purchaseUnitCount: 1,
    payeeMerchantId: order.input.payeeMerchantId,
    amount: { currency: "SGD", cents: total },
    customId: order.input.correlationId,
    items: order.input.lines.map((line) => ({ name: line.name, quantity: String(line.quantity), unit: { currency: "SGD", cents: sgdFromCents(line.unitSgdCents) } })),
    captures: order.captureId ? [{ id: order.captureId, status: "COMPLETED", amount: { currency: "SGD", cents: total } }] : [],
    approvalUrl: order.status === "PAYER_ACTION_REQUIRED" ? `${SANDBOX_APPROVAL}${id}` : null,
  };
}

const ok = <T>(value: T): ProviderResult<T> => ({ kind: "ok", value });

export function createFakePayPal(): FakePayPal {
  const orders = new Map<string, FakeOrder>();
  // Unique per fake, so fakes in one test database never reuse an order id.
  const run = randomBytes(4).toString("hex").toUpperCase();
  let counter = 0;
  const fake: FakePayPal = {
    calls: [],
    tamper: null,
    onRead: null,
    writes: () => fake.calls.filter((call) => call.op !== "readOrder"),
    captures: () => fake.calls.filter((call) => call.op === "captureOrder"),
    approve(orderId) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no fixture order ${orderId}`);
      order.status = "APPROVED";
    },
    client: {
      async createOrder(input, requestId) {
        const id = `FIXTURE-ORDER-${run}-${++counter}`;
        fake.calls.push({ op: "createOrder", orderId: id, requestId });
        orders.set(id, { input, status: "PAYER_ACTION_REQUIRED", captureId: null });
        return ok(view(id, orders.get(id)!));
      },
      async readOrder(orderId) {
        fake.calls.push({ op: "readOrder", orderId, requestId: null });
        const order = orders.get(orderId);
        if (!order) return { kind: "http_error", status: 404, retryable: false };
        const phase: Phase = order.captureId ? "post_capture" : "pre_capture";
        fake.onRead?.(phase);
        const current = view(orderId, order);
        return ok(fake.tamper ? fake.tamper(current, phase) : current);
      },
      async captureOrder(orderId, requestId) {
        fake.calls.push({ op: "captureOrder", orderId, requestId });
        const order = orders.get(orderId);
        if (!order || order.status !== "APPROVED") return { kind: "http_error", status: 422, retryable: false };
        order.status = "COMPLETED";
        order.captureId = `FIXTURE-CAPTURE-${orderId.slice("FIXTURE-ORDER-".length)}`;
        return ok(view(orderId, order));
      },
    },
  };
  return fake;
}
