// S35 local browser check, FIXTURE only: a disposable local database holding labeled FIXTURE orders in
// each payment state, `next dev`, and a fake OpenAI server, so no real model is called. It stops with
// SIGTERM, which ends the server and drops the database. The generated merchant password goes only to
// the file named by S35_PREVIEW_LOGIN, outside the repository.
//
//   TEST_DATABASE_URL=... S35_PREVIEW_LOGIN=/path/outside/repo npx tsx docs/plans/envoi/evidence/s35-local-preview.mts
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { createMerchant, seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../../../../tests/support/db";
import { webEnvFor } from "../../../../tests/support/session";

const PORT = 3135;
const MODEL_PORT = 3136;
const database = await createTestDatabase("s35preview");
const admin = postgres(database.adminUrl, { max: 1, onnotice: () => {} });
const db = drizzle(admin, { schema });
const { outletId } = await seedDemoFixture(db);

const email = `s35-preview-${randomBytes(3).toString("hex")}@merchant.example.test`;
const password = randomBytes(18).toString("base64url");
const { userId } = await createMerchant(db, { email, name: "FIXTURE S35 merchant", password });
await admin`insert into merchant_memberships (id, user_id, outlet_id, role, is_demo, evidence_ref, approved_at) values (${`mbr_s35${randomBytes(4).toString("hex")}`}, ${userId}, ${outletId}, 'owner', true, 'FIXTURE: S35 preview', now())`;
writeFileSync(process.env.S35_PREVIEW_LOGIN!, JSON.stringify({ email, password }), { mode: 0o600 });

const [revision] = await admin<{ id: string }[]>`select published_menu_revision_id as id from outlets where id = ${outletId}`;
const DAY = 86_400_000;
const rows: { name: string; quantity: number; total: number; state: string; rail: string; attempt: string; daysAgo: number; acknowledged?: boolean }[] = [
  { name: "FIXTURE Kopi C", quantity: 1, total: 180, state: "paid", rail: "paypal", attempt: "capture_confirmed", daysAgo: 0 },
  { name: "FIXTURE Iced lemon tea", quantity: 2, total: 440, state: "paid", rail: "paypal", attempt: "capture_confirmed", daysAgo: 2, acknowledged: true },
  { name: "FIXTURE Teh tarik", quantity: 1, total: 220, state: "pending_payment", rail: "paypal", attempt: "order_created", daysAgo: 0 },
  { name: "FIXTURE Kaya toast", quantity: 3, total: 750, state: "pending_payment", rail: "paypal", attempt: "capture_unknown", daysAgo: 0 },
  { name: "FIXTURE Soft-boiled eggs", quantity: 1, total: 200, state: "uncertain", rail: "paypal", attempt: "capture_unknown", daysAgo: 1 },
  { name: "FIXTURE Milo", quantity: 2, total: 500, state: "unpaid_closed", rail: "paypal", attempt: "abandoned", daysAgo: 3 },
  { name: "FIXTURE Old kopi", quantity: 1, total: 180, state: "paid", rail: "paypal", attempt: "capture_confirmed", daysAgo: 12 },
];
await admin.begin(async (sql) => {
  await sql`set local session_replication_role = replica`;
  for (const [index, row] of rows.entries()) {
    const purchaseId = `pur_s35preview${index}`;
    const at = new Date(Date.now() - row.daysAgo * DAY - index * 60_000).toISOString();
    const paid = row.state === "paid";
    await sql`insert into purchases (id, buyer_user_id, outlet_id, menu_revision_id, state, entry_point, lines, total_minor, currency, review_expires_at, created_at, rail, acknowledged_at, acknowledged_by_user_id)
      values (${purchaseId}, ${userId}, ${outletId}, ${revision!.id}, ${row.state}, 'fixture_tracer', ${JSON.stringify([{ menuItemId: `FIXTURE-item-${index}`, itemKey: `FIXTURE-${index}`, name: row.name, quantity: row.quantity, unitMinor: row.total / row.quantity, lineMinor: row.total }])}::jsonb, ${row.total}, 'SGD', ${new Date(Date.now() + DAY).toISOString()}::timestamptz, ${at}::timestamptz, ${row.rail}, ${row.acknowledged ? at : null}::timestamptz, ${row.acknowledged ? userId : null})`;
    await sql`insert into payment_attempts (id, purchase_id, rail, state, payee_merchant_id, total_minor, currency, create_request_id, order_id, capture_request_id, capture_id, capture_gross_minor, capture_verified_at, created_at, updated_at)
      values (${`att_s35preview${index}`}, ${purchaseId}, ${row.rail}, ${row.attempt}, 'FIXTURE-SELLER', ${row.total}, 'SGD', ${`FIXTURE-create-${index}`}, ${`FIXTURE-order-${index}`}, ${row.attempt.startsWith("capture") ? `FIXTURE-capreq-${index}` : null}, ${paid ? `FIXTURE-capture-${index}` : null}, ${paid ? row.total : null}, ${paid ? at : null}::timestamptz, ${at}::timestamptz, now())`;
  }
});

// FIXTURE: a fake OpenAI Responses API. It reads a few words of the sentence; it is not the model.
const iso = (at: number) => new Date(at + 8 * 3_600_000).toISOString().slice(0, 10);
function fixtureFilter(sentence: string): Record<string, unknown> {
  const text = sentence.toLowerCase();
  const answer: Record<string, unknown> = { states: null, rails: null, currencies: null, from: null, to: null };
  if (/\bpaid\b/.test(text) && !/not paid|unpaid/.test(text)) answer.states = ["paid"];
  if (/pending|not paid|checking/.test(text)) answer.states = ["pending_payment", "uncertain"];
  if (/paypal/.test(text)) answer.rails = ["paypal"];
  if (/this week/.test(text)) {
    answer.from = iso(Date.now() - 6 * DAY);
    answer.to = iso(Date.now());
  }
  return answer;
}
const model = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    const sentence = /<sentence>\\n(.*?)\\n<\/sentence>/.exec(body)?.[1] ?? "";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "FIXTURE-resp",
      object: "response",
      created_at: 1_790_000_000,
      model: "FIXTURE-model",
      status: "completed",
      output: [{ type: "message", id: "FIXTURE-msg", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(fixtureFilter(sentence)), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
      incomplete_details: null,
    }));
  });
});
model.listen(MODEL_PORT, "127.0.0.1");

const base = `http://localhost:${PORT}`;
const server = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  stdio: "inherit",
  env: { ...process.env, ...webEnvFor(database.webUrl), BETTER_AUTH_URL: base, APP_BASE_URL: base, OPENAI_API_KEY: "fixture-openai-key", AI_MODEL: "FIXTURE-model", OPENAI_BASE_URL: `http://127.0.0.1:${MODEL_PORT}/v1` } as NodeJS.ProcessEnv,
  detached: true,
});

async function stop() {
  if (server.pid) process.kill(-server.pid, "SIGTERM");
  model.close();
  await admin.end({ timeout: 5 });
  await database.drop();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
