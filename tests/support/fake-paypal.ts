import { randomBytes } from "node:crypto";
import type { PayPalOrder } from "@/domain/purchases/reconcile";
import type { CreateOrderInput, PayPalWriteClient, ProviderResult } from "@/integrations/paypal/orders";
import { sgdFromCents } from "@/lib/money";

// FIXTURE: a fake of the PayPal Orders v2 boundary (PayPalWriteClient). Nothing here talks to
// PayPal; order and capture ids are labeled FIXTURE so no output can pass for a sandbox record.
// Like PayPal, it honors PayPal-Request-Id: a repeated key returns the earlier request's result.
// Faults are injected per operation: "lose_request" fails before the fake provider acts,
// "lose_response" acts and then drops the answer, as a timeout would, and "refuse" answers a 422
// naming an issue code without acting.

export type FakeOp = "createOrder" | "readOrder" | "captureOrder";

export type FakeCall = { op: FakeOp; orderId: string | null; requestId: string | null };

export type Fault = "lose_request" | "lose_response" | "refuse";

type FakeOrder = { input: CreateOrderInput; status: string; captureId: string | null };

export type Phase = "pre_capture" | "post_capture";

export type FakePayPal = {
  client: PayPalWriteClient;
  calls: FakeCall[];
  writes(): FakeCall[];
  captures(): FakeCall[];
  reads(): FakeCall[];
  approve(orderId: string): void;
  // PayPal no longer holds the order, as after an uncaptured order expires: reads and captures 404.
  forget(orderId: string): void;
  // The next `times` calls of `op` suffer `fault`.
  fail(op: FakeOp, fault: Fault, times?: number): void;
  // Every capture with a new request id is refused with this status and these issue codes.
  refuseCapture: { status: number; issues: string } | null;
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
const lost: ProviderResult<never> = { kind: "timeout", responseReceived: false };
const refused = (status: number, issues: string): ProviderResult<never> => ({ kind: "http_error", status, retryable: false, issues });

export function createFakePayPal(): FakePayPal {
  const orders = new Map<string, FakeOrder>();
  const createdByKey = new Map<string, string>();
  const capturedByKey = new Map<string, ProviderResult<PayPalOrder>>();
  const faults: { op: FakeOp; fault: Fault }[] = [];
  // Unique per fake, so fakes in one test database never reuse an order id.
  const run = randomBytes(4).toString("hex").toUpperCase();
  let counter = 0;

  const takeFault = (op: FakeOp): Fault | null => {
    const index = faults.findIndex((entry) => entry.op === op);
    if (index < 0) return null;
    const [entry] = faults.splice(index, 1);
    return entry!.fault;
  };

  const fake: FakePayPal = {
    calls: [],
    refuseCapture: null,
    tamper: null,
    onRead: null,
    writes: () => fake.calls.filter((call) => call.op !== "readOrder"),
    captures: () => fake.calls.filter((call) => call.op === "captureOrder"),
    reads: () => fake.calls.filter((call) => call.op === "readOrder"),
    approve(orderId) {
      const order = orders.get(orderId);
      if (!order) throw new Error(`no fixture order ${orderId}`);
      order.status = "APPROVED";
    },
    forget(orderId) {
      orders.delete(orderId);
    },
    fail(op, fault, times = 1) {
      for (let i = 0; i < times; i++) faults.push({ op, fault });
    },
    client: {
      async createOrder(input, requestId) {
        const fault = takeFault("createOrder");
        const known = createdByKey.get(requestId);
        fake.calls.push({ op: "createOrder", orderId: known ?? null, requestId });
        if (fault === "lose_request") return lost;
        if (fault === "refuse") return refused(422, "UNPROCESSABLE_ENTITY,INVALID_REQUEST");
        let id = known;
        if (!id) {
          id = `FIXTURE-ORDER-${run}-${++counter}`;
          orders.set(id, { input, status: "PAYER_ACTION_REQUIRED", captureId: null });
          createdByKey.set(requestId, id);
          fake.calls[fake.calls.length - 1]!.orderId = id;
        }
        if (fault === "lose_response") return lost;
        return ok(view(id, orders.get(id)!));
      },
      async readOrder(orderId) {
        const fault = takeFault("readOrder");
        fake.calls.push({ op: "readOrder", orderId, requestId: null });
        if (fault === "refuse") return refused(422, "UNPROCESSABLE_ENTITY");
        if (fault) return lost;
        const order = orders.get(orderId);
        if (!order) return refused(404, "RESOURCE_NOT_FOUND");
        const phase: Phase = order.captureId ? "post_capture" : "pre_capture";
        fake.onRead?.(phase);
        const current = view(orderId, order);
        return ok(fake.tamper ? fake.tamper(current, phase) : current);
      },
      async captureOrder(orderId, requestId) {
        const fault = takeFault("captureOrder");
        fake.calls.push({ op: "captureOrder", orderId, requestId });
        if (fault === "lose_request") return lost;
        if (fault === "refuse") return refused(422, "UNPROCESSABLE_ENTITY");
        let result = capturedByKey.get(requestId);
        if (!result) {
          const order = orders.get(orderId);
          if (fake.refuseCapture) result = refused(fake.refuseCapture.status, fake.refuseCapture.issues);
          else if (!order) result = refused(404, "RESOURCE_NOT_FOUND");
          else if (order.captureId) result = refused(422, "UNPROCESSABLE_ENTITY,ORDER_ALREADY_CAPTURED");
          else if (order.status !== "APPROVED") result = refused(422, "UNPROCESSABLE_ENTITY,ORDER_NOT_APPROVED");
          else {
            order.status = "COMPLETED";
            order.captureId = `FIXTURE-CAPTURE-${orderId.slice("FIXTURE-ORDER-".length)}`;
            result = ok(view(orderId, order));
          }
          capturedByKey.set(requestId, result);
        }
        if (fault === "lose_response") return lost;
        return result;
      },
    },
  };
  return fake;
}
