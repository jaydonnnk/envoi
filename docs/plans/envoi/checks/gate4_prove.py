"""Plant one fault per scratch copy and require that the checker reports exactly the expected rules.

Usage, from the repository root, with a scratch directory outside the repository:
    python3 -I docs/plans/envoi/checks/gate4_prove.py docs/plans/envoi . main <workdir>

Each fault is applied to a fresh copy of the gate folder, never to the real files.
A fault whose expected result is PASS is a recorded limit: the checker is known not to detect it.
Secret needles are assembled at run time so that no literal secret shape is written to the repository.
"""
import os, re, shutil, subprocess, sys

folder, repo, base, work = sys.argv[1:5]
here = os.path.dirname(os.path.abspath(__file__))
checker = os.path.join(here, "gate4_check.py")
shutil.rmtree(work, ignore_errors=True)
os.makedirs(work)


def run(chk, path):
    r = subprocess.run([sys.executable, "-I", chk, path, repo, base], capture_output=True, text=True)
    m = re.search(r"^FAIL (.*)$", r.stdout, flags=re.M)
    if not m and "PASS" not in r.stdout:
        return {"CRASH"}, r.stdout + r.stderr
    return (set(m.group(1).split()) if m else set()), r.stdout


def copy(name):
    dst = os.path.join(work, name, "envoi")
    shutil.copytree(folder, dst)
    return dst


def sub(path, rel, old, new, count=1):
    p = os.path.join(path, rel)
    s = open(p, encoding="utf-8").read()
    assert s.count(old) >= 1, (rel, old[:70])
    open(p, "w", encoding="utf-8").write(s.replace(old, new, count))


def move_s9(d):
    p = os.path.join(d, "04-slices.md")
    s = open(p, encoding="utf-8").read()
    block = s[s.index("### S9 "):s.index("### S10 ")]
    s = s.replace(block, "", 1).replace("### S16 ", block + "### S16 ", 1)
    open(p, "w", encoding="utf-8").write(s)


def append(d, rel, text):
    with open(os.path.join(d, rel), "a", encoding="utf-8") as f:
        f.write(text)


NPG = "password " + "npg" + "_ABCDEFGH1234"
F = []


def fault(rules, label, fn):
    F.append((set(rules), label, fn))


# Faults carried from the first Gate 4 checker, updated for the current text
fault(["R1"], "broken anchor", lambda d: sub(d, "handoff.md", "03-program-design.md#test-delta-for-the-gate-4-revision", "03-program-design.md#test-delta-missing"))
fault(["R2"], "renamed assignment", lambda d: sub(d, "04-slices.md", "`polling stops at a terminal state`.", "`polling stops at terminal`."))
fault(["R2"], "wrong group case count", lambda d: sub(d, "04-slices.md", "group `import route refusals read no body` (4 cases)", "group `import route refusals read no body` (5 cases)"))
fault(["R3"], "wrong table count", lambda d: sub(d, "04-slices.md", "| 4 | S4 | 2 | 2 | 3 |", "| 4 | S4 | 2 | 3 | 3 |"))
fault(["R3"], "wrong total row", lambda d: sub(d, "04-slices.md", "| **Total** | | **92** | **231** | **39** | |", "| **Total** | | **93** | **231** | **39** | |"))
fault(["R4"], "duplicate addition", lambda d: sub(d, "04-slices.md", "| `foreign Origin is rejected` |", "| `MCP refuses GET and DELETE` |"))
fault(["R4"], "addition count", lambda d: sub(d, "04-slices.md", "| 5 | S13 | 3 | 3 | 2 |", "| 5 | S13 | 3 | 3 | 3 |"))
fault(["R4"], "empty mutation", lambda d: sub(d, "04-slices.md", "| Allow `GET`; the test fails. |", "| |"))
fault(["R5"], "removed name revived", lambda d: sub(d, "04-slices.md", "- Voice, AG Grid and catalogue breadth.", "- Voice, AG Grid and catalogue breadth, and `guessed token is denied`."))
fault(["R6"], "checklist order", lambda d: sub(d, "00-status.md", "- [ ] S9 - Merchant SGQR decode and identifier mapping.\n- [ ] S10 - Buyer scan or paste; second in the cut order.\n",
                                              "- [ ] S10 - Buyer scan or paste; second in the cut order.\n- [ ] S9 - Merchant SGQR decode and identifier mapping.\n"))
fault(["R6"], "dependency built later", lambda d: sub(d, "04-slices.md", "then text. | S4, S9 |", "then text. | S4, S16 |"))
fault(["R6"], "section order", move_s9)
fault(["R7"], "em dash", lambda d: sub(d, "roadmap.md", "None of these candidates authorizes implementation.", "None of these candidates authorizes implementation \u2014 none."))
fault(["R7"], "em dash entity", lambda d: sub(d, "04-slices.md", "Sections follow the build order.", "Sections follow the build order &" + "mdash; always."))
fault(["R8"], "secret value", lambda d: sub(d, "research.md", "Research and mockup checks do not establish runtime evidence.", "Research and mockup checks do not establish runtime evidence. " + NPG))
fault(["R10"], "Gate 3 edited", lambda d: sub(d, "03-program-design.md", "Every test must be able to fail.", "Every test must be able to fail, always."))
fault(["R10"], "product scope edited", lambda d: sub(d, "01-product.md", "Seeded merchants and test transactions cannot be mistaken", "Seeded merchants and test transactions can never be mistaken"))
fault(["R10"], "mockup edited", lambda d: append(d, os.path.join("mockups", "index.html"), "<!-- x -->\n"))
fault(["R11"], "superseded token", lambda d: sub(d, "04-slices.md", "- Voice, AG Grid and catalogue breadth.", "- Voice, AG Grid and catalogue breadth; `T_IMAGE_ACCESS`."))
fault(["R12"], "mirror misses S17", lambda d: sub(d, "stack-recommendation.md", "builds it as S16 and S17", "builds it as S16 and later"))
fault(["R14"], "mirror miscounts additions", lambda d: sub(d, "handoff.md", "plus 39 named additions", "plus 38 named additions"))

# The nine faults of the 2026-10-12 independent review, adapted to the current text
fault(["R13"], "review 3: roadmap cut order contradicts 04", lambda d: sub(d, "roadmap.md", "User-decided capability cut order: PYUSD (S16 and S17) first, scan (S10) next", "User-decided capability cut order: scan (S10) first, PYUSD (S16 and S17) next"))
fault(["R14", "R15"], "review 4: S17 recovery group moved into S16 with the table updated", lambda d: (
    sub(d, "04-slices.md", "Gate 3: group `PYUSD recovery over a fake chain` (15 cases), ", "Gate 3: "),
    sub(d, "04-slices.md", "group `shared RPC limiter` (5 cases), ", "group `shared RPC limiter` (5 cases), group `PYUSD recovery over a fake chain` (15 cases), "),
    sub(d, "04-slices.md", "| 13 | S16 | 28 | 113 | 1 |", "| 13 | S16 | 29 | 128 | 1 |"),
    sub(d, "04-slices.md", "| 14 | S17 | 4 | 18 | 7 |", "| 14 | S17 | 3 | 3 | 7 |")))
fault([], "review 5: S6 dropped from S7's dependencies (known limit: list completeness is not checked)",
      lambda d: sub(d, "04-slices.md", "cannot be bought again on the new menu. | S2, S6 |", "cannot be bought again on the new menu. | S2 |"))
fault(["R14"], "review 6: wrong S16 prose count", lambda d: sub(d, "04-slices.md", "Twenty-eight named tests in 113 cases", "Twenty-nine named tests in 120 cases"))
fault(["R13"], "review 7: cut order swapped in 04's revision bullet", lambda d: sub(d, "04-slices.md", "- **Cut order** is PYUSD, then scan, then S14", "- **Cut order** is S14, then scan, then PYUSD"))
fault(["R14"], "review 8: wrong additions baseline in 00-status", lambda d: sub(d, "00-status.md", "39 named additions, up from 20", "39 named additions, up from 26"))

# Faults for the rules added after the review
fault(["R13"], "handoff cut order contradicts 04", lambda d: sub(d, "handoff.md", "the cut order PYUSD, scan, S14", "the cut order scan, PYUSD, S14"))
fault(["R13"], "checklist cut rank contradicts 04", lambda d: sub(d, "00-status.md", "- [ ] S10 - Buyer scan or paste; second in the cut order.", "- [ ] S10 - Buyer scan or paste; third in the cut order."))
fault(["R14"], "handoff build order contradicts 04", lambda d: sub(d, "handoff.md", "S1, S2, S3, S4, S13, S6, S5, S7, S8,", "S1, S2, S3, S4, S13, S5, S6, S7, S8,"))
fault(["R14"], "checkpoint list contradicts build order", lambda d: sub(d, "04-slices.md", "(S1-S4, S13, S6, S5, S7 and S8)", "(S1-S4, S13 and S5-S8)"))
fault(["R14"], "roadmap delta count", lambda d: sub(d, "roadmap.md", "21 cases added", "22 cases added"))
fault(["R14"], "curated claim deleted", lambda d: sub(d, "04-slices.md", "Seventeen named tests in 57 cases.\n", ""))
fault(["R14"], "additions breakdown does not sum", lambda d: sub(d, "04-slices.md", "39 named additions: 33 cover", "39 named additions: 32 cover"))
fault(["R15"], "core test moved with the table updated", lambda d: (
    sub(d, "04-slices.md", ", `polling stops at a terminal state`.", "."),
    sub(d, "04-slices.md", "`model tool budget is enforced`.", "`model tool budget is enforced`, `polling stops at a terminal state`."),
    sub(d, "04-slices.md", "| 3 | S3 | 8 | 8 | 3 |", "| 3 | S3 | 7 | 7 | 3 |"),
    sub(d, "04-slices.md", "| 4 | S4 | 2 | 2 | 3 |", "| 4 | S4 | 3 | 3 | 3 |")))
fault(["R15"], "unit sentence sends recovery to the wrong slice", lambda d: sub(d, "04-slices.md", "and the PYUSD recovery unit to S17.", "and the PYUSD recovery unit to S16."))
fault(["R14"], "00-status breakdown disagrees with 04", lambda d: sub(d, "00-status.md", "up from 20: 33 cover contracts", "up from 20: 32 cover contracts"))
fault(["R14"], "contract split does not sum", lambda d: sub(d, "04-slices.md", "are the 28 of the review's major fixes", "are the 27 of the review's major fixes"))
fault(["R14"], "minor-fix additions miscounted", lambda d: sub(d, "00-status.md", "five with the minor ones and one with the Gate 3 reopening, for 39 in all", "four with the minor ones and one with the Gate 3 reopening, for 39 in all"))

# Faults for the 2026-10-12 minor review fixes
fault(["R16"], "minor 2: S11 dropped from S16's dependencies", lambda d: sub(d, "04-slices.md", "| S3, S4, S5, S7, S8, S11 |", "| S3, S4, S5, S7, S8 |"))
fault(["R16"], "minor 2: S4 dropped from S16's dependencies", lambda d: sub(d, "04-slices.md", "| S3, S4, S5, S7, S8, S11 |", "| S3, S5, S7, S8, S11 |"))
fault(["R16"], "minor 2: S5 dropped from S11's dependencies", lambda d: sub(d, "04-slices.md", "nothing of the photo is stored. | S5, S6, S7 |", "nothing of the photo is stored. | S6, S7 |"))
fault([], "minor 1: S16's hint branch of recovery.ts dropped (known limit: a need the section does not name is not checked)", lambda d: sub(d, "04-slices.md",
      "before expiry, which needs `src/domain/pyusd/recovery.ts` with `decideRecoveryStep`'s hint branch: for a `prepared` attempt it yields `verify_hints_then_wait`, so the readable hint is verified, as Gate 3's PYUSD recovery call stack does on both sides of the attempt's bound;",
      "before expiry;"))
fault(["R16"], "limiter named before S4 builds it", lambda d: sub(d, "04-slices.md", "End to end in the sandbox: approve and capture; cancel at PayPal.", "End to end in the sandbox: approve and capture; cancel at PayPal; a burst meets `src/lib/ratelimit.ts`."))
fault(["R4"], "minor 3: operator-flag addition loses its mutation", lambda d: sub(d, "04-slices.md", "| Skip the flag check in `record-extra-transfer-refund`; the test fails. |", "| |"))
# Faults for the 2026-10-12 Gate 3 reopening (delta D10)
fault(["R10"], "reopened Gate 3 text edited after review", lambda d: sub(d, "03-program-design.md", "It is not retryable and not operator-visible", "It is retryable and not operator-visible"))
# Faults for the 2026-10-16 Gate 1 re-approval (menu photo drafting deferred)
fault(["R10"], "re-approved Gate 1 body edited", lambda d: sub(d, "01-product.md", "Menu photo import is visibly not available in this release", "Menu photo import is available in this release"))
fault(["R10"], "re-approved Gate 1 mockup edited", lambda d: sub(d, os.path.join("mockups", "merchant-onboarding.html"), "Menu photo import is not available in this release.", "Menu photo import is available in this release."))
# Faults for the 2026-10-15 English-only reopening of Gates 2-4
fault(["R10"], "reopened Gate 2 text edited after approval", lambda d: sub(d, "02-architecture.md", "including rotated text, small prices, blur and non-SGD ambiguity", "including Chinese text, rotated text, small prices, blur and non-SGD ambiguity"))
fault(["R10"], "reopened Gate 3 English-only text edited after approval", lambda d: sub(d, "03-program-design.md", "Rotated and small-price text accuracy on English menus", "Chinese, rotated and small-price text accuracy"))
fault(["R14"], "D10 part of the contract split miscounted", lambda d: sub(d, "04-slices.md", "and the one D10 kill switch", "and the two D10 kill switch"))
fault(["R4"], "kill-switch addition loses its mutation", lambda d: sub(d, "04-slices.md", "| Skip the `PAYMENTS_ENABLED` check in PayPal eligibility; the test fails. |", "| |"))
# Faults for the approval record of 2026-10-12; the earlier approval-claim faults retired with R9's heuristic
fault(["R9"], "Gate 4 approval reverted in the status line", lambda d: sub(d, "00-status.md", "- Gate 4 - Slice plan: **APPROVED 2026-10-12** by the user", "- Gate 4 - Slice plan: **in progress** by the user"))
fault(["R9"], "Gate 3 re-approval reverted in the status line", lambda d: sub(d, "00-status.md", "- Gate 3 - Program Design: **RE-APPROVED 2026-10-12** by the user", "- Gate 3 - Program Design: **reopened 2026-10-12** by the user"))
fault(["R9"], "Gate 4 checklist item unticked", lambda d: sub(d, "00-status.md", "- [x] Explicit user approval of Gate 4, 2026-10-12", "- [ ] Explicit user approval of Gate 4, 2026-10-12"))
fault(["R9"], "approval missing from the history", lambda d: sub(d, "00-status.md", '- 2026-10-12: the user said "I approve both pls publish', '- 2026-10-12: the user said "I will approve later, pls publish'))
fault(["R9"], "04 approval marker removed", lambda d: sub(d, "04-slices.md", "**APPROVED by the user on 2026-10-12**", "**Draft.**"))
fault(["R9"], "handoff title reverted", lambda d: sub(d, "handoff.md", "# Envoi: Gates 1-4 approved", "# Envoi: Gate 4 revision drafted"))
fault(["R9"], "stale draft wording in roadmap", lambda d: sub(d, "roadmap.md", "the Gate 4 slice plan was revised and approved on 2026-10-12", "the unapproved Gate 4 draft was revised on 2026-10-12"))
fault(["R9"], "stale draft wording in the 01-product closing line", lambda d: sub(d, "01-product.md", "The slice plan in `04-slices.md` was revised and approved on 2026-10-12", "The slice plan is an unapproved draft in `04-slices.md`"))
fault(["R9"], "handoff still awaits the Gate 4 question", lambda d: sub(d, "handoff.md", "## Next authorized action\n", "## Next authorized action\n\nThis awaits `Approve Gate 4, or what should change?`.\n"))
fault(["R8"], "literal secret in a checker source", lambda d: append(d, os.path.join("checks", "gate4_check.py"), "# " + NPG + "\n"))

results = []
got, out = run(checker, copy("pristine"))
results.append(("pristine", set(), got, out))
for i, (want, label, fn) in enumerate(F):
    d = copy(f"f{i:02d}")
    fn(d)
    got, out = run(checker, d)
    results.append((label, want, got, out))

# Disable each secret rule in turn: the self-test must fail R8 only.
src = open(checker, encoding="utf-8").read()
block = src[src.index("PATTERNS = ["):src.index("]\nNEEDLES")]
pats = [l for l in block.splitlines()[1:] if l.strip()]
for n, line in enumerate(pats):
    mutated = src.replace(line + "\n", line.replace('r"', 'r"(?!x)DISABLED', 1) + "\n", 1)
    chk = os.path.join(work, f"checker-disabled-{n + 1}.py")
    open(chk, "w", encoding="utf-8").write(mutated)
    got, out = run(chk, folder)
    results.append((f"secret rule {n + 1} disabled", {"R8"}, got, out))

bad = 0
for label, want, got, out in results:
    ok = got == want
    bad += not ok
    print(f"{'ok ' if ok else 'BAD'} {label}: expected {sorted(want) or 'PASS'}, got {sorted(got) or 'PASS'}")
    if not ok:
        print("    " + out.strip().replace("\n", "\n    "))
print(f"{len(results) - bad}/{len(results)} as expected")
sys.exit(1 if bad else 0)
