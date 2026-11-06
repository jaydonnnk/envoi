import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublishedMenu, listPublishedItemNames, listPublishedOutlets, searchPublishedOutlets, shopContext } from "@/domain/outlets/search";
import * as schema from "@/lib/db/schema";
import { seedJudgeFixtures, setOutletHidden } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";

describe("hiding a demo fixture shop", () => {
  let database: TestDatabase;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let hidden: { outletId: string; name: string };
  let other: { outletId: string; name: string };

  beforeAll(async () => {
    database = await createTestDatabase("hideoutlet");
    db = drizzle(database.admin, { schema });
    const seeded = await seedJudgeFixtures(db);
    hidden = seeded[0]!;
    other = seeded[1]!;
    await setOutletHidden(db, { outletId: hidden.outletId, hidden: true });
  });

  afterAll(async () => {
    await database?.drop();
  });

  it("drops it from the public list and leaves other shops", async () => {
    const ids = (await listPublishedOutlets(db as never)).map((row) => row.id);
    expect(ids).not.toContain(hidden.outletId);
    expect(ids).toContain(other.outletId);
  });

  it("drops it from search by name", async () => {
    expect(await searchPublishedOutlets(db as never, { area: null, name: hidden.name })).toEqual([]);
    expect((await searchPublishedOutlets(db as never, { area: null, name: other.name })).map((row) => row.id)).toEqual([other.outletId]);
  });

  it("drops its items from the assistant's item names", async () => {
    const ids = new Set((await listPublishedItemNames(db as never, null)).map((row) => row.outletId));
    expect(ids.has(hidden.outletId)).toBe(false);
    expect(ids.has(other.outletId)).toBe(true);
  });

  it("keeps its direct links working", async () => {
    expect((await getPublishedMenu(db as never, hidden.outletId))?.outlet.id).toBe(hidden.outletId);
    expect((await shopContext(db as never, hidden.outletId))?.id).toBe(hidden.outletId);
  });

  it("refuses a shop that is not a demo fixture and changes nothing", async () => {
    await database.admin`update outlets set is_demo_fixture = false where id = ${other.outletId}`;
    await expect(setOutletHidden(db, { outletId: other.outletId, hidden: true })).rejects.toThrow("not a demo fixture");
    const [row] = await database.admin`select hidden_at from outlets where id = ${other.outletId}`;
    expect(row!.hidden_at).toBeNull();
    await database.admin`update outlets set is_demo_fixture = true where id = ${other.outletId}`;
  });

  it("audits once, then a repeat changes nothing, and showing brings it back", async () => {
    expect((await setOutletHidden(db, { outletId: hidden.outletId, hidden: true })).status).toBe("unchanged");
    const audits = await database.admin`select action from audit_events where outlet_id = ${hidden.outletId} and action = 'outlet_hidden'`;
    expect(audits.length).toBe(1);
    expect((await setOutletHidden(db, { outletId: hidden.outletId, hidden: false })).status).toBe("shown");
    expect((await listPublishedOutlets(db as never)).map((row) => row.id)).toContain(hidden.outletId);
  });
});
