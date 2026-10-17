import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseRpcLimiter, type RpcAdmission, type RpcLimiter } from "@/integrations/solana/limiter";
import { connectWeb } from "@/lib/db/web";
import { durationMs } from "@/lib/time";
import { createTestDatabase, type TestDatabase } from "../support/db";

// S16, Gate 3 group "shared RPC limiter" (5 cases): createDatabaseRpcLimiter against PostgreSQL as
// envoi_web. Two limiter instances share one database and stand in for the web app and the runner.
// The clock is injected; the limiter rows are reset before every case.

const T0 = new Date("2026-10-27T03:00:00.000Z");

describe("shared RPC limiter", () => {
  let database: TestDatabase;
  let web: ReturnType<typeof connectWeb>;
  let at: Date;
  let app: RpcLimiter;
  let runner: RpcLimiter;

  beforeAll(async () => {
    database = await createTestDatabase("pyusdlimiter");
    web = connectWeb(database.webUrl, 4);
  });

  beforeEach(async () => {
    await database.admin`delete from rpc_limiter_calls`;
    await database.admin`update rpc_limiter_slots set holder = null, lease_expires_at = null`;
    await database.admin`update rpc_limiter_backoff set until = null, consecutive = 0`;
    at = T0;
    const now = () => at;
    // A fixed jitter draw, so the backoff length is known.
    app = createDatabaseRpcLimiter(web.db, now, () => 0.5);
    runner = createDatabaseRpcLimiter(web.db, now, () => 0.5);
  });

  afterAll(async () => {
    await web?.close();
    await database?.drop();
  });

  const granted = async (admission: Promise<RpcAdmission>) => {
    const result = await admission;
    if (result.ok) await result.release();
    return result.ok;
  };

  it("RPC calls stop at 20 per 10 seconds across web and runner", async () => {
    let admitted = 0;
    for (let n = 0; n < 20; n += 1) {
      // Alternating callers and distinct methods, so only the shared window can decide.
      if (await granted((n % 2 === 0 ? app : runner).acquire(`fixtureMethod${n}`))) admitted += 1;
    }
    expect(admitted).toBe(20);
    expect(await app.acquire("fixtureMethodLast")).toMatchObject({ ok: false, reason: "global" });
    expect(await runner.acquire("fixtureMethodLast")).toMatchObject({ ok: false, reason: "global" });
  });

  it("one RPC method stops at 10 per 10 seconds", async () => {
    for (let n = 0; n < 10; n += 1) expect(await granted((n % 2 === 0 ? app : runner).acquire("getTransaction"))).toBe(true);
    expect(await app.acquire("getTransaction")).toMatchObject({ ok: false, reason: "method" });
    expect(await granted(runner.acquire("getGenesisHash"))).toBe(true);
  });

  it("at most two RPC requests run at once", async () => {
    const first = await app.acquire("getGenesisHash");
    const second = await runner.acquire("getEpochInfo");
    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(await app.acquire("getBlockHeight")).toMatchObject({ ok: false, reason: "concurrency" });
    if (first.ok) await first.release();
    expect(await granted(runner.acquire("getBlockHeight"))).toBe(true);
    if (second.ok) await second.release();
  });

  it("RPC 429 backs off every caller", async () => {
    await app.reportRateLimited();
    const refusedApp = await app.acquire("getGenesisHash");
    const refusedRunner = await runner.acquire("getGenesisHash");
    expect(refusedApp).toMatchObject({ ok: false, reason: "backoff" });
    expect(refusedRunner).toMatchObject({ ok: false, reason: "backoff" });
    // The first backoff draws from up to backoffBaseMs (1 s) with the fixed draw 0.5, floored at 1 s.
    expect(refusedRunner.ok ? 0 : refusedRunner.retryAfterMs).toBe(1_000);
    at = new Date(T0.getTime() + 1_000);
    expect(await granted(runner.acquire("getGenesisHash"))).toBe(true);
  });

  it("abandoned RPC slot is reclaimed after its lease", async () => {
    // Two holders that crash: they never release.
    expect((await app.acquire("getGenesisHash")).ok).toBe(true);
    expect((await runner.acquire("getEpochInfo")).ok).toBe(true);
    at = new Date(T0.getTime() + durationMs("T_RPC_SLOT_LEASE") - 1);
    expect(await app.acquire("getBlockHeight")).toMatchObject({ ok: false, reason: "concurrency" });
    at = new Date(T0.getTime() + durationMs("T_RPC_SLOT_LEASE"));
    expect(await granted(app.acquire("getBlockHeight"))).toBe(true);
  });
});
