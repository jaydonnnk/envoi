import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPurchaseRequest, previewPurchaseRequest, redeemPurchaseRequest } from "@/domain/handoffs/redeem";
import type { AgentPrincipal, BuyerPrincipal } from "@/lib/auth-context";
import * as schema from "@/lib/db/schema";
import { connectWeb, type Db } from "@/lib/db/web";
import { issueAgentToken } from "@/operator/cli";
import { createPaymentsFixture, jsonPost, routeParams, type PaymentsFixture } from "../support/payments";
import { anonymousCookie, TEST_BASE_URL } from "../support/session";

// S13 agent handoff: an agent token proposes a basket over MCP or HTTP, and a buyer's own session
// redeems the link once into a fresh server-priced review. PayPal is never called here.
describe("agent handoff over MCP", () => {
  let fixture: PaymentsFixture;
  let web: { db: Db; close: () => Promise<void> };
  let agentToken: string;
  let agent: AgentPrincipal;
  let routes: {
    auth: typeof import("@/app/api/auth/[...all]/route");
    purchase: typeof import("@/app/api/v1/purchases/[id]/route");
    requests: typeof import("@/app/api/v1/purchase-requests/route");
    redeem: typeof import("@/app/api/v1/purchase-requests/redeem/route");
    mcp: typeof import("@/app/mcp/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("handoff");
    const issued = await issueAgentToken(drizzle(fixture.database.admin, { schema }), "fixture agent");
    agentToken = issued.token;
    agent = { kind: "agent", agentTokenId: issued.agentTokenId, label: issued.label };
    web = connectWeb(fixture.database.webUrl, 2);
    routes = {
      auth: await import("@/app/api/auth/[...all]/route"),
      purchase: await import("@/app/api/v1/purchases/[id]/route"),
      requests: await import("@/app/api/v1/purchase-requests/route"),
      redeem: await import("@/app/api/v1/purchase-requests/redeem/route"),
      mcp: await import("@/app/mcp/route"),
    };
  });

  afterAll(async () => {
    await web?.close();
    await fixture?.database.drop();
  });

  const item = (name: string) => {
    const found = fixture.items.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no fixture item ${name}`);
    return found;
  };

  const tokenOf = (url: string) => {
    const match = /\/approve\/([a-z2-7]{52})$/.exec(url);
    if (!match) throw new Error("not a handoff url");
    return match[1]!;
  };

  async function buyer(): Promise<{ cookie: string; principal: BuyerPrincipal }> {
    const cookie = await anonymousCookie(routes.auth.POST);
    const response = await routes.auth.GET(new Request(`${TEST_BASE_URL}/api/auth/get-session`, { headers: { cookie } }));
    const session = (await response.json()) as { user: { id: string } };
    return { cookie, principal: { kind: "buyer", userId: session.user.id, isAnonymous: true } };
  }

  async function agentRequest(body: unknown, token = agentToken): Promise<Response> {
    return routes.requests.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchase-requests`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async function newLink(lines: { menuItemId: string; quantity: number }[], extra: Record<string, unknown> = {}): Promise<string> {
    const response = await agentRequest({ outletId: fixture.outletId, lines, ...extra });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { url: string } };
    return data.url;
  }

  async function redeem(token: string, cookie: string): Promise<{ status: number; body: { data?: { outcome: string; purchaseId?: string }; error?: { code: string } } }> {
    const response = await routes.redeem.POST(jsonPost("/api/v1/purchase-requests/redeem", cookie, { token }));
    return { status: response.status, body: (await response.json()) as never };
  }

  type McpHeaders = Record<string, string>;

  function mcpRequest(body: string, headers: McpHeaders = {}): Request {
    return new Request(`${TEST_BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${agentToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: new URL(TEST_BASE_URL).host,
        "mcp-protocol-version": "2025-06-18",
        ...headers,
      },
      body,
    });
  }

  async function callTool(name: string, args: Record<string, unknown>, headers: McpHeaders = {}): Promise<{ status: number; text: string; isError: boolean }> {
    const response = await routes.mcp.POST(mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }), headers));
    const envelope = (await response.json()) as { result?: { content: { text: string }[]; isError?: boolean } };
    return { status: response.status, text: envelope.result?.content[0]?.text ?? "", isError: envelope.result?.isError === true };
  }

  const countRequests = async () => Number((await fixture.database.admin<{ n: string }[]>`select count(*) as n from purchase_requests`)[0]!.n);

  it("agent token cannot read a receipt", async () => {
    const { cookie } = await buyer();
    const redeemed = await redeem(tokenOf(await newLink([{ menuItemId: item("Kopi O").id, quantity: 1 }])), cookie);
    const purchaseId = redeemed.body.data!.purchaseId!;

    const asAgent = await routes.purchase.GET(new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { authorization: `Bearer ${agentToken}` } }), routeParams(purchaseId));
    expect(asAgent.status).toBe(403);
    const body = JSON.stringify(await asAgent.json());
    expect(body).toContain("forbidden_membership");
    expect(body).not.toContain(purchaseId);

    // Even holding the buyer's cookie, a request that presents an agent token is refused.
    const withCookie = await routes.purchase.GET(
      new Request(`${TEST_BASE_URL}/api/v1/purchases/${purchaseId}`, { headers: { authorization: `Bearer ${agentToken}`, cookie } }),
      routeParams(purchaseId),
    );
    expect(withCookie.status).toBe(403);
  });

  it("agent token cannot redeem a handoff", async () => {
    const token = tokenOf(await newLink([{ menuItemId: item("Kopi O").id, quantity: 1 }]));
    const response = await routes.redeem.POST(
      new Request(`${TEST_BASE_URL}/api/v1/purchase-requests/redeem`, { method: "POST", headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json" }, body: JSON.stringify({ token }) }),
    );
    expect(response.status).toBe(403);
    const [row] = await fixture.database.admin`select redeemed_at from purchase_requests where purchase_id is null order by created_at desc limit 1`;
    expect(row!.redeemed_at).toBeNull();
  });

  it("handoff redeems once", async () => {
    const token = tokenOf(await newLink([{ menuItemId: item("Teh C peng").id, quantity: 1 }]));
    const first = await buyer();
    const second = await buyer();

    const once = await redeem(token, first.cookie);
    expect(once.status).toBe(201);
    expect(once.body.data!.outcome).toBe("redeemed");

    const again = await redeem(token, first.cookie);
    expect(again.body.data).toEqual({ outcome: "already_redeemed" });
    const other = await redeem(token, second.cookie);
    expect(other.body.data).toEqual({ outcome: "already_redeemed" });

    // The refused redemption by another buyer left no review behind.
    const theirs = await fixture.database.admin`select id from purchases where buyer_user_id = ${second.principal.userId}`;
    expect(theirs).toHaveLength(0);
    const [bound] = await fixture.database.admin`select redeemed_by_user_id, purchase_id from purchase_requests where purchase_id = ${once.body.data!.purchaseId!}`;
    expect(bound!.redeemed_by_user_id).toBe(first.principal.userId);
  });

  it("concurrent redemptions bind once", async () => {
    const created = await createPurchaseRequest(web.db, agent, { outletId: fixture.outletId, lines: [{ menuItemId: item("Teh C peng").id, quantity: 2 }] }, new Date());
    if (created.kind !== "created") throw new Error("not created");
    const [first, second] = [await buyer(), await buyer()];

    const outcomes = await Promise.all([first, second].map((who) => redeemPurchaseRequest(web.db, who.principal, created.handoffToken, new Date())));
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["already_redeemed", "redeemed"]);
    const reviews = await fixture.database.admin`select id from purchases where buyer_user_id in (${first.principal.userId}, ${second.principal.userId})`;
    expect(reviews).toHaveLength(1);
  });

  it("handoff expires after T_HANDOFF", async () => {
    const at = (ms: number) => new Date(Date.UTC(2026, 9, 14, 2, 0, 0) + ms);
    const lines = [{ menuItemId: item("Kaya toast set").id, quantity: 1 }];
    const created = await createPurchaseRequest(web.db, agent, { outletId: fixture.outletId, lines }, at(0));
    if (created.kind !== "created") throw new Error("not created");
    expect(created.expiresAt.getTime() - at(0).getTime()).toBe(600_000);

    const outcomeAt = async (ms: number) => {
      const fresh = await createPurchaseRequest(web.db, agent, { outletId: fixture.outletId, lines }, at(0));
      if (fresh.kind !== "created") throw new Error("not created");
      return (await redeemPurchaseRequest(web.db, (await buyer()).principal, fresh.handoffToken, at(ms))).kind;
    };
    expect(await outcomeAt(9 * 60_000)).toBe("redeemed");
    expect(await outcomeAt(599_999)).toBe("redeemed");
    expect(await outcomeAt(600_000)).toBe("expired");
    expect(await outcomeAt(11 * 60_000)).toBe("expired");
  });

  it("approval preview shows names and quantities only", async () => {
    const url = await newLink([{ menuItemId: item("Kopi O").id, quantity: 3 }]);
    const preview = await previewPurchaseRequest(web.db, tokenOf(url), new Date());
    expect(preview).toMatchObject({ kind: "open", outlet: { id: fixture.outletId, isDemoFixture: true }, lines: [{ name: "Kopi O", quantity: 3 }] });
    expect(JSON.stringify(preview)).not.toMatch(/cents|price|total|amount/i);
  });

  it("approval preview closes a used, expired or unknown link", async () => {
    const at = new Date(Date.UTC(2026, 9, 14, 3, 0, 0));
    const lines = [{ menuItemId: item("Kopi O").id, quantity: 1 }];
    const used = await createPurchaseRequest(web.db, agent, { outletId: fixture.outletId, lines }, at);
    const stale = await createPurchaseRequest(web.db, agent, { outletId: fixture.outletId, lines }, at);
    if (used.kind !== "created" || stale.kind !== "created") throw new Error("not created");
    expect((await redeemPurchaseRequest(web.db, (await buyer()).principal, used.handoffToken, at)).kind).toBe("redeemed");

    expect(await previewPurchaseRequest(web.db, used.handoffToken, at)).toEqual({ kind: "already_redeemed" });
    expect((await previewPurchaseRequest(web.db, stale.handoffToken, new Date(at.getTime() + 599_999))).kind).toBe("open");
    expect(await previewPurchaseRequest(web.db, stale.handoffToken, new Date(at.getTime() + 600_000))).toEqual({ kind: "expired" });
    expect(await previewPurchaseRequest(web.db, "a".repeat(52), at)).toEqual({ kind: "invalid" });
    expect(await previewPurchaseRequest(web.db, "not-a-token", at)).toEqual({ kind: "invalid" });
  });

  it("purchase requests need a live agent token", async () => {
    const lines = [{ menuItemId: item("Kopi O").id, quantity: 1 }];
    const { cookie } = await buyer();
    const asBuyer = await routes.requests.POST(jsonPost("/api/v1/purchase-requests", cookie, { outletId: fixture.outletId, lines }));
    expect(asBuyer.status).toBe(401);
    expect((await agentRequest({ outletId: fixture.outletId, lines }, `${agentToken}x`)).status).toBe(401);

    const revoked = await issueAgentToken(drizzle(fixture.database.admin, { schema }), "revoked fixture agent");
    expect((await agentRequest({ outletId: fixture.outletId, lines }, revoked.token)).status).toBe(201);
    await fixture.database.admin`update agent_tokens set revoked_at = now() where id = ${revoked.agentTokenId}`;
    expect((await agentRequest({ outletId: fixture.outletId, lines }, revoked.token)).status).toBe(401);
  });

  it("MCP refuses GET and DELETE", async () => {
    for (const response of [await routes.mcp.GET(), await routes.mcp.DELETE()]) {
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("foreign Origin is rejected", async () => {
    const before = await countRequests();
    const args = { outletId: fixture.outletId, lines: [{ menuItemId: item("Kopi O").id, quantity: 1 }] };
    const foreign = await routes.mcp.POST(
      mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_purchase_request", arguments: args } }), { origin: "https://attacker.example" }),
    );
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ ok: false, error: { code: "forbidden_origin", details: { reason: "origin" } } });
    expect(await countRequests()).toBe(before);

    const own = await callTool("create_purchase_request", args, { origin: TEST_BASE_URL });
    expect(own.status).toBe(200);
    expect(await countRequests()).toBe(before + 1);
  });

  it("foreign Host is rejected", async () => {
    const response = await routes.mcp.POST(mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), { host: "attacker.example" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "forbidden_origin", details: { reason: "host" } } });
  });

  it("MCP reads at most 16 KiB of body", async () => {
    const message = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const exact = await routes.mcp.POST(mcpRequest(message + " ".repeat(16_384 - message.length)));
    expect(exact.status).toBe(200);
    const over = await routes.mcp.POST(mcpRequest(message + " ".repeat(16_385 - message.length)));
    expect(over.status).toBe(400);
    expect(await over.json()).toMatchObject({ ok: false, error: { code: "validation_failed", details: { reason: "too_large" } } });
  });

  it("MCP lists only the three scoped tools", async () => {
    const response = await routes.mcp.POST(mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })));
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(["create_purchase_request", "get_menu", "search_outlets"]);
  });

  it("an MCP client finds the shop, reads the menu and gets a link a buyer redeems", async () => {
    const init = await routes.mcp.POST(
      mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fixture-client", version: "1" } } })),
    );
    expect(init.status).toBe(200);

    expect(JSON.parse((await callTool("search_outlets", { area: "o" })).text).outlets).toEqual([]);
    const found = JSON.parse((await callTool("search_outlets", { area: "near Tanjong Pagar" })).text) as { outlets: { id: string; isDemoFixture: boolean; label: string }[] };
    expect(found.outlets).toEqual([expect.objectContaining({ id: fixture.outletId, isDemoFixture: true, label: "Demo fixture shop, not a real merchant" })]);

    const menu = JSON.parse((await callTool("get_menu", { outletId: fixture.outletId })).text) as { items: { id: string; name: string }[] };
    const kopi = menu.items.find((entry) => entry.name === "Kopi O")!;

    const created = await callTool("create_purchase_request", { outletId: fixture.outletId, lines: [{ menuItemId: kopi.id, quantity: 2 }], totalSgdCents: 1 });
    expect(created.isError).toBe(false);
    expect(created.text).not.toMatch(/cents|total|amount|purchaseId|pur_/i);
    const { url } = JSON.parse(created.text) as { url: string };
    expect(url.startsWith(`${TEST_BASE_URL}/approve/`)).toBe(true);

    const redeemed = await redeem(tokenOf(url), (await buyer()).cookie);
    const [purchase] = await fixture.database.admin`select total_sgd_cents from purchases where id = ${redeemed.body.data!.purchaseId!}`;
    expect(purchase!.total_sgd_cents).toBe(2 * item("Kopi O").unitSgdCents);

    const unknown = await callTool("create_purchase_request", { outletId: fixture.outletId, lines: [{ menuItemId: "itm_made_up", quantity: 1 }] });
    expect(unknown.isError).toBe(true);
  });

  it("no handoff token or agent token reaches the log", async () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
    const out = vi.spyOn(console, "log").mockImplementation(capture);
    const err = vi.spyOn(console, "error").mockImplementation(capture);
    try {
      const created = await callTool("create_purchase_request", { outletId: fixture.outletId, lines: [{ menuItemId: item("Kopi O").id, quantity: 1 }] });
      const handoff = tokenOf((JSON.parse(created.text) as { url: string }).url);
      await redeem(handoff, (await buyer()).cookie);
      expect(lines.some((line) => line.includes("create_purchase_request"))).toBe(true);
      const joined = lines.join("\n");
      expect(joined).not.toContain(handoff);
      expect(joined).not.toContain(agentToken);
    } finally {
      out.mockRestore();
      err.mockRestore();
      process.env.LOG_LEVEL = previous;
    }
  });
});
