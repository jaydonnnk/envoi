# S16 amendment (Phantom landing) mutation runner, s17-mutate.py with its own definitions and results. Run with:
#   python3 -I docs/plans/envoi/evidence/s16-landing-mutate.py [id ...]
# Each definition in s16-landing-mutation-defs.json is applied alone by exact text replacement (every old
# text must occur exactly once, checked before any file is written). Unlike earlier runners, the
# whole test file runs under each mutation with vitest's JSON reporter, so every failing row is
# recorded: the Gate 3 batching rule needs one mutation to fail exactly its own row of a group.
# Every touched file is then restored and its SHA-256 compared with the original, and the file runs
# again. A proof needs: the named row failing on an AssertionError, for a Gate 3 group row no other
# row of the same group failing, a byte-identical restore, and a passing rerun of the whole file. Results go to
# s16-landing-mutations.json beside this file.
# Needs Node on PATH and the local test PostgreSQL the integration tests use (TEST_DATABASE_URL);
# DATABASE_URL is removed from the environment so nothing can reach Neon.
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


def main():
    defs = json.load(open(os.path.join(HERE, "s16-landing-mutation-defs.json")))
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
            mutated = run(m["test_file"])
        finally:
            for path, (raw, _) in originals.items():
                open(path, "wb").write(raw)
        identical = all(sha(path) == digest for path, (_, digest) in originals.items())
        rerun = run(m["test_file"])
        own = (mutated or {}).get(m["test"], {"status": "missing", "group": "", "error": ""})
        failed = sorted(title for title, row in (mutated or {}).items() if row["status"] == "failed")
        same_group_others = sorted(title for title in failed if title != m["test"] and (mutated or {})[title]["group"] == own["group"])
        on_assertion = own["status"] == "failed" and own["error"].startswith("AssertionError")
        rerun_passed = rerun is not None and len(rerun) > 0 and all(row["status"] == "passed" for row in rerun.values())
        # Gate 3's batching rule binds group rows: one mutation must fail exactly its own row. A
        # standalone test may share a fault with another standalone test; that is recorded, not refused.
        group_clean = m["kind"] == "standalone" or not same_group_others
        proof = on_assertion and group_clean and identical and rerun_passed
        result = {
            "id": m["id"],
            "test": m["test"],
            "kind": m["kind"],
            "group": own["group"],
            "files": sorted({e["file"] for e in m["edits"]}),
            "mutation": m["mutation"],
            "own_row": own["status"],
            "error": own["error"],
            "fails_on_assertion": on_assertion,
            "other_failing_rows": [t for t in failed if t != m["test"]],
            # Each other failing row's first error line, so an unexpected overlap can be diagnosed (S16 review F8).
            "other_errors": {t: mutated[t]["error"] for t in failed if t != m["test"]},
            "same_group_others": same_group_others,
            "restored_identical": identical,
            "rerun_all_passed": rerun_passed,
            "rerun_rows": len(rerun or {}),
            "proof": proof,
        }
        results.append(result)
        print(json.dumps(result), flush=True)
    return results


if __name__ == "__main__":
    out = main()
    if not sys.argv[1:]:
        git = lambda *args: subprocess.run(["git", *args], cwd=ROOT, stdout=subprocess.PIPE, text=True).stdout.strip()
        record = {
            "branch": git("branch", "--show-current"),
            "base_commit": git("rev-parse", "--short", "HEAD"),
            "uncommitted_changes": bool(git("status", "--porcelain")),
            "method": "Each definition in s16-landing-mutation-defs.json applied alone by exact text replacement, its whole test file run with the vitest JSON reporter, every touched file restored and compared by SHA-256, then the whole file rerun. A proof needs the named row to fail on an AssertionError, no other row of its group to fail (for a Gate 3 group row; a standalone test's other failures are recorded), a byte-identical restore and an all-passing rerun. Unit tests only: the landing request and navigation are injected fakes, and every id is a FIXTURE value.",
            "results": out,
        }
        json.dump(record, open(os.path.join(HERE, "s16-landing-mutations.json"), "w"), indent=1)
        print(sum(r["proof"] for r in out), "of", len(out), "proved")
