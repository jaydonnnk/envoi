#!/usr/bin/env python3
"""S41 mutation runner.

Proves each S41 guard fails under its own mutation, on an AssertionError, and that every mutated file
is restored byte-identical. Definitions are in s41-mutation-defs.json beside this file; the result is
written to s41-mutations.json.

Run from the repository root:  python3 docs/plans/envoi/evidence/s41-mutate.py

An optional first argument names another definitions file beside this one, so a second set of guards
can be proved without overwriting the first set's recorded result. That file may carry its own
"label", "output" and "greenRerun" keys; without them the defaults below apply unchanged.
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DEFS_PATH = HERE / (sys.argv[1] if len(sys.argv) > 1 else "s41-mutation-defs.json")
DEFS = json.loads(DEFS_PATH.read_text())
OUT_PATH = HERE / DEFS.get("output", "s41-mutations.json")
LABEL = DEFS.get("label", "S41 guard mutations; FIXTURE model boundary for the prompt guard, no real model call")
GREEN_RERUN = DEFS.get(
    "greenRerun",
    [
        {"project": "unit", "test": "tests/unit/landing-page.test.ts"},
        {"project": "unit", "test": "tests/unit/placeholder-examples.test.ts"},
        {"project": "integration", "test": "tests/integration/buyer-suggestions.test.ts"},
    ],
)

LOCAL_TEST_DB = "postgres://postgres@127.0.0.1:5432/envoi_test"
NEON_NAMES = ("DATABASE_URL", "MIGRATION_DATABASE_URL", "MAINTENANCE_DATABASE_URL")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def env_for(project: str) -> dict:
    env = dict(os.environ)
    env["PATH"] = f"{os.path.expanduser('~/.local/node/bin')}:{os.path.expanduser('~/.local/bin')}:{env.get('PATH', '')}"
    for name in NEON_NAMES:
        env.pop(name, None)
    if project == "integration":
        env["TEST_DATABASE_URL"] = LOCAL_TEST_DB
    return env


def run_tests(project: str, test_file: str) -> tuple[int, list[dict], str]:
    """Returns (exit code, failed assertions, raw output)."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as handle:
        report = handle.name
    command = [
        "npx", "vitest", "run", "--config", "config/vitest.config.ts",
        "--project", project, test_file, "--reporter=json", f"--outputFile={report}",
    ]
    done = subprocess.run(command, cwd=ROOT, env=env_for(project), capture_output=True, text=True)
    raw = done.stdout + done.stderr
    failures: list[dict] = []
    try:
        data = json.loads(Path(report).read_text())
        for suite in data.get("testResults", []):
            for assertion in suite.get("assertionResults", []):
                if assertion.get("status") == "failed":
                    failures.append({
                        "title": assertion.get("title", ""),
                        "messages": assertion.get("failureMessages", []),
                    })
    except (OSError, json.JSONDecodeError):
        pass
    finally:
        Path(report).unlink(missing_ok=True)
    return done.returncode, failures, raw


def main() -> int:
    results = []
    restored_ok = True
    for mutation in DEFS["mutations"]:
        target = ROOT / mutation["file"]
        before = sha(target)
        original = target.read_text()
        find = mutation["find"]
        if original.count(find) != 1:
            results.append({**{k: mutation[k] for k in ("id", "guard", "file")},
                            "proved": False, "reason": f"target appears {original.count(find)} times, expected 1"})
            continue
        target.write_text(original.replace(find, mutation["replace"], 1))
        try:
            code, failures, raw = run_tests(mutation["project"], mutation["test"])
        finally:
            target.write_text(original)
        after = sha(target)
        byte_identical = after == before
        restored_ok = restored_ok and byte_identical

        guard = mutation["guard"]
        needle = mutation["needle"]
        matched = [f for f in failures if f["title"] == guard]
        assertion_error = any("AssertionError" in message for f in matched for message in f["messages"])
        needle_hit = any(needle in message for f in matched for message in f["messages"]) or (needle == guard and bool(matched))
        proved = code != 0 and bool(matched) and assertion_error and needle_hit and byte_identical
        results.append({
            "id": mutation["id"],
            "guard": guard,
            "needle": needle,
            "file": mutation["file"],
            "test": mutation["test"],
            "exitCode": code,
            "failedAssertions": [f["title"] for f in failures],
            "assertionError": assertion_error,
            "needleFound": needle_hit,
            "restoredByteIdentical": byte_identical,
            "proved": proved,
        })
        print(f"{'PROVED ' if proved else 'FAILED '}{mutation['id']} {guard[:60]} "
              f"(exit {code}, assertions {len(failures)}, AssertionError {assertion_error}, "
              f"needle {needle_hit}, restored {byte_identical})", flush=True)

    green = {}
    for entry in GREEN_RERUN:
        project, test_file = entry["project"], entry["test"]
        code, failures, _ = run_tests(project, test_file)
        green[test_file] = {"exitCode": code, "failedAssertions": [f["title"] for f in failures]}
        print(f"{'GREEN  ' if code == 0 else 'RED    '}{test_file}", flush=True)

    proved = sum(1 for row in results if row.get("proved"))
    out = {
        "label": LABEL,
        "ranAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(results),
        "proved": proved,
        "allRestoredByteIdentical": restored_ok,
        "greenAfterRestore": green,
        "mutations": results,
    }
    OUT_PATH.write_text(json.dumps(out, indent=1) + "\n")
    print(f"\nproved {proved} of {len(results)}; restored byte-identical: {restored_ok}")
    return 0 if proved == len(results) and restored_ok and all(g["exitCode"] == 0 for g in green.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
