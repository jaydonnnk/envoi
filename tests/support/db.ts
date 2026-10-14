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
  maintenanceUrl: string; // envoi_maintenance, the role the maintenance runner uses
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
    // The web and maintenance roles are cluster-wide; they are created out of band on Neon and here
    // for tests.
    for (const role of ["envoi_web", "envoi_maintenance"]) {
      await root.unsafe(`DO $$ BEGIN CREATE ROLE ${role} LOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`);
    }
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
    maintenanceUrl: withDatabase(baseUrl, name, "envoi_maintenance"),
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

// FIXTURE: a hand edit of a published menu, which no role may make since S7 (migration 0017 makes a
// published revision and its items immutable; in the product only republication changes a menu).
// Older tests use it to put the published fixture menu into a state they then check, so it runs as
// the superuser with triggers off for this one transaction only.
export async function handEditPublishedMenu(admin: postgres.Sql, edit: (sql: postgres.TransactionSql) => Promise<unknown>): Promise<void> {
  await admin.begin(async (sql) => {
    await sql`set local session_replication_role = replica`;
    await edit(sql);
  });
}
