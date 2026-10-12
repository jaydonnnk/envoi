import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanSurface } from "../support/secret-scan";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Needles are assembled at run time so this file never carries one literally.
const user = ["plant", "ed"].join("");
const secret = ["fixture", "Needle", "9f3a"].join("");
const host = "ep-fixture.example.invalid";
const winUser = ["Fixture", "User"].join("");
const scheme = ["postgresql", ":"].join("");
const credentials = [user, secret].join(":");
const drive = ["C", ":"].join("");
const bearer = ["Bear", "er"].join("");

const PLANTED: ReadonlyArray<{ file: string; content: string; rule: string }> = [
  { file: "conn.txt", content: `url=${scheme}//${credentials}@${host}/db\n`, rule: "connection-string" },
  { file: "conn-escaped.json", content: `{"url":"${scheme}\\/\\/${credentials}@${host}\\/db"}\n`, rule: "connection-string" },
  { file: "bearer.txt", content: `Authorization: ${bearer} ${secret}${secret}abcdef\n`, rule: "bearer-value" },
  { file: "win-backslash.txt", content: `${drive}\\Users\\${winUser}\\envoi\\src\n`, rule: "windows-user-path" },
  { file: "win-escaped.json", content: `{"path":"${drive}\\\\Users\\\\${winUser}\\\\envoi"}\n`, rule: "windows-user-path" },
  { file: "win-forward.txt", content: `${drive}/Users/${winUser}/envoi/src\n`, rule: "windows-user-path" },
  { file: "mac-home.txt", content: `${["", "Users", winUser, "Desktop"].join("/")}/envoi\n`, rule: "macos-home-path" },
];

describe("no secret reaches the committed tree", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "envoi-secret-scan-"));
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  it("self-test: the scanner detects each planted needle in the staged surface", () => {
    execFileSync("git", ["init", "-q", sandbox]);
    for (const { file, content } of PLANTED) writeFileSync(join(sandbox, file), content);
    writeFileSync(join(sandbox, "clean.txt"), "TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test\n");
    execFileSync("git", ["-C", sandbox, "add", "--all"]);

    const findings = scanSurface(sandbox);
    for (const { file, rule } of PLANTED) {
      expect(findings.filter((finding) => finding.file === file).map((finding) => finding.rule), file).toContain(rule);
    }
    expect(findings.filter((finding) => finding.file === "clean.txt")).toEqual([]);
  });

  it("the repository's committable surface carries no secret or local path", () => {
    expect(scanSurface(repoRoot)).toEqual([]);
  });
});
