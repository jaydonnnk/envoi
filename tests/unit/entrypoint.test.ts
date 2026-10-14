import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { isEntrypoint } from "@/lib/entrypoint";
import { REPO_ROOT } from "../support/runner-build";

// Scripts run only when started as the main module. Node gives that module its real path,
// percent-encoded, so a start through a symlink or a directory with a space must still match.
describe("script entrypoints", () => {
  const dir = mkdtempSync(join(tmpdir(), "envoi entry "));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("a script started through a symlink in a path with a space is its own entrypoint", () => {
    const script = join(dir, "script.js");
    const other = join(dir, "other.js");
    writeFileSync(script, "");
    writeFileSync(other, "");
    const link = join(dir, "linked script.js");
    symlinkSync(script, link);
    // What Node sets as the main module's import.meta.url.
    const moduleUrl = pathToFileURL(realpathSync(script)).href;
    expect(moduleUrl).toContain("%20");
    expect(isEntrypoint(moduleUrl, script)).toBe(true);
    expect(isEntrypoint(moduleUrl, link)).toBe(true);
    expect(isEntrypoint(moduleUrl, other)).toBe(false);
    expect(isEntrypoint(moduleUrl, join(dir, "missing.js"))).toBe(false);
    expect(isEntrypoint(moduleUrl, undefined)).toBe(false);
  });

  it("every script decides it is the entrypoint through isEntrypoint", () => {
    const sources = (readdirSync(join(REPO_ROOT, "src"), { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => join(REPO_ROOT, "src", file));
    const comparing = sources.filter((file) => /process\.argv\[1\]|import\.meta\.url\s*===/.test(readFileSync(file, "utf8"))).map((file) => relative(REPO_ROOT, file));
    expect(comparing).toEqual(["src/lib/entrypoint.ts"]);
    const callers = sources.filter((file) => readFileSync(file, "utf8").includes("isEntrypoint(import.meta.url)")).map((file) => relative(REPO_ROOT, file)).sort();
    expect(callers).toEqual(["src/lib/db/migrate.ts", "src/maintenance/run.ts", "src/operator/cli.ts"]);
  });
});
