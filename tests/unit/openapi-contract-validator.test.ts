import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSupported, checkResponse, loadDocument, validate, type OpenApiDocument } from "../support/openapi";

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
    // S14 review fix 6: the database refuses a price of 0 (menu_items_price_check), so the document does too.
    ["zero cents", (b: ReturnType<typeof menu>) => Object.assign(b.data.items[0]!, { unitSgdCents: 0 }), "$.data.items[0].unitSgdCents: 0 is below 1"],
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

  // S14 review fix 4: the document types ok as a plain boolean, so checkResponse holds its value.
  it("holds the envelope flag ok to the status", async () => {
    const cache = { "cache-control": "public, max-age=30" };
    expect(await checkResponse(document, "/api/v1/outlets/{id}/menu", "GET", json({ ...menu(), ok: false }, 200, cache))).toEqual(["$.ok: false on a 200 answer"]);
    const notFound = { ok: true, error: { code: "not_found", message: "That shop is not on Envoi.", retryable: false, details: {} } };
    expect(await checkResponse(document, "/api/v1/outlets/{id}/menu", "GET", json(notFound, 404, { "cache-control": "no-store" }))).toEqual(["$.ok: true on a 404 answer"]);
  });
});

// S14 review fix 2: every schema in the document is checked when it is loaded, not only the ones a
// response happens to reach, so a rule validate() would skip cannot hide in an unexercised branch.
describe("OpenAPI document support check", () => {
  type Doc = OpenApiDocument & Record<string, never>;
  const schemas = (d: OpenApiDocument) => d.components.schemas as Record<string, { properties: Record<string, Record<string, unknown>> } & Record<string, unknown>>;
  const menuParameter = (d: OpenApiDocument) => (d.paths["/api/v1/outlets/{id}/menu"]!.get as unknown as { parameters: { schema: Record<string, unknown> }[] }).parameters[0]!.schema;

  it("accepts the real document", () => {
    expect(() => assertSupported(loadDocument())).not.toThrow();
  });

  it("refuses to load an unsupported document", () => {
    const d = structuredClone(loadDocument()) as Doc;
    Object.assign(schemas(d).MenuItem!.properties.name!, { maxLength: 80 });
    const path = join(mkdtempSync(join(tmpdir(), "envoi-openapi-")), "document.json");
    writeFileSync(path, JSON.stringify(d));
    expect(() => loadDocument(path)).toThrowError("unsupported schema at #/components/schemas/MenuItem.properties.name: keyword maxLength");
  });

  it.each([
    ["an unknown keyword on a property", (d: Doc) => Object.assign(schemas(d).MenuItem!.properties.name!, { maxLength: 80 }), "#/components/schemas/MenuItem.properties.name: keyword maxLength"],
    ["an unknown keyword under items", (d: Doc) => Object.assign(schemas(d).OutletList!.properties.outlets!, { items: { type: "object", minProperties: 1 } }), "#/components/schemas/OutletList.properties.outlets.items: keyword minProperties"],
    ["an unknown keyword on a path parameter", (d: Doc) => Object.assign(menuParameter(d), { maxLength: 30 }), "get /api/v1/outlets/{id}/menu parameter id: keyword maxLength"],
    ["an unknown keyword on a header", (d: Doc) => Object.assign(d.components.headers.NoStore!.schema, { const: "no-store" }), "#/components/headers/NoStore: keyword const"],
    ["a sibling of $ref", (d: Doc) => Object.assign(schemas(d).Menu!.properties.outlet!, { required: ["id"] }), "#/components/schemas/Menu.properties.outlet: $ref has a sibling keyword other than description"],
    ["an additionalProperties schema", (d: Doc) => Object.assign(schemas(d).OutletSummary!, { additionalProperties: { type: "string" } }), "#/components/schemas/OutletSummary: additionalProperties is not false"],
    ["an unknown type", (d: Doc) => Object.assign(schemas(d).MenuItem!.properties.unitSgdCents!, { type: ["int", "null"] }), "#/components/schemas/MenuItem.properties.unitSgdCents: type is missing or unknown"],
    ["an enum that is not a list", (d: Doc) => Object.assign(d.components.headers.NoStore!.schema, { enum: "no-store" }), "#/components/headers/NoStore: enum is not an array"],
    ["a pattern that is not a string", (d: Doc) => Object.assign(schemas(d).OutletSummary!.properties.id!, { pattern: 7 }), "#/components/schemas/OutletSummary.properties.id: pattern is not a string"],
    ["a minimum that is not a number", (d: Doc) => Object.assign(schemas(d).MenuItem!.properties.unitSgdCents!, { minimum: "1" }), "#/components/schemas/MenuItem.properties.unitSgdCents: minimum is not a number"],
    ["required that is not a list of names", (d: Doc) => Object.assign(schemas(d).MenuItem!, { required: "id" }), "#/components/schemas/MenuItem: required is not a list of names"],
    // S19: the agent route's request body is checked too.
    ["an unknown keyword on a request body schema", (d: Doc) => Object.assign((d.paths["/api/v1/purchase-requests"]!.post as unknown as { requestBody: { content: Record<string, { schema: unknown }> } }).requestBody.content["application/json"]!, { schema: { type: "object", minProperties: 1 } }), "post /api/v1/purchase-requests request application/json: keyword minProperties"],
    ["an unknown keyword on a response schema", (d: Doc) => Object.assign(d.paths["/api/v1/outlets"]!.get!.responses["200"]!.content["application/json"]!, { schema: { type: "object", minProperties: 1 } }), "get /api/v1/outlets 200 application/json: keyword minProperties"],
  ])("rejects %s", (_name, corrupt, where) => {
    const d = structuredClone(loadDocument()) as Doc;
    corrupt(d);
    expect(() => assertSupported(d)).toThrowError(`unsupported schema at ${where}`);
  });
});
