import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import * as schema from "@/lib/db/schema";
import { pgConnection } from "@/lib/db/web";
import { newId } from "@/lib/ids";
import { redact } from "@/lib/log";

// Operator acts (Gate 4 delta D1), run locally by the human operator with MIGRATION_DATABASE_URL.
// No HTTP route reaches this file.

type OperatorDb = PostgresJsDatabase<typeof schema>;

export const DEMO_FIXTURE_KEY = "demo-fixture-1";

// Fictional branding (product rule 9). Every price is known, so the tracer basket can be priced.
export const DEMO_FIXTURE = {
  name: "Lorong Demo Kopi",
  area: "Tanjong Pagar",
  items: [
    { name: "Kopi O", unitSgdCents: 160 },
    { name: "Kaya toast set", unitSgdCents: 450 },
    { name: "Teh C peng", unitSgdCents: 220 },
    { name: "Soft-boiled eggs (2)", unitSgdCents: 200 },
  ],
} as const;

export type SeedResult = { status: "created" | "unchanged"; outletId: string; menuRevisionId: string };

// Creates the fixture only when it is absent. Run again, it changes nothing and reports the
// existing ids, so no operator act ever gives a basket a second checkout key.
export async function seedDemoFixture(db: OperatorDb, now: Date = new Date()): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const outletId = newId("out");
    const inserted = await tx
      .insert(schema.outlets)
      .values({ id: outletId, name: DEMO_FIXTURE.name, area: DEMO_FIXTURE.area, isDemoFixture: true, fixtureKey: DEMO_FIXTURE_KEY, createdAt: now })
      .onConflictDoNothing({ target: schema.outlets.fixtureKey })
      .returning({ id: schema.outlets.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: schema.outlets.id, menuRevisionId: schema.outlets.publishedMenuRevisionId })
        .from(schema.outlets)
        .where(eq(schema.outlets.fixtureKey, DEMO_FIXTURE_KEY));
      if (!existing?.menuRevisionId) throw new Error("The demo fixture exists without a published menu; inspect it by hand.");
      return { status: "unchanged", outletId: existing.id, menuRevisionId: existing.menuRevisionId };
    }

    const menuRevisionId = newId("mrv");
    await tx.insert(schema.menuRevisions).values({ id: menuRevisionId, outletId, status: "confirmed", confirmedAt: now, createdAt: now });
    await tx.insert(schema.menuItems).values(
      DEMO_FIXTURE.items.map((item, position) => ({
        id: newId("itm"),
        menuRevisionId,
        position,
        name: item.name,
        unitSgdCents: item.unitSgdCents,
        available: true,
      })),
    );
    await tx.update(schema.outlets).set({ publishedMenuRevisionId: menuRevisionId }).where(eq(schema.outlets.id, outletId));
    return { status: "created", outletId, menuRevisionId };
  });
}

const COMMANDS = ["seed-demo-fixture"] as const;

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command !== "seed-demo-fixture") {
    console.error(`usage: npm run operator -- <${COMMANDS.join("|")}>`);
    return 2;
  }
  loadLocalEnvFile();
  const connection = pgConnection(migrationEnv().MIGRATION_DATABASE_URL);
  const client = postgres(connection.url, { ssl: connection.ssl, max: 1, onnotice: () => {}, connection: { search_path: "public" } });
  try {
    const result = await seedDemoFixture(drizzle(client, { schema }));
    console.log(
      result.status === "created"
        ? `created demo fixture: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`
        : `demo fixture already exists, nothing changed: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`,
    );
    return 0;
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error("operator command failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    });
}
