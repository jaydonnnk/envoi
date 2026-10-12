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
});

const migrationSchema = z.object({ MIGRATION_DATABASE_URL: postgresUrl });
const testSchema = z.object({ TEST_DATABASE_URL: postgresUrl });

export type WebEnv = z.infer<typeof webSchema>;
export type MigrationEnv = z.infer<typeof migrationSchema>;
export type TestEnv = z.infer<typeof testSchema>;

// Every name this module reads. .env.example must list exactly these.
export const ENV_NAMES = [
  ...Object.keys(webSchema.shape),
  ...Object.keys(migrationSchema.shape),
  ...Object.keys(testSchema.shape),
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
  if (source !== process.env) return parse(webSchema, source, "web");
  webCache ??= parse(webSchema, source, "web");
  return webCache;
}

export function migrationEnv(source: NodeJS.ProcessEnv = process.env): MigrationEnv {
  return parse(migrationSchema, source, "migration");
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
