# S14 review fixes mutation runner: s14-mutate.py with its own definitions and results, plus a
# "command" kind for the guards that are configuration rather than code under a vitest test. Run with:
#   python3 -I docs/plans/envoi/evidence/s14-review-fixes-mutate.py [id ...]
# Run it in a copy of the working tree without .env.local (for example a git archive or rsync copy
# with a cp -cR copy of node_modules), never in a checkout that is building or serving.
# Each definition in s14-review-fixes-mutation-defs.json is applied alone by exact text replacement
# (every old text must occur exactly once, checked before any file is written).
# A vitest definition runs its whole test file with vitest's JSON reporter; its proof needs the named
# row failing on an AssertionError, a byte-identical restore and a passing rerun of the whole file.
# A command definition runs a shell command; its proof needs the command to exit non-zero with the
# needle in its output, the control command (if any) to pass under the same mutation, a byte-identical
# restore and the command passing on rerun. A command proof is an exit status and a message, not an
# AssertionError, and is recorded as such.
# Results go to s14-review-fixes-mutations.json beside this file. DATABASE_URL is removed from the
# environment so nothing can reach Neon.
import hashlib, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
ENV = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
ENV.setdefault("TEST_DATABASE_URL", "postgres://postgres@127.0.0.1:5432/envoi_test")


def run(test_file):
    with tempfile.TemporaryDirectory() as tmp:
        report = os.path.join(tmp, "report.json")
        subprocess.run(["npx", "vitest", "run", test_file, "--reporter=json", f"--outputFile={report}"], cwd=ROOT, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900)
        if not os.path.exists(report):
            return None
        data = json.load(open(report))
    rows = {}
    for suite in data.get("testResults", []):
        for test in suite.get("assertionResults", []):
            message = re.sub(r"\x1b\[[0-9;]*m", "", (test.get("failureMessages") or [""])[0])
            rows[test["title"]] = {"status": test["status"], "group": " > ".join(test.get("ancestorTitles", [])), "error": message.splitlines()[0][:300] if message else ""}
    return rows


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def shell(command):
    done = subprocess.run(["/bin/zsh", "-c", command], cwd=ROOT, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=1800)
    return done.returncode, done.stdout


def first_line(text, needle):
    return next((line.strip()[:300] for line in text.splitlines() if needle in line), "")


def main():
    defs = json.load(open(os.path.join(HERE, "s14-review-fixes-mutation-defs.json")))
    only = set(sys.argv[1:])
    results = []
    for m in defs:
        if only and m["id"] not in only:
            continue
        originals = {}
        texts = {}
        for edit in m["edits"]:
            path = os.path.join(ROOT, edit["file"])
            if path not in originals:
                originals[path] = (open(path, "rb").read(), sha(path))
                texts[path] = open(path, encoding="utf-8").read()
            assert texts[path].count(edit["old"]) == 1, (m["id"], edit["file"], texts[path].count(edit["old"]))
            texts[path] = texts[path].replace(edit["old"], edit["new"])
        for path, text in texts.items():
            open(path, "w", encoding="utf-8").write(text)
        try:
            if m["kind"] == "command":
                code, output = shell(m["command"])
                control = shell(m["control"]) if m.get("control") else None
            else:
                mutated = run(m["test_file"])
        finally:
            for path, (raw, _) in originals.items():
                open(path, "wb").write(raw)
        identical = all(sha(path) == digest for path, (_, digest) in originals.items())
        result = {"id": m["id"], "kind": m["kind"], "files": sorted({e["file"] for e in m["edits"]}), "mutation": m["mutation"]}
        if m["kind"] == "command":
            rerun_code, rerun_output = shell(m["command"])
            fails_with_needle = code != 0 and m["needle"] in output
            control_passed = control is None or control[0] == 0
            result.update({
                "command": m["command"],
                "exit": code,
                "needle": m["needle"],
                "evidence": first_line(output, m["needle"]),
                "fails_with_needle": fails_with_needle,
                "control": m.get("control"),
                "control_exit": None if control is None else control[0],
                "restored_identical": identical,
                "rerun_exit": rerun_code,
                "proof": fails_with_needle and control_passed and identical and rerun_code == 0,
            })
        else:
            rerun = run(m["test_file"])
            own = (mutated or {}).get(m["test"], {"status": "missing", "group": "", "error": ""})
            failed = sorted(title for title, row in (mutated or {}).items() if row["status"] == "failed")
            on_assertion = own["status"] == "failed" and own["error"].startswith("AssertionError")
            rerun_passed = rerun is not None and len(rerun) > 0 and all(row["status"] == "passed" for row in rerun.values())
            result.update({
                "test": m["test"],
                "group": own["group"],
                "own_row": own["status"],
                "error": own["error"],
                "fails_on_assertion": on_assertion,
                "other_failing_rows": [t for t in failed if t != m["test"]],
                "restored_identical": identical,
                "rerun_all_passed": rerun_passed,
                "rerun_rows": len(rerun or {}),
                "proof": on_assertion and identical and rerun_passed,
            })
        results.append(result)
        print(json.dumps(result), flush=True)
    return results


if __name__ == "__main__":
    out = main()
    if not sys.argv[1:]:
        record = {
            "method": "Run in an rsync copy of the envoi/slice-14-review-fixes working tree without .env.local, with a cp -cR copy of node_modules and DATABASE_URL removed. Each definition in s14-review-fixes-mutation-defs.json is applied alone by exact text replacement, every touched file restored and compared by SHA-256. Vitest definitions: the named row must fail on an AssertionError and the whole file pass on rerun; other failing rows are recorded. Command definitions: the command must exit non-zero with the needle in its output, the control command must pass under the same mutation, and the command must pass on rerun.",
            "results": out,
        }
        json.dump(record, open(os.path.join(HERE, "s14-review-fixes-mutations.json"), "w"), indent=1)
        print(sum(r["proof"] for r in out), "of", len(out), "proved")
