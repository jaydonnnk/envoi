import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

// Builds the maintenance runner with its own tsconfig into a fresh directory inside the repository's
// ignored .maintenance-build, so its bare imports still resolve from node_modules, and walks the
// runtime import graph of the emitted JavaScript. Type-only imports are erased by the compiler, so
// they are not edges: what this walks is what Node would load.

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

export type RunnerBuild = { outDir: string; remove: () => void };

export async function buildRunner(label: string): Promise<RunnerBuild> {
  const outDir = join(REPO_ROOT, ".maintenance-build", `test-${label}-${randomBytes(4).toString("hex")}`);
  const tsc = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
  await promisify(execFile)(process.execPath, [tsc, "-p", join(REPO_ROOT, "tsconfig.runner.json"), "--outDir", outDir], { cwd: REPO_ROOT });
  return { outDir, remove: () => rmSync(outDir, { recursive: true, force: true }) };
}

const IMPORT = /\b(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

// Every specifier a module loads at runtime: static imports and re-exports, side-effect imports and
// dynamic imports with a literal specifier.
export function specifiersOf(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((match) => (match[1] ?? match[2])!);
}

// The same mapping as src/maintenance/resolve-hook.ts: "@/x" is the built src/x.js, and an
// extensionless relative import gains ".js". Bare packages are reported, not followed.
function resolveSpecifier(outDir: string, fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return join(outDir, "src", `${specifier.slice(2)}.js`);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = resolve(dirname(fromFile), specifier);
    return /\.[cm]?js$/.test(target) ? target : `${target}.js`;
  }
  return null;
}

export type RuntimeGraph = { modules: string[]; packages: string[] };

// Modules are repository-relative paths inside the build, such as "src/lib/time.js".
export function runtimeGraph(outDir: string, entries: readonly string[]): RuntimeGraph {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = entries.map((entry) => join(outDir, entry));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`runner build imports a missing module: ${relative(outDir, file)}`);
    seen.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(outDir, file, specifier);
      if (target) queue.push(target);
      else packages.add(specifier);
    }
  }
  return { modules: [...seen].map((file) => relative(outDir, file)).sort(), packages: [...packages].sort() };
}

export const RUNNER_ENTRIES = ["src/maintenance/resolve-hook.js", "src/maintenance/run.js"] as const;
