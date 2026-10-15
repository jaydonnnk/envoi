import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// S11: static checks over the import route sources and the repository root; no database.

const ROOT = join(import.meta.dirname, "..", "..");
const IMPORT_PATH = "/api/v1/merchant/outlets/out_fixture/menu-imports";

// Next.js matcher patterns as the proxy config writes them: ":name*" matches any rest of the path,
// ":name" one segment, and a pattern beginning "/((?!" is a negative lookahead catch-all.
function matcherCovers(pattern: string, path: string): boolean {
  if (pattern.startsWith("/((?!")) return true;
  const source = pattern
    .split("/")
    .map((segment) => (segment.endsWith("*") && segment.startsWith(":") ? "(?:/.*)?" : segment.startsWith(":") ? "/[^/]+" : segment === "" ? "" : `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
    .join("");
  return new RegExp(`^${source || "/"}$`).test(path);
}

function proxyMatchers(file: string): string[] | "everything" {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  let matchers: string[] | "everything" = "everything";
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText() !== "config" || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || property.name.getText() !== "matcher") continue;
        const value = property.initializer;
        if (ts.isStringLiteral(value)) matchers = [value.text];
        else if (ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteral)) matchers = value.elements.map((element) => (element as ts.StringLiteral).text);
      }
    }
  });
  return matchers;
}

function firstStatementOf(file: string, method: string): string {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === method && node.body) return node.body.statements[0]?.getText() ?? "";
  }
  throw new Error(`${file} has no ${method} handler`);
}

describe("import route static checks", () => {
  it("no proxy matcher covers the import route", () => {
    for (const name of ["src/proxy.ts", "src/middleware.ts", "middleware.ts", "proxy.ts"]) {
      const file = join(ROOT, name);
      if (!existsSync(file)) continue;
      const matchers = proxyMatchers(file);
      // A proxy without a readable matcher list runs on every path, the import route included.
      expect(matchers, `${name} has no matcher list`).not.toBe("everything");
      for (const pattern of matchers as string[]) expect(matcherCovers(pattern, IMPORT_PATH), `${name} matcher ${pattern}`).toBe(false);
    }
    // The checker itself recognizes a catch-all, a prefix and a rest pattern.
    expect(matcherCovers("/((?!_next).*)", IMPORT_PATH)).toBe(true);
    expect(matcherCovers("/api/:path*", IMPORT_PATH)).toBe(true);
    expect(matcherCovers("/operator/:path*", IMPORT_PATH)).toBe(false);
  });

  it("menu-import handler begins with its membership guard", () => {
    expect(firstStatementOf("src/app/api/v1/merchant/outlets/[id]/menu-imports/route.ts", "POST")).toMatch(/^const principal = await requireOutletMembership\(/);
  });

  it("menu-draft handler begins with its membership guard", () => {
    expect(firstStatementOf("src/app/api/v1/merchant/outlets/[id]/menu-draft/route.ts", "GET")).toMatch(/^const principal = await requireOutletMembership\(/);
  });
});
