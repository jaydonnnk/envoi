import { z } from "zod";

// Single parsed view of process.env. Other modules read configuration only through here.
// Names only ever appear in .env.example; values live in the ignored .env.local and in Render.

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

// Test money only: any value other than these refuses to boot.
const environment = z.enum(["local", "sandbox"]);

const webSchema = z.object({
  DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  APP_BASE_URL: z.url(),
  ENVOI_ENVIRONMENT: environment,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  // Sandbox REST app credentials. The API host is a reviewed code constant, never configuration.
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_PARTNER_ATTRIBUTION_ID: z.string().min(1),
  // The sandbox app's webhook registration; every delivery is verified against it (S3).
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  // Kill switch for new PayPal starts and captures (D10). Must be stated explicitly; reads,
  // reconcile, webhooks and maintenance never check it.
  PAYMENTS_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true"),
  // Buyer text suggestions (S4). Both unset turns text entry off and leaves manual selection only;
  // AI_MODEL is the model chosen by the pre-registered R5 evaluation recorded in 00-status.md.
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  // Menu photo import (S11). AI_MENU_MODEL is the vision model chosen by the pre-registered R5
  // evaluation in 00-status.md, never AI_MODEL; it also needs a reviewed bounds entry in
  // MENU_SPEND_POLICY. MENU_IMPORTS_ENABLED is the import kill switch: unset reads as false, so
  // imports stay closed until it is stated "true".
  AI_MENU_MODEL: z.string().min(1).optional(),
  MENU_IMPORTS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  // PYUSD on Solana devnet (S16). These are the rail's only two settings: the cluster, genesis hash,
  // mint, token program and decimals are reviewed code constants in src/domain/pyusd/constants.ts,
  // and any other PYUSD_ or SOLANA_ name refuses to boot. The RPC URL is checked against the pinned
  // devnet identity before every use, so a mainnet URL only makes PYUSD unavailable. PYUSD_ENABLED
  // unset reads as false, and it guards new PYUSD actions only, never recovery reads.
  SOLANA_RPC_URL: z.url().optional(),
  PYUSD_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

// The PYUSD rail is configured by exactly the names in webSchema; a mint, cluster or program override
// stated in the environment is refused rather than ignored, so nobody believes it took effect.
const RAIL_NAME = /^(PYUSD|SOLANA)_/;
const webShape = new Set(Object.keys(webSchema.shape));

function refuseUnknownRailNames(source: NodeJS.ProcessEnv): void {
  const unknown = Object.keys(source).filter((name) => RAIL_NAME.test(name) && !webShape.has(name) && source[name] !== undefined);
  if (unknown.length > 0) throw new Error(`Invalid web configuration: ${unknown.map((name) => `${name}: not a setting; the PYUSD rail reads only SOLANA_RPC_URL and PYUSD_ENABLED`).join("; ")}`);
}

const migrationSchema = z.object({ MIGRATION_DATABASE_URL: postgresUrl });

// The maintenance runner (S5): its own direct connection as envoi_maintenance, and the PayPal
// sandbox credentials for order reads only, and since S17 the devnet RPC URL for chain reads only. It
// never reads the web database URL, the auth secret, the payments kill switch or PYUSD_ENABLED, which
// maintenance does not check.
const maintenanceSchema = z.object({
  MAINTENANCE_DATABASE_URL: postgresUrl,
  ENVOI_ENVIRONMENT: environment,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_PARTNER_ATTRIBUTION_ID: z.string().min(1),
  // S17: devnet reads for reconcile_pyusd_attempts through the read-only client; unset, that task
  // claims nothing.
  SOLANA_RPC_URL: z.url().optional(),
});
const testSchema = z.object({ TEST_DATABASE_URL: postgresUrl });

export type WebEnv = z.infer<typeof webSchema>;
export type MigrationEnv = z.infer<typeof migrationSchema>;
export type MaintenanceEnv = z.infer<typeof maintenanceSchema>;
export type TestEnv = z.infer<typeof testSchema>;

// Every name this module reads, once each: the maintenance runner shares some with the web app.
// .env.example must list exactly these.
export const ENV_NAMES = [
  ...new Set([
    ...Object.keys(webSchema.shape),
    ...Object.keys(migrationSchema.shape),
    ...Object.keys(maintenanceSchema.shape),
    ...Object.keys(testSchema.shape),
  ]),
] as const;

function parse<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv, scope: string): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report names and reasons only, never values.
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid ${scope} configuration: ${problems.join("; ")}`);
  }
  return result.data;
}

let webCache: WebEnv | undefined;

export function webEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (source !== process.env) {
    refuseUnknownRailNames(source);
    return parse(webSchema, source, "web");
  }
  if (!webCache) {
    refuseUnknownRailNames(source);
    webCache = parse(webSchema, source, "web");
  }
  return webCache;
}

export function migrationEnv(source: NodeJS.ProcessEnv = process.env): MigrationEnv {
  return parse(migrationSchema, source, "migration");
}

export function maintenanceEnv(source: NodeJS.ProcessEnv = process.env): MaintenanceEnv {
  return parse(maintenanceSchema, source, "maintenance");
}

export function testEnv(source: NodeJS.ProcessEnv = process.env): TestEnv {
  return parse(testSchema, source, "test");
}

// Command-line entrypoints are not started by Next.js, so they load .env.local themselves.
export function loadLocalEnvFile(path = ".env.local"): void {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
