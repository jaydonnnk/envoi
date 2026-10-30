import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startPayPal, type StartResult } from "@/domain/payments/attempts";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import { getAuth } from "@/lib/auth";
import { isPrincipal, requireBuyerSession, type BuyerPrincipal } from "@/lib/auth-context";
import { connectWeb } from "@/lib/db/web";
import type { AppError } from "@/lib/errors";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";
import { waitFor } from "../support/wait";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));

// paypal/start against the real schema as envoi_web. PayPal is a labeled fixture fake.
describe("paypal/start", () => {
  let fixture: PaymentsFixture;
  let fake: FakePayPal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("start");
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  async function review(quantity: number): Promise<{ cookie: string; purchaseId: string }> {
    fake = createFakePayPal();
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.purchases.POST(
      jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[0]!.id, quantity }] }),
    );
    const { data } = (await response.json()) as { data: { purchaseId: string } };
    return { cookie, purchaseId: data.purchaseId };
  }

  async function principalOf(cookie: string): Promise<BuyerPrincipal> {
    const principal = await requireBuyerSession(getAuth(), new Headers({ cookie }));
    if (!isPrincipal(principal)) throw new Error("no buyer session");
    return principal;
  }

  it("expired review cannot start a payment", async () => {
    const { cookie, purchaseId } = await review(1);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1_000));

    const response = await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, cookie), routeParams(purchaseId));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "review_expired" } });
    expect(fake.calls).toEqual([]);
    expect(await fixture.database.admin`select id from payment_attempts where purchase_id = ${purchaseId}`).toHaveLength(0);
  });

  it("double start returns the same attempt", async () => {
    const { cookie, purchaseId } = await review(2);
    const principal = await principalOf(cookie);
    const web = connectWeb(fixture.database.webUrl, 4);
    const deps = { db: web.db, paypal: fake.client, now: () => new Date(), appBaseUrl: TEST_BASE_URL };
    const admin = fixture.database.admin;
    const waitingOnLock = async () =>
      (await admin`select count(*)::int as n from pg_stat_activity where datname = ${fixture.database.name} and wait_event_type = 'Lock'`)[0]!.n > 0;

    let firstHeld!: () => void;
    const firstInBarrier = new Promise<void>((resolve) => (firstHeld = resolve));
    let secondReachedRead = false;
    try {
      // The first start holds after its existing-attempt read until the second is waiting on the
      // purchase row lock or has reached the same read.
      const first = startPayPal(deps, principal, purchaseId, {
        afterExistingAttemptRead: async () => {
          firstHeld();
          await waitFor(async () => secondReachedRead || (await waitingOnLock()), 10_000, "second start to block or read");
        },
      });
      await firstInBarrier;
      const second = startPayPal(deps, principal, purchaseId, {
        afterExistingAttemptRead: async () => {
          secondReachedRead = true;
        },
      });
      const results: Array<StartResult | AppError> = await Promise.all([first, second]);

      for (const result of results) expect(result).not.toHaveProperty("code");
      const [a, b] = results as [StartResult, StartResult];
      expect(b.attemptId).toBe(a.attemptId);
      expect(b.approvalUrl).toBe(a.approvalUrl);
      expect(fake.writes()).toHaveLength(1);
    } finally {
      await web.close();
    }
  });

  it("a purchase holds at most one non-terminal attempt", async () => {
    const { purchaseId } = await review(3);

    // Direct inserts against the real schema, inside a transaction that the violation rolls back.
    let terminalAndActiveCoexist = false;
    await expect(
      fixture.database.admin.begin(async (sql) => {
        const insert = (state: string) => sql`
          insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_minor, currency, create_request_id)
          values (${`att_${randomUUID()}`}, ${purchaseId}, ${state}, 'FXTRSELLER2AB', 160, 'SGD', ${randomUUID()})`;
        await insert("abandoned");
        await insert("created");
        terminalAndActiveCoexist = true;
        await insert("order_created");
      }),
    ).rejects.toMatchObject({ code: "23505", constraint_name: "payment_attempts_one_active" });
    expect(terminalAndActiveCoexist).toBe(true);
    expect(await fixture.database.admin`select id from payment_attempts where purchase_id = ${purchaseId}`).toHaveLength(0);
  });
});
