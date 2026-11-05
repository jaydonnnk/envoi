// S32 scoped secret check. Real needles stay in memory; no credential is planted in any file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { loadLocalEnvFile } from "@/env";

loadLocalEnvFile();
const needles = Object.entries(process.env).filter(([name, value]) => {
  if (!value || value.length < 16 || !/(?:SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL)$/.test(name)) return false;
  if (name.endsWith("DATABASE_URL")) {
    try {
      const url = new URL(value);
      if (["localhost", "127.0.0.1"].includes(url.hostname) && !url.password) return false;
    } catch { /* An unparseable credential value still needs scanning. */ }
  }
  return true;
});
assert(needles.length > 0, "no credential needles were available; no absence claim");
function variants(value: string) {
  const slash = value.replaceAll("\\", "/");
  return [...new Set([value, slash, JSON.stringify(value).slice(1, -1), JSON.stringify(slash).slice(1, -1)])];
}
function detects(text: string, value: string) {
  return variants(value).some((needle) => text.includes(needle));
}
// Checks the actual JSON-escaped surface in memory, including Windows slash variants.
const canary = 'S32-FAKE-CANARY-C:\\fixture\\needle/"value';
for (const [, value] of [...needles, ["FAKE", canary]]) {
  if (!value) throw new Error("empty credential needle");
  assert(detects(JSON.stringify({ fixture: value }), value), "serialized needle self-test failed");
  assert(detects(JSON.stringify({ fixture: value.replaceAll("\\", "/") }), value), "slash needle self-test failed");
  assert(!detects('{"fixture":"negative control"}', value), "negative control failed");
}
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((path) =>
  path.startsWith("docs/plans/envoi/evidence/s32-") || ["PROGRESS.md", "docs/plans/envoi/00-status.md", "src/integrations/assistant/agent.ts", "tests/unit/s32-language-eval.test.ts", "tests/integration/s32-language-eval.test.ts"].includes(path),
).filter((path) => !path.endsWith("s32-secret-scan.json"));
const hits: { name: string; path: string }[] = [];
for (const path of paths) {
  const text = readFileSync(path, "utf8");
  for (const [name, value] of needles) if (value && detects(text, value)) hits.push({ name, path });
}
const result = { label: "S32 scoped credential-value scan; actual credentials remain only in memory; serialized planted self-tests never written", ranAt: new Date().toISOString(), surfaceFiles: paths.length, credentialNeedles: needles.length, positiveSelfTests: (needles.length + 1) * 2, negativeControls: needles.length + 1, hits };
writeFileSync("docs/plans/envoi/evidence/s32-secret-scan.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ surfaceFiles: result.surfaceFiles, credentialNeedles: result.credentialNeedles, selfTestsPassed: true, hits: hits.length }));
assert.equal(hits.length, 0, "credential value detected; see variable name and path in sanitized report");
