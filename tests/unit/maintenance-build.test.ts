import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRunner, RUNNER_ENTRIES, runtimeGraph, type RunnerBuild } from "../support/runner-build";

// Gate 3 "maintenance cannot capture": the compiled maintenance runner, built by its own tsconfig,
// loads no module that can create or capture a PayPal order, and no module it loads names the
// capture endpoint. The capture module is src/integrations/paypal/orders.ts.
const CAPTURE_MODULE = "src/integrations/paypal/orders.js";
const CAPTURE_ENDPOINT = /\/capture\b/;

describe("maintenance runner build graph", () => {
  let build: RunnerBuild;

  beforeAll(async () => {
    build = await buildRunner("graph");
  }, 120_000);

  afterAll(() => {
    build?.remove();
  });

  it("maintenance cannot capture", () => {
    const graph = runtimeGraph(build.outDir, RUNNER_ENTRIES);
    // The build-graph evidence: every module and package the runner loads.
    console.log(`runner runtime graph: ${graph.modules.length} modules\n  ${graph.modules.join("\n  ")}\npackages: ${graph.packages.join(", ")}`);

    // The walk is real: it reaches the read-only client and reconciliation.
    expect(graph.modules).toContain("src/integrations/paypal/orders-read.js");
    expect(graph.modules).toContain("src/domain/payments/attempts.js");

    expect(graph.modules).not.toContain(CAPTURE_MODULE);
    const naming = graph.modules.filter((module) => CAPTURE_ENDPOINT.test(readFileSync(join(build.outDir, module), "utf8")));
    expect(naming).toEqual([]);
  });

  it("the build-graph check finds the capture module and endpoint when a runner module loads them", () => {
    // Self-test of the scanner on the real build: a probe that imports the capture module, as a
    // runner module would, is reported, and the capture module itself names the endpoint.
    writeFileSync(join(build.outDir, "src/maintenance/probe.js"), 'import { paypalWriteClient } from "@/integrations/paypal/orders";\nexport const probe = paypalWriteClient;\n');
    const graph = runtimeGraph(build.outDir, ["src/maintenance/probe.js"]);
    expect(graph.modules).toContain(CAPTURE_MODULE);
    expect(CAPTURE_ENDPOINT.test(readFileSync(join(build.outDir, CAPTURE_MODULE), "utf8"))).toBe(true);
  });
});
