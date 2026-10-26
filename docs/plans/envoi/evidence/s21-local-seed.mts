// S21 local run seed. Creates a disposable local database named envoi_s21_local, migrates it with the
// real schema, seeds the demo FIXTURE shop and one FIXTURE "Test Shop" shaped like the live Test Shop
// the user described on 2026-10-26 plus the two iced teas of the approved mockup, and assigns the
// FIXTURE PayPal sandbox seller to both. Prints the database name and the two roles' URLs, which hold
// no password because the local cluster uses trust authentication. Nothing here reaches Neon.
// Run from the repository root:
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
//     npx tsx --tsconfig tsconfig.json docs/plans/envoi/evidence/s21-local-seed.mts
// Drop it afterwards with:
//   psql "$TEST_DATABASE_URL" -c 'drop database if exists "envoi_s21_local" with (force)'
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "@/lib/db/migrate";
import { newId } from "@/lib/ids";
import * as schema from "@/lib/db/schema";
import { assignPayPalDestination, seedDemoFixture } from "@/operator/cli";

const NAME = "envoi_s21_local";
const BASE = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/postgres";
// The same FIXTURE seller the integration tests use; it is not a real PayPal account.
const FIXTURE_SELLER = "FXTRSELLER2AB";

// The live Test Shop the user described on 2026-10-26, plus the two iced teas of buyer-one-box.html.
const TEST_SHOP = {
  key: "s21-local-test-shop",
  name: "Test Shop",
  area: "Test Area",
  items: [
    ["Kopi C", 180, true],
    ["Mee siam", 550, false],
    ["Kaya toast set", 450, false],
    ["Iced lemon tea", 220, true],
    ["Iced milk tea", 250, true],
  ],
} as const;

function urlFor(database: string, user?: string): string {
  const parsed = new URL(BASE);
  parsed.pathname = `/${database}`;
  if (user) {
    parsed.username = user;
    parsed.password = "";
  }
  return parsed.toString();
}

const root = postgres(BASE, { max: 1, onnotice: () => {} });
try {
  await root.unsafe(`DROP DATABASE IF EXISTS "${NAME}" WITH (FORCE)`);
  await root.unsafe(`CREATE DATABASE "${NAME}"`);
  for (const role of ["envoi_web", "envoi_maintenance"]) {
    await root.unsafe(`DO $$ BEGIN CREATE ROLE ${role} LOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`);
  }
} finally {
  await root.end({ timeout: 5 });
}

const adminUrl = urlFor(NAME);
await runMigrations(adminUrl);
const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });
try {
  const db = drizzle(admin, { schema });
  const demo = await seedDemoFixture(db);

  const outletId = newId("out");
  const revision = newId("mrv");
  await admin`insert into outlets (id, name, area, is_demo_fixture, fixture_key, created_at) values (${outletId}, ${TEST_SHOP.name}, ${TEST_SHOP.area}, true, ${TEST_SHOP.key}, now())`;
  await admin`insert into menu_revisions (id, outlet_id, status, confirmed_at, created_at) values (${revision}, ${outletId}, 'confirmed', now(), now())`;
  for (const [position, [name, cents, available]] of TEST_SHOP.items.entries()) {
    const itemId = newId("itm");
    await admin`insert into menu_items (id, item_key, menu_revision_id, position, name, unit_sgd_cents, available) values (${itemId}, ${itemId}, ${revision}, ${position}, ${name}, ${cents}, ${available})`;
  }
  await admin`update outlets set published_menu_revision_id = ${revision} where id = ${outletId}`;

  await assignPayPalDestination(db, demo.outletId, FIXTURE_SELLER);
  await assignPayPalDestination(db, outletId, FIXTURE_SELLER);

  console.log(
    JSON.stringify(
      {
        label: "FIXTURE shops and a FIXTURE PayPal sandbox seller; test money only, no live account",
        database: NAME,
        adminUrl,
        webUrl: urlFor(NAME, "envoi_web"),
        demoFixtureOutletId: demo.outletId,
        testShopOutletId: outletId,
      },
      null,
      1,
    ),
  );
} finally {
  await admin.end({ timeout: 5 });
}
