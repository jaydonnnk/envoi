import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type HistoryScan, scanHistory } from "../../scripts/scan-history";

// Needles are assembled at run time so this file never carries one literally.
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const keypair = Buffer.concat([seed, publicKey.export({ format: "der", type: "spki" }).subarray(-32)]);
// Same length as a keypair and a signature, but the halves do not match: never reported.
const notKeypair = Buffer.concat([seed, randomBytes(32)]);

const walletAddress = base58(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
// A slash and a plus make the URL-encoded form differ from the raw value.
const envSecret = ["fixture", "Env/Value+", "7c1e"].join("");
const envPassword = ["fixture", "Pass", "word", "41"].join("");
const scheme = ["postgresql", ":"].join("");
const host = "ep-fixture.example.invalid";
const openAi = ["sk", "proj", "fixtureNeedle0123456789abcd"].join("-");
const github = ["ghp", "_", "A".repeat(36)].join("");
const neon = ["napi", "_", "a".repeat(48)].join("");
const pemHeader = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const jwt = ["eyJ", "hbGciOiJIUzI1", ".eyJ", "zdWIiOiIxMjM0", ".", "fixtureSignature0"].join("");

const PLANTED: ReadonlyArray<{ file: string; content: string; rule: string }> = [
  { file: "keypair.json", content: `${JSON.stringify([...keypair])}\n`, rule: "solana-keypair-array" },
  { file: "keypair-b58.txt", content: `key ${base58(keypair)}\n`, rule: "solana-keypair-base58" },
  { file: "keypair-b64.txt", content: `key ${keypair.toString("base64")}\n`, rule: "solana-keypair-base64" },
  { file: "env-raw.txt", content: `value=${envSecret}\n`, rule: "env-local-value:PLANTED_VALUE" },
  { file: "env-encoded.txt", content: `value=${encodeURIComponent(envSecret)}\n`, rule: "env-local-value:PLANTED_VALUE" },
  { file: "env-b64.txt", content: `value=${Buffer.from(envSecret).toString("base64")}\n`, rule: "env-local-value:PLANTED_VALUE" },
  { file: "env-password.txt", content: `password ${envPassword} ok\n`, rule: "env-local-value:PLANTED_URL" },
  // A name reviewed as public keeps that class only while its value has the public shape.
  { file: "wallet.txt", content: `merchant ${walletAddress}\n`, rule: "env-local-public:ENVOI_MERCHANT" },
  { file: "wallet-secret.txt", content: `buyer ${base58(notKeypair)}x\n`, rule: "env-local-value:ENVOI_BUYER" },
  { file: "conn.txt", content: `url=${scheme}//planted:${envPassword}x@${host}/db\n`, rule: "connection-string" },
  { file: "openai.txt", content: `key=${openAi}\n`, rule: "openai-key" },
  { file: "github.txt", content: `token=${github}\n`, rule: "github-token" },
  { file: "neon.txt", content: `key=${neon}\n`, rule: "neon-api-key" },
  { file: "pem.txt", content: `${pemHeader}\n`, rule: "private-key-block" },
  { file: "jwt.txt", content: `t=${jwt}\n`, rule: "jwt" },
  { file: "config/.env.production", content: "A=1\n", rule: "forbidden-path" },
];

describe("history secret scan self-test", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "envoi-history-scan-"));
  let scan: HistoryScan;
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  // Every needle sits in a commit that a later commit deletes, so only a history scan can find it.
  beforeAll(() => {
    const run = (...args: string[]) => execFileSync("git", ["-C", sandbox, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args]);
    run("init", "-q");
    writeFileSync(join(sandbox, ".env.local"), `PLANTED_VALUE=${envSecret}\nPLANTED_URL=${scheme}//u:${envPassword}@${host}/db\nENVOI_MERCHANT=${walletAddress}\nENVOI_BUYER=${base58(notKeypair)}x\n`);
    mkdirSync(join(sandbox, "config"));
    for (const { file, content } of PLANTED) writeFileSync(join(sandbox, file), content);
    writeFileSync(join(sandbox, "signature.txt"), `${JSON.stringify([...notKeypair])}\n${base58(notKeypair)}\n${notKeypair.toString("base64")}\n`);
    writeFileSync(join(sandbox, "clean.txt"), "TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/envoi_test\n");
    run("add", "--all", "--", ".", ":!.env.local");
    run("commit", "-q", "-m", "planted");
    for (const { file } of PLANTED) unlinkSync(join(sandbox, file));
    run("add", "--all", "--", ".", ":!.env.local");
    run("commit", "-q", "-m", `removed, but this message carries ${openAi}`);
    scan = scanHistory(sandbox);
  });

  it.each(PLANTED)("finds $rule in deleted $file", ({ file, rule }) => {
    expect(scan.findings.filter((f) => f.path === file).map((f) => f.rule)).toContain(rule);
  });

  it("finds a needle in a commit message", () => {
    expect(scan.findings.filter((f) => f.path === "(message)").map((f) => f.rule)).toEqual(["openai-key"]);
  });

  it("reports a ref the remote advertises that is missing locally", () => {
    const remote = join(sandbox, "..", `${sandbox.split("/").pop()}-remote.git`);
    const other = join(sandbox, "..", `${sandbox.split("/").pop()}-other`);
    try {
      execFileSync("git", ["init", "-q", "--bare", remote]);
      execFileSync("git", ["-C", sandbox, "push", "-q", remote, "HEAD:refs/heads/main"]);
      execFileSync("git", ["clone", "-q", remote, other]);
      execFileSync("git", ["-C", other, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "remote only"]);
      execFileSync("git", ["-C", other, "push", "-q", "origin", "HEAD:refs/heads/remote-only"]);
      expect(scanHistory(sandbox, { remote, env: false }).missingRemoteRefs).toHaveLength(1);
    } finally {
      rmSync(remote, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("reports nothing for a 64-byte value that is not a keypair, or for a password-less local URL", () => {
    expect(scan.findings.filter((f) => f.path === "signature.txt" || f.path === "clean.txt")).toEqual([]);
  });
});
