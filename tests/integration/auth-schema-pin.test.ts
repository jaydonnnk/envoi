import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth";
import { connectWeb } from "@/lib/db/web";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// R11 containment. The decoy tables have the same columns as Better Auth's, so a write that
// resolved into neon_auth would succeed silently instead of erroring.
describe("auth tables resolve to public only", () => {
  let database: TestDatabase;
  let web: ReturnType<typeof connectWeb>;

  beforeAll(async () => {
    database = await createTestDatabase("authpin");
    await database.admin.unsafe(`
      CREATE SCHEMA neon_auth;
      CREATE TABLE neon_auth."user" (LIKE public."user" INCLUDING ALL);
      CREATE TABLE neon_auth."session" (LIKE public."session" INCLUDING ALL);
      GRANT USAGE ON SCHEMA neon_auth TO envoi_web;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA neon_auth TO envoi_web;
      ALTER DATABASE "${database.name}" SET search_path = neon_auth, public;
    `);
    web = connectWeb(database.webUrl, 2);
  });

  afterAll(async () => {
    await web?.close();
    await database?.drop();
  });

  it("Better Auth reads and writes public even when search_path puts neon_auth first", async () => {
    const auth = createAuth({ db: web.db, secret: "test-fixture-secret-0123456789abcdef0123456789", baseURL: TEST_BASE_URL, trustedOrigins: [TEST_BASE_URL] });

    const cookie = await anonymousCookie((request) => auth.handler(request));
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.isAnonymous).toBe(true);

    const [counts] = await database.admin<{ publicUsers: number; publicSessions: number; decoyUsers: number; decoySessions: number }[]>`
      select
        (select count(*)::int from public."user") as "publicUsers",
        (select count(*)::int from public."session") as "publicSessions",
        (select count(*)::int from neon_auth."user") as "decoyUsers",
        (select count(*)::int from neon_auth."session") as "decoySessions"`;
    expect(counts).toEqual({ publicUsers: 1, publicSessions: 1, decoyUsers: 0, decoySessions: 0 });
  });
});
