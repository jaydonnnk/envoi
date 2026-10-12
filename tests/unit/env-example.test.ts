import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENV_NAMES } from "@/env";

describe(".env.example lists exactly the names src/env.ts reads", () => {
  it("has the same names and no values", () => {
    const text = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const entries = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    expect(entries.every((line) => /^[A-Z][A-Z0-9_]*=$/.test(line))).toBe(true);
    expect(entries.map((line) => line.slice(0, -1)).sort()).toEqual([...ENV_NAMES].sort());
  });
});
