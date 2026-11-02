"""Rerunnable S27 MCP guard proofs. Never uses external accounts or local env files."""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[4]
UNIT = "tests/unit/envoi-mcp.test.ts"
CLIENT = "src/integrations/assistant/envoi-mcp.ts"
CONTRACTS = "src/integrations/mcp/contracts.ts"
MUTATIONS = [
    ("s27-36-positive-price", CONTRACTS, "z.number().int().min(1).nullable()", "z.number().int().nullable()", UNIT, "accepts unknown prices, refuses zero and fractional prices"),
    ("s27-36-integer-price", CONTRACTS, "z.number().int().min(1).nullable()", "z.number().min(1).nullable()", UNIT, "accepts unknown prices, refuses zero and fractional prices"),
    ("s27-36-outlet-currency", CONTRACTS, "menu.outlet.currency === menu.currency && ", "", UNIT, "rejects outlet currency mismatch"),
    ("review-notification-deadline", CLIENT, "signal: activeSignal", "signal: init?.signal", UNIT, "an aborted turn also stops the initialized notification"),
    ("review-envelope-error", CLIENT, "error instanceof z.core.$ZodError || ", "", UNIT, "a malformed MCP envelope is invalid_answer"),
    ("s25-fetch", "src/integrations/assistant/tools.ts", 'import { tool } from "ai";', 'import { tool } from "ai";\nfunction fixtureDirectFetch() { return fetch("https://fixture.invalid"); }', "tests/unit/assistant.test.ts", "the assistant reaches Envoi only through the MCP client"),
    ("s25-http-import", "src/integrations/assistant/tools.ts", 'import { tool } from "ai";', 'import { tool } from "ai";\nimport "node:http";', "tests/unit/assistant.test.ts", "the assistant reaches Envoi only through the MCP client"),
    ("s20-fetch", "src/integrations/assistant/tools.ts", 'import { tool } from "ai";', 'import { tool } from "ai";\nfunction fixtureDirectFetch() { return fetch("https://fixture.invalid"); }', "tests/unit/buyer-agent.test.ts", "agent tools call only the MCP client"),
    ("s20-http-import", "src/integrations/assistant/tools.ts", 'import { tool } from "ai";', 'import { tool } from "ai";\nimport "node:http";', "tests/unit/buyer-agent.test.ts", "agent tools call only the MCP client"),
    *[("s27-17-" + name.replace(" ", "-"), CLIENT, "const parsed = outputSchemas[tool].safeParse(result.structuredContent);", "const parsed = { success: true, data: result.structuredContent };", UNIT, "currency > " + name) for name in ["missing currency", "string price", "item currency mismatch"]],
    ("s27-36-eur", CONTRACTS, 'const currency = z.enum(["SGD", "USD"]);', 'const currency = z.enum(["SGD", "USD", "EUR"]);', UNIT, "rejects EUR currency"),
    ("s27-36-item-currency", "src/app/mcp/route.ts", "unitMinor: item.unitMinor, currency: menu.currency,", 'unitMinor: item.unitMinor, currency: "SGD",', "tests/integration/us-shops.test.ts", "every MCP tool answer matches its output schema"),
    ("s27-36-string-price", CONTRACTS, "unitMinor: z.number().int().min(1).nullable(),", "unitMinor: z.union([z.string(), z.number().int().min(1)]).nullable(),", UNIT, "MCP output contracts > rejects a string price"),
    ("s27-36-missing-url", CONTRACTS, "url: z.string().url(),", "url: z.string().url().optional(),", UNIT, "requires the purchase url"),
    ("s27-36-refine", CONTRACTS, '.refine((menu) => menu.outlet.currency === menu.currency && menu.items.every((item) => item.currency === menu.currency), "Every menu price must use the menu currency")', "", UNIT, "MCP output contracts > rejects item currency mismatch"),
    ("s27-36-structured", "src/app/mcp/route.ts", ", structuredContent: value", "", "tests/integration/us-shops.test.ts", "every MCP tool answer matches its output schema"),
]

def run(file, test, log):
    env = {key: value for key, value in os.environ.items() if key not in ("DATABASE_URL", "MIGRATION_DATABASE_URL", "MAINTENANCE_DATABASE_URL")}
    env["TEST_DATABASE_URL"] = "postgres://postgres@127.0.0.1:5432/envoi_test"
    with log.open("w") as output:
        result = subprocess.run([str(ROOT / "node_modules/.bin/vitest"), "run", "--config", "config/vitest.config.ts", file, "-t", test], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=90)
    text = log.read_text()
    return result.returncode, "AssertionError" in text, "No test files found" not in text and re.search(r"Tests\s+[1-9]\d* (?:passed|failed)", text) is not None

selected = set(sys.argv[1:])
logs = Path(tempfile.mkdtemp(prefix="envoi-mcp-mutations-"))
results = []
for name, file, old, new, testfile, test in MUTATIONS:
    if selected and name not in selected:
        continue
    path = ROOT / file
    original = path.read_bytes()
    assert original.decode().count(old) == 1, (name, "anchor count")
    before, _, ran = run(testfile, test, logs / f"{name}-baseline.log")
    assert before == 0 and ran, (name, "baseline failed or no tests ran")
    try:
        path.write_text(original.decode().replace(old, new))
        code, assertion, ran = run(testfile, test, logs / f"{name}-mutant.log")
    finally:
        path.write_bytes(original)
    restored = path.read_bytes() == original
    rerun, _, reran = run(testfile, test, logs / f"{name}-restored.log")
    passed = code != 0 and assertion and ran and restored and rerun == 0 and reran
    row = {"id": name, "file": file, "test": test, "baseline": before, "mutant": code, "assertionError": assertion, "byteIdenticalRestore": restored, "restoredRerun": rerun, "sha256": hashlib.sha256(original).hexdigest(), "pass": passed}
    results.append(row)
    print(f"{name}: {'PASS' if passed else 'FAIL'}", flush=True)
    if not passed:
        break
report = Path(__file__).with_name("s27-mcp-mutations.json")
report.write_text(json.dumps({"date": "2026-11-02", "boundary": "local fixture calls only", "results": results}, indent=2) + "\n")
print(f"Logs: {logs}")
sys.exit(0 if results and all(row["pass"] for row in results) else 1)
