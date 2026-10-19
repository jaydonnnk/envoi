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
    const menuOf = (id: string) => routes.menu.GET(new Request(`${TEST_BASE_URL}/api/v1/outlets/${id}/menu`), routeParams(id));
    const calls: { name: string; template: string; response: Response }[] = [
      { name: "list", template: "/api/v1/outlets", response: await routes.outlets.GET() },
      { name: "published menu", template: "/api/v1/outlets/{id}/menu", response: await menuOf(fixture.outletId) },
      { name: "unpublished menu", template: "/api/v1/outlets/{id}/menu", response: await menuOf(unpublishedId) },
      { name: "unknown outlet", template: "/api/v1/outlets/{id}/menu", response: await menuOf(newId("out")) },
    ];

    const exercised = new Set<string>();
    for (const { name, template, response } of calls) {
      exercised.add(`GET ${template} ${response.status}`);
      // Read a copy first so a body that fits the document must also carry the data asserted below.
      const body = (await response.clone().json()) as { ok: unknown; data?: { outlets?: unknown[]; items?: unknown[] } };
      expect(await checkResponse(document, template, "GET", response), name).toEqual([]);
      // The document types ok as a plain boolean (see its description), so its value is held here.
      expect(body.ok, name).toBe(response.status === 200);
      if (name === "list") expect(body.data?.outlets?.length, name).toBe(1);
      if (name === "published menu") expect(body.data?.items?.length, name).toBe(fixture.items.length);
    }
    expect([...exercised].sort()).toEqual(documentedResponses(document).sort());
    expect(calls.map((call) => call.response.status)).toEqual([200, 200, 404, 404]);
  });
});
