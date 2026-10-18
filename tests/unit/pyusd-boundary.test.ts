import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { build } from "esbuild";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildRunner, RUNNER_ENTRIES } from "../support/runner-build";

// S16, Gate 3 group "PYUSD static boundary checks" (7 cases) and the named addition "PYUSD pins build
// together". Static analysis of the source import graph, the route sources and bundles built here;
// no database and no network.

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");
const SOLANA_PACKAGE = /^(@solana\/|@solana-program\/|@wallet-standard\/)/;
const SEND_METHOD = /\b(sendTransaction|sendRawTransaction|requestAirdrop)\b/g;

function resolveSource(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(fromFile), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(candidate) && !candidate.endsWith("/")) return candidate;
  return null;
}

// Runtime imports only: an `import type` or an import whose every name is a type is erased, so it is
// not an edge. Dynamic imports with a literal specifier count.
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause !== undefined && !clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      out.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

// Every module and package the entries load at runtime.
function sourceGraph(entries: string[]): { modules: string[]; packages: string[] } {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of runtimeSpecifiers(file)) {
      const target = resolveSource(file, specifier);
      if (target) queue.push(target);
      else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier);
    }
  }
  return { modules: [...seen].map((file) => relative(ROOT, file)).sort(), packages: [...packages].sort() };
}

const filesUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(ROOT, dir, entry.name)]));

// The PayPal routes and pages, the PayPal integration and the maintenance task reconcile_attempts.
const PAYPAL_ENTRIES = [
  "src/app/api/v1/purchases/[id]/paypal/start/route.ts",
  "src/app/api/v1/purchases/[id]/paypal/complete/route.ts",
  "src/app/api/v1/integrations/paypal/webhook/route.ts",
  "src/app/paypal/return/page.tsx",
  "src/app/paypal/cancel/page.tsx",
  // reconcile_attempts; since S17 tasks.ts also lists reconcile_pyusd_attempts, so the PayPal task has
  // its own module.
  "src/domain/maintenance/paypal-task.ts",
].map((file) => join(ROOT, file));

function solanaReach(graph: { modules: string[]; packages: string[] }): string[] {
  return [...graph.packages.filter((name) => SOLANA_PACKAGE.test(name)), ...graph.modules.filter((file) => file.startsWith("src/integrations/solana/"))];
}

// A tree-shaken bundle of the entries in which only Envoi's own modules and the Solana packages are
// inlined, so what remains of the Solana libraries is exactly what Envoi's code can reach.
async function solanaBundle(entries: string[]): Promise<string> {
  const result = await build({
    entryPoints: entries.map((file) => join(ROOT, file)),
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    treeShaking: true,
    outdir: "bundle",
    logLevel: "silent",
    jsx: "automatic",
    alias: { "@": SRC },
    plugins: [
      {
        name: "inline-only-envoi-and-solana",
        setup(b) {
          b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@/") || SOLANA_PACKAGE.test(args.path) ? undefined : { path: args.path, external: true }));
        },
      },
    ],
  });
  return result.outputFiles.map((file) => file.text).join("\n");
}

const PYUSD_SERVER_ENTRIES = [
  "src/app/api/v1/merchant/outlets/[id]/destinations/pyusd/challenge/route.ts",
  "src/app/api/v1/merchant/outlets/[id]/destinations/pyusd/route.ts",
  "src/app/api/v1/merchant/outlets/[id]/pyusd-rate/route.ts",
  "src/app/api/v1/purchases/[id]/pyusd/prepare/route.ts",
  "src/app/api/v1/purchases/[id]/pyusd/submitted/route.ts",
  "src/app/api/v1/purchases/[id]/reconcile/route.ts",
  "src/app/api/v1/purchases/route.ts",
  "src/app/review/[purchaseId]/page.tsx",
];

function firstStatementOf(file: string, method: string): string {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === method && node.body) return node.body.statements[0]?.getText() ?? "";
  }
  throw new Error(`${file} has no ${method} handler`);
}

function membersOf(file: string, typeName: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName && ts.isTypeLiteralNode(node.type)) return node.type.members.map((member) => member.name?.getText() ?? "");
  }
  throw new Error(`${file} declares no ${typeName}`);
}

describe("PYUSD static boundary checks", () => {
  it("PayPal code imports no Solana module", () => {
    const graph = sourceGraph([...PAYPAL_ENTRIES, ...filesUnder("src/integrations/paypal")]);
    expect(graph.modules).toContain("src/domain/payments/attempts.ts");
    expect(solanaReach(graph)).toEqual([]);
    // The checker sees a Solana module when an entry does load one.
    expect(solanaReach(sourceGraph([join(ROOT, "src/app/api/v1/purchases/[id]/pyusd/prepare/route.ts")]))).toContain("src/integrations/solana/rpc.ts");
  });

  it("server never sends a transaction", async () => {
    expect(membersOf("src/integrations/solana/rpc.ts", "SolanaReadClient").filter((name) => /send|airdrop/i.test(name))).toEqual([]);
    const server = await solanaBundle(PYUSD_SERVER_ENTRIES);
    expect(server).toContain("getTransaction");
    expect(server.match(SEND_METHOD) ?? []).toEqual([]);
    const runner = await buildRunner("s16-send");
    try {
      for (const entry of RUNNER_ENTRIES) expect(existsSync(join(runner.outDir, entry)), entry).toBe(true);
      const text = filesUnder(relative(ROOT, runner.outDir)).map((file) => readFileSync(file, "utf8")).join("\n");
      expect(text.match(SEND_METHOD) ?? []).toEqual([]);
    } finally {
      runner.remove();
    }
  }, 60_000);

  it("wallet challenge handler begins with its membership guard", () => {
    expect(firstStatementOf("src/app/api/v1/merchant/outlets/[id]/destinations/pyusd/challenge/route.ts", "POST")).toMatch(/^const principal = await requireOutletMembership\(/);
  });

  it("wallet proof handler begins with its membership guard", () => {
    expect(firstStatementOf("src/app/api/v1/merchant/outlets/[id]/destinations/pyusd/route.ts", "PUT")).toMatch(/^const principal = await requireOutletMembership\(/);
  });

  it("rate handler begins with its membership guard", () => {
    expect(firstStatementOf("src/app/api/v1/merchant/outlets/[id]/pyusd-rate/route.ts", "PUT")).toMatch(/^const principal = await requireOutletMembership\(/);
  });

  it("preparation handler begins with its buyer guard", () => {
    expect(firstStatementOf("src/app/api/v1/purchases/[id]/pyusd/prepare/route.ts", "POST")).toMatch(/^const principal = await requireBuyerSession\(/);
  });

  it("signature hint handler begins with its buyer guard", () => {
    expect(firstStatementOf("src/app/api/v1/purchases/[id]/pyusd/submitted/route.ts", "POST")).toMatch(/^const principal = await requireBuyerSession\(/);
  });
});

describe("PYUSD pins build together", () => {
  const PINS = {
    "@solana/kit": "8.4.0",
    "@solana-program/token-2022": "0.19.0",
    "@solana-program/memo": "0.15.0",
    "@wallet-standard/app": "1.1.1",
    "@solana/wallet-standard-features": "1.5.0",
  };

  it("the five pins are exact, under typescript 6.0.3, with one @solana/sysvars through @solana/kit 8.4.0", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const [name, version] of Object.entries(PINS)) expect(pkg.dependencies[name], name).toBe(version);
    expect(pkg.devDependencies.typescript).toBe("6.0.3");
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as { packages: Record<string, { version?: string }> };
    for (const [name, version] of Object.entries(PINS)) expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(version);
    expect(lock.packages["node_modules/typescript"]?.version).toBe("6.0.3");
    const sysvars = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/@solana/sysvars"));
    expect(sysvars).toEqual([["node_modules/@solana/sysvars", expect.objectContaining({ version: "8.4.0" })]]);
    const kitDependency = (JSON.parse(readFileSync(join(ROOT, "node_modules/@solana/kit/package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies["@solana/sysvars"];
    expect(kitDependency).toBe("8.4.0");
  });

  it("the PYUSD modules bundle for the browser and for Node", async () => {
    const bundle = async (platform: "browser" | "node", entries: string[]) =>
      build({ entryPoints: entries.map((file) => join(ROOT, file)), bundle: true, write: false, platform, format: "esm", outdir: "b", logLevel: "silent", alias: { "@": SRC }, external: ["node:*"] });
    const browser = await bundle("browser", ["src/lib/wallet/standard.ts", "src/lib/wallet/phantom-browse.ts"]);
    const node = await bundle("node", ["src/integrations/solana/build.ts", "src/integrations/solana/decode.ts", "src/domain/pyusd/verify.ts"]);
    expect(browser.errors).toEqual([]);
    expect(node.errors).toEqual([]);
    expect(browser.outputFiles.length).toBe(2);
    expect(node.outputFiles.length).toBe(3);
  }, 60_000);
});
