import { describe, expect, it } from "vitest";
import { checkResponse, loadDocument, validate } from "../support/openapi";

// S14: each rule of the contract check rejects its own fault on the real document's schemas, so a
// passing contract test means the responses fit, not that a rule was never applied.
const document = loadDocument();
const menuResponse = { $ref: "#/components/schemas/MenuResponse" };

const outlet = { id: `out_${"a".repeat(26)}`, name: "FIXTURE shop", area: "Bugis", isDemoFixture: true };
const item = { id: `itm_${"b".repeat(26)}`, name: "Kaya toast", unitSgdCents: 250, available: true };
const menu = () => ({ ok: true, data: { outlet: { ...outlet }, menuRevisionId: `mrv_${"c".repeat(26)}`, items: [{ ...item }] } });

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("OpenAPI contract validator", () => {
  it("accepts a fitting menu, including unknown price and availability", () => {
    const body = menu();
    expect(validate(document, menuResponse, body)).toEqual([]);
    body.data.items[0] = { ...item, unitSgdCents: null as never, available: null as never };
    expect(validate(document, menuResponse, body)).toEqual([]);
  });

  it.each([
    ["missing required field", (b: ReturnType<typeof menu>) => delete (b.data as Partial<typeof b.data>).menuRevisionId, "$.data: missing required menuRevisionId"],
    ["renamed field", (b: ReturnType<typeof menu>) => Object.assign(b.data.items[0]!, { price: 1 }), "$.data.items[0]: unexpected property price"],
    ["wrong type", (b: ReturnType<typeof menu>) => Object.assign(b.data.outlet, { isDemoFixture: "yes" }), "$.data.outlet.isDemoFixture: expected boolean, got string"],
    ["null where not allowed", (b: ReturnType<typeof menu>) => Object.assign(b.data.outlet, { name: null }), "$.data.outlet.name: expected string, got null"],
    ["fractional cents", (b: ReturnType<typeof menu>) => Object.assign(b.data.items[0]!, { unitSgdCents: 2.5 }), "$.data.items[0].unitSgdCents: expected integer or null, got number"],
    ["negative cents", (b: ReturnType<typeof menu>) => Object.assign(b.data.items[0]!, { unitSgdCents: -1 }), "$.data.items[0].unitSgdCents: -1 is below 0"],
    ["pattern", (b: ReturnType<typeof menu>) => Object.assign(b.data.outlet, { id: "pur_x" }), '$.data.outlet.id: "pur_x" does not match ^out_[a-z2-7]{26}$'],
  ])("rejects %s", (_name, corrupt, message) => {
    const body = menu();
    corrupt(body);
    expect(validate(document, menuResponse, body)).toEqual([message]);
  });

  it("rejects enum", () => {
    const notFound = (code: string) => ({ ok: false, error: { code, message: "That shop is not on Envoi.", retryable: false, details: {} } });
    const schema = { $ref: "#/components/schemas/NotFoundResponse" };
    expect(validate(document, schema, notFound("not_found"))).toEqual([]);
    expect(validate(document, schema, notFound("validation_failed"))).toEqual(['$.error.code: "validation_failed" is not one of ["not_found"]']);
  });

  it("refuses a schema keyword it does not understand", () => {
    expect(() => validate(document, { type: "string", maxLength: 3 }, "abcd")).toThrowError("unsupported schema keyword maxLength at $");
  });

  it("checks status, headers and content type of a live response", async () => {
    const template = "/api/v1/outlets/{id}/menu";
    const cache = { "cache-control": "public, max-age=30" };
    expect(await checkResponse(document, template, "GET", json(menu(), 200, cache))).toEqual([]);
    expect(await checkResponse(document, template, "GET", json(menu(), 500, cache))).toEqual([`GET ${template} answered 500, which is not documented`]);
    expect(await checkResponse(document, template, "GET", json(menu(), 200, {}))).toEqual(["header Cache-Control: missing"]);
    expect(await checkResponse(document, template, "GET", json(menu(), 200, { "cache-control": "no-store" }))).toEqual([
      'header Cache-Control: "no-store" is not one of ["public, max-age=30"]',
    ]);
    const html = new Response("<p>hi</p>", { status: 200, headers: { "content-type": "text/html", ...cache } });
    expect(await checkResponse(document, template, "GET", html)).toEqual(["content-type text/html is not documented for 200"]);
    expect(await checkResponse(document, "/api/v1/purchases", "GET", json({}, 200, cache))).toEqual(["GET /api/v1/purchases is not documented"]);
  });
});
