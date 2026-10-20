import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// S14: checks a response against openapi/envoi-public.yaml without a schema library. The document is
// JSON syntax (valid YAML 1.2), so JSON.parse reads it. Only the keywords listed in KNOWN are
// understood; any other keyword throws, so the document cannot gain a rule this check silently skips.

export type Schema = Record<string, unknown>;
export type OpenApiDocument = {
  paths: Record<string, Record<string, { responses: Record<string, OpenApiResponse> }>>;
  components: { schemas: Record<string, Schema>; headers: Record<string, { required?: boolean; schema: Schema }> };
};
type OpenApiResponse = {
  headers?: Record<string, { $ref: string }>;
  content: Record<string, { schema: Schema }>;
};

export const PUBLIC_DOCUMENT = fileURLToPath(new URL("../../openapi/envoi-public.yaml", import.meta.url));

export function loadDocument(path = PUBLIC_DOCUMENT): OpenApiDocument {
  const document = JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument;
  assertSupported(document);
  return document;
}

const KNOWN = new Set(["$ref", "type", "enum", "required", "properties", "additionalProperties", "items", "pattern", "minimum", "description"]);
const TYPES = new Set(["object", "array", "string", "integer", "number", "boolean", "null"]);

// S14 review fix 2: validate() meets only the schemas a response reaches, so every schema in the
// document (components, headers, parameters, responses) is checked here once, when it is loaded.
// A keyword whose rule validate() would not apply in full throws instead of being skipped.
export function assertSupported(document: OpenApiDocument): void {
  const schemas: [string, unknown][] = Object.entries(document.components.schemas).map(([name, schema]) => [`#/components/schemas/${name}`, schema]);
  for (const [name, header] of Object.entries(document.components.headers)) schemas.push([`#/components/headers/${name}`, header.schema]);
  for (const [template, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods) as [string, { parameters?: { name: string; schema: unknown }[]; responses: Record<string, OpenApiResponse> }][]) {
      for (const parameter of operation.parameters ?? []) schemas.push([`${method} ${template} parameter ${parameter.name}`, parameter.schema]);
      for (const [status, response] of Object.entries(operation.responses)) {
        for (const [media, { schema }] of Object.entries(response.content)) schemas.push([`${method} ${template} ${status} ${media}`, schema]);
      }
    }
  }
  for (const [where, schema] of schemas) assertSchema(document, schema, where);
}

function assertSchema(document: OpenApiDocument, schema: unknown, where: string): void {
  const fail = (problem: string): never => {
    throw new Error(`unsupported schema at ${where}: ${problem}`);
  };
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) fail("not an object");
  const s = schema as Schema;
  for (const keyword of Object.keys(s)) if (!KNOWN.has(keyword)) fail(`keyword ${keyword}`);
  if (s.$ref !== undefined) {
    if (typeof s.$ref !== "string") fail("$ref is not a string");
    resolve(document, s.$ref as string);
    if (Object.keys(s).some((keyword) => keyword !== "$ref" && keyword !== "description")) fail("$ref has a sibling keyword other than description");
    return;
  }
  const types = Array.isArray(s.type) ? s.type : s.type === undefined ? [] : [s.type];
  if (types.length === 0 || !types.every((type) => typeof type === "string" && TYPES.has(type))) fail("type is missing or unknown");
  if (s.enum !== undefined && !Array.isArray(s.enum)) fail("enum is not an array");
  if (s.pattern !== undefined) {
    if (typeof s.pattern !== "string") fail("pattern is not a string");
    new RegExp(s.pattern as string, "u");
  }
  if (s.minimum !== undefined && typeof s.minimum !== "number") fail("minimum is not a number");
  if (s.required !== undefined && !(Array.isArray(s.required) && s.required.every((name) => typeof name === "string"))) fail("required is not a list of names");
  if (s.additionalProperties !== undefined && s.additionalProperties !== false) fail("additionalProperties is not false");
  if (s.properties !== undefined) {
    if (typeof s.properties !== "object" || s.properties === null || Array.isArray(s.properties)) fail("properties is not an object");
    for (const [name, child] of Object.entries(s.properties as Record<string, unknown>)) assertSchema(document, child, `${where}.properties.${name}`);
  }
  if (s.items !== undefined) assertSchema(document, s.items, `${where}.items`);
}

function resolve(document: OpenApiDocument, ref: string): Schema {
  const prefix = "#/components/schemas/";
  const target = ref.startsWith(prefix) ? document.components.schemas[ref.slice(prefix.length)] : undefined;
  if (!target) throw new Error(`unresolvable $ref ${ref}`);
  return target;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

// Returns one message per violation, each naming the JSON path; an empty list means the value fits.
export function validate(document: OpenApiDocument, schema: Schema, value: unknown, path = "$"): string[] {
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN.has(keyword)) throw new Error(`unsupported schema keyword ${keyword} at ${path}`);
  }
  if (typeof schema.$ref === "string") return validate(document, resolve(document, schema.$ref), value, path);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    const actual = typeOf(value);
    if (!allowed.includes(actual) && !(actual === "integer" && allowed.includes("number"))) {
      return [`${path}: expected ${allowed.join(" or ")}, got ${actual}`];
    }
  }
  const errors: string[] = [];
  if (Array.isArray(schema.enum) && !schema.enum.some((option) => option === value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof schema.pattern === "string" && typeof value === "string" && !new RegExp(schema.pattern, "u").test(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    errors.push(`${path}: ${value} is below ${schema.minimum}`);
  }
  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const name of (schema.required ?? []) as string[]) {
      if (!(name in record)) errors.push(`${path}: missing required ${name}`);
    }
    for (const [name, child] of Object.entries(record)) {
      const childSchema = properties[name];
      if (childSchema) errors.push(...validate(document, childSchema, child, `${path}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property ${name}`);
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((child, index) => errors.push(...validate(document, schema.items as Schema, child, `${path}[${index}]`)));
  }
  return errors;
}

// Checks one live response against the operation documented for its path template: the status must
// be documented, every required header must be present and valid, and the JSON body must fit.
export async function checkResponse(document: OpenApiDocument, template: string, method: string, response: Response): Promise<string[]> {
  const operation = document.paths[template]?.[method.toLowerCase()];
  if (!operation) return [`${method} ${template} is not documented`];
  const documented = operation.responses[String(response.status)];
  if (!documented) return [`${method} ${template} answered ${response.status}, which is not documented`];

  const errors: string[] = [];
  for (const [name, { $ref }] of Object.entries(documented.headers ?? {})) {
    const header = document.components.headers[$ref.replace("#/components/headers/", "")];
    if (!header) throw new Error(`unresolvable header $ref ${$ref}`);
    const value = response.headers.get(name);
    if (value === null) {
      if (header.required) errors.push(`header ${name}: missing`);
      continue;
    }
    errors.push(...validate(document, header.schema, value, `header ${name}`));
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const media = documented.content[contentType];
  if (!media) return [...errors, `content-type ${contentType || "(none)"} is not documented for ${response.status}`];
  const body: unknown = await response.json();
  errors.push(...validate(document, media.schema, body));
  // S14 review fix 4: the document types ok as a plain boolean (see its description), so its value
  // is held here: true exactly on a 2xx answer. Every check, in-process or over HTTP, applies it.
  if (typeOf(body) === "object" && (body as { ok?: unknown }).ok !== (response.status >= 200 && response.status < 300)) {
    errors.push(`$.ok: ${JSON.stringify((body as { ok?: unknown }).ok)} on a ${response.status} answer`);
  }
  return errors;
}

// Every documented operation and status, as "GET /path 200", so a check can prove it exercised all.
export function documentedResponses(document: OpenApiDocument): string[] {
  return Object.entries(document.paths).flatMap(([template, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) => Object.keys(operation.responses).map((status) => `${method.toUpperCase()} ${template} ${status}`)),
  );
}
