import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanBuild } from "../../scripts/scan-build";

// S16 review fixes, F5: the scanner CI runs on the real `next build` output. Each case plants a
// FIXTURE file in a throwaway .next tree, so the scanner is shown to find its needle where the real
// build puts code, and to ignore what is not shipped code.

describe("built output scan for Solana send methods", () => {
  let dir: string;
  const plant = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const fresh = () => {
    dir = mkdtempSync(join(tmpdir(), "envoi-scan-"));
    plant("server/chunks/rpc.js", 'const m = "getTransaction";');
  };

  it("finds a send method name in the server output", () => {
    fresh();
    plant("server/chunks/123.js", "client.sendTransaction(tx)");
    expect(scanBuild(dir).hits).toEqual([{ file: "server/chunks/123.js", name: "sendTransaction" }]);
  });

  it("finds a send method name in the browser output", () => {
    fresh();
    plant("static/chunks/app/page.js", 'rpc["requestAirdrop"](a)');
    expect(scanBuild(dir).hits).toEqual([{ file: "static/chunks/app/page.js", name: "requestAirdrop" }]);
  });

  it("ignores source maps and reports a clean build as clean", () => {
    fresh();
    plant("server/chunks/123.js.map", '{"sourcesContent":["sendRawTransaction"]}');
    expect(scanBuild(dir)).toEqual({ files: 1, reachedRpc: true, hits: [] });
  });
});
