import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDocument } from "../support/openapi";

// S19: the APIMatic-generated client in clients/typescript, regenerated from openapi/envoi-public.yaml,
// must hold no operation that reaches a receipt or payment route. Its validation is structural only
// (value rules such as a price's minimum are Envoi's to enforce), so Gate 3's test 2 was retired.
const SOURCE = join(process.cwd(), "clients/typescript/src");

// Every operation the client can send, read from the generated source: each execute() call carries
// one urlTemplate built from a literal path.
function operationPaths(): string[] {
  const files = readdirSync(SOURCE, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
  const paths: string[] = [];
  let executes = 0;
  for (const file of files) {
    const text = readFileSync(join(SOURCE, file), "utf8");
    executes += text.match(/#rawClient\.execute\(/g)?.length ?? 0;
    for (const match of text.matchAll(/urlTemplate:\s*this\.#servers\.\w+\("([^"]+)"\)/g)) paths.push(match[1]!);
  }
  // An operation whose path this pattern cannot read would otherwise go unchecked.
  expect(paths.length).toBe(executes);
  return paths;
}

describe("generated client", () => {
  it("generated client reaches no receipt or payment route", () => {
    const paths = operationPaths();
    // Whole path segments are compared, so /api/v1/purchase-requests is not taken for /api/v1/purchases.
    const underPurchases = paths.filter((path) => path.split("/").includes("purchases"));
    expect(underPurchases).toEqual([]);
    // The client covers exactly the documented operations, the agent's purchase request route included.
    expect([...paths].sort()).toEqual(Object.keys(loadDocument().paths).sort());
  });
});
