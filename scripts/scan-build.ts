// S16 review fixes, F5: scans the real `next build` output for a Solana send method name, which
// Gate 3's "server never sends a transaction" forbids in the built server bundles. The unit test of
// that name scans an esbuild bundle as a proxy; CI runs this on the webpack build Render deploys.
//   npx tsx scripts/scan-build.ts [.next]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const SEND_METHOD = /\b(sendTransaction|sendRawTransaction|requestAirdrop)\b/g;
// Both the server and the browser output; source maps hold source text, not shipped code.
export const BUILD_ROOTS = ["server", "static"];
// The RPC client's own method name: its presence shows the scan reached the Solana code.
const RPC_MARKER = "getTransaction";

export type BuildScan = { files: number; reachedRpc: boolean; hits: { file: string; name: string }[] };

function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return /\.(c|m)?js$/.test(entry.name) ? [path] : [];
  });
}

export function scanBuild(nextDir: string): BuildScan {
  const scan: BuildScan = { files: 0, reachedRpc: false, hits: [] };
  for (const root of BUILD_ROOTS) {
    for (const file of jsFiles(join(nextDir, root))) {
      const text = readFileSync(file, "utf8");
      scan.files += 1;
      if (root === "server" && text.includes(RPC_MARKER)) scan.reachedRpc = true;
      for (const match of text.matchAll(SEND_METHOD)) scan.hits.push({ file: relative(nextDir, file), name: match[1]! });
    }
  }
  return scan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nextDir = process.argv[2] ?? ".next";
  const scan = scanBuild(nextDir);
  if (scan.files === 0 || !scan.reachedRpc) {
    console.error(`scan-build: ${nextDir} has no built server code with the Solana RPC client (${scan.files} files); run npm run build first.`);
    process.exit(1);
  }
  if (scan.hits.length > 0) {
    for (const hit of scan.hits) console.error(`scan-build: ${hit.name} in ${hit.file}`);
    process.exit(1);
  }
  console.log(`scan-build: no send method name in ${scan.files} built files.`);
}
