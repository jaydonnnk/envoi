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
  return JSON.parse(readFileSync(path, "utf8")) as OpenApiDocument;
}

const KNOWN = new Set(["$ref", "type", "enum", "required", "properties", "additionalProperties", "items", "pattern", "minimum", "description"]);

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
  errors.push(...validate(document, media.schema, await response.json()));
  return errors;
}

// Every documented operation and status, as "GET /path 200", so a check can prove it exercised all.
export function documentedResponses(document: OpenApiDocument): string[] {
  return Object.entries(document.paths).flatMap(([template, methods]) =>
    Object.entries(methods).flatMap(([method, operation]) => Object.keys(operation.responses).map((status) => `${method.toUpperCase()} ${template} ${status}`)),
  );
}
