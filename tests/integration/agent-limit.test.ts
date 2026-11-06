import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { hashToken, newId } from "@/lib/ids";
import { issueAgentToken, revokeAgentToken } from "@/operator/cli";
import { createPaymentsFixture, type PaymentsFixture } from "../support/payments";
import { TEST_BASE_URL } from "../support/session";

// S37 judge token: every agent token has its own limit on /mcp, checked before any tool runs, and a
// revoked token reaches no tool. Limits are asserted with literal values, not the module's constants.
// Real POSTs go through the route; only the site token's 900 is seeded up to its edge.
describe("agent token limit and revocation on /mcp", () => {
  let fixture: PaymentsFixture;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let routes: { mcp: typeof import("@/app/mcp/route") };
  const T0 = new Date("2026-11-06T08:00:00.000Z").getTime();
  const TEN_MINUTES = 10 * 60_000;
  // webEnv reads the environment once, so the site's token is fixed before the first request.
  const SITE_TOKEN = "envoi_agent_FIXTURE_site_assistant";
  const siteTokenId = "agt_fixture_site";

  beforeAll(async () => {
    fixture = await createPaymentsFixture("agentlimit", { ASSISTANT_AGENT_TOKEN: SITE_TOKEN });
    db = drizzle(fixture.database.admin, { schema });
    await db.insert(schema.agentTokens).values({ id: siteTokenId, label: "FIXTURE site assistant", tokenHash: hashToken(SITE_TOKEN), createdAt: new Date() });
    routes = { mcp: await import("@/app/mcp/route") };
  });

  beforeEach(async () => {
    await fixture.database.admin`delete from rate_limit_hits`;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  const fixtureToken = (label: string) => issueAgentToken(drizzle(fixture.database.admin, { schema }), `FIXTURE ${label}`);

  async function seedHits(subject: string, n: number): Promise<void> {
    const rows = Array.from({ length: n }, () => ({ id: newId("rlh"), bucket: "agent_mcp", subject, at: new Date(T0 - 1_000).toISOString() }));
    await fixture.database.admin`insert into rate_limit_hits ${fixture.database.admin(rows)}`;
  }

  function post(token: string, method: string, params: Record<string, unknown>): Promise<Response> {
    return routes.mcp.POST(
      new Request(`${TEST_BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          host: new URL(TEST_BASE_URL).host,
          "mcp-protocol-version": "2025-06-18",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
  }

  const listTools = (token: string) => post(token, "tools/list", {});

  // Real POSTs, because the limit counts every POST, not only tool calls.
  async function spendPosts(token: string, n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) expect((await listTools(token)).status).toBe(200);
  }

  async function createLink(token: string): Promise<{ status: number; code?: string; created: boolean }> {
    const item = fixture.items[0]!;
    const before = await countRequests();
    const response = await post(token, "tools/call", { name: "create_purchase_request", arguments: { outletId: fixture.outletId, lines: [{ menuItemId: item.id, quantity: 1 }] } });
    const body = (await response.json()) as { error?: { code?: string } };
    return { status: response.status, code: typeof body.error?.code === "string" ? body.error.code : undefined, created: (await countRequests()) === before + 1 };
  }

  const countRequests = async () => Number((await fixture.database.admin<{ n: string }[]>`select count(*) as n from purchase_requests`)[0]!.n);

  it("an agent token over its limit reaches no tool", async () => {
    const { token } = await fixtureToken("over limit");
    await spendPosts(token, 59);

    expect(await createLink(token)).toEqual({ status: 200, code: undefined, created: true });
    expect(await createLink(token)).toEqual({ status: 429, code: "rate_limited", created: false });
  });

  it("the limit is counted per token, apart from other agents", async () => {
    const full = await fixtureToken("full");
    const other = await fixtureToken("other");
    await spendPosts(full.token, 60);

    expect((await createLink(other.token)).created).toBe(true);
  });

  it("the allowance returns after 10 minutes", async () => {
    const { token } = await fixtureToken("window");
    vi.setSystemTime(T0 - 1_000);
    // Spends until refused, whatever the exact number is; the first test owns the number.
    for (let i = 0; i < 70 && (await listTools(token)).status === 200; i += 1);

    vi.setSystemTime(T0 + TEN_MINUTES - 2_000);
    expect((await listTools(token)).status).toBe(429);
    vi.setSystemTime(T0 + TEN_MINUTES);
    expect((await createLink(token)).created).toBe(true);
  });

  it("the site's own token has 900 where any other token has 60, and is still limited", async () => {
    await seedHits(siteTokenId, 899);

    expect((await createLink(SITE_TOKEN)).created).toBe(true);
    expect((await createLink(SITE_TOKEN)).status).toBe(429);
  });

  it("a revoked agent token reaches no tool", async () => {
    const { token, agentTokenId } = await fixtureToken("revoked");
    expect((await createLink(token)).created).toBe(true);

    expect(await revokeAgentToken(db, agentTokenId)).toEqual({ status: "revoked", agentTokenId });

    expect(await createLink(token)).toMatchObject({ status: 401, created: false });
  });

  it("revoking records the act, withdraws only that token and refuses an unknown id", async () => {
    const revoked = await fixtureToken("withdrawn");
    const kept = await fixtureToken("kept");

    await revokeAgentToken(db, revoked.agentTokenId);
    expect(await revokeAgentToken(db, revoked.agentTokenId)).toEqual({ status: "unchanged", agentTokenId: revoked.agentTokenId });
    await expect(revokeAgentToken(db, "agt_made_up")).rejects.toThrow("does not exist");

    expect((await createLink(kept.token)).created).toBe(true);
    const audits = await fixture.database.admin`select details from audit_events where action = 'agent_token_revoked' and details->>'agentTokenId' = ${revoked.agentTokenId}`;
    expect(audits).toHaveLength(1);
  });
});
