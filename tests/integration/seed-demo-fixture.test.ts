import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedDemoFixture } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";

describe("re-seeding never changes an existing fixture", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase("seed");
  });

  afterAll(async () => {
    await database?.drop();
  });

  const snapshot = () => database.admin`
    select o.id, o.name, o.published_menu_revision_id,
      (select count(*)::int from outlets) as outlets,
      (select count(*)::int from menu_revisions) as revisions,
      (select json_agg(json_build_object('id', i.id, 'name', i.name, 'cents', i.unit_sgd_cents) order by i.position)
         from menu_items i) as items
    from outlets o`;

  it("a second run reports the existing ids and leaves outlet, revision and pointer unchanged", async () => {
    const db = drizzle(database.admin, { schema });
    const first = await seedDemoFixture(db);
    expect(first.status).toBe("created");
    const before = await snapshot();

    const second = await seedDemoFixture(db);
    expect(second).toEqual({ status: "unchanged", outletId: first.outletId, menuRevisionId: first.menuRevisionId });
    expect(await snapshot()).toEqual(before);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ published_menu_revision_id: first.menuRevisionId, outlets: 1, revisions: 1 });
  });
});
