# S21 secret scan. Reads the values in .env.local into memory and never prints one: it reports only a
# variable's name, the file it was found in and a count. Run from the repository root with:
#   python3 -I docs/plans/envoi/evidence/s21-secret-scan.py
# Surface: every tracked file plus every untracked file Git does not ignore, which is what a commit
# would carry, so it covers this slice's diff and its new evidence files at once.
# Self-test: before scanning, each needle is planted in a scratch file and the scanner must find it,
# so a clean result cannot mean a scanner that never matches. Needles shorter than 8 characters are
# skipped, because a short value matches ordinary prose and proves nothing.
import os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
ENV_FILE = os.path.join(ROOT, ".env.local")
MIN_LEN = 8

# A name is a credential when its value authenticates or authorizes: a key, a secret, a token or a
# password, or a connection string that actually carries a password. The repository's own scan rule
# in tests/support/secret-scan.ts already treats a URL with no password, such as the local test URL,
# as not a secret, so TEST_DATABASE_URL is classified the same way here. Every other name holds a
# value the gate documents state on purpose, such as a model name, a local base URL or a demo
# account's address; those are reported and adjudicated in 00-status.md rather than treated as a leak.
CREDENTIAL_NAME = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD)$", re.IGNORECASE)
CONNECTION_STRING = re.compile(r"DATABASE_URL$", re.IGNORECASE)
PASSWORD_IN_URL = re.compile(r"://[^:/@\s]+:[^@\s]+@")


def is_credential(name, value):
    return bool(CREDENTIAL_NAME.search(name)) or (bool(CONNECTION_STRING.search(name)) and bool(PASSWORD_IN_URL.search(value)))


def needles():
    found = {}
    for line in open(ENV_FILE, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if len(value) >= MIN_LEN:
            found[name.strip()] = value
    return found


def surface():
    out = subprocess.run(["git", "-C", ROOT, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], capture_output=True, text=True, check=True).stdout
    return sorted(set(p for p in out.split("\0") if p))


def scan(paths, names):
    hits = []
    for path in paths:
        full = os.path.join(ROOT, path)
        if not os.path.isfile(full):
            continue
        try:
            data = open(full, "rb").read()
        except OSError:
            continue
        for name in names:
            needle = names[name].encode("utf-8")
            if needle in data:
                hits.append((name, path))
    return hits


def main():
    names = needles()
    if not names:
        print("no needles: .env.local has no value of at least", MIN_LEN, "characters")
        return 1

    # Self-test on a scratch file outside the repository, so no plant is ever written into it.
    with tempfile.TemporaryDirectory() as tmp:
        plant = os.path.join(tmp, "plant.txt")
        proved = 0
        for name, value in names.items():
            with open(plant, "w", encoding="utf-8") as handle:
                handle.write(f"prefix {value} suffix\n")
            if scan([plant], {name: value}):
                proved += 1
        os.remove(plant)
    if proved != len(names):
        print(f"SELF-TEST FAILED: {proved} of {len(names)} needles were found when planted")
        return 1

    paths = surface()
    hits = scan(paths, names)
    credentials = sorted(name for name, value in names.items() if is_credential(name, value))
    others = sorted(name for name, value in names.items() if not is_credential(name, value))
    credential_hits = sorted({(name, path) for name, path in hits if name in credentials})
    other_hits = sorted({(name, path) for name, path in hits if name not in credentials})
    print(f"needles: {len(names)} values from .env.local, each at least {MIN_LEN} characters, never printed")
    print(f"self-test: {proved} of {len(names)} planted needles found in a scratch file outside the repository")
    print(f"surface: {len(paths)} files (tracked plus untracked and not ignored)")
    print(f"credential names ({len(credentials)}): {', '.join(credentials)}")
    print(f"not credentials ({len(others)}): {', '.join(others)}")
    for name, path in credential_hits:
        print(f"CREDENTIAL FOUND {name} in {path}")
    for name, path in other_hits:
        print(f"other value present: {name} in {path}")
    if credential_hits:
        return 1
    print(f"credentials found: none; all {len(credentials)} credential values are absent from the surface")
    print(f"other values present: {len({name for name, _ in other_hits})} of {len(others)} names, each adjudicated in 00-status.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
