// Slice S5 manual runs, labeled manual. From the repository root, after `npm run runner:build`:
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
//     npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s5-manual-run.mts <scratch dir>
// On a disposable local database it leaves the S3 harness's uncertain capture (PayPal captured, the
// answer was lost), an expired review and an expired session, then starts the compiled runner twice
// as its own process, with no buyer page open. PayPal is the FIXTURE fetch in s5-fixture-paypal.mjs:
// no network call is made and every id is FIXTURE-*. It prints evidence only, never a secret, and
// keeps the database for the screen check, printing its name.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PayPalOrder } from "../../../../src/domain/purchases/reconcile";
import * as schema from "../../../../src/lib/db/schema";
import { assignPayPalDestination, seedDemoFixture } from "../../../../src/operator/cli";
import { createTestDatabase } from "../../../../tests/support/db";
import { createFakePayPal } from "../../../../tests/support/fake-paypal";
import { FIXTURE_SELLER, jsonPost } from "../../../../tests/support/payments";
import { anonymousCookie, TEST_BASE_URL, webEnvFor } from "../../../../tests/support/session";

const ROOT = resolve(import.meta.dirname, "../../../..");
const scratch = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: s5-manual-run.mts <scratch dir>");

const database = await createTestDatabase("s5manual");
const admin = database.admin;
const { outletId } = await seedDemoFixture(drizzle(admin, { schema }));
await assignPayPalDestination(drizzle(admin, { schema }), outletId, FIXTURE_SELLER);
Object.assign(process.env, webEnvFor(database.webUrl));

const { POST: authPost } = await import("../../../../src/app/api/auth/[...all]/route");
const { POST: purchasesPost } = await import("../../../../src/app/api/v1/purchases/route");
const { completePayPal, startPayPal } = await import("../../../../src/domain/payments/attempts");
const { getAuth } = await import("../../../../src/lib/auth");
const { isPrincipal, requireBuyerSession } = await import("../../../../src/lib/auth-context");
const { webDb } = await import("../../../../src/lib/db/web");
const { systemNow } = await import("../../../../src/lib/time");

const [kopi] = await admin<{ id: string }[]>`select i.id from menu_items i order by i.position limit 1`;
async function review(): Promise<{ cookie: string; purchaseId: string }> {
  const cookie = await anonymousCookie(authPost);
  const created = await purchasesPost(jsonPost("/api/v1/purchases", cookie, { outletId, rail: "paypal", lines: [{ menuItemId: kopi!.id, quantity: 1 }] }));
  if (created.status !== 201) throw new Error(`review failed with ${created.status}`);
  return { cookie, purchaseId: ((await created.json()) as { data: { purchaseId: string } }).data.purchaseId };
}

const state = async (purchaseId: string) =>
  (await admin<{ purchase: string; attempt: string | null }[]>`
    select p.state as purchase, a.state as attempt from purchases p left join payment_attempts a on a.purchase_id = p.id where p.id = ${purchaseId}`)[0]!;

// 1. The S3 harness: approved, then the capture's answer lost after PayPal captured.
const fake = createFakePayPal();
const uncertain = await review();
const principal = await requireBuyerSession(getAuth(), new Headers({ cookie: uncertain.cookie }));
if (!isPrincipal(principal)) throw new Error("no buyer session");
const paypalDeps = { db: webDb(), paypal: fake.client, now: systemNow, appBaseUrl: TEST_BASE_URL };
await startPayPal(paypalDeps, principal, uncertain.purchaseId);
const orderId = fake.calls[0]!.orderId!;
fake.approve(orderId);
fake.fail("captureOrder", "lose_response");
await completePayPal(paypalDeps, principal, uncertain.purchaseId);

// 2. A review left open past T_REVIEW, and 3. a session past its expiry.
const expiredReview = await review();
await admin`update purchases set review_expires_at = now() - interval '1 minute' where id = ${expiredReview.purchaseId}`;
await anonymousCookie(authPost);
const [expiredSession] = await admin<{ id: string }[]>`
  update session set expires_at = now() - interval '1 minute' where id = (select id from session order by created_at desc limit 1) returning id`;

// PayPal's record of the order, as the Orders v2 API would return it, for the FIXTURE fetch.
const read = await fake.client.readOrder(orderId);
if (read.kind !== "ok") throw new Error("fake order unreadable");
const money = (cents: number | null) => ({ currency_code: "SGD", value: ((cents ?? 0) / 100).toFixed(2) });
const toRaw = (order: PayPalOrder) => ({
  id: order.id,
  status: order.status,
  purchase_units: [
    {
      payee: { merchant_id: order.payeeMerchantId },
      amount: money(order.amount?.cents ?? null),
      custom_id: order.customId,
      items: (order.items ?? []).map((item) => ({ name: item.name, quantity: item.quantity, unit_amount: money(item.unit?.cents ?? null) })),
      payments: { captures: order.captures.map((capture) => ({ id: capture.id, status: capture.status, amount: money(capture.amount?.cents ?? null) })) },
    },
  ],
  links: [],
});
const ordersFile = join(scratch, "s5-fixture-orders.json");
const callsFile = join(scratch, "s5-fixture-calls.log");
writeFileSync(ordersFile, JSON.stringify({ [orderId]: toRaw(read.value) }));
writeFileSync(callsFile, "");

console.log("[FIXTURE] before the runs, no buyer page open:");
console.log(`  uncertain capture ${uncertain.purchaseId}: ${JSON.stringify(await state(uncertain.purchaseId))} (order ${orderId})`);
console.log(`  expired review ${expiredReview.purchaseId}: ${JSON.stringify(await state(expiredReview.purchaseId))}`);
console.log(`  expired session ${expiredSession!.id}: present`);
console.log(`  fake PayPal captures sent by the buyer flow: ${fake.captures().length}`);

// The buyer's completion read the order just now; wait out T_PROVIDER_READ_DEBOUNCE (30 s), as an
// hourly run would have.
await new Promise((done) => setTimeout(done, 31_000));

for (const label of ["manual run 1", "manual run 2"]) {
  const started = Date.now();
  const child = spawnSync(
    process.execPath,
    ["--import", join(ROOT, "docs/plans/envoi/evidence/s5-fixture-paypal.mjs"), "--import", join(ROOT, ".maintenance-build/src/maintenance/resolve-hook.js"), join(ROOT, ".maintenance-build/src/maintenance/run.js")],
    {
      cwd: scratch,
      encoding: "utf8",
      timeout: 130_000,
      env: {
        PATH: process.env.PATH ?? "",
        MAINTENANCE_DATABASE_URL: database.maintenanceUrl,
        ENVOI_ENVIRONMENT: "local",
        LOG_LEVEL: "info",
        PAYPAL_CLIENT_ID: "FIXTURE-client-id",
        PAYPAL_CLIENT_SECRET: "FIXTURE-client-secret",
        PAYPAL_PARTNER_ATTRIBUTION_ID: "FIXTURE-attribution",
        ENVOI_FIXTURE_PAYPAL_ORDERS: ordersFile,
        ENVOI_FIXTURE_PAYPAL_CALLS: callsFile,
      },
    },
  );
  const [run] = await admin<{ id: string; trigger: string; status: string; started_at: string; finished_at: string; database_size_bytes: number; report: unknown }[]>`
    select id, trigger, status, to_json(started_at) #>> '{}' as started_at, to_json(finished_at) #>> '{}' as finished_at, database_size_bytes::int, report from maintenance_runs order by started_at desc limit 1`;
  console.log(`\n[${label}] compiled runner exited ${child.status} after ${Date.now() - started} ms`);
  for (const line of `${child.stdout}${child.stderr}`.trim().split("\n")) console.log(`  log: ${line}`);
  console.log(`  maintenance_runs: ${run!.id} trigger=${run!.trigger} status=${run!.status} heartbeat(started_at)=${run!.started_at} finished_at=${run!.finished_at} pg_database_size=${run!.database_size_bytes} bytes`);
  console.log(`  report: ${JSON.stringify(run!.report)}`);
  console.log(`  uncertain capture now: ${JSON.stringify(await state(uncertain.purchaseId))}; expired review now: ${JSON.stringify(await state(expiredReview.purchaseId))}`);
  console.log(`  expired session present: ${(await admin`select id from session where id = ${expiredSession!.id}`).length === 1}`);
  const [connections] = await admin<{ count: number }[]>`select count(*)::int as count from pg_stat_activity where application_name = 'envoi-maintenance' and datname = current_database()`;
  console.log(`  runner connections left open: ${connections!.count}`);
}
console.log(`\n[FIXTURE] PayPal calls the runner made:\n  ${readFileSync(callsFile, "utf8").trim().split("\n").join("\n  ")}`);
const [audit] = await admin<{ actor: string; action: string }[]>`select actor, action from audit_events where purchase_id = ${uncertain.purchaseId} and action = 'paypal_capture_confirmed'`;
console.log(`audit: ${JSON.stringify(audit)}`);
console.log(`database kept for the screen check: ${database.name}`);
process.exit(0);
