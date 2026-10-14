import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { approveMembership, createMerchant } from "@/operator/cli";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { anonymousCookie, webEnvFor } from "../support/session";

// Operator acts for merchant accounts (Gate 4 delta D1). FIXTURE passwords are generated in memory
// for this run only.
describe("operator merchant acts", () => {
  let database: TestDatabase;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    database = await createTestDatabase("operator_merchant");
    db = drizzle(database.admin, { schema });
    Object.assign(process.env, webEnvFor(database.webUrl));
  });

  afterAll(async () => {
    await database?.drop();
  });

  const password = () => randomBytes(18).toString("base64url");

  it("create-merchant never changes an existing account", async () => {
    const first = await createMerchant(db, { email: "Repeat@Merchant.example.test ", name: "FIXTURE repeat", password: password() });
    expect(first.status).toBe("created");
    const before = await database.admin`select u.email, u.is_anonymous, a.provider_id, a.password from "user" u join account a on a.user_id = u.id where u.id = ${first.userId}`;
    expect(before).toEqual([{ email: "repeat@merchant.example.test", is_anonymous: false, provider_id: "credential", password: expect.stringMatching(/^[0-9a-f]+:[0-9a-f]+$/) }]);

    const second = await createMerchant(db, { email: "repeat@merchant.example.test", name: "Someone else", password: password() });
    expect(second).toEqual({ status: "unchanged", userId: first.userId });
    expect(await database.admin`select u.email, u.is_anonymous, a.provider_id, a.password from "user" u join account a on a.user_id = u.id where u.id = ${first.userId}`).toEqual(before);
    expect(await database.admin`select id from merchant_memberships where user_id = ${first.userId}`).toHaveLength(0);
  });

  it("create-merchant refuses a short password and stores nothing", async () => {
    await expect(createMerchant(db, { email: "short@merchant.example.test", name: "FIXTURE short", password: "too-short" })).rejects.toThrow(/12 to 128/);
    expect(await database.admin`select id from "user" where email = 'short@merchant.example.test'`).toHaveLength(0);
  });

  it("approve-membership grants one unbound membership and repeats as unchanged", async () => {
    const { userId } = await createMerchant(db, { email: "approve@merchant.example.test", name: "FIXTURE approve", password: password() });
    const first = await approveMembership(db, { email: "approve@merchant.example.test", evidenceRef: "FIXTURE evidence" });
    expect(first).toMatchObject({ status: "created", userId });
    const second = await approveMembership(db, { email: "APPROVE@merchant.example.test" });
    expect(second).toEqual({ status: "unchanged", userId, membershipId: first.membershipId });
    expect(await database.admin`select outlet_id, role, is_demo, evidence_ref, revoked_at from merchant_memberships where user_id = ${userId}`).toEqual([
      { outlet_id: null, role: "owner", is_demo: true, evidence_ref: "FIXTURE evidence", revoked_at: null },
    ]);
  });

  it("approve-membership refuses an anonymous or unknown account", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    await anonymousCookie(POST);
    const [anonymous] = await database.admin<{ email: string }[]>`select email from "user" where is_anonymous limit 1`;
    await expect(approveMembership(db, { email: anonymous!.email })).rejects.toThrow(/No merchant account/);
    await expect(approveMembership(db, { email: "nobody@merchant.example.test" })).rejects.toThrow(/No merchant account/);
    expect(await database.admin`select m.id from merchant_memberships m join "user" u on u.id = m.user_id where u.is_anonymous`).toHaveLength(0);
  });
});
