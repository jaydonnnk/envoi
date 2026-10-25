import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { issueAgentToken } from "@/operator/cli";
import { checkResponse, documentedResponses, loadDocument } from "../support/openapi";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";
import { TEST_BASE_URL } from "../support/session";

// S14: the public read routes answer what openapi/envoi-public.yaml says, including their errors.
// S19: so does the agent's purchase request route. Real route handlers run as envoi_web against a
// migrated disposable database holding the seeded demo fixture shop (with its FIXTURE PayPal sandbox
// seller), one shop with no published menu and one FIXTURE agent token. PayPal is never called.
describe("public API contract", () => {
  let fixture: PaymentsFixture;
  let unpublishedId: string;
  let agentToken: string;
  let routes: {
    outlets: typeof import("@/app/api/v1/outlets/route");
    menu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
    requests: typeof import("@/app/api/v1/purchase-requests/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("public-contract");
    unpublishedId = newId("out");
    await fixture.database.admin`insert into outlets (id, name, area, is_demo_fixture) values (${unpublishedId}, 'Unpublished FIXTURE', 'Bugis', true)`;
    // Confirmed but never published: only the published pointer keeps it from buyers.
    await fixture.database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at) values (${newId("mrv")}, ${unpublishedId}, 'confirmed', now())`;
    agentToken = (await issueAgentToken(drizzle(fixture.database.admin, { schema }), "FIXTURE contract agent")).token;
    routes = {
      outlets: await import("@/app/api/v1/outlets/route"),
      menu: await import("@/app/api/v1/outlets/[id]/menu/route"),
      requests: await import("@/app/api/v1/purchase-requests/route"),
    };
  });

  afterAll(async () => {
    await fixture?.database.drop();
  });

  it("public API matches its OpenAPI document", async () => {
    const document = loadDocument();
    // Next.js answers a handler that throws with an undocumented 500, so a throw is checked as one.
    const menuOf = (id: string) =>
      routes.menu.GET(new Request(`${TEST_BASE_URL}/api/v1/outlets/${encodeURIComponent(id)}/menu`), routeParams(id)).catch(() => new Response(null, { status: 500 }));
    const calls: { name: string; template: string; response: Response }[] = [
      { name: "list", template: "/api/v1/outlets", response: await routes.outlets.GET() },
      { name: "published menu", template: "/api/v1/outlets/{id}/menu", response: await menuOf(fixture.outletId) },
      { name: "unpublished menu", template: "/api/v1/outlets/{id}/menu", response: await menuOf(unpublishedId) },
      { name: "unknown outlet", template: "/api/v1/outlets/{id}/menu", response: await menuOf(newId("out")) },
      // S14 review fix 1: an id no outlet can have, such as a NUL byte PostgreSQL refuses, answers the
      // documented 404 like an unknown shop.
      { name: "NUL byte id", template: "/api/v1/outlets/{id}/menu", response: await menuOf("\u0000") },
      { name: "short id", template: "/api/v1/outlets/{id}/menu", response: await menuOf("x") },
      { name: "2 KB id", template: "/api/v1/outlets/{id}/menu", response: await menuOf(`out_${"a".repeat(2048)}`) },
    ];

    const exercised = new Set<string>();
    for (const { name, template, response } of calls) {
      exercised.add(`GET ${template} ${response.status}`);
      // Check a copy first (checkResponse also holds the envelope flag ok, which the document types
      // as a plain boolean), then read the body that fits the document for the data asserted below.
      expect(await checkResponse(document, template, "GET", response.clone()), name).toEqual([]);
      const body = (await response.json()) as { data?: { outlets?: unknown[]; items?: unknown[] } };
      if (name === "list") expect(body.data?.outlets?.length, name).toBe(1);
      if (name === "published menu") expect(body.data?.items?.length, name).toBe(fixture.items.length);
    }
    expect([...exercised].sort()).toEqual(documentedResponses(document).filter((response) => response.startsWith("GET ")).sort());
    expect(calls.map((call) => call.response.status)).toEqual([200, 200, 404, 404, 404, 404, 404]);
  });

  it("agent purchase request matches its OpenAPI document", async () => {
    const document = loadDocument();
    const template = "/api/v1/purchase-requests";
    // No route is documented that neither this test nor the read test exercises.
    expect(Object.keys(document.paths).sort()).toEqual(["/api/v1/outlets", "/api/v1/outlets/{id}/menu", template]);
    const post = (body: string, token: string | null = agentToken) =>
      routes.requests
        .POST(
          new Request(`${TEST_BASE_URL}${template}`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
            body,
          }),
        )
        .catch(() => new Response(null, { status: 500 }));
    const line = { menuItemId: fixture.items[0]!.id, quantity: 2 };
    const basket = (extra: Record<string, unknown> = {}) => JSON.stringify({ outletId: fixture.outletId, lines: [line], ...extra });
    const calls: { name: string; response: Response; status: number; reason?: string }[] = [
      { name: "created", response: await post(basket()), status: 201 },
      { name: "no lines", response: await post(JSON.stringify({ outletId: fixture.outletId })), status: 400 },
      { name: "not JSON", response: await post("{"), status: 400 },
      { name: "body over 4 KiB", response: await post(basket({ note: "x".repeat(5000) })), status: 400, reason: "too_large" },
      { name: "zero quantity", response: await post(JSON.stringify({ outletId: fixture.outletId, lines: [{ ...line, quantity: 0 }] })), status: 400, reason: "quantity" },
      { name: "unknown item", response: await post(JSON.stringify({ outletId: fixture.outletId, lines: [{ ...line, menuItemId: newId("itm") }] })), status: 400, reason: "unknown_item" },
      { name: "no token", response: await post(basket(), null), status: 401 },
      { name: "unknown token", response: await post(basket(), "a".repeat(52)), status: 401 },
      { name: "unknown shop", response: await post(JSON.stringify({ outletId: newId("out"), lines: [line] })), status: 404 },
      { name: "unpublished shop", response: await post(JSON.stringify({ outletId: unpublishedId, lines: [line] })), status: 404 },
    ];

    const exercised = new Set<string>();
    for (const { name, response, status, reason } of calls) {
      exercised.add(`POST ${template} ${response.status}`);
      expect(response.status, name).toBe(status);
      expect(await checkResponse(document, template, "POST", response.clone()), name).toEqual([]);
      const body = (await response.json()) as { data?: { url: string; expiresAt: string }; error?: { details: { reason?: string } } };
      if (reason) expect(body.error?.details.reason, name).toBe(reason);
      if (name === "created") {
        // The link expires 10 minutes after it is created, and its token is redeemable on this server.
        expect(body.data!.url.startsWith(`${TEST_BASE_URL}/approve/`), name).toBe(true);
        const remaining = Date.parse(body.data!.expiresAt) - Date.now();
        expect(remaining, name).toBeGreaterThan(9 * 60_000);
        expect(remaining, name).toBeLessThanOrEqual(10 * 60_000);
      }
    }
    expect([...exercised].sort()).toEqual(documentedResponses(document).filter((response) => response.startsWith("POST ")).sort());
  });
});
