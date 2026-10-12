"""Gate 4 documentary checker for docs/plans/envoi.

Usage, from the repository root:
    python3 -I docs/plans/envoi/checks/gate4_check.py docs/plans/envoi . main

Arguments: the gate folder (which may be a scratch copy), the repository root and the base ref.
Each rule reports under its own id, so a planted fault can be shown to fail only its own rule.
gate4_prove.py in this folder plants those faults.

What the rules do not check:
- whether a slice's "Depends on" list is complete, beyond R16's curated build tokens (R6 checks only that each listed slice comes earlier);
- which additions are contract tests and which are refinements (R14 checks only that the stated parts sum and agree);
- whether a slice's tests can run on the code built by then, beyond Gate 3's unit placement (R15);
- stale approval wording outside the current-state parts R9 scans, or phrased outside its pattern;
- counts stated anywhere other than the curated claims of R14;
- whether the 2026-10-12 Gate 3 reopening text is right: R10 only pins its reviewed SHA256;
- any runtime, account, model, wallet or usability fact.
"""
import difflib, hashlib, html, os, re, subprocess, sys

folder, repo, base = sys.argv[1], sys.argv[2], sys.argv[3]
fails = {}


def fail(rule, msg):
    fails.setdefault(rule, []).append(msg)


def git_show(path):
    r = subprocess.run(["git", "-C", repo, "show", f"{base}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def slug(h):
    h = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", h.strip())
    h = re.sub(r"[`*_]", "", h).lower()
    return "".join(ch if (ch.isalnum() or ch in "-_") else ("-" if ch == " " else "") for ch in h)


UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}


def num(word):
    w = word.strip().lower()
    if w.isdigit():
        return int(w)
    if w in UNITS:
        return UNITS.index(w)
    if w in TENS:
        return TENS[w]
    head, _, tail = w.partition("-")
    if head in TENS and tail in UNITS[1:10]:
        return TENS[head] + UNITS.index(tail)
    return None


md = {f: open(os.path.join(folder, f), encoding="utf-8").read()
      for f in sorted(os.listdir(folder)) if f.endswith(".md")}

# R1 local links and anchors
anchors = {}
for f, s in md.items():
    seen, a = {}, set()
    for h in re.findall(r"^#{1,6}\s+(.*)$", s, flags=re.M):
        b = slug(h)
        n = seen.get(b, 0)
        a.add(b if n == 0 else f"{b}-{n}")
        seen[b] = n + 1
    anchors[f] = a
nlinks = nanch = 0
for f, s in md.items():
    for target in re.findall(r"\]\(([^)\s]+)\)", s):
        if re.match(r"https?:|mailto:", target):
            continue
        nlinks += 1
        path, _, frag = target.partition("#")
        tf = path or f
        if not os.path.exists(os.path.join(folder, tf)):
            fail("R1", f"{f}: missing link target {target}")
            continue
        if frag:
            nanch += 1
            if tf not in anchors or frag not in anchors[tf]:
                fail("R1", f"{f}: missing anchor {target}")

# Parse the Gate 3 test plan, remembering the slice unit each test sits under
g3 = md["03-program-design.md"]
plan = g3.split("\n## Test plan\n", 1)[1].split("\n## Test delta for the Gate 4 revision\n", 1)[0]
groups, standalone, unit_of = {}, [], {}
current_group, header, unit = None, None, None
for line in plan.splitlines():
    m = re.match(r"^### (.*)$", line)
    if m:
        h = m.group(1)
        unit = ("core" if "the Gate 4 draft assignment stands" in h else
                "basket" if "placed by Gate 4" in h else
                "import" if "(import slice)" in h else
                "purchase" if "(PYUSD purchase slice)" in h else
                "recovery" if "(PYUSD recovery slice)" in h else None)
        if unit is None:
            fail("R15", f"Gate 3 test heading names no known slice unit: {h}")
        continue
    m = re.match(r"^\*\*Group `([^`]+)`\*\*, (\d+) cases\.", line)
    if m:
        current_group = m.group(1)
        groups[current_group] = {"declared": int(m.group(2)), "rows": 0}
        unit_of[current_group] = unit
        continue
    if re.match(r"^\| (Case|Test) \|", line):
        header = line.split("|")[1].strip()
        if header == "Test":
            current_group = None
        continue
    m = re.match(r"^\|\s*`([^`]+)`\s*\|", line)
    if m:
        if header == "Case" and current_group:
            groups[current_group]["rows"] += 1
        elif header == "Test":
            standalone.append(m.group(1))
            unit_of[m.group(1)] = unit
    if line.startswith("Standalone tests:"):
        current_group = None
for g, v in groups.items():
    if v["declared"] != v["rows"]:
        fail("R2", f"Gate 3 group {g} declares {v['declared']} cases but lists {v['rows']}")
named = {**{g: v["rows"] for g, v in groups.items()}, **{t: 1 for t in standalone}}
if len(named) != len(groups) + len(standalone):
    fail("R2", "a Gate 3 group and standalone test share a name")
delta = g3.split("\n## Test delta for the Gate 4 revision\n", 1)[1].split("\n## Gate 4 deltas", 1)[0]
removed = re.findall(r"^\|\s*`([^`]+)`\s*\|[^|]*\|\s*removed\s*\|", delta, flags=re.M)
prev_names = len(re.findall(r"^\|\s*`[^`]+`\s*\|[^|]*\|[^|]*\|\s*$", delta.split("\nAdded cases:\n", 1)[0], flags=re.M))
added_cases = len(re.findall(r"^\| [A-M](?:, [A-M])* \| ", delta.split("\nAdded cases:\n", 1)[1] if "\nAdded cases:\n" in delta else "", flags=re.M))


def parse_slices(text):
    part = text.split("\n## Slices\n", 1)[1].split("\n## Test assignment\n", 1)[0]
    secs, asg, adds, cur, in_add = [], [], [], None, False
    for line in part.splitlines():
        m = re.match(r"^### (S\d+) (.*)$", line)
        if m:
            cur = m.group(1)
            secs.append((cur, m.group(2)))
            continue
        if line.startswith("Gate 3: "):
            body = line[len("Gate 3: "):]
            for gm in re.finditer(r"group `([^`]+)` \((\d+) cases\)", body):
                asg.append((cur, gm.group(1), "group", int(gm.group(2))))
            rest = re.sub(r"group `[^`]+` \(\d+ cases\)", "", body)
            for name in re.findall(r"`([^`]+)`", rest):
                asg.append((cur, name, "test", 1))
            continue
        if line.startswith("| Addition |"):
            in_add = True
            continue
        if in_add:
            m = re.match(r"^\|\s*`([^`]+)`\s*\|[^|]*\|\s*([^|]*?)\s*\|\s*$", line)
            if m:
                adds.append((cur, m.group(1), m.group(2)))
            elif not line.startswith("| ---"):
                in_add = False
    return secs, asg, adds


s4 = md["04-slices.md"]
section_list, assigned, additions = parse_slices(s4)
sections = [s for s, _ in section_list]
titles = dict(section_list)
b04 = git_show("docs/plans/envoi/04-slices.md")
base_sections, base_assigned, base_additions = parse_slices(b04.decode("utf-8")) if b04 else ([], [], [])

# R2 every Gate 3 named test assigned exactly once, with its own case count
names = [a[1] for a in assigned]
for t in named:
    c = names.count(t)
    if c != 1:
        fail("R2", f"Gate 3 test assigned {c} times: {t}")
for sl, name, kind, declared in assigned:
    if name not in named:
        fail("R2", f"{sl}: assigned name not in the Gate 3 plan: {name}")
    elif kind == "group" and name not in groups:
        fail("R2", f"{sl}: {name} is not a Gate 3 group")
    elif kind == "test" and name in groups:
        fail("R2", f"{sl}: group {name} assigned without its case count")
    elif kind == "group" and declared != groups[name]["rows"]:
        fail("R2", f"{sl}: group {name} says {declared} cases, Gate 3 has {groups[name]['rows']}")

# R3 per-slice named and case counts in the Test assignment table
ta = s4.split("\n## Test assignment\n", 1)[1].split("\n## ", 1)[0]
table = {}
total_row = None
for line in ta.splitlines():
    m = re.match(r"^\| (\d+) \| (S\d+) \| (\d+) \| (\d+) \| (\d+) \|", line)
    if m:
        table[m.group(2)] = tuple(int(m.group(i)) for i in (1, 3, 4, 5))
    m = re.match(r"^\| \*\*Total\*\* \| \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \| \*\*(\d+)\*\* \|", line)
    if m:
        total_row = tuple(int(x) for x in m.groups())
computed = {}
for sl, name, kind, declared in assigned:
    n, c = computed.get(sl, (0, 0))
    computed[sl] = (n + 1, c + named.get(name, declared))
for sl in set(computed) | set(table):
    want = computed.get(sl, (0, 0))
    got = table.get(sl, (None, None, None, None))[1:3]
    if want != got:
        fail("R3", f"{sl}: table says {got} named/cases, Gate 3 lines give {want}")
if total_row is None:
    fail("R3", "no total row in Test assignment")
else:
    if total_row[:2] != (sum(v[1] for v in table.values()), sum(v[2] for v in table.values())):
        fail("R3", "total row does not equal the sum of rows")
    if total_row[:2] != (len(named), sum(named.values())):
        fail("R3", f"total row {total_row[:2]} does not equal Gate 3's {len(named)} tests and {sum(named.values())} cases")

# R4 additions: unique, distinct from Gate 3 names, counted per slice, each with a mutation plan
an = [a[1] for a in additions]
for a in set(an):
    if an.count(a) != 1:
        fail("R4", f"addition named {an.count(a)} times: {a}")
    if a in named or a in removed:
        fail("R4", f"addition reuses a Gate 3 name: {a}")
for sl, a, mutation in additions:
    if not mutation:
        fail("R4", f"{sl}: addition {a} has an empty mutation cell")
per = {}
for sl, _, _ in additions:
    per[sl] = per.get(sl, 0) + 1
for sl in set(per) | set(table):
    if per.get(sl, 0) != table.get(sl, (0, 0, 0, 0))[3]:
        fail("R4", f"{sl}: {per.get(sl, 0)} additions listed, table says {table.get(sl, (0, 0, 0, 0))[3]}")
if total_row and total_row[2] != len(additions):
    fail("R4", f"total additions {total_row[2]} but {len(additions)} listed")
falsifiers = sum(1 for _, _, mutation in additions if mutation.startswith("None."))
base_names = {a[1] for a in base_additions}
new_additions = sum(1 for a in additions if a[1] not in base_names)

# R5 removed Gate 3 names appear nowhere in 04
if len(removed) != 10:
    fail("R5", f"expected 10 removed names in the Gate 3 delta, found {len(removed)}")
for r in removed:
    if r in s4:
        fail("R5", f"removed Gate 3 name appears in 04-slices.md: {r}")

# R6 build order: plan table, section order, assignment table and status checklist agree;
# each listed dependency comes earlier (completeness of the lists is not checked)
sp = s4.split("\n## Slice plan\n", 1)[1].split("\n## ", 1)[0]
order, deps, window = [], {}, {}
for line in sp.splitlines():
    m = re.match(r"^\| (\d+) \| (S\d+) [^|]*\|[^|]*\| ([^|]*) \| ([^|]*) \|", line)
    if m:
        if int(m.group(1)) != len(order) + 1:
            fail("R6", f"order number {m.group(1)} out of sequence")
        order.append(m.group(2))
        deps[m.group(2)] = re.findall(r"S\d+", m.group(3))
        window[m.group(2)] = m.group(4).strip()
if order != sections:
    fail("R6", f"slice sections {sections} differ from the plan order {order}")
st = md["00-status.md"].split("\n## Slices\n", 1)[1].split("\n## ", 1)[0]
checklist = re.findall(r"^- \[[ x]\] (S\d+) - ", st, flags=re.M)
if checklist != order:
    fail("R6", f"00-status checklist {checklist} differs from the plan order {order}")
if [r[0] for r in sorted(table.items(), key=lambda kv: kv[1][0])] != order:
    fail("R6", "Test assignment rows are not in build order")
for sl, ds in deps.items():
    for d in ds:
        if d not in order or order.index(d) >= order.index(sl):
            fail("R6", f"{sl} depends on {d}, which is not built earlier")

# R7 em dashes in lines added since the base, in the md, html and py files of the gate folder
added = []
for root, _, files in os.walk(folder):
    for name in sorted(files):
        if not name.endswith((".md", ".html", ".py")):
            continue
        rel = os.path.relpath(os.path.join(root, name), folder)
        before = git_show(f"docs/plans/envoi/{rel}")
        before = before.decode("utf-8").splitlines() if before else []
        after = open(os.path.join(root, name), encoding="utf-8").read().splitlines()
        for kind, _, _, j1, j2 in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
            if kind in ("insert", "replace"):
                added.extend(after[j1:j2])
EM = "\u2014"
em = [l for l in added if EM in html.unescape(l) or re.search("&" + r"mdash;|&#0*8212;|&#x0*2014;", l, flags=re.I)]
if em:
    fail("R7", f"em dash in {len(em)} added line(s): {em[0][:80]}")

# R8 secret shapes over the added lines, every gate document and these checker sources, with a self-test.
# The needles are assembled at run time so that no literal secret shape is ever written to the repository.
PATTERNS = [
    r"postgres(?:ql)?://[^\s:@/]+:[^\s@/]+@",
    r"\bDATABASE_URL\s*=\s*\S+",
    r"client_secret\s*[=:]\s*['\"]?[A-Za-z0-9_\-]{8,}",
    r"\bnpg_[A-Za-z0-9]{8,}",
    r"\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}",
    r"\bAIza[0-9A-Za-z_\-]{30,}",
    r"\bgsk_[A-Za-z0-9]{20,}",
    r"hooks\.zapier\.com/hooks/catch/\d+/\w+",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]",
    r"(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{85,90}(?![1-9A-HJ-NP-Za-km-z])",
]
NEEDLES = [
    "postgresql" + "://synthetic_user" + ":synthetic_password" + "@invalid.example/test",
    "DATABASE_URL" + "=SYNTHETIC_NOT_A_CONNECTION",
    "client_secret" + ": 'abcdEFGH12345678'",
    "password " + "npg" + "_ABCDEFGH1234",
    "OPENAI_API_KEY " + "sk-" + "proj-" + "ABCDEFGHIJKLMNOPQRSTUVWX",
    "AIza" + "SyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12",
    "gsk" + "_ABCDEFGHIJKLMNOPQRSTUV",
    "https://hooks." + "zapier.com/hooks/catch/" + "123456/abcdef/",
    "-----BEGIN OPENSSH " + "PRIVATE KEY-----",
    "[" + ",".join(["12"] * 64) + "]",
    "2" * 88,
]


def scan(lines):
    return [(p, l) for l in lines for p in PATTERNS if re.search(p, l)]


for n, needle in enumerate(NEEDLES):
    own = [i for i, p in enumerate(PATTERNS) if re.search(p, needle)]
    if own != [n]:
        fail("R8", f"secret rule {n + 1} does not independently detect its own needle")
PUBLIC = ["CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"]
if scan(PUBLIC):
    fail("R8", "a secret rule rejects a public 32-44-character address")
sources = []
for root, _, files in os.walk(os.path.join(folder, "checks")):
    for name in sorted(files):
        if name.endswith(".py"):
            sources.extend(open(os.path.join(root, name), encoding="utf-8").read().splitlines())
hits = scan(added) + [h for f in md.values() for h in scan(f.splitlines())] + scan(sources)
if hits:
    fail("R8", f"secret-shaped value, pattern {hits[0][0]}")

# R9 gate state after the user's approval on 2026-10-12 ("I approve both"): Gate 3 re-approved and Gate 4
# approved in the status lines, the ticked checklist items, the approval history, 04-slices.md and the
# handoff.md title; and no current-state line still calls either gate a draft or awaiting approval.
# Before the approval this rule did the reverse; its approval-claim heuristic is retired because the claims are now true.
status, handoff = md["00-status.md"], md["handoff.md"]
QUOTE = "I approve both pls publish the branches and commit all the changes to main"
if not re.search(r"^- Gate 4 - Slice plan: \*\*APPROVED 2026-10-12\*\* by the user", status, flags=re.M):
    fail("R9", "00-status.md Gate 4 line does not record the 2026-10-12 approval")
if not re.search(r"^- Gate 3 - Program Design: \*\*RE-APPROVED 2026-10-12\*\* by the user", status, flags=re.M):
    fail("R9", "00-status.md Gate 3 line does not record the 2026-10-12 re-approval")
for item in ("- [x] Explicit user approval of Gate 4, 2026-10-12", "- [x] Explicit user re-approval of Gate 3, 2026-10-12"):
    if item not in status:
        fail("R9", f"00-status.md checklist lacks: {item}")
history = status.split("\n### Approval history\n", 1)[1].split("\n### ", 1)[0] if "\n### Approval history\n" in status else ""
if QUOTE not in history:
    fail("R9", "00-status.md approval history lacks the user's approval")
if "**APPROVED by the user on 2026-10-12**" not in s4:
    fail("R9", "04-slices.md does not record its approval")
if not handoff.startswith("# Envoi: Gates 1-4 approved"):
    fail("R9", "handoff.md title does not record the approvals")
STALE = re.compile(r"unapproved (?:Gate 4 )?draft|awaits? re-approval|awaiting re-approval|awaits? (?:the user's answers? to )?`Approve Gate [34]|pending Gate 4 approval", re.I)
current = {
    "00-status.md": status.split("\n### Reopening 2026-10-10", 1)[0] + status.split("\n## Slices\n", 1)[1].split("\n## ", 1)[0],
    "04-slices.md": s4.split("\n## Revision 2026-10-12\n", 1)[0],
    "handoff.md": handoff.split("\n## Product scope to preserve\n", 1)[0] + handoff.split("\n## Next authorized action\n", 1)[1].split("\n## ", 1)[0],
    "roadmap.md": md["roadmap.md"].split("\n## ", 1)[0],
    "stack-recommendation.md": md["stack-recommendation.md"].split("\n## ", 1)[0],
    "research.md": md["research.md"].split("\n## ", 1)[0],
    "01-product.md": md["01-product.md"].rstrip().splitlines()[-1],
}
for f, text in current.items():
    for l in text.splitlines():
        if STALE.search(l):
            fail("R9", f"{f} current state still reads as unapproved: {l[:90]}")

# R10 protected documents unchanged from the base; 01-product.md may change only its closing status line.
# 03-program-design.md may instead equal the re-approved text of the 2026-10-12 Gate 3 reopening, pinned by hash;
# any further edit to it must update this hash on purpose.
G3_REOPENING_SHA256 = "b24f79865afdc655c4539092344bcb72d8db0d96eb577e7740e8599620688cb4"
for root, _, files in os.walk(folder):
    for name in sorted(files):
        rel = os.path.relpath(os.path.join(root, name), folder)
        if rel in ("02-architecture.md", "03-program-design.md") or rel.startswith("mockups" + os.sep):
            data = open(os.path.join(root, name), "rb").read()
            if data == git_show(f"docs/plans/envoi/{rel}"):
                continue
            if rel == "03-program-design.md" and hashlib.sha256(data).hexdigest() == G3_REOPENING_SHA256:
                continue
            fail("R10", f"protected file changed: {rel}")
b01 = git_show("docs/plans/envoi/01-product.md").decode("utf-8").splitlines()
a01 = md["01-product.md"].splitlines()
changed = [l for l in difflib.unified_diff(b01, a01, lineterm="", n=0) if l[:1] in "+-" and l[:3] not in ("+++", "---")]
if any(not l[1:].startswith("**Gate 1 approved") for l in changed) or len(changed) > 2:
    fail("R10", "01-product.md changed beyond its closing status line")

# R11 superseded image and Zapier contracts are absent from the slice plan
for token in ("ZAPIER_MENU_HOOK_URL", "T_IMAGE_ACCESS", "T_SOURCE_SWEEP", "expire_imports", "sweep_sources",
              "menu_import_sources", "capability URL", "zapier/dispatch"):
    if token in s4:
        fail("R11", f"superseded token in 04-slices.md: {token}")

# R12 mirrors carry the new slices
for f in ("00-status.md", "handoff.md", "roadmap.md", "stack-recommendation.md", "research.md"):
    for token in ("S16", "S17"):
        if not re.search(rf"\b{token}\b", md[f]):
            fail("R12", f"{f} does not mention {token}")

# R13 build order and cut order agree across the mirrors
CATS = [("PYUSD", r"\bPYUSD\b|\bS1[67]\b"), ("scan", r"\b[Ss]can\b|\bS10\b"), ("S14", r"\bS14\b|\bAPIMatic\b")]


def cat_sequence(text):
    firsts = []
    for name, pat in CATS:
        m = re.search(pat, text)
        if m:
            firsts.append((m.start(), name))
    return [name for _, name in sorted(firsts)]


r13_statements = 0
cut = s4.split("- **Cut order.**", 1)[1].split("\n- **", 1)[0] if "- **Cut order.**" in s4 else ""
items = re.findall(r"^\s+(\d)\. \*\*([^*]+)\*\*", cut, flags=re.M)
expected_cut = [cat_sequence(t)[0] if cat_sequence(t) else None for _, t in items]
if [int(n) for n, _ in items] != list(range(1, len(items) + 1)) or len(items) != 3 or None in expected_cut or len(set(expected_cut)) != 3:
    fail("R13", f"04-slices.md cut order list is not three distinct numbered items: {items}")
else:
    nsent = 0
    for f, s in md.items():
        for line in s.splitlines():
            for sentence in re.split(r"(?<=[.!?;])\s+", re.sub(r"[*`]", "", line)):
                if "cut order" not in sentence.lower():
                    continue
                seq = cat_sequence(sentence)
                if len(seq) < 2:
                    continue
                nsent += 1
                if seq != [c for c in expected_cut if c in seq]:
                    fail("R13", f"{f} states cut order {seq}, 04-slices.md lists {expected_cut}: {sentence[:90]}")
    for sl, ordinal in re.findall(r"^- \[[ x]\] (S\d+) - .*?\b(first|second|third)\b in the cut order", st, flags=re.M):
        want = ["first", "second", "third"][expected_cut.index(cat_sequence(sl)[0])] if cat_sequence(sl) else None
        if ordinal != want:
            fail("R13", f"00-status checklist puts {sl} {ordinal} in the cut order, 04-slices.md puts it {want}")
    r13_statements = nsent
    if nsent < 4:
        fail("R13", f"only {nsent} cut-order statements found; the mirrors lost them")

# R14 curated prose counts: each claim must be found exactly once and agree with the computed value.
# Claims are located by wording; a reworded claim fails here until this list is updated.
section = {}
s4_secs = s4.split("\n## Slices\n", 1)[1].split("\n## Test assignment\n", 1)[0]
for m in re.finditer(r"^### (S\d+) .*?(?=^### |\Z)", s4_secs, flags=re.M | re.S):
    section[m.group(1)] = m.group(0)
G3N, G3C = len(named), sum(named.values())
unit_counts = {}
for t, u in unit_of.items():
    n, c = unit_counts.get(u, (0, 0))
    unit_counts[u] = (n + 1, c + named[t])
slice_of = {name: sl for sl, name, _, _ in assigned}


claims_checked = []


def claim(label, text, pattern, check):
    claims_checked.append(label)
    found = re.findall(pattern, text, flags=re.M)
    if len(found) != 1:
        fail("R14", f"{label}: claim found {len(found)} times")
        return None
    g = found[0] if isinstance(found[0], tuple) else (found[0],)
    problem = check(g)
    if problem:
        fail("R14", f"{label}: {problem}")
    return g


def want(pairs):
    bad = [f"says {got}, expected {exp}" for got, exp in pairs if num(got) != exp]
    return "; ".join(bad)


claim("04 revision bullet", s4,
      r"All ([\w-]+) named tests and (\w+) cases of the re-approved Gate 3 test plan are assigned once each, and named additions grow from (\w+) to (\w+)\.",
      lambda g: want(zip(g, (G3N, G3C, len(base_additions), len(additions)))))
claim("04 assignment totals", s4,
      r"Every one of the (\w+) named tests in the re-approved Gate 3 test plan, (\w+) standalone tests and (\w+) groups covering (\w+) cases",
      lambda g: want(zip(g, (G3N, len(standalone), len(groups), G3C))))
claim("04 removed names", s4, r"^The (\w+) names the Gate 3 \[test delta\]", lambda g: want(zip(g, (len(removed),))))
br = claim("04 additions breakdown", s4,
           r"^([\w-]+) named additions: (\w+) cover approved Gate 2 and Gate 3 contracts [^,]+, (\w+) are test refinements this plan adds \([^)]*\), and (\w+) are pin falsifiers\.",
           lambda g: want(zip((g[0], g[3]), (len(additions), falsifiers)))
           or ("" if None not in map(num, g) and num(g[1]) + num(g[2]) + num(g[3]) == num(g[0]) else f"parts {g[1:]} do not sum to {g[0]}"))
if br:
    claim("04 additions re-test note", s4, r"^Two of the (\w+), both in S7,", lambda g: want(zip(g, (num(br[1]),))))
    claim("04 contract additions split", s4,
          r"^The (\w+) are the (\w+) of the review's major fixes plus the (\w+) D9 limits [^,]*, the (\w+) operator-flag checks [^.]*? and the (\w+) D10 kill switch",
          lambda g: want(zip((g[0],), (num(br[1]),)))
          or ("" if None not in map(num, g) and sum(map(num, g[1:])) == num(g[0]) else f"parts {g[1:]} do not sum to {g[0]}"))
claim("S11 prose", section.get("S11", ""), r"^([\w-]+) named tests in (\d+) cases\.$", lambda g: want(zip(g, computed.get("S11", (0, 0)))))
basket = unit_counts.get("basket", (0, 0))
basket_in = lambda sl: sum(1 for t, u in unit_of.items() if u == "basket" and slice_of.get(t) == sl)
claim("S16 prose", section.get("S16", ""),
      r"^([\w-]+) named tests in (\d+) cases: Gate 3's PYUSD purchase unit, (\d+) named tests in (\d+) cases, plus (\w+) of its (\w+) basket-lock tests",
      lambda g: want(zip(g, computed.get("S16", (0, 0)) + unit_counts.get("purchase", (0, 0)) + (basket_in("S16"), basket[0]))))
unit_line = claim("04 unit placement sentence", s4,
                  r"^By Gate 3 slice unit: the (\d+) core tests keep the earlier draft's placement; the (\w+) basket-lock and PayPal abandonment tests split (\w+) to (S\d+) and (\w+) to (S\d+); the import unit goes to (S\d+), the PYUSD purchase unit to (S\d+) and the PYUSD recovery unit to (S\d+)\.",
                  lambda g: want(zip((g[0], g[1], g[2], g[4]), (unit_counts.get("core", (0, 0))[0], basket[0], basket_in(g[3]), basket_in(g[5])))))
claim("04 checkpoint", s4, r"If the (\w+) slices through (S\d+) in build order \(([^)]*)\)",
      lambda g: (want(zip((g[0],), (order.index(g[1]) + 1 if g[1] in order else -1,)))
                 or ("" if [x for p in re.split(r", | and ", g[2]) for x in (
                     [f"S{i}" for i in range(int(p.split("-")[0][1:]), int(p.split("-")[1][1:]) + 1)] if "-" in p else [p])]
                     == order[:order.index(g[1]) + 1] else f"lists ({g[2]}), build order has {order[:order.index(g[1]) + 1]}")))
claim("04 slice count", s4, r"^\d+\. \*\*(\w+) slices in about four weeks\.\*\*", lambda g: want(zip(g, (len(order),))))
claim("04 first window", s4, r"makes the first window (\w+) slices", lambda g: want(zip(g, (sum(1 for w in window.values() if w == window[order[0]]),))))
claim("04 S16 size", s4, r"S16 carries (\w+) named tests and (\d+) of the (\d+) cases", lambda g: want(zip(g, computed.get("S16", (0, 0)) + (G3C,))))
claim("00-status Gate 4 line", status,
      r"all (\w+) named tests and (\w+) cases are assigned once each, the (\w+) removed names nowhere, and ([\w-]+) named additions, up from (\w+): (\w+) cover contracts [^,]+, (\w+) are refinements of this plan and (\w+) are pin falsifiers\.",
      lambda g: want(zip(g[:5], (G3N, G3C, len(removed), len(additions), len(base_additions))))
      or ("" if br and [num(x) for x in g[5:]] == [num(x) for x in br[1:]] else f"breakdown {g[5:]} differs from 04's {br[1:] if br else None}"))
claim("00-status revision checklist", status,
      r"place the (\w+) basket-lock and abandonment tests (\w+) in (S\d+) and (\w+) in (S\d+); add ([\w-]+) named additions, (\w+) with the revision, (\w+) with the major review fixes, (\w+) with the minor ones and (\w+) with the Gate 3 reopening, for (\w+) in all\.",
      lambda g: want(zip((g[0], g[1], g[3], g[5], g[10]), (basket[0], basket_in(g[2]), basket_in(g[4]), new_additions, len(additions))))
      or ("" if None not in map(num, g[6:10]) and sum(map(num, g[6:10])) == num(g[5]) else f"{g[6:10]} do not sum to {g[5]}"))
claim("00-status revision checklist totals", status, r"Assign all (\w+) named tests and (\w+) cases once each and the (\w+) removed names nowhere;",
      lambda g: want(zip(g, (G3N, G3C, len(removed)))))
claim("handoff build order", handoff, r"(\w+) slices under stable IDs in the build order ((?:S\d+, )+S\d+), with",
      lambda g: want(zip((g[0],), (len(order),))) or ("" if g[1].split(", ") == order else f"lists {g[1]}, plan order is {', '.join(order)}"))
claim("handoff counts", handoff, r"all (\w+) named tests and (\w+) cases of the re-approved Gate 3 assigned once each, plus ([\w-]+) named additions",
      lambda g: want(zip(g, (G3N, G3C, len(additions)))))
claim("roadmap counts", md["roadmap.md"], r"\((\d+) previous names mapped to (\d+) named tests and (\d+) cases; (\d+) names removed, (\d+) cases added\)",
      lambda g: want(zip(g, (prev_names, G3N, G3C, len(removed), added_cases))))
claim("Gate 3 unit counts", g3,
      r"By slice unit: the 2026-10-07 core keeps (\d+) named tests and (\d+) cases; the basket lock and PayPal abandonment have (\d+) and (\d+); the import slice has (\d+) and (\d+); the PYUSD purchase slice has (\d+) and (\d+); and the PYUSD recovery slice has (\d+) and (\d+)\.",
      lambda g: want(zip(g, sum((unit_counts.get(u, (0, 0)) for u in ("core", "basket", "import", "purchase", "recovery")), ()))))

# R15 every Gate 3 test runs in the slice its Gate 3 unit names: core tests keep the base draft's slice,
# and the import, PYUSD purchase and PYUSD recovery units go where the unit sentence says, to a slice titled for them
base_slice = {name: sl for sl, name, _, _ in base_assigned}
if unit_line:
    target = {"import": unit_line[6], "purchase": unit_line[7], "recovery": unit_line[8]}
    keyword = {"import": r"\bimport\b", "purchase": r"\bPYUSD\b.*\bpurchase\b", "recovery": r"\bPYUSD recovery\b"}
    for u, sl in target.items():
        if not re.search(keyword[u], titles.get(sl, "")):
            fail("R15", f"the {u} unit goes to {sl}, whose title is {titles.get(sl)!r}")
    for t, u in unit_of.items():
        here = slice_of.get(t)
        if here is None:
            continue
        if u == "core" and base_slice.get(t) != here:
            fail("R15", f"core test {t} runs in {here}, the base draft put it in {base_slice.get(t)}")
        if u in target and here != target[u]:
            fail("R15", f"{u} test {t} runs in {here}, the unit goes to {target[u]}")
        if u == "basket" and here not in (unit_line[3], unit_line[5]):
            fail("R15", f"basket-lock test {t} runs in {here}, outside {unit_line[3]} and {unit_line[5]}")

# R16 curated build tokens: the first slice in build order whose Builds paragraph names a token builds it;
# no earlier slice may name it, and every later slice that names it must reach its builder through "Depends on".
BUILD_TOKENS = ["src/lib/http/origin.ts", "assertSameOrigin", "src/lib/http/bounded-body.ts", "src/lib/ratelimit.ts",
                "GET /health/operator", "requireOperator", "grant-operator", "src/domain/pyusd/recovery.ts", "decideRecoveryStep"]


def closure(sl, seen=None):
    seen = set() if seen is None else seen
    for d in deps.get(sl, []):
        if d not in seen:
            seen.add(d)
            closure(d, seen)
    return seen


builds = {sl: (re.search(r"\*\*Builds\.\*\*\n(.*?)(?:\n\n|\Z)", text, flags=re.S) or [None, ""])[1] for sl, text in section.items()}
r16_uses = 0
for token in BUILD_TOKENS:
    builder = next((sl for sl in order if token in builds.get(sl, "")), None)
    if builder is None:
        fail("R16", f"no slice's Builds names {token}")
        continue
    for sl in order:
        if sl == builder or token not in section.get(sl, ""):
            continue
        r16_uses += 1
        if order.index(sl) < order.index(builder):
            fail("R16", f"{sl} names {token} before {builder} builds it")
        elif builder not in closure(sl):
            fail("R16", f"{sl} names {token}, built in {builder}, which its Depends on does not reach")

print(f"links {nlinks} ({nanch} anchored); gate3 named {len(named)} ({len(groups)} groups, {len(standalone)} standalone), "
      f"cases {sum(named.values())}; assigned {len(assigned)}; additions {len(additions)} ({new_additions} new, {falsifiers} falsifiers); "
      f"removed {len(removed)}; order {len(order)}; added lines {len(added)}; "
      f"cut-order statements {r13_statements}; curated claims {len(claims_checked)}; build-token uses {r16_uses}")
if fails:
    print("FAIL " + " ".join(sorted(fails)))
    for r in sorted(fails):
        for m in fails[r]:
            print(f" - {r}: {m}")
    sys.exit(1)
print("PASS")
