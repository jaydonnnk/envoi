import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "@/lib/db/migrate";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S27 migration 0027 on a database built to 0026 and filled with FIXTURE rows in the old shape: a
// published and a draft menu (one price unknown), two purchases whose lines carry the old keys, and
// their payment attempts, one captured. The same counts and sums are taken on Neon before and after.
const BEFORE = "0026_assistant_rate_limit_bucket";

type Totals = Record<string, string | number | null>;

async function totals(sql: postgres.Sql, names: { unit: string; total: string; gross: string; unitKey: string; lineKey: string }): Promise<Totals> {
  const [row] = await sql.unsafe(`
    select
      (select count(*)::int from outlets) as outlets,
      (select count(*)::int from menu_items) as menu_items,
      (select count(*)::int from purchases) as purchases,
      (select count(*)::int from payment_attempts) as payment_attempts,
      (select sum("${names.unit}")::text from menu_items) as menu_items_unit,
      (select count(*)::int from menu_items where "${names.unit}" is null) as menu_items_unknown,
      (select sum("${names.total}")::text from purchases) as purchases_total,
      (select sum("${names.total}")::text from payment_attempts) as attempts_total,
      (select sum("${names.gross}")::text from payment_attempts) as attempts_gross,
      (select sum((l.value->>'${names.unitKey}')::bigint)::text from purchases p, jsonb_array_elements(p.lines) l(value)) as lines_unit,
      (select sum((l.value->>'${names.lineKey}')::bigint)::text from purchases p, jsonb_array_elements(p.lines) l(value)) as lines_line,
      (select count(*)::int from purchases p, jsonb_array_elements(p.lines) l(value)) as line_count`);
  return row as Totals;
}

describe("currency migration", () => {
  let database: TestDatabase;
  let folder: string;

  beforeAll(async () => {
    database = await createTestDatabase("currency_mig", { migrate: false });
    // The migrations up to 0026 only, as Neon holds them before this slice.
    folder = mkdtempSync(join(tmpdir(), "envoi-0026-"));
    cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
    const last = journal.entries.findIndex((entry) => entry.tag === BEFORE);
    expect(last).toBeGreaterThan(0);
    for (const entry of journal.entries.slice(last + 1)) rmSync(join(folder, `${entry.tag}.sql`));
    journal.entries = journal.entries.slice(0, last + 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    const client = postgres(database.adminUrl, { max: 1, onnotice: () => {}, connection: { search_path: "public" } });
    try {
      await migrate(drizzle(client), { migrationsFolder: folder, migrationsSchema: "public", migrationsTable: "__drizzle_migrations" });
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  afterAll(async () => {
    if (folder) rmSync(folder, { recursive: true, force: true });
    await database?.drop();
  });

  it("the currency migration keeps every amount and marks existing outlets SG", async () => {
    const sql = database.admin;
    await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('usr_fixture_s27', 'FIXTURE buyer', 'fixture-s27@buyer.example.test', false, now(), now())`;
    await sql`insert into outlets (id, name, area, is_demo_fixture) values ('out_fixture_s27a', 'FIXTURE Kopi', 'Tanjong Pagar', true), ('out_fixture_s27b', 'FIXTURE Draft', 'Bugis', true)`;
    await sql`insert into menu_revisions (id, outlet_id, status, confirmed_at) values ('mrv_fixture_s27a', 'out_fixture_s27a', 'confirmed', now()), ('mrv_fixture_s27b', 'out_fixture_s27b', 'draft', null)`;
    await sql`
      insert into menu_items (id, menu_revision_id, position, name, unit_sgd_cents, available) values
        ('itm_fixture_s27a', 'mrv_fixture_s27a', 1, 'Kopi C', 180, true),
        ('itm_fixture_s27b', 'mrv_fixture_s27a', 2, 'Iced lemon tea', 220, true),
        ('itm_fixture_s27c', 'mrv_fixture_s27b', 1, 'Kaya toast', 350, true),
        ('itm_fixture_s27d', 'mrv_fixture_s27b', 2, 'Ebi fry', null, null)`;
    await sql`update outlets set published_menu_revision_id = 'mrv_fixture_s27a' where id = 'out_fixture_s27a'`;
    const lines = (items: [string, string, number, number][]) =>
      sql.json(items.map(([menuItemId, name, quantity, unit]) => ({ menuItemId, name, quantity, unitSgdCents: unit, lineSgdCents: unit * quantity })));
    await sql`
      insert into purchases (id, buyer_user_id, outlet_id, menu_revision_id, state, entry_point, lines, total_sgd_cents, currency, review_expires_at) values
        ('pur_fixture_s27a', 'usr_fixture_s27', 'out_fixture_s27a', 'mrv_fixture_s27a', 'paid', 'fixture_tracer', ${lines([["itm_fixture_s27b", "Iced lemon tea", 2, 220]])}, 440, 'SGD', now()),
        ('pur_fixture_s27b', 'usr_fixture_s27', 'out_fixture_s27a', 'mrv_fixture_s27a', 'unpaid_closed', 'fixture_tracer', ${lines([["itm_fixture_s27a", "Kopi C", 1, 180], ["itm_fixture_s27b", "Iced lemon tea", 3, 220]])}, 840, 'SGD', now())`;
    await sql`
      insert into payment_attempts (id, purchase_id, state, payee_merchant_id, total_sgd_cents, currency, create_request_id, capture_request_id, capture_id, capture_gross_sgd_cents) values
        ('att_fixture_s27a', 'pur_fixture_s27a', 'capture_confirmed', 'FXTRSELLER2AB', 440, 'SGD', 'fixture-create-s27a', 'fixture-capture-s27a', 'FIXTURE-CAPTURE-S27', 440),
        ('att_fixture_s27b', 'pur_fixture_s27b', 'capture_failed', 'FXTRSELLER2AB', 840, 'SGD', 'fixture-create-s27b', null, null, null)`;
    const linesBefore = await sql`select id, lines from purchases order by id`;
    const before = await totals(sql, { unit: "unit_sgd_cents", total: "total_sgd_cents", gross: "capture_gross_sgd_cents", unitKey: "unitSgdCents", lineKey: "lineSgdCents" });
    expect(before).toMatchObject({ menu_items_unit: "750", menu_items_unknown: 1, purchases_total: "1280", attempts_gross: "440", lines_unit: "620", line_count: 3 });

    await runMigrations(database.adminUrl);

    const after = await totals(sql, { unit: "unit_minor", total: "total_minor", gross: "capture_gross_minor", unitKey: "unitMinor", lineKey: "lineMinor" });
    expect(after).toEqual(before);
    expect(await sql`select id, country from outlets order by id`).toEqual([
      { id: "out_fixture_s27a", country: "SG" },
      { id: "out_fixture_s27b", country: "SG" },
    ]);
    expect(await sql`select distinct currency from purchases`).toEqual([{ currency: "SGD" }]);
    // Each stored line keeps its order and every other field; only the two amount keys are renamed.
    const linesAfter = await sql`select id, lines from purchases order by id`;
    const renamed = linesBefore.map((row) => ({
      id: row.id,
      lines: (row.lines as Record<string, unknown>[]).map(({ unitSgdCents, lineSgdCents, ...rest }) => ({ ...rest, unitMinor: unitSgdCents, lineMinor: lineSgdCents })),
    }));
    expect(linesAfter).toEqual(renamed);
    // The published outlet's country is now locked; the draft-only outlet may still choose.
    await expect(sql`update outlets set country = 'US' where id = 'out_fixture_s27a'`).rejects.toMatchObject({ code: "23514" });
    await sql`update outlets set country = 'US' where id = 'out_fixture_s27b'`;
  });
});
