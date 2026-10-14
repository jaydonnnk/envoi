# Slice S6 mutation runner. Run from anywhere with: python3 -I docs/plans/envoi/evidence/s6-mutate.py
# Each definition in s6-mutation-defs.json is applied alone by exact text replacement (every old text
# must occur exactly once), the named test is run alone, every touched file is restored and its
# SHA-256 compared with the original, and the test is run again. A proof needs a failing mutated run,
# a byte-identical restore and a passing rerun, and, as since S4, the mutated run must fail on an
# AssertionError rather than only through a crash or a database error. Results go to s6-mutations.json
# beside this file.
# Needs Node on PATH and the local test PostgreSQL that the integration tests use.
import hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))


def run(test_file, name):
    out = subprocess.run(["npx", "vitest", "run", test_file, "-t", name], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=600).stdout
    out = re.sub(r"\x1b\[[0-9;]*m", "", out)
    tests = next((l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "no Tests line")
    err = next((l.strip() for l in out.splitlines() if re.match(r"\s*(AssertionError|Error|TypeError|PostgresError)\b", l)), "")
    return tests, err[:300]


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def main():
    defs = json.load(open(os.path.join(HERE, "s6-mutation-defs.json")))
    only = set(sys.argv[1:])
    results = []
    for m in defs:
        if only and m["id"] not in only:
            continue
        originals = {}
        for edit in m["edits"]:
            path = os.path.join(ROOT, edit["file"])
            if path not in originals:
                originals[path] = (open(path, "rb").read(), sha(path))
            text = open(path, encoding="utf-8").read()
            assert text.count(edit["old"]) == 1, (m["id"], edit["file"], text.count(edit["old"]))
            open(path, "w", encoding="utf-8").write(text.replace(edit["old"], edit["new"]))
        try:
            mutated, err = run(m["test_file"], m["test"])
        finally:
            for path, (raw, _) in originals.items():
                open(path, "wb").write(raw)
        identical = all(sha(path) == digest for path, (_, digest) in originals.items())
        rerun, _ = run(m["test_file"], m["test"])
        on_assertion = err.startswith("AssertionError")
        proof = "failed" in mutated and on_assertion and identical and "failed" not in rerun and "passed" in rerun
        result = {"id": m["id"], "test": m["test"], "files": sorted({e["file"] for e in m["edits"]}), "mutation": m["mutation"], "mutated": mutated, "error": err, "fails_on_assertion": on_assertion, "restored_identical": identical, "rerun": rerun, "proof": proof}
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
            "method": "Each definition in s6-mutation-defs.json applied alone by exact text replacement, its named test run alone (vitest -t), every touched file restored and compared by SHA-256, then the test rerun. Integration tests run on local PostgreSQL with the real schema built from the migrations, so a mutation of a migration file reaches the disposable database; merchant accounts are created by the operator functions with passwords generated in memory per run. PayPal and OpenAI are never called. A proof also needs the mutated run to fail on an AssertionError.",
            "results": out,
        }
        json.dump(record, open(os.path.join(HERE, "s6-mutations.json"), "w"), indent=1)
        print(sum(r["proof"] for r in out), "of", len(out), "proved")
