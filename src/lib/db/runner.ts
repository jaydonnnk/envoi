import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./web";
import { pgConnection } from "./web";
import * as schema from "./schema";

// Direct (unpooled) connection as envoi_maintenance for the maintenance runner (S5). Leases use
// row-level UPDATE ... RETURNING, so nothing relies on session state; the connection is still
// direct, as Gate 3 places maintenance off the transaction pooler. The application name lets an
// operator, and the finite-run test, see whether a runner still holds a connection.
export const RUNNER_APPLICATION_NAME = "envoi-maintenance";

export function connectRunner(url: string): { db: Db; close: () => Promise<void> } {
  const connection = pgConnection(url);
  const client = postgres(connection.url, {
    ssl: connection.ssl,
    max: 2,
    idle_timeout: 5,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { application_name: RUNNER_APPLICATION_NAME },
  });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
