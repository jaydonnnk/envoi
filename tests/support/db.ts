import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { loadLocalEnvFile, testEnv } from "@/env";
import { runMigrations } from "@/lib/db/migrate";

// Each test file gets its own disposable database on the local PostgreSQL (or the CI service
// container), migrated with the real schema and constraints. Never Neon.

export type TestDatabase = {
  name: string;
  adminUrl: string; // superuser, for setup and assertions
  webUrl: string; // envoi_web, the role the app runs as
  admin: postgres.Sql;
  drop: () => Promise<void>;
};

function withDatabase(url: string, database: string, user?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) {
    parsed.username = user;
    parsed.password = "";
  }
  return parsed.toString();
}

export async function createTestDatabase(label: string, options: { migrate?: boolean } = {}): Promise<TestDatabase> {
  if (!process.env.TEST_DATABASE_URL) loadLocalEnvFile();
  const baseUrl = testEnv().TEST_DATABASE_URL;
  const name = `envoi_t_${label}_${randomBytes(4).toString("hex")}`;

  const root = postgres(baseUrl, { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`CREATE DATABASE "${name}"`);
    // The web role is cluster-wide; it is created out of band on Neon and here for tests.
    await root.unsafe(
      `DO $$ BEGIN CREATE ROLE envoi_web LOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`,
    );
  } finally {
    await root.end({ timeout: 5 });
  }

  const adminUrl = withDatabase(baseUrl, name);
  if (options.migrate !== false) await runMigrations(adminUrl);
  const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });

  return {
    name,
    adminUrl,
    webUrl: withDatabase(baseUrl, name, "envoi_web"),
    admin,
    drop: async () => {
      await admin.end({ timeout: 5 });
      const cleanup = postgres(baseUrl, { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    },
  };
}
