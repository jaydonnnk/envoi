import { and, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { recordAudit } from "@/domain/audit/events";
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

// PayPal account ids: 13 characters from 2-9 and A-Z without I and O (PayPal rejects any other
// payee merchant_id with INVALID_PARAMETER_SYNTAX).
const PAYPAL_MERCHANT_ID = /^[2-9A-HJ-NP-Z]{13}$/;

export type AssignResult = { status: "created" | "unchanged"; outletId: string; destinationId: string; sellerMerchantId: string; version: number };

// Writes a PayPal sandbox destination only for an outlet that has none (D1). Run again, for the
// same or another seller, it changes nothing and reports the existing destination, so no operator
// act gives a basket a second checkout key. The seller is a distinct sandbox account, never
// Envoi's own API caller account.
export async function assignPayPalDestination(db: OperatorDb, outletId: string, sellerMerchantId: string, now: Date = new Date()): Promise<AssignResult> {
  if (!PAYPAL_MERCHANT_ID.test(sellerMerchantId)) throw new Error("The seller id must be a PayPal sandbox account id: 13 characters, 2-9 and A-Z without I or O.");
  return db.transaction(async (tx) => {
    const [outlet] = await tx.select({ id: schema.outlets.id }).from(schema.outlets).where(eq(schema.outlets.id, outletId));
    if (!outlet) throw new Error(`No outlet ${outletId}.`);
    const destinationId = newId("dst");
    const inserted = await tx
      .insert(schema.paymentDestinations)
      .values({ id: destinationId, outletId, rail: "paypal", environment: "sandbox", sellerMerchantId, status: "active", version: 1, createdAt: now })
      .onConflictDoNothing({ target: [schema.paymentDestinations.outletId, schema.paymentDestinations.rail] })
      .returning({ id: schema.paymentDestinations.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select()
        .from(schema.paymentDestinations)
        .where(and(eq(schema.paymentDestinations.outletId, outletId), eq(schema.paymentDestinations.rail, "paypal")));
      if (!existing) throw new Error("Destination conflict without a destination; inspect it by hand.");
      return { status: "unchanged", outletId, destinationId: existing.id, sellerMerchantId: existing.sellerMerchantId, version: existing.version };
    }
    await recordAudit(tx, {
      at: now,
      actor: "operator",
      action: "paypal_destination_assigned",
      outletId,
      operatorVisible: true,
      details: { destinationId, sellerMerchantId, environment: "sandbox" },
    });
    return { status: "created", outletId, destinationId, sellerMerchantId, version: 1 };
  });
}

const USAGE = "usage: npm run operator -- seed-demo-fixture | assign-paypal-destination <outletId> <sellerMerchantId>";

async function run(db: OperatorDb, argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === "seed-demo-fixture" && args.length === 0) {
    const result = await seedDemoFixture(db);
    console.log(
      result.status === "created"
        ? `created demo fixture: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`
        : `demo fixture already exists, nothing changed: outlet ${result.outletId}, menu revision ${result.menuRevisionId}`,
    );
    return 0;
  }
  if (command === "assign-paypal-destination" && args.length === 2) {
    const result = await assignPayPalDestination(db, args[0]!, args[1]!);
    console.log(
      result.status === "created"
        ? `assigned PayPal sandbox destination ${result.destinationId} (seller ${result.sellerMerchantId}, version ${result.version}) to outlet ${result.outletId}`
        : `outlet ${result.outletId} already has PayPal destination ${result.destinationId} (seller ${result.sellerMerchantId}, version ${result.version}); nothing changed`,
    );
    return 0;
  }
  console.error(USAGE);
  return 2;
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] !== "seed-demo-fixture" && argv[0] !== "assign-paypal-destination") {
    console.error(USAGE);
    return 2;
  }
  loadLocalEnvFile();
  const connection = pgConnection(migrationEnv().MIGRATION_DATABASE_URL);
  const client = postgres(connection.url, { ssl: connection.ssl, max: 1, onnotice: () => {}, connection: { search_path: "public" } });
  try {
    return await run(drizzle(client, { schema }), argv);
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
