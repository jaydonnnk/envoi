import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { claimDueAttempts } from "@/domain/maintenance/due";
import { readOperatorHealth } from "@/domain/maintenance/health";
import { MAINTENANCE_TASKS, runMaintenance, type MaintenanceDeps, type MaintenanceTask } from "@/domain/maintenance/tasks";
import type { PayPalReadClient } from "@/integrations/paypal/orders-read";
import type { PayPalWriteClient } from "@/integrations/paypal/orders";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { grantOperator } from "@/operator/cli";
import { createFakePayPal, type FakePayPal } from "../support/fake-paypal";
import { jsonRequest, newMerchant, signInCookie } from "../support/merchant";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { buildRunner, type RunnerBuild } from "../support/runner-build";
import { anonymousCookie } from "../support/session";

const paypal = vi.hoisted(() => ({ client: null as PayPalWriteClient | null }));
vi.mock("@/integrations/paypal/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/paypal/orders")>()),
  paypalWriteClient: () => paypal.client,
}));
// The operator page reads the cookie through next/headers, as inside a Next.js request.
const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: request.cookie }) }));

const quiet = () => {};

// S5 maintenance against the real schema. The runner connects as envoi_maintenance with only its
// migration grants; buyer flows run as envoi_web. PayPal is the labeled fixture fake, so every order
// and capture id is FIXTURE-*, never a sandbox record.
describe("maintenance runner (fixture PayPal)", () => {
  let fixture: PaymentsFixture;
  let maintenance: { db: Db; client: postgres.Sql };
  let build: RunnerBuild;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchases: typeof import("@/app/api/v1/purchases/route");
    start: typeof import("@/app/api/v1/purchases/[id]/paypal/start/route");
    complete: typeof import("@/app/api/v1/purchases/[id]/paypal/complete/route");
    health: typeof import("@/app/api/v1/health/operator/route");
    unknownApi: typeof import("@/app/api/v1/[...path]/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("maintenance");
    // In-process runs use the maintenance role under their own application name, so the finite-run
    // test sees only the compiled runner's connections.
    const client = postgres(fixture.database.maintenanceUrl, { max: 2, onnotice: quiet, connection: { application_name: "envoi-maintenance-test" } });
    maintenance = { db: drizzle(client, { schema }), client };
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchases: await import("@/app/api/v1/purchases/route"),
      start: await import("@/app/api/v1/purchases/[id]/paypal/start/route"),
      complete: await import("@/app/api/v1/purchases/[id]/paypal/complete/route"),
      health: await import("@/app/api/v1/health/operator/route"),
      unknownApi: await import("@/app/api/v1/[...path]/route"),
    };
    build = await buildRunner("finite");
  }, 120_000);

  afterAll(async () => {
    await maintenance?.client.end({ timeout: 5 });
    build?.remove();
    await fixture?.database.drop();
  });

  const admin = () => fixture.database.admin;
  // A clock 31 seconds ahead, past the T_PROVIDER_READ_DEBOUNCE window a buyer request just opened.
  const later = () => new Date(Date.now() + 31_000);
  const deps = (fake: FakePayPal, now: () => Date = later): MaintenanceDeps => ({ paypal: fake.client, solana: null, now, log: quiet });

  async function openReview(fake: FakePayPal): Promise<{ cookie: string; purchaseId: string }> {
    paypal.client = fake.client;
    const cookie = await anonymousCookie(routes.auth.POST);
    const created = await routes.purchases.POST(jsonPost("/api/v1/purchases", cookie, { outletId: fixture.outletId, rail: "paypal", lines: [{ menuItemId: fixture.items[0]!.id, quantity: 1 }] }));
    expect(created.status).toBe(201);
    return { cookie, purchaseId: ((await created.json()) as { data: { purchaseId: string } }).data.purchaseId };
  }

  // The S3 harness: an approved order whose capture PayPal performed or never received, with the
  // capture answer lost either way, leaves the purchase uncertain and the attempt capture_unknown.
  async function uncertainCapture(fault: "lose_response" | "lose_request"): Promise<{ fake: FakePayPal; cookie: string; purchaseId: string }> {
    const fake = createFakePayPal();
    const { cookie, purchaseId } = await openReview(fake);
    expect((await routes.start.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/start`, cookie), routeParams(purchaseId))).status).toBe(200);
    fake.approve(fake.calls[0]!.orderId!);
    fake.fail("captureOrder", fault);
    await routes.complete.POST(jsonPost(`/api/v1/purchases/${purchaseId}/paypal/complete`, cookie), routeParams(purchaseId));
    expect(await stateOf(purchaseId)).toEqual({ purchase: "uncertain", attempt: "capture_unknown" });
    return { fake, cookie, purchaseId };
  }

  async function stateOf(purchaseId: string): Promise<{ purchase: string; attempt: string | null }> {
    const [row] = await admin()<{ purchase: string; attempt: string | null }[]>`
      select p.state as purchase, a.state as attempt from purchases p left join payment_attempts a on a.purchase_id = p.id
      where p.id = ${purchaseId} order by a.created_at desc limit 1`;
    return row!;
  }

  // FIXTURE: due attempts written directly, each on its own buyer's review, for the claim and
  // deadline tests. Settled afterwards so no later run claims them.
  async function dueAttempts(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const { purchaseId } = await openReview(createFakePayPal());
      const id = newId("att");
      await admin()`update purchases set state = 'uncertain' where id = ${purchaseId}`;
      await admin()`
        insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_sgd_cents, currency, create_request_id, order_id, capture_request_id)
        values (${id}, ${purchaseId}, 'capture_unknown', 'FXTRSELLER2AB', ${fixture.items[0]!.unitSgdCents}, 'SGD', ${randomUUID()}, ${`FIXTURE-ORDER-DUE-${id}`}, ${randomUUID()})`;
      ids.push(id);
    }
    return ids;
  }

  async function settle(attemptIds: readonly string[]): Promise<void> {
    await admin()`update payment_attempts set state = 'capture_failed', outcome_reason = 'FIXTURE settled', maintenance_claim_owner = null, maintenance_claim_expires_at = null where id in ${admin()(attemptIds)}`;
  }

  it("maintenance reconciles an uncertain capture with no buyer page open", async () => {
    const { fake, purchaseId } = await uncertainCapture("lose_response");
    const capturesBefore = fake.captures().length;

    const report = await runMaintenance(maintenance.db, deps(fake), "manual");

    expect(await stateOf(purchaseId)).toEqual({ purchase: "paid", attempt: "capture_confirmed" });
    expect(report.tasks.find((task) => task.name === "reconcile_attempts")).toMatchObject({ status: "ok", processed: 1 });
    expect(fake.captures()).toHaveLength(capturesBefore);
    const [audit] = await admin()<{ actor: string }[]>`select actor from audit_events where purchase_id = ${purchaseId} and action = 'paypal_capture_confirmed'`;
    expect(audit).toEqual({ actor: "maintenance" });
    const [attempt] = await admin()<{ maintenance_checks: number; maintenance_claim_owner: string | null }[]>`
      select maintenance_checks, maintenance_claim_owner from payment_attempts where purchase_id = ${purchaseId}`;
    expect(attempt).toEqual({ maintenance_checks: 1, maintenance_claim_owner: null });
  });

  it("maintenance never replays a capture", async () => {
    // PayPal never received the capture, so its order shows none: only a capture could change that,
    // and maintenance may not send one.
    const { fake, purchaseId } = await uncertainCapture("lose_request");
    const capturesBefore = fake.captures().length;

    await runMaintenance(maintenance.db, deps(fake), "manual");

    expect(fake.captures()).toHaveLength(capturesBefore);
    expect(fake.reads().length).toBeGreaterThan(0);
    expect(await stateOf(purchaseId)).toEqual({ purchase: "uncertain", attempt: "capture_unknown" });
    await settle((await admin()<{ id: string }[]>`select id from payment_attempts where purchase_id = ${purchaseId}`).map((row) => row.id));
  });

  it("overlapping runs claim disjoint work", async () => {
    const ids = await dueAttempts(4);
    const now = new Date();
    try {
      // Run A claims two and still holds them when run B starts.
      const a = (await claimDueAttempts(maintenance.db, now, 2, "FIXTURE-run-a")).map((row) => row.id);
      const b = (await claimDueAttempts(maintenance.db, now, 4, "FIXTURE-run-b")).map((row) => row.id);
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(2);
      expect(a.filter((id) => b.includes(id))).toEqual([]);
      expect([...a, ...b].sort()).toEqual([...ids].sort());

      // Two claimers at the same moment, once the T_LEASE of 300,000 ms has passed for both earlier claims.
      const afterLease = new Date(now.getTime() + 300_000);
      const [c, d] = await Promise.all([claimDueAttempts(maintenance.db, afterLease, 2, "FIXTURE-run-c"), claimDueAttempts(maintenance.db, afterLease, 2, "FIXTURE-run-d")]);
      const cIds = c.map((row) => row.id);
      const dIds = d.map((row) => row.id);
      expect(cIds.filter((id) => dIds.includes(id))).toEqual([]);
      expect(cIds.length + dIds.length).toBe(4);

      // One millisecond before those claims' T_LEASE passes, nothing is claimable.
      expect(await claimDueAttempts(maintenance.db, new Date(afterLease.getTime() + 299_999), 4, "FIXTURE-run-e")).toEqual([]);
    } finally {
      await settle(ids);
    }
  });

  it("a run stops taking work at T_MAINT_RUN", async () => {
    const ids = await dueAttempts(3);
    try {
      // Each provider read takes 61 seconds on the run's clock and gets no answer, so the second
      // read ends 122 seconds in, past the 120,000 ms T_MAINT_RUN.
      const start = Date.now();
      let elapsed = 0;
      const reads: string[] = [];
      const slow: MaintenanceDeps = {
        paypal: {
          async readOrder(orderId) {
            reads.push(orderId);
            elapsed += 61_000;
            return { kind: "timeout", responseReceived: false };
          },
        },
        solana: null,
        now: () => new Date(start + 31_000 + elapsed),
        log: quiet,
      };
      const report = await runMaintenance(maintenance.db, slow, "manual");
      expect(reads).toHaveLength(2);
      expect(report.tasks.map((task) => [task.name, task.status, task.reason])).toEqual([
        ["heartbeat", "ok", null],
        ["record_capacity", "ok", null],
        ["reconcile_attempts", "partial", "run_deadline"],
        ["close_expired_reviews", "partial", "run_deadline"],
        ["purge_expired_sessions", "partial", "run_deadline"],
      ]);
      // A run that stops at its deadline is not a failure; the unread attempt stays due.
      const [run] = await admin()<{ status: string; finished_at: Date | null }[]>`select status, finished_at from maintenance_runs where id = ${report.runId}`;
      expect(run!.status).toBe("ok");
      expect(run!.finished_at).not.toBeNull();
    } finally {
      await settle(ids);
    }
  });

  it("a run stops taking work 10,000 ms before T_MAINT_RUN to finish its report", async () => {
    const ids = await dueAttempts(4);
    try {
      // Each provider read takes 37 seconds on the run's clock. Three reads end 111 seconds in, past
      // 110,000 ms but inside the 120,000 ms T_MAINT_RUN, so a fourth is never started.
      const start = Date.now();
      let elapsed = 0;
      const reads: string[] = [];
      const slow: MaintenanceDeps = {
        paypal: {
          async readOrder(orderId) {
            reads.push(orderId);
            elapsed += 37_000;
            return { kind: "timeout", responseReceived: false };
          },
        },
        solana: null,
        now: () => new Date(start + 31_000 + elapsed),
        log: quiet,
      };
      const report = await runMaintenance(maintenance.db, slow, "manual");
      expect(reads).toHaveLength(3);
      expect(report.tasks.find((task) => task.name === "reconcile_attempts")).toMatchObject({ status: "partial", reason: "run_deadline" });
      const [run] = await admin()<{ status: string; finished_at: Date | null }[]>`select status, finished_at from maintenance_runs where id = ${report.runId}`;
      expect(run!.finished_at).not.toBeNull();
    } finally {
      await settle(ids);
    }
  });

  it("a task that times out takes no further item and the next task waits for the one it was running", async () => {
    const ids = await dueAttempts(3);
    try {
      // FIXTURE: each provider read takes 300 ms of real time and reconcile_attempts times out after
      // 450 ms, during the second read.
      const fake = createFakePayPal();
      const reads: { orderId: string; endedAt: number }[] = [];
      const slowRead: PayPalReadClient = {
        async readOrder(orderId) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          const answer = await fake.client.readOrder(orderId);
          reads.push({ orderId, endedAt: Date.now() });
          return answer;
        },
      };
      let closeStartedAt = 0;
      const tasks: MaintenanceTask[] = MAINTENANCE_TASKS.map((task) => {
        if (task.name === "reconcile_attempts") return { ...task, timeoutMs: 450 };
        if (task.name === "close_expired_reviews") {
          return {
            ...task,
            claim: (...args) => {
              closeStartedAt = Date.now();
              return task.claim(...args);
            },
          };
        }
        return task;
      });

      const report = await runMaintenance(maintenance.db, { paypal: slowRead, solana: null, now: later, log: quiet }, "manual", tasks);

      expect(report.tasks.find((task) => task.name === "reconcile_attempts")).toMatchObject({ status: "failed", reason: "reconcile_attempts_timeout" });
      expect(reads).toHaveLength(2);
      expect(closeStartedAt).toBeGreaterThanOrEqual(reads.at(-1)!.endedAt);
      const checks = await admin()<{ maintenance_checks: number }[]>`select maintenance_checks from payment_attempts where id in ${admin()(ids)} order by maintenance_checks desc`;
      expect(checks.map((row) => row.maintenance_checks)).toEqual([1, 1, 0]);
    } finally {
      await settle(ids);
    }
  });

  it("maintenance checks every due attempt in turn when more are due than one run takes", async () => {
    // FIXTURE: eleven attempts PayPal shows no capture for, so each read leaves them uncertain and
    // their updated_at unchanged. A run takes at most 10.
    const ids = await dueAttempts(11);
    try {
      const fake = createFakePayPal();
      const reads: string[] = [];
      const read: PayPalReadClient = {
        async readOrder(orderId) {
          reads.push(orderId);
          return fake.client.readOrder(orderId);
        },
      };
      // Two runs an hour apart, each past the T_PROVIDER_READ_DEBOUNCE of the one before.
      const base = Date.now();
      const runAt = (offsetMs: number): MaintenanceDeps => ({ paypal: read, solana: null, now: () => new Date(base + offsetMs), log: quiet });
      await runMaintenance(maintenance.db, runAt(3_600_000), "manual");
      const first = new Set(reads);
      expect(first.size).toBe(10);
      reads.length = 0;
      await runMaintenance(maintenance.db, runAt(7_200_000), "manual");
      const orders = (await admin()<{ order_id: string }[]>`select order_id from payment_attempts where id in ${admin()(ids)}`).map((row) => row.order_id);
      const missed = orders.filter((order) => !first.has(order));
      expect(missed).toHaveLength(1);
      // The attempt the first run left unread is read first in the second.
      expect(reads[0]).toBe(missed[0]);
    } finally {
      await settle(ids);
    }
  });

  it("an attempt skipped as in flight or just read is not counted as checked", async () => {
    const [debounced, inFlight] = await dueAttempts(2);
    try {
      // FIXTURE: a buyer's status check read one attempt just now, within T_PROVIDER_READ_DEBOUNCE,
      // and a completion holds the other's capture lease.
      await admin()`update payment_attempts set last_provider_read_at = now() where id = ${debounced!}`;
      await admin()`update payment_attempts set state = 'capture_dispatched', lease_owner = 'FIXTURE-completion', lease_expires_at = now() + interval '5 minutes' where id = ${inFlight!}`;
      const fake = createFakePayPal();

      const report = await runMaintenance(maintenance.db, deps(fake, () => new Date()), "manual");

      expect(fake.reads()).toHaveLength(0);
      expect(report.tasks.find((task) => task.name === "reconcile_attempts")).toMatchObject({ status: "partial", processed: 0 });
      const rows = await admin()<{ maintenance_checks: number; maintenance_checked_at: Date | null; maintenance_claim_owner: string | null }[]>`
        select maintenance_checks, maintenance_checked_at, maintenance_claim_owner from payment_attempts where id in (${debounced!}, ${inFlight!})`;
      expect(rows).toEqual([
        { maintenance_checks: 0, maintenance_checked_at: null, maintenance_claim_owner: null },
        { maintenance_checks: 0, maintenance_checked_at: null, maintenance_claim_owner: null },
      ]);
    } finally {
      await admin()`update payment_attempts set lease_owner = null, lease_expires_at = null where id = ${inFlight!}`;
      await settle([debounced!, inFlight!]);
    }
  });

  it("close_expired_reviews stores what the buyer already reads", async () => {
    const { purchaseId } = await openReview(createFakePayPal());
    await admin()`update purchases set review_expires_at = now() - interval '1 minute' where id = ${purchaseId}`;
    const report = await runMaintenance(maintenance.db, deps(createFakePayPal()), "manual");
    expect(await stateOf(purchaseId)).toEqual({ purchase: "review_expired", attempt: null });
    expect(report.tasks.find((task) => task.name === "close_expired_reviews")!.processed).toBeGreaterThanOrEqual(1);
  });

  it("purge_expired_sessions deletes only expired sessions and keeps their purchases", async () => {
    const { cookie: expiredCookie, purchaseId } = await openReview(createFakePayPal());
    const live = await anonymousCookie(routes.auth.POST);
    const sessionOf = async (cookie: string) => {
      const response = await routes.auth.GET(jsonRequest("GET", "/api/auth/get-session", cookie));
      return ((await response.json()) as { session: { id: string }; user: { id: string } });
    };
    const expired = await sessionOf(expiredCookie);
    const kept = await sessionOf(live);
    await admin()`update session set expires_at = now() - interval '1 minute' where id = ${expired.session.id}`;

    await runMaintenance(maintenance.db, deps(createFakePayPal()), "manual");

    const remaining = (await admin()<{ id: string }[]>`select id from session where id in (${expired.session.id}, ${kept.session.id})`).map((row) => row.id);
    expect(remaining).toEqual([kept.session.id]);
    const [owner] = await admin()<{ buyer_user_id: string }[]>`select buyer_user_id from purchases where id = ${purchaseId}`;
    expect(owner!.buyer_user_id).toBe(expired.user.id);
    expect(await admin()`select id from "user" where id = ${expired.user.id}`).toHaveLength(1);
  });

  it("the maintenance role cannot create an attempt, dispatch a capture or change a price", async () => {
    const { purchaseId } = await openReview(createFakePayPal());
    const outcome = async (query: Promise<unknown>) => query.then(() => "allowed", (err: { message: string }) => err.message);
    const role = maintenance.client;
    expect(
      await outcome(role`insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_sgd_cents, currency, create_request_id) values ('att_role_test', ${purchaseId}, 'created', 'FXTRSELLER2AB', 160, 'SGD', ${randomUUID()})`),
    ).toMatch(/permission denied/);
    expect(await outcome(role`update payment_attempts set capture_request_id = ${randomUUID()} where purchase_id = ${purchaseId}`)).toMatch(/permission denied/);
    expect(await outcome(role`update purchases set total_sgd_cents = 1 where id = ${purchaseId}`)).toMatch(/permission denied/);
    expect(await admin()`select id from payment_attempts where id = 'att_role_test'`).toHaveLength(0);
  });

  // Starts the compiled runner as its own process from `entry`, the directory holding the build's
  // src/maintenance, and resolves with its exit code, or "running" if it has not exited in 30 s.
  async function startRunner(entry: string): Promise<number | null | "running"> {
    const child = spawn(process.execPath, ["--import", join(entry, "src/maintenance/resolve-hook.js"), join(entry, "src/maintenance/run.js")], {
      // No .env.local in the working directory: the runner reads only what is given here.
      cwd: tmpdir(),
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        MAINTENANCE_DATABASE_URL: fixture.database.maintenanceUrl,
        ENVOI_ENVIRONMENT: "local",
        LOG_LEVEL: "warn",
        PAYPAL_CLIENT_ID: "fixture-client-id",
        PAYPAL_CLIENT_SECRET: "fixture-client-secret",
        PAYPAL_PARTNER_ATTRIBUTION_ID: "fixture-attribution",
      },
      stdio: "ignore",
    });
    // Well inside the 120,000 ms T_MAINT_RUN; a runner that has not exited by then never will.
    const exit = await new Promise<number | null | "running">((resolve) => {
      const timer = setTimeout(() => resolve("running"), 30_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    if (exit === "running") child.kill("SIGKILL");
    return exit;
  }

  it("maintenance run is finite", async () => {
    // Nothing is due for PayPal, so the compiled runner, which holds the real sandbox client, makes
    // no provider call; it still has a review to close and a session to purge.
    expect(await admin()`select id from payment_attempts where state in ('capture_dispatched', 'capture_unknown') or provider_read_due_at is not null`).toHaveLength(0);
    const { purchaseId } = await openReview(createFakePayPal());
    await admin()`update purchases set review_expires_at = now() - interval '1 minute' where id = ${purchaseId}`;
    await anonymousCookie(routes.auth.POST);
    await admin()`update session set expires_at = now() - interval '1 minute' where id = (select id from session order by created_at desc limit 1)`;
    const runsBefore = (await admin()`select id from maintenance_runs`).length;

    expect(await startRunner(build.outDir)).toBe(0);

    const runs = await admin()<{ trigger: string; status: string; finished_at: Date | null }[]>`select trigger, status, finished_at from maintenance_runs order by started_at`;
    expect(runs).toHaveLength(runsBefore + 1);
    expect(runs.at(-1)).toMatchObject({ trigger: "manual", status: "ok" });
    expect(runs.at(-1)!.finished_at).not.toBeNull();
    expect(await stateOf(purchaseId)).toEqual({ purchase: "review_expired", attempt: null });
    const [connections] = await admin()<{ count: number }[]>`
      select count(*)::int as count from pg_stat_activity where application_name = 'envoi-maintenance' and datname = current_database()`;
    expect(connections!.count).toBe(0);
  }, 60_000);

  it("the runner started through a symlink in a path with a space still runs", async () => {
    // Node gives the main module its real path, percent-encoded, so a start through a symlink or a
    // directory with a space must still be recognized as the entrypoint rather than doing nothing.
    const dir = mkdtempSync(join(tmpdir(), "envoi runner "));
    try {
      const link = join(dir, "linked build");
      symlinkSync(build.outDir, link);
      const runsBefore = (await admin()`select id from maintenance_runs`).length;
      expect(await startRunner(link)).toBe(0);
      const runs = await admin()<{ status: string; finished_at: Date | null }[]>`select status, finished_at from maintenance_runs order by started_at`;
      expect(runs).toHaveLength(runsBefore + 1);
      expect(runs.at(-1)).toMatchObject({ status: "ok" });
      expect(runs.at(-1)!.finished_at).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  describe("operator health view", () => {
    const healthOf = (cookie: string, headers: Record<string, string> = {}) => routes.health.GET(jsonRequest("GET", "/api/v1/health/operator", cookie, undefined, headers));

    async function operatorCookie(label: string): Promise<{ cookie: string; userId: string }> {
      const operator = await newMerchant(fixture.database, label, { membership: false });
      await grantOperator(drizzle(admin(), { schema }), { email: operator.email, evidenceRef: "FIXTURE operator" });
      return { cookie: await signInCookie(routes.auth.POST, operator), userId: operator.userId };
    }

    async function expectNotFound(response: Response) {
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(text).not.toMatch(/heartbeat|capacity|overdue/i);
    }

    it("only an operator reads the operator health view", async () => {
      // Its own run, so the view has a heartbeat and a capacity reading whatever ran before.
      await runMaintenance(maintenance.db, deps(createFakePayPal(), () => new Date()), "manual");
      const anonymous = await anonymousCookie(routes.auth.POST);
      await expectNotFound(await healthOf(anonymous));

      const merchant = await newMerchant(fixture.database, "health-merchant", { membership: true });
      await expectNotFound(await healthOf(await signInCookie(routes.auth.POST, merchant)));

      const { cookie } = await operatorCookie("health-operator");
      const response = await healthOf(cookie);
      expect(response.status).toBe(200);
      const { data } = (await response.json()) as { data: { heartbeat: { lastAt: string | null; overdue: boolean }; capacity: { databaseSizeBytes: number | null }; overdueWork: { uncertainPurchases: number } } };
      expect(data.heartbeat.lastAt).not.toBeNull();
      expect(data.heartbeat.overdue).toBe(false);
      expect(data.capacity.databaseSizeBytes ?? 0).toBeGreaterThan(0);
      expect(data.overdueWork).toHaveProperty("uncertainPurchases");
    });

    it("an anonymous session is refused even when it holds an operator grant row", async () => {
      const anonymous = await anonymousCookie(routes.auth.POST);
      const session = (await (await routes.auth.GET(jsonRequest("GET", "/api/auth/get-session", anonymous))).json()) as { user: { id: string } };
      // FIXTURE: a grant no supported path creates for an anonymous user.
      await admin()`insert into operator_grants (id, user_id, granted_at) values ('opg_anon_fixture', ${session.user.id}, now())`;
      await expectNotFound(await healthOf(anonymous));
    });

    it("an agent credential never reaches the operator health view", async () => {
      const { cookie } = await operatorCookie("health-agent");
      await expectNotFound(await healthOf(cookie, { authorization: "Bearer envoi_agent_FIXTURE" }));
    });

    it("a revoked operator grant reaches nothing", async () => {
      const { cookie, userId } = await operatorCookie("health-revoked");
      await admin()`update operator_grants set revoked_at = now() where user_id = ${userId}`;
      await expectNotFound(await healthOf(cookie));
    });

    it("the web role cannot grant an operator", async () => {
      const web = postgres(fixture.database.webUrl, { max: 1, onnotice: quiet });
      try {
        const merchant = await newMerchant(fixture.database, "health-self-grant", { membership: true });
        const result = await web`insert into operator_grants (id, user_id, granted_at) values ('opg_web_test', ${merchant.userId}, now())`.then(
          () => "inserted",
          (err: { message: string }) => err.message,
        );
        expect(result).toMatch(/permission denied/);
      } finally {
        await web.end({ timeout: 5 });
      }
    });

    it("an unknown API path answers exactly what the operator route answers everyone else", async () => {
      const refused = await healthOf(await anonymousCookie(routes.auth.POST));
      const unknown = routes.unknownApi.GET();
      expect(unknown.status).toBe(refused.status);
      for (const header of ["content-type", "cache-control"]) expect(unknown.headers.get(header)).toBe(refused.headers.get(header));
      expect(await unknown.text()).toBe(await refused.text());
    });

    it("an operator page answers everyone but the operator as an unknown address", async () => {
      // A notFound() from the page renders an empty error shell during streaming, unlike an unknown
      // address, so the proxy rewrites every non-operator request to a path no route matches.
      const { proxy, UNKNOWN_ROUTE_PATH } = await import("@/proxy");
      const { NextRequest } = await import("next/server");
      const through = (cookie: string | null, headers: Record<string, string> = {}) =>
        proxy(new NextRequest("http://localhost:3000/operator/health", { headers: { ...(cookie ? { cookie } : {}), ...headers } }));
      const rewritten = (response: Response) => response.headers.get("x-middleware-rewrite");
      const unknown = `http://localhost:3000${UNKNOWN_ROUTE_PATH}`;

      expect(rewritten(await through(null))).toBe(unknown);
      expect(rewritten(await through(await anonymousCookie(routes.auth.POST)))).toBe(unknown);
      const merchant = await newMerchant(fixture.database, "proxy-merchant", { membership: true });
      expect(rewritten(await through(await signInCookie(routes.auth.POST, merchant)))).toBe(unknown);
      const { cookie } = await operatorCookie("proxy-operator");
      expect(rewritten(await through(cookie, { authorization: "Bearer envoi_agent_FIXTURE" }))).toBe(unknown);

      const passed = await through(cookie);
      expect(rewritten(passed)).toBeNull();
      expect(passed.headers.get("x-middleware-next")).toBe("1");
    });

    it("the operator is alerted when storage reaches 70% of the project limit", async () => {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { default: OperatorHealthPage } = await import("@/app/operator/health/page");
      request.cookie = (await operatorCookie("health-capacity")).cookie;
      const web = drizzle(admin(), { schema });
      // FIXTURE: runs dated ahead of every real run, so each is the latest capacity reading in turn.
      const reading = async (id: string, bytes: number, daysAhead: number) => {
        await admin()`insert into maintenance_runs (id, trigger, status, started_at, finished_at, database_size_bytes)
          values (${id}, 'manual', 'ok', now() + ${`${daysAhead} days`}::interval, now() + ${`${daysAhead} days`}::interval, ${bytes})`;
        return { health: await readOperatorHealth(web, new Date()), html: renderToStaticMarkup(await OperatorHealthPage()) };
      };
      try {
        // 699,999,999 of 1,000,000,000 bytes is under 70%; exactly 700,000,000 is at it.
        const under = await reading("mnt_fixture_capacity_under", 699_999_999, 1);
        expect(under.health.capacity.alert).toBe(false);
        expect(under.html).toContain("Under 70%");
        expect(under.html).not.toContain('role="alert"');
        const at = await reading("mnt_fixture_capacity_at", 700_000_000, 2);
        expect(at.health.capacity.alert).toBe(true);
        expect(at.html).toContain("Over 70%");
        expect(at.html).toContain("Storage has reached 70% of the 1 GB project limit.");
      } finally {
        await admin()`delete from maintenance_runs where id in ('mnt_fixture_capacity_under', 'mnt_fixture_capacity_at')`;
      }
    });

    it("the operator page is the not-found page for everyone but the operator", async () => {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { default: OperatorHealthPage, generateMetadata } = await import("@/app/operator/health/page");
      request.cookie = await anonymousCookie(routes.auth.POST);
      await expect(OperatorHealthPage()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) });
      // The metadata gives the layout's defaults, not a not-found of its own: a notFound() from
      // metadata answers an error shell with no page body, unlike an unknown address.
      expect(await generateMetadata().catch((err: { digest?: string }) => ({ thrown: err.digest ?? "error" }))).toEqual({});

      request.cookie = (await operatorCookie("health-page")).cookie;
      const html = renderToStaticMarkup(await OperatorHealthPage());
      expect(html).toContain("Maintenance heartbeat");
      expect(html).toContain("pg_database_size covers this database only");
      expect((await generateMetadata()).title).toBe("Operator health | Envoi");
    });
  });
});
