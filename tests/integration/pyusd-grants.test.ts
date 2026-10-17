import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S16 review fixes, F4: the web role's grants from migration 0022 are a barrier of their own, so each
// one gets a test that a widened grant fails. Every statement matches no row, so only the privilege
// check can refuse it; each refused statement has a positive control, the same statement on granted
// columns only, which the web role may run.

describe("PYUSD web-role grants", () => {
  let database: TestDatabase;
  let web: postgres.Sql;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdgrants");
    web = postgres(database.webUrl, { max: 1, onnotice: () => {} });
  });

  afterAll(async () => {
    await web?.end({ timeout: 5 });
    await database?.drop();
  });

  // The SQLSTATE a statement ends with, or "ok".
  const outcome = (query: Promise<unknown>) => query.then(() => "ok", (err: { code?: string }) => err.code ?? "no_code");
  const DENIED = "42501";

  it("the web role cannot re-price a PYUSD attempt", async () => {
    expect(await outcome(web`update payment_attempts set pyusd_hints = pyusd_hints where false`)).toBe("ok");
    expect(await outcome(web`update payment_attempts set pyusd_atomic_amount = pyusd_atomic_amount + 1 where false`)).toBe(DENIED);
  });

  it("the web role cannot write a PayPal seller into a destination", async () => {
    expect(await outcome(web`insert into payment_destinations (id, outlet_id, rail, environment, status, version, created_at) select 'dst_grant', 'out_grant', 'pyusd', 'devnet', 'active', 1, now() where false`)).toBe("ok");
    expect(await outcome(web`insert into payment_destinations (id, outlet_id, rail, environment, status, version, created_at, seller_merchant_id) select 'dst_grant', 'out_grant', 'pyusd', 'devnet', 'active', 1, now(), 'FXTRSELLER' where false`)).toBe(DENIED);
    expect(await outcome(web`update payment_destinations set seller_merchant_id = 'FXTRSELLER' where false`)).toBe(DENIED);
  });

  it("the web role cannot approve an enrollment", async () => {
    expect(await outcome(web`update enrollments set status = 'approved', approved_at = now() where false`)).toBe(DENIED);
  });

  it("the web role cannot change a dated PYUSD rate", async () => {
    expect(await outcome(web`insert into pyusd_rates (id, outlet_id, atomic_per_sgd, confirmed_at, confirmed_by_user_id) select 'rat_grant', 'out_grant', 1, now(), 'usr_grant' where false`)).toBe("ok");
    expect(await outcome(web`update pyusd_rates set atomic_per_sgd = atomic_per_sgd + 1 where false`)).toBe(DENIED);
  });

  it("the web role cannot rewrite a wallet challenge", async () => {
    expect(await outcome(web`update wallet_challenges set consumed_at = now() where false`)).toBe("ok");
    expect(await outcome(web`update wallet_challenges set wallet = wallet, message = message where false`)).toBe(DENIED);
  });
});
