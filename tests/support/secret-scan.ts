import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Scans the surface a commit would carry: tracked files plus untracked files that are not ignored.

export type Rule = { id: string; pattern: RegExp; skip?: (path: string) => boolean };
export type Finding = { file: string; rule: string; line: number };

// Gate documents and AGENTS.md record the historical Windows and macOS checkout paths on purpose.
const HISTORICAL_RECORD = (path: string) => path.startsWith("docs/plans/") || path === "AGENTS.md";

// A separator is a slash, a backslash, or a JSON-escaped backslash or slash.
const SEP = String.raw`(?:\\\\|\\\/|\\|\/)`;

export const RULES: readonly Rule[] = [
  {
    id: "connection-string",
    // scheme://user:password@ — a URL with no password, such as the local test URL, is not a secret.
    pattern: new RegExp(String.raw`postgres(?:ql)?:${SEP}{2}[^\s:@/\\"']+:[^\s@/\\"']+@`, "i"),
  },
  {
    id: "bearer-value",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/,
  },
  {
    id: "windows-user-path",
    pattern: new RegExp(String.raw`\b[A-Za-z]:${SEP}+(?:Users|Documents and Settings)${SEP}+[^\\/\s"':]+`, "i"),
    skip: HISTORICAL_RECORD,
  },
  {
    id: "macos-home-path",
    pattern: new RegExp(String.raw`${SEP}Users${SEP}+[A-Za-z0-9._-]+${SEP}`),
    skip: HISTORICAL_RECORD,
  },
];

export function surfaceFiles(repoDir: string): string[] {
  const out = execFileSync("git", ["-C", repoDir, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split("\0").filter(Boolean))].sort();
}

export function scanText(path: string, text: string, rules: readonly Rule[] = RULES): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (rule.skip?.(path)) continue;
    const lines = text.split("\n");
    lines.forEach((content, index) => {
      if (rule.pattern.test(content)) findings.push({ file: path, rule: rule.id, line: index + 1 });
    });
  }
  return findings;
}

export function scanSurface(repoDir: string, rules: readonly Rule[] = RULES): Finding[] {
  const findings: Finding[] = [];
  for (const file of surfaceFiles(repoDir)) {
    let buffer: Buffer;
    try {
      buffer = readFileSync(join(repoDir, file));
    } catch {
      continue; // deleted in the working tree; the deletion carries no content
    }
    if (buffer.subarray(0, 8000).includes(0)) continue; // binary
    findings.push(...scanText(file, buffer.toString("utf8"), rules));
  }
  return findings;
}
