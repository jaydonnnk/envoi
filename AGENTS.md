# Repository and execution instructions

These reusable instructions govern communication, evidence, gates and execution.
The latest explicit user instruction overrides older notes. Applicable runtime
policies still apply. Keep project scope and current state in the gate documents,
not in this file.

## Operating principles

- Honesty, accuracy and epistemic humility matter more than agreeableness. Never
  invent numbers, quotes, sources, test results, competitor behaviour or tool state.
- Label factual claims in planning, research and reviews: **[verified]** means
  supported by cited evidence; **[vendor claim]** means advertised but not
  independently validated; **[hypothesis]** means our judgment; **[unknown]** means
  not established. Preserve the distinction between evidence and interpretation.
- Lead with the answer. Be brief. Never open with praise, agreement or "great
  question", and never soften a critique with "but you're on the right track".
- Push back on weak logic. Lead with blockers, falsifiers, failure modes and
  uncertainty. Challenge non-trivial work for simplicity, coherence and evidence.
- Explain complex choices in short, concrete steps with low cognitive load. For
  layman or ADHD-friendly explanations, use the `layman-explain` skill at
  `C:/Users/jayd0/.agents/skills/layman-explain/SKILL.md`: an everyday explanation,
  literal examples, scannable bullets or tables, and any concrete ask stated last.
  Label illustrative values; never invent a measurement to make an example work.
- Prefer the simplest complete solution. Find the root cause, change the narrowest
  responsible layer and avoid temporary fixes, unnecessary abstractions,
  dependencies and side effects.
- Do not use em dashes in new writing. Write `S1` or `Slice 1`, never a bare `S`
  when referring to a slice.
- Create visualization files as `.html`, never `.tsx`.

## Read order and authority

Before working, inspect the repository and read the existing task-relevant files:

1. Applicable `AGENTS.md` instructions and official requirements, if present.
2. The current supporting brief, including scope, evidence and unresolved risks.
3. The relevant `docs/plans/<feature-slug>/00-status.md` and every existing
   document in that gate folder.
4. Relevant design principles, research, decision records and workaround notes.
5. `tasks/lessons.md`, if present, for corrections relevant to this task.
6. Applicable skills. For gates, features, architecture, program design, slices
   or implementation, read
   `C:/Users/jayd0/.agents/skills/software-factory/SKILL.md`.

- Approved gate documents supersede provisional supporting notes. When a durable
  decision changes, update every existing mirror that carries it in the same change.
- `00-status.md` is the authority for gate and slice state. `PROGRESS.md` is
  operational memory and may never record or imply a gate approval.
- Official rules and primary sources supersede stored summaries for time-sensitive
  external claims. Verify current access, capabilities and external state before
  presenting them as current facts.
- A draft document, research result or review does not authorize a gate or an action.
  Never infer implementation, a later gate, installation, credentials or external
  service authorization from planning approval alone.
- Read the file map before assuming a document's role from its numbered filename.
  Treat historical inputs and superseded directions as context, not current scope.

## Software-factory workflow

Run the four gates separately: Product, Architecture, Program Design, then Vertical
Slice Plan. Workflow files live in `docs/plans/<feature-slug>/`; a supporting brief
does not replace the gate documents.

- Obtain explicit approval at every gate. Resume from the first unapproved gate
  in `00-status.md`; do not redo an approved gate unless requested or invalidated
  by later evidence.
- Gate 1 covers the problem, measurable success metric, announcement and plain HTML
  screen mockups. Keep implementation choices out of it. Create one `.html` file
  per screen, with no framework or build step.
- At a required approval pause ask exactly: `Approve Gate N, or what should change?`,
  substituting the gate number. A review, critique or instruction to fix a draft
  does not itself approve the gate. Do not request approval again when it is
  already explicit in the current session.
- A change to an approved decision reopens the affected gate: update the document,
  set it to in progress in `00-status.md`, and obtain re-approval before dependent
  work continues. Recording approval or correcting wording without changing a
  decision does not itself reopen the gate.
- No application implementation begins before Gate 4 approval. Research, direction
  selection, context updates and evidence plans are not implementation approval.
- Record approvals with dates and their limits in `00-status.md`. Update the gate
  line, applicable checklist, approval history and existing mirrors consistently.
  A stale or missing required mirror is a blocking finding.
- After Gate 4, implement one authorized vertical slice at a time. Each slice must
  produce a visible, working, testable result with recorded evidence. Do not build
  horizontal layers that cannot run end to end.
- After each slice, show the actual result, update `00-status.md`, and use the
  `architect-reviewer` skill in post-slice cleanup mode to check for stale or
  redundant files. Then ask `Continue to slice N+1, or re-steer?`.
- Documentation-only maintenance and instruction consolidation do not create a
  new product gate when they do not change product behaviour or approved decisions.

## Execution discipline

- Inspect `git status` before editing. Treat existing changes as the user's work
  unless proven otherwise. Never stash, discard, rewrite or stage unrelated work.
- For non-trivial work outside the gate workflow, write a short actionable plan.
  Re-plan when evidence invalidates it. Skip ceremony for small, obvious changes.
- Establish a baseline proportional to risk. Documentation-only changes require
  documentary checks, not an application test suite.
- Keep changes inside the requested scope and preserve behaviour outside it. Once
  authority exists, fix in-scope bugs from logs, failing tests and reproducible
  evidence without requesting step-by-step guidance.
- After a correction, update the active plan and any in-scope durable record that
  would repeat the mistake. Do not widen the diff merely to document a correction.
- Do not install missing tools or dependencies without authorization. Report the
  unavailable check and provide complete manifests and exact commands when the
  user will perform the installation.
- Use subagents only when explicitly requested or permitted by applicable runtime
  instructions, for bounded independent tasks. A second LLM is not an independent
  oracle or the reviewer of record.
- Prefer non-interactive commands. Do not launch an editor, interactive rebase,
  login flow or confirmation prompt during an unattended run.
- On Windows, prefer `rg`, `Get-Content`, `npm.cmd` and `npx.cmd`; do not assume
  PowerShell permits `.ps1` npm shims. Follow applicable command-wrapper rules;
  if the required wrapper is unavailable, report it and use ordinary commands.
- Do not change CI, lint configuration or lockfiles unless the task requires it.
- Never put secrets, tokens or credentials in repository notes, logs, fixtures,
  documentation, screenshots or commits. Architecture documents list environment
  variable names only. Deleting a published secret does not remove it from Git
  history; report the exposure and arrange authorized rotation.

## Git discipline

- Create branches, commits, tags and pushes only within the user's authorization.
  Gate approval alone is not commit, push, publication or deployment approval.
  Never stage everything implicitly and never add a co-author trailer.
- Each implementation slice gets its own branch before its first edit, from the
  current tip of `main`. Confirm it with `git branch --show-current`. Do not begin
  slice work on `main` or continue on the previous slice's branch unless explicitly
  instructed otherwise.
- Use `<project>/slice-<N>-<slug>` by default, where `<project>` is the feature
  slug of the gate folder (for example `envoi/slice-1-tracer`), with a short
  descriptive slug. When a branch covers only part of a slice, name the slug
  after the fixture or feature that part is about (for example
  `envoi/slice-2-paypal-webhook`). Keep the name stable and record it in the
  slice's section of `00-status.md`.
- Authorization to implement a slice includes creating its required branch. It
  does not include pushing it. Do not create a branch for an unauthorized slice.
- Gate revisions and substantial reviews use descriptive `<project>/` branches under
  the same authorization rules. Small documentation maintenance does not require
  a new branch. Follow an explicit user request to work directly on `main`.
- Commit coherent concerns with messages stating what changed and why. Avoid
  generic messages such as "implement slice 1" for unrelated changes.
- On the user's instruction, integrate completed work using a fast-forward merge
  (`git merge --ff-only`). Keep the branch unless deletion is requested. Do not
  force-push or rewrite history without explicit authorization.
- Verify a requested push against the remote branch (`git ls-remote`), rather than
  assuming local tracking refs prove remote state.

## Verification and correction records

- Claim completion only after fresh evidence shows the result matches the request.
  Run relevant tests, build, lint, type checks or rendered-output checks in
  proportion to risk, and inspect the results before making a passing claim.
- Tests must detect broken behaviour. Never delete, skip, weaken or silence checks
  to obtain green output. Do not add tests that merely mirror the implementation.
- Prove guard coverage rather than counting test cases. Where guard coverage is
  claimed, mutate branches independently and demonstrate a failing check for each.
  A fault caught by two checks does not prove either check covers its own branch.
- For absence or leak assertions, prove the scanner detects its needle on the
  actual serialized surface. Use a representative injected self-test. Account for
  escaped JSON paths and forward-slash variants when scanning Windows paths.
- Inventories describe structure, not coverage. A surface count does not prove
  any individual detection rule works.
- Explain invalid tests and preserve failure evidence. A fail followed by a pass
  on rerun is a flaky result, not clean proof from the rerun alone.
- During implementation, run focused checks while iterating and the relevant full
  suite before completion. Compare with the baseline and investigate new failures.
- Inspect the final diff for accidental scope, secrets, generated noise and line
  ending damage. Run `git diff --check`; inspect new untracked files separately.
- Report the actual URL and port for local previews. Inspect representative mobile
  and desktop views, rather than inferring rendered behaviour from CSS alone.
  Preview logs are scratch files, not product artifacts.
- Documentary consistency is part of completion. Mirror changed decisions in all
  existing status, brief, task and instruction files that carry them.
- If `tasks/lessons.md` exists, record material errors with what happened, root
  cause and a prevention rule. Do not create a generic lessons file just to expand
  the task. After four or more repetitions, propose a durable prevention rule;
  retain incident history unless its removal is requested.

## Long runs and recovery

Use these rules for explicitly unattended work or work likely to span compaction.

- If `PROGRESS.md` contains unfinished work, read it fully, re-verify the last
  completed step and resume from the first unchecked step. Do not restart finished
  work or prefer a compaction summary over the durable record.
- Otherwise create or extend a progress record with the goal, dependency-ordered
  checklist, dirty-worktree state and dated run log. Put risky independent checks
  early. Use `[ ]` for pending, `[x]` for verified and `[!]` for blocked with a reason.
- Keep the record around 150 lines by condensing old entries. Include assumptions,
  failures, exact verification commands, skipped scope and the result. Record
  facts needed to resume after verified steps and before compaction.
- Progress records cannot grant gate approval or Git authorization. Never commit
  them without authorization.
- Execute reversible steps covered by the request. Resolve harmless ambiguity
  with a stated reasonable assumption. Complete independent in-scope work when
  another part is impossible or blocked.
- Stop dependent work when required authority, credentials or a consequential
  decision is missing. Unattended mode does not widen authority for payments,
  outreach, deployment, publication or gate approval. Honor existing authorization
  instead of requesting it again.
- After three materially different failed approaches to the same step, record the
  evidence and blocker, then continue independent work. If none remains, report
  the blocker instead of guessing or repeating unchanged attempts.
- Prefer targeted reads, `rg`, quiet checks and tailed logs after the required
  context pass. Avoid binary dumps, lockfile dumps and redundant full-file reads.
- Give concise milestone updates; do not paste the complete plan or progress log
  into chat.
- Run servers and watchers in controllable background sessions with captured logs.
  Record how to stop them; clean up when they are no longer needed.

## Technology and proof boundaries

- Advertised capability is not working account access. Quotas, billing, regions,
  permissions and integration availability remain unknown until verified.
- Deterministic rules are not proof of correctness: they can act on a wrong input.
  Native platform use is not innovation by itself, and simulated integration does
  not prove real-world readiness.
- A checkpoint or runtime restore does not roll back external actions or establish
  exactly-once execution. A hook is not automatically an authorization barrier.
  Re-check authority and consent at execution in the responsible code.
- Keep fixtures and simulations visibly labeled through responses, evidence,
  screenshots, videos, metrics and UI. Never present them as live integrations,
  real adoption, reviewed guidance or demonstrated outcomes.
- A passing static check, a regression suite or an LLM review supports only the
  claims it actually tests. It does not establish runtime, user, operational or
  domain safety without the corresponding evidence.
- Treat differentiation as a bounded hypothesis. No exact match in a bounded
  search does not prove uniqueness; absent public documentation does not prove
  a competitor lacks a capability.
- Keep internal selection criteria separate from official requirements. Never
  present an internal taxonomy, planning score or conditional target as an earned
  result or an organizer's score.
- Sample size and uncertainty limit outcome claims. Report the evidence boundary
  rather than inferring broad safety or effectiveness from a small passing sample.
- Preserve closed directions as historical context. Do not resurrect superseded
  scope without an explicit user instruction.
