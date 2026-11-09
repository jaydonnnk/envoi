// S14 review fix 4: runs the public API contract check over real HTTP,
// against the production build in .next, so the framework layer (routing, next.config headers,
// decoding of the path) is checked too, not only the route handlers the integration test calls.
// It creates a disposable, migrated local database holding the seeded demo FIXTURE shop, starts
// `next start` against it with fixture settings (payments and PYUSD off), runs the contract script and MCP client, then
// stops the server and drops the database. CI runs it after `npm run build`.
//
//   npm run build && npx tsx tests/e2e/run-public-api.ts [port]
//
// Every configuration name src/env.ts reads is set here, so neither Next.js nor src/env.ts can fill
// one from a local .env.local; the run refuses to start if a name is left unset.
import assert from "node:assert/strict";
import { connectEnvoi } from "@/integrations/assistant/envoi-mcp";
import { spawn, type ChildProcess } from "node:child_process";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ENV_NAMES } from "@/env";
import * as schema from "@/lib/db/schema";
import { assignPayPalDestination, issueAgentToken, seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../support/db";
import { FIXTURE_SELLER } from "../support/payments";
import { webEnvFor } from "../support/session";

const port = Number(process.argv[2] ?? "3100");
const baseUrl = `http://localhost:${port}`;

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    spawn(command, args, { env, stdio: "inherit" }).on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitFor(url: string, server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer within 60 seconds`);
}

const database = await createTestDatabase("e2ehttp");
let server: ChildProcess | undefined;
let code = 1;
try {
  const seedClient = postgres(database.adminUrl, { max: 1, onnotice: () => {} });
  let agentToken: string;
  let outletId: string;
  try {
    const db = drizzle(seedClient, { schema });
    const seeded = await seedDemoFixture(db);
    console.log(`FIXTURE seed: ${JSON.stringify(seeded)}`);
    await assignPayPalDestination(db, seeded.outletId, FIXTURE_SELLER);
    outletId = seeded.outletId;
    agentToken = (await issueAgentToken(db, "FIXTURE MCP e2e agent")).token;
  } finally {
    await seedClient.end({ timeout: 5 });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...webEnvFor(database.webUrl),
    BETTER_AUTH_URL: baseUrl,
    APP_BASE_URL: baseUrl,
    PAYMENTS_ENABLED: "false",
    PYUSD_ENABLED: "false",
    MENU_IMPORTS_ENABLED: "false",
    WEB_IMPORTS_ENABLED: "false",
    // Fixture values: no route this run calls reaches OpenAI, Kernel or Solana.
    OPENAI_API_KEY: "fixture-unused",
    AI_MODEL: "fixture-unused",
    AI_MENU_MODEL: "fixture-unused",
    AI_WEB_MENU_MODEL: "fixture-unused",
    AI_MENU_TRANSLATION_MODEL: "fixture-unused",
    KERNEL_API_KEY: "fixture-unused",
    // S25: no route this run calls is the assistant's, so its agent token is a placeholder too.
    ASSISTANT_AGENT_TOKEN: "fixture-unused",
    // S45: no route this run calls is the copilot's, and no seller in this run is the demo seller.
    PAYPAL_DEMO_SELLER_CLIENT_ID: "fixture-unused",
    PAYPAL_DEMO_SELLER_CLIENT_SECRET: "fixture-unused",
    PAYPAL_DEMO_SELLER_MERCHANT_ID: "FXTRUNUSED0AA",
    // S48: no route this run calls scans a sticker, so the key is a fixture value.
    STICKER_HASH_KEY: "fixture-unused-sticker-hash-key-0000000000",
    // S50: no route this run calls publishes, so no Workflow run is started; fixture values keep a
    // real Render key in .env.local away from this server.
    RENDER_API_KEY: "fixture-unused",
    RENDER_WORKFLOW_SLUG: "fixture-unused",
    // S43: this run signs no one up, so merchant sign-up stays off as before S43.
    MERCHANT_SIGNUP_ENABLED: "false",
    // S38: no seller in this run is on the allowlist, so crypto stays off.
    PAYPAL_CRYPTO_ENABLED: "FIXTURE-UNLISTED-SELLER",
    SOLANA_RPC_URL: "http://127.0.0.1:9/fixture-unused",
    // The disposable database only, so no local .env.local can supply a real one.
    MIGRATION_DATABASE_URL: database.adminUrl,
    MAINTENANCE_DATABASE_URL: database.maintenanceUrl,
    TEST_DATABASE_URL: database.adminUrl,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const unset = ENV_NAMES.filter((name) => !env[name]);
  if (unset.length > 0) throw new Error(`unset configuration names: ${unset.join(", ")}`);

  server = spawn("node_modules/.bin/next", ["start", "-p", String(port)], { env, stdio: ["ignore", "inherit", "inherit"] });
  await waitFor(`${baseUrl}/api/v1/outlets`, server);

  const contract = await run("node_modules/.bin/tsx", ["tests/e2e/public-api-contract.ts", baseUrl, "nul"], env);
  assert.equal(contract, 0);
  const client = await connectEnvoi(baseUrl, agentToken);
  try {
    const signal = AbortSignal.timeout(10_000);
    const shops = await client.callEnvoi("search_outlets", {}, signal);
    assert.equal(shops.ok, true);
    if (!shops.ok) throw new Error("FIXTURE registry read failed");
    assert.ok(shops.value.outlets.some((outlet) => outlet.id === outletId && outlet.currency === "SGD"));
    const menu = await client.callEnvoi("get_menu", { outletId }, signal);
    assert.equal(menu.ok, true);
    if (!menu.ok) throw new Error("FIXTURE menu read failed");
    const item = menu.value.items.find((item) => item.available && item.unitMinor !== null);
    assert.ok(item);
    const link = await client.callEnvoi("create_purchase_request", { outletId, lines: [{ menuItemId: item.id, quantity: 1 }] }, signal);
    assert.equal(link.ok, true);
    if (!link.ok) throw new Error("FIXTURE proposal failed");
    assert.equal(new URL(link.value.url).origin, baseUrl);
    assert.ok(new URL(link.value.url).pathname.startsWith("/approve/"));
    assert.equal(link.status, 200);
  } finally {
    await client.close();
  }
  console.log("Public API contract and MCP client over real HTTP: PASS (local FIXTURE only)");
  code = 0;
} finally {
  server?.kill("SIGTERM");
  if (server && server.exitCode === null) await new Promise((resolve) => server!.once("exit", resolve));
  await database.drop();
}
process.exit(code);
