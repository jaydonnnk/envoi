// S14 review fix 4: runs the public API contract check and the generated client over real HTTP,
// against the production build in .next, so the framework layer (routing, next.config headers,
// decoding of the path) is checked too, not only the route handlers the integration test calls.
// It creates a disposable, migrated local database holding the seeded demo FIXTURE shop, starts
// `next start` against it with fixture settings (payments and PYUSD off), runs both scripts, then
// stops the server and drops the database. CI runs it after `npm run build`.
//
//   npm run build && npx tsx tests/e2e/run-public-api.ts [port]
//
// Every configuration name src/env.ts reads is set here, so neither Next.js nor src/env.ts can fill
// one from a local .env.local; the run refuses to start if a name is left unset.
import { spawn, type ChildProcess } from "node:child_process";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ENV_NAMES } from "@/env";
import * as schema from "@/lib/db/schema";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase } from "../support/db";
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
  try {
    console.log(`FIXTURE seed: ${JSON.stringify(await seedDemoFixture(drizzle(seedClient, { schema })))}`);
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
    // Fixture values: no route this run calls reaches OpenAI or Solana.
    OPENAI_API_KEY: "fixture-unused",
    AI_MODEL: "fixture-unused",
    AI_MENU_MODEL: "fixture-unused",
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
  const client = await run("node_modules/.bin/tsx", ["tests/e2e/apimatic-client.ts", baseUrl], env);
  console.log(`contract check exit ${contract}, generated client exit ${client}`);
  code = contract === 0 && client === 0 ? 0 : 1;
} finally {
  server?.kill("SIGTERM");
  if (server && server.exitCode === null) await new Promise((resolve) => server!.once("exit", resolve));
  await database.drop();
}
process.exit(code);
