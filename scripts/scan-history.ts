// S15: scans the whole Git history before the repository becomes public. Every blob reachable from
// any local ref or any ref the remote advertises, and every commit and tag message, is checked; a
// finding names the object, path, rule and line, never the matched value.
//   npx tsx scripts/scan-history.ts [repo] [--remote origin] [--no-env]
// Rules: the committed-tree rules of tests/support/secret-scan.ts, generic credential shapes, every
// .env.local value of 12 or more characters (raw, URL-encoded and base64, plus each URL's password),
// Solana keypairs as 64-integer arrays, base58 or base64 (confirmed by the ed25519 layout: the second
// half is the public key of the first), and paths that must never be committed.
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { join } from "node:path";
import { RULES as TREE_RULES } from "../tests/support/secret-scan";
import { loadLocalEnvFile } from "../src/env";

export type HistoryFinding = { object: string; path: string; rule: string; line: number };
export type HistoryScan = {
  blobs: number;
  messages: number;
  refs: number;
  missingRemoteRefs: string[];
  needles: number;
  findings: HistoryFinding[];
};

// Personal paths and public .env.local values are identifiers to review, not secrets; the gate
// documents record them on purpose.
export const isIdentifier = (rule: string) =>
  rule === "windows-user-path" || rule === "macos-home-path" || rule.startsWith("env-local-public:");
const PATH_RULES = new Set(["windows-user-path", "macos-home-path"]);

const PATTERN_RULES: readonly { id: string; pattern: RegExp }[] = [
  ...TREE_RULES.filter((rule) => !PATH_RULES.has(rule.id)).map(({ id, pattern }) => ({ id, pattern })),
  { id: "openai-key", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/ },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { id: "neon-api-key", pattern: /\bnapi_[a-z0-9]{40,}/ },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

// Paths that hold secrets by convention; a blob at such a path is a finding whatever it contains.
const FORBIDDEN_PATH = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]+)?|\.neon|id_(?:rsa|ed25519|ecdsa)|[^/]+\.(?:pem|p12|pfx|key))$/;

const INT_ARRAY = /\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/g;
const BASE58_RUN = /[1-9A-HJ-NP-Za-km-z]{86,90}/g;
const BASE64_RUN = /[A-Za-z0-9+/]{86}==/g;
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(text: string): Buffer | null {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value % 256n));
    value /= 256n;
  }
  for (const char of text) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

// A Solana keypair file is 64 bytes: a 32-byte ed25519 seed followed by its own public key. A
// transaction signature has the same length but not this layout, so it is not reported.
export function isKeypair(bytes: Buffer | null): boolean {
  if (!bytes || bytes.length !== 64) return false;
  try {
    const key = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, bytes.subarray(0, 32)]), format: "der", type: "pkcs8" });
    const publicKey = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32);
    return publicKey.equals(bytes.subarray(32));
  } catch {
    return false;
  }
}

function keypairRules(line: string): string[] {
  const rules = new Set<string>();
  for (const match of line.matchAll(INT_ARRAY)) {
    const numbers = match[0].slice(1, -1).split(",").map((n) => Number(n.trim()));
    if (numbers.every((n) => n <= 255) && isKeypair(Buffer.from(numbers))) rules.add("solana-keypair-array");
  }
  for (const match of line.matchAll(BASE58_RUN)) {
    if (isKeypair(base58Decode(match[0]))) rules.add("solana-keypair-base58");
  }
  for (const match of line.matchAll(BASE64_RUN)) {
    if (isKeypair(Buffer.from(match[0], "base64"))) rules.add("solana-keypair-base64");
  }
  return [...rules];
}

// Every .env.local value long enough to be a credential, in the forms it could be written in.
// .env.local names whose values are public by nature, reviewed on 2026-10-20: two devnet wallet
// addresses and two password-less local URLs. A name here is treated as public only while its value
// still has that shape, so a secret later stored under one of these names is still a secret finding.
const PUBLIC_ENV_SHAPES: Readonly<Record<string, (value: string) => boolean>> = {
  ENVOI_BUYER: (value) => isPublicKey(value),
  ENVOI_MERCHANT: (value) => isPublicKey(value),
  BETTER_AUTH_URL: (value) => isLocalUrlWithoutPassword(value),
  TEST_DATABASE_URL: (value) => isLocalUrlWithoutPassword(value),
};

function isPublicKey(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && base58Decode(value)?.length === 32;
}

function isLocalUrlWithoutPassword(value: string): boolean {
  try {
    const url = new URL(value);
    return url.password === "" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

// Each needle maps to the rule its finding carries, naming the .env.local name it came from.
export function envNeedles(repo: string): Map<string, string> {
  const saved = { ...process.env };
  for (const name of Object.keys(process.env)) delete process.env[name];
  loadLocalEnvFile(join(repo, ".env.local")); // absent: no needles
  const entries = Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length >= 12);
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, saved);
  const needles = new Map<string, string>();
  for (const [name, value] of entries) {
    const rule = PUBLIC_ENV_SHAPES[name]?.(value) ? `env-local-public:${name}` : `env-local-value:${name}`;
    needles.set(value, rule);
    needles.set(encodeURIComponent(value), rule);
    needles.set(Buffer.from(value).toString("base64"), rule);
    try {
      const url = new URL(value);
      if (url.password.length >= 8) {
        needles.set(url.password, rule);
        needles.set(decodeURIComponent(url.password), rule);
      }
    } catch {
      // not a URL
    }
  }
  return needles;
}

export function scanText(object: string, path: string, text: string, needles: ReadonlyMap<string, string>): HistoryFinding[] {
  const findings: HistoryFinding[] = [];
  text.split("\n").forEach((line, index) => {
    const rules = new Set<string>();
    for (const { id, pattern } of PATTERN_RULES) if (pattern.test(line)) rules.add(id);
    for (const rule of TREE_RULES) if (PATH_RULES.has(rule.id) && rule.pattern.test(line)) rules.add(rule.id);
    for (const rule of keypairRules(line)) rules.add(rule);
    for (const [needle, rule] of needles) if (line.includes(needle)) rules.add(rule);
    for (const rule of rules) findings.push({ object, path, rule, line: index + 1 });
  });
  return findings;
}

const git = (repo: string, args: string[], input?: string) =>
  execFileSync("git", ["-C", repo, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });

export function scanHistory(repo: string, options: { remote?: string; env?: boolean } = {}): HistoryScan {
  const needles = options.env === false ? new Map<string, string>() : envNeedles(repo);
  const remoteRefs = options.remote
    ? git(repo, ["ls-remote", options.remote]).toString().trim().split("\n").filter(Boolean).map((line) => line.split("\t")[0]!)
    : [];
  // Only refs present locally can be scanned; any other is reported, never silently skipped.
  const tips = [...new Set(remoteRefs)].filter((sha) => {
    try {
      git(repo, ["cat-file", "-e", `${sha}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  });
  const missingRemoteRefs = [...new Set(remoteRefs)].filter((sha) => !tips.includes(sha));
  const revArgs = ["--all", ...tips];

  // Every blob reachable from any ref, with the first path it was seen under.
  const paths = new Map<string, string>();
  for (const line of git(repo, ["rev-list", "--objects", ...revArgs]).toString().split("\n")) {
    const [sha, ...rest] = line.split(" ");
    if (sha && !paths.has(sha)) paths.set(sha, rest.join(" "));
  }
  const types = git(repo, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], [...paths.keys()].join("\n") + "\n").toString();
  const blobs = types.split("\n").filter((line) => line.endsWith(" blob")).map((line) => line.split(" ")[0]!);

  const findings: HistoryFinding[] = [];
  const contents = git(repo, ["cat-file", "--batch"], blobs.join("\n") + "\n");
  let offset = 0;
  for (const sha of blobs) {
    const headerEnd = contents.indexOf(0x0a, offset);
    const size = Number(contents.subarray(offset, headerEnd).toString().split(" ")[2]);
    const body = contents.subarray(headerEnd + 1, headerEnd + 1 + size);
    offset = headerEnd + 1 + size + 1;
    const path = paths.get(sha) ?? "";
    if (FORBIDDEN_PATH.test(path)) findings.push({ object: sha, path, rule: "forbidden-path", line: 0 });
    if (body.subarray(0, 8000).includes(0)) continue; // binary
    findings.push(...scanText(sha, path, body.toString("utf8"), needles));
  }

  // Commit and annotated tag messages are published with the history too.
  const log = git(repo, ["log", "--format=%H%x00%B%x01", ...revArgs]).toString().split("\x01");
  const tags = git(repo, ["for-each-ref", "--format=%(objectname)%00%(contents)%01", "refs/tags"]).toString().split("\x01");
  const messages = [...log, ...tags].map((entry) => entry.replace(/^\n/, "")).filter(Boolean);
  for (const entry of messages) {
    const [sha, text] = entry.split("\0");
    findings.push(...scanText(sha!, "(message)", text ?? "", needles));
  }

  const refs = git(repo, ["for-each-ref", "--format=%(refname)"]).toString().trim().split("\n").filter(Boolean).length;
  return { blobs: blobs.length, messages: messages.length, refs, missingRemoteRefs, needles: needles.size, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const remoteIndex = args.indexOf("--remote");
  const remote = remoteIndex >= 0 ? args[remoteIndex + 1] : undefined;
  const repo = args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--remote") ?? ".";
  const scan = scanHistory(repo, { remote, env: !args.includes("--no-env") });
  const secrets = scan.findings.filter((f) => !isIdentifier(f.rule));
  const identifiers = scan.findings.filter((f) => isIdentifier(f.rule));
  console.log(`refs ${scan.refs}; blobs ${scan.blobs}; messages ${scan.messages}; env needles ${scan.needles}`);
  console.log(`remote refs missing locally: ${scan.missingRemoteRefs.length}`);
  for (const f of secrets) console.log(`SECRET ${f.rule} ${f.object.slice(0, 12)} ${f.path}:${f.line}`);
  const byPath = new Map<string, number>();
  for (const f of identifiers) byPath.set(`${f.rule} ${f.path}`, (byPath.get(`${f.rule} ${f.path}`) ?? 0) + 1);
  for (const [key, count] of byPath) console.log(`IDENTIFIER ${key} (${count} lines)`);
  console.log(`secret findings ${secrets.length}; identifier findings ${identifiers.length}`);
  process.exitCode = secrets.length > 0 || scan.missingRemoteRefs.length > 0 ? 1 : 0;
}
