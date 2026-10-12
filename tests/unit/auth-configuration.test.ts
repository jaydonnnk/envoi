import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkAuthConfiguration } from "../support/auth-config";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("auth configuration matches the approved gate", () => {
  it("the committed neon.ts keeps Neon managed auth off, as Gate 2 approved", () => {
    expect(checkAuthConfiguration(read("neon.ts"), read("docs/plans/envoi/02-architecture.md"))).toEqual({ ok: true });
  });

  it("refuses auth: true while no Gate 2 amendment is recorded", () => {
    const flipped = 'export default defineConfig({\n  // auth: false,\n  auth: true,\n});\n';
    expect(checkAuthConfiguration(flipped, "No amendment here.")).toEqual({
      ok: false,
      reason: "neon.ts sets auth: true with no recorded Gate 2 amendment",
    });
  });

  it("refuses a neon.ts that does not state auth explicitly", () => {
    expect(checkAuthConfiguration("export default defineConfig({});\n", "")).toMatchObject({ ok: false });
  });
});
