import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { checkResponse, documentedResponses, loadDocument } from "../support/openapi";
import { createPaymentsFixture, routeParams, type PaymentsFixture } from "../support/payments";
import { TEST_BASE_URL } from "../support/session";

// S14: the public read routes answer what openapi/envoi-public.yaml says, including their errors.
// Real route handlers run as envoi_web against a migrated disposable database holding the seeded
// demo fixture shop and one shop with no published menu.
describe("public API contract", () => {
  let fixture: PaymentsFixture;
  let unpublishedId: string;
  let routes: {
    outlets: typeof import("@/app/api/v1/outlets/route");
    menu: typeof import("@/app/api/v1/outlets/[id]/menu/route");
  };

  beforeAll(async () => {
    fixture = await createPaymentsFixture("public-contract");
    unpublishedId = newId("out");
    await fixture.database.admin`insert into outlets (id, name, area, is_demo_fixture) values (${unpublishedId}, 'Unpublished FIXTURE', 'Bugis', true)`;
    // Confirmed but never published: only the published pointer keeps it from buyers.
    await fixture.database.admin`insert into menu_revisions (id, outlet_id, status, confirmed_at) values (${newId("mrv")}, ${unpublishedId}, 'confirmed', now())`;
    routes = {
      outlets: await import("@/app/api/v1/outlets/route"),
      menu: await import("@/app/api/v1/outlets/[id]/menu/route"),
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
    expect([...exercised].sort()).toEqual(documentedResponses(document).sort());
    expect(calls.map((call) => call.response.status)).toEqual([200, 200, 404, 404, 404, 404, 404]);
  });
});
