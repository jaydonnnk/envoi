import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { pgConnection } from "@/lib/db/web";
import { redact } from "@/lib/log";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle", import.meta.url));

// Direct (unpooled) connection with the migration role. search_path is fixed for this session so
// unqualified DDL can only land in public.
export async function runMigrations(url: string): Promise<void> {
  const connection = pgConnection(url);
  const client = postgres(connection.url, { ssl: connection.ssl, max: 1, onnotice: () => {}, connection: { search_path: "public" } });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "public",
      migrationsTable: "__drizzle_migrations",
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadLocalEnvFile();
  runMigrations(migrationEnv().MIGRATION_DATABASE_URL)
    .then(() => console.log("migrations applied"))
    .catch((err: unknown) => {
      console.error("migration failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    });
}
