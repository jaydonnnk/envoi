import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseRpcLimiter } from "@/integrations/solana/limiter";
import { connectRunner } from "@/lib/db/runner";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S17, Gate 4 delta D7: migration 0023 gives the web role pyusd_extra_transfers and the maintenance
// role the PYUSD attempt columns, pyusd_extra_transfers and the RPC limiter rows. Each grant is a
// barrier of its own, so each gets a test that a widened grant fails, as the S16 grant tests do. Every
// statement matches no row, so only the privilege check can refuse it; each refused statement has a
// positive control the role may run.

describe("PYUSD recovery grants", () => {
  let database: TestDatabase;
  let web: postgres.Sql;
  let maintenance: postgres.Sql;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdrecgrants");
    web = postgres(database.webUrl, { max: 1, onnotice: () => {} });
    maintenance = postgres(database.maintenanceUrl, { max: 1, onnotice: () => {} });
  });

  afterAll(async () => {
    await web?.end({ timeout: 5 });
    await maintenance?.end({ timeout: 5 });
    await database?.drop();
  });

  const outcome = (query: Promise<unknown>) => query.then(() => "ok", (err: { code?: string }) => err.code ?? "no_code");
  const DENIED = "42501";

  const insertExtra = (sql: postgres.Sql) =>
    sql`insert into pyusd_extra_transfers (id, attempt_id, signature, slot, destination_delta, verification, found_at) select 'pxt_grant', 'att_grant', 'sig', 1, 1, 'verified', now() where false`;
  const insertRefund = (sql: postgres.Sql) =>
    sql`insert into pyusd_extra_transfers (id, attempt_id, signature, slot, destination_delta, verification, found_at, refund_reference, refund_recorded_at, refund_recorded_by_user_id) select 'pxt_grant', 'att_grant', 'sig', 1, 1, 'verified', now(), 'FXTR', now(), 'usr_grant' where false`;

  it("the web role cannot record a refund reference", async () => {
    expect(await outcome(insertExtra(web))).toBe("ok");
    expect(await outcome(insertRefund(web))).toBe(DENIED);
    expect(await outcome(web`update pyusd_extra_transfers set refund_reference = 'FXTR' where false`)).toBe(DENIED);
  });

  it("the web role cannot delete an extra transfer", async () => {
    expect(await outcome(web`select id from pyusd_extra_transfers where false`)).toBe("ok");
    expect(await outcome(web`delete from pyusd_extra_transfers where false`)).toBe(DENIED);
  });

  it("the maintenance role cannot record a refund reference", async () => {
    expect(await outcome(insertExtra(maintenance))).toBe("ok");
    expect(await outcome(insertRefund(maintenance))).toBe(DENIED);
    expect(await outcome(maintenance`update pyusd_extra_transfers set refund_reference = 'FXTR' where false`)).toBe(DENIED);
  });

  it("the maintenance role cannot re-price or rebind a PYUSD attempt", async () => {
    expect(await outcome(maintenance`update payment_attempts set pyusd_scan = pyusd_scan, pyusd_mismatch_signature = pyusd_mismatch_signature, pyusd_hints = pyusd_hints where false`)).toBe("ok");
    expect(await outcome(maintenance`update payment_attempts set pyusd_atomic_amount = pyusd_atomic_amount + 1 where false`)).toBe(DENIED);
    expect(await outcome(maintenance`update payment_attempts set pyusd_reference = pyusd_reference, pyusd_destination_token_account = pyusd_destination_token_account where false`)).toBe(DENIED);
  });

  it("the maintenance role cannot reseat the RPC limiter", async () => {
    // Positive control: the shared limiter works as envoi_maintenance, as the runner uses it.
    const runner = connectRunner(database.maintenanceUrl);
    try {
      const admission = await createDatabaseRpcLimiter(runner.db, () => new Date()).acquire("getBlockHeight");
      expect(admission.ok).toBe(true);
      if (admission.ok) await admission.release();
    } finally {
      await runner.close();
    }
    expect(await outcome(maintenance`update rpc_limiter_slots set slot = slot where false`)).toBe(DENIED);
    expect(await outcome(maintenance`insert into rpc_limiter_slots (slot) select 2 where false`)).toBe(DENIED);
  });
});
