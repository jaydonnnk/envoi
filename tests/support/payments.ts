import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { assignPayPalDestination, seedDemoFixture } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "./db";
import { TEST_BASE_URL, webEnvFor } from "./session";

// FIXTURE: a sandbox-style seller id for the demo fixture outlet, in PayPal's id alphabet. Not a
// real account.
export const FIXTURE_SELLER = "FXTRSELLER2AB";

export type PaymentsFixture = {
  database: TestDatabase;
  outletId: string;
  items: { id: string; name: string; unitSgdCents: number }[];
};

// A migrated disposable database holding the seeded demo fixture with a PayPal destination, and
// the web environment pointed at it as envoi_web.
export async function createPaymentsFixture(label: string, env: Record<string, string> = {}): Promise<PaymentsFixture> {
  const database = await createTestDatabase(label);
  const db = drizzle(database.admin, { schema });
  const { outletId } = await seedDemoFixture(db);
  await assignPayPalDestination(db, outletId, FIXTURE_SELLER);
  const items = await database.admin<{ id: string; name: string; unitSgdCents: number }[]>`
    select i.id, i.name, i.unit_sgd_cents as "unitSgdCents" from menu_items i order by i.position`;
  Object.assign(process.env, webEnvFor(database.webUrl), env);
  return { database, outletId, items: [...items] };
}

export function jsonPost(path: string, cookie: string, body: unknown = {}): Request {
  return new Request(`${TEST_BASE_URL}${path}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: TEST_BASE_URL },
    body: JSON.stringify(body),
  });
}

export const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
