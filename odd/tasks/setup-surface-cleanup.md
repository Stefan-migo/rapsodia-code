# setup-surface-cleanup

**Branch:** `odd/setup-surface-cleanup` · **Worktree:** `../rapsodia-code-odd-setup-surface-cleanup`

**TDD:** OFF — this repository has no test harness (`npm test` exits 1: "No test files found").

## Objective

Make the project-setup surface tell the truth in both directions: retire the legacy `/rapso-init`
path that the published package never shipped, ship the `/new-project` affordance the shipped
`bootstrap` skill already promises, and align the main-worktree guard with the state it is actually
meant to protect.

## Problem

Three distinct defects, all instances of the same class: **what the surface promises and what the
product delivers have drifted apart.**

### 1. `/rapso-init` is unreachable for every consumer

`rapso-init.sh` and `commands/rapso-init.md` live at the repository root and are **not in the
published tarball**. `cli/package.json` declares `"files": ["dist", "src/template"]`; `npm pack
--dry-run` in `cli/` reports 44 files, none of them either path. `--install-global` copies
`commands/rapso-init.md` into `~/.config/opencode/commands/`, so the flag is a mechanism for
**repo clones only**.

Its rename (`dbf1d1b`) updated the repository copies and left the machine-global copy orphaned:
`~/.config/opencode/commands/cortex-init.md` survived, still pointing at the retired
`/home/stefan/Cortex/rapso-init.sh`. That is how the defect surfaced.

`rapso-init.sh` also duplicates `rapso adopt`, which *is* published, carries a manifest, is
idempotent, and retires legacy agent identities. And it links skills with `ln -sf` from
`$RAPSO_PACK_DIR/cli/src/template/...` — a repository path, and a symlink, which is precisely the
class `#54` had to work around elsewhere on native Windows.

### 2. `/new-project` does not exist, but a shipped skill says it does

`cli/src/template/.opencode/skills/bootstrap/SKILL.md` L15 declares:

> ## When to Load
> - User types `/new-project`

Nothing installs that command: the template ships no `.opencode/commands/`, the CLI never writes
into `~/.config/opencode/commands/`, and no such file exists globally. The skill itself works — it
is the documented trigger that is fictional.

The `bootstrap` skill is additionally undiscoverable: the template's `AGENTS.md` Skills table lists
only `graphify` and `design-system`, and `USER-GUIDE.md` never mentions it.

### 3. The main-worktree guard blocks the output of `rapso close`

`.githooks/pre-commit` L13-26 is named the *Main worktree code guard*, but its allowlist is a single
pattern, `.rapsodia-code/sessions/*`. Every other path is refused.

`rapso close` → `cli/src/engine/session.ts` L107-121 exports the Engram snapshot into `wiki/`,
writing `wiki/log.md` and `wiki/engram/.engram-sync-state.json`. Those files are **tracked**, so the
guard refuses to commit the output of the product's own close flow. Observed in the main worktree:

```
 M wiki/engram/.engram-sync-state.json
 M wiki/log.md
 wiki/engram/.engram-sync-state.json | 4479 ++++++++++++++++++++++++++++++++
```

The guard is directory-based, not branch-based: it compares `git rev-parse --git-dir` against
`--git-common-dir`, which are equal only in the main worktree. A feature branch created inside the
main directory does not evade it; only a linked worktree does. The guard is also local and bypassable
(`--no-verify`), GitHub `main` is not branch-protected, and `.github/workflows` does not exist, so it
guarantees process *shape*, never review *integrity*. That is a separate finding, recorded below.

## Why

- `rapso-init.sh` costs maintenance, ships nowhere, duplicates `adopt`, and contradicts the Windows
  work in the same release. Leaving it means the next rename orphans a machine copy again.
- A shipped skill that names a nonexistent command teaches every consumer to trust a broken
  affordance, and `bootstrap` — a headline template feature — stays invisible.
- A guard that refuses its own product's output is a guard people learn to bypass. Every bypass
  erodes the rule it is meant to enforce.

## Scope

In scope:

- `rapso-init.sh` — delete.
- `commands/rapso-init.md` — delete.
- `.gitignore` — drop the entries that existed only for `rapso-init.sh` install artifacts.
- `scripts/rapso-sync.sh` — drop the single rewrite that migrated consumers onto the retired
  command. The script itself stays.
- `.githooks/pre-commit` — widen the step 1b allowlist to local regenerable state.
- `cli/src/template/.opencode/commands/new-project.md` — add.
- `cli/src/template/AGENTS.md` — advertise `bootstrap` in the Skills table.
- `odd/tasks/setup-surface-cleanup.md` — this document.
- The machine-global `~/.config/opencode/commands/rapso-init.md` — uninstall (not a repo file).

Out of scope (unchanged, deliberately — see also *Follow-ups*):

- `scripts/rapso-sync.sh` itself. Only the one rewrite that pointed at the retired command is
  removed; the script stays. That it is referenced by the shipped `rapso-session` skill while
  shipping nowhere is a separate instance of the same class.
- `wiki/` tracking. 108 files are tracked while `.gitignore` L5 ignores `/wiki/`. Untracking them is
  a history-bearing decision and is not taken here.
- GitHub branch protection. The guard's softness is a real gap but a separate decision.
- `/.opencode/skills/rapso-*` and `/.opencode/skills/ponytail-*` ignores. Same family as the
  `/.opencode/commands/` ignore, but touching them changes how this repository dogfoods its own
  skills.

## Constraints

- This repository has **no lint script** and **no test harness**. Verification is `npm run typecheck`,
  `npm run build` (both from `cli/`), `bash -n`, and concrete shell scenarios. `shellcheck` is not
  installed.
- The Atomicity Gate blocks any commit staging more than 5 files.
- The main-worktree guard blocks every path in this change set from the main worktree, so all commits
  happen in this worktree.
- Removing the global command is a machine step, reversible from git history
  (`dbf1d1b~1:commands/cortex-init.md` holds the pre-rename copy).
- `rapso-init.sh` and `commands/rapso-init.md` are recoverable from git history; no other copy is
  needed.

## Tasks

- [x] **T01** — Delete `rapso-init.sh`, `commands/rapso-init.md`, and the repo-local installed copy
  `.opencode/commands/rapso-init.md`.
- [x] **T02** — Remove the `.gitignore` entries that existed only for `rapso-init.sh` install
  artifacts (`/rapso-init.sh.bak-*` and its comment; `/.opencode/commands/`), so the retired
  installer leaves no dead rules.
- [x] **T03** — Uninstall the machine-global `~/.config/opencode/commands/rapso-init.md`.
- [x] **T04** — Widen the `.githooks/pre-commit` step 1b allowlist from `.rapsodia-code/sessions/*`
  to local regenerable state: `.rapsodia-code/*`, `wiki/*`, `.atl/*`. Keep the comment honest about
  what the guard does and does not guarantee.
- [x] **T05** — Add `cli/src/template/.opencode/commands/new-project.md`, a thin door to the
  `bootstrap` skill. No promise beyond what the skill does.
- [x] **T06** — Add `bootstrap` to the Skills table in `cli/src/template/AGENTS.md` so the skill is
  discoverable at all.
- [x] **T07** — Remove the `s|cortex-init|rapso-init|g` rewrite from `scripts/rapso-sync.sh`. Added
  after the fact, with a reason: the rewrite is *invalidated* by T01, not merely adjacent to it.
  The sync tool rewrites legacy consumer `AGENTS.md` files, and its table migrated `cortex-init`
  onto `rapso-init` — the command this change deletes. Retiring the command while the tool keeps
  steering consumers onto it would ship a self-contradictory state, and rewriting a legacy token
  onto a missing path only moves a dead reference. Only that one line is removed; every other
  rewrite still targets a live command, and `rapso-sync.sh` itself stays.

## Acceptance criteria

1. No repository file references `rapso-init.sh` or `commands/rapso-init.md`, and neither path
   exists.
2. `npm pack --dry-run` in `cli/` lists `src/template/.opencode/commands/new-project.md`.
3. A project generated by `rapso init` contains `.opencode/commands/new-project.md` whose frontmatter
   matches the other command files in shape.
4. The template's `AGENTS.md` Skills table names `bootstrap` with a truthful trigger.
5. No rewrite in `scripts/rapso-sync.sh` names a retired command, and `bash -n scripts/rapso-sync.sh`
   exits 0.
6. `bash -n .githooks/pre-commit` exits 0, and staging `wiki/log.md` in the **main** worktree is
   accepted by the guard while staging a product file is still refused.
7. `~/.config/opencode/commands/rapso-init.md` is absent.

## Progress

- [x] T01
- [x] T02
- [x] T03
- [x] T04
- [x] T05
- [x] T06
- [x] T07

All seven tasks are complete and verified above. Nothing was left partial.

## Verification

1. **Search for survivors** — `grep -rn "rapso-init" --exclude-dir=node_modules --exclude-dir=graphify-out
   --exclude-dir=wiki .` → report the real output.
2. **Tarball** — `cd cli && npm pack --dry-run` → report the `new-project` line and the totals.
3. **Typecheck and build** — `cd cli && npm run typecheck` and `npm run build` → exit codes.
4. **Guard behavior** — `bash -n .githooks/pre-commit`; then, in the **main** worktree, stage
   `wiki/log.md` and confirm the guard accepts, and stage a product file and confirm it refuses.
   Report the real output of each.
5. **Generated project** — `rapso init <scratch> --yes` in a throwaway directory, then confirm
   `.opencode/commands/new-project.md` exists and `AGENTS.md` names `bootstrap`.
6. **Sync script** — `bash -n scripts/rapso-sync.sh` → exit code.
7. **Staging discipline** — `git status --short` → only the intended paths.

## Evidence

### T01 / T02 / T07 — the legacy path is gone

```
$ grep -rn "rapso-init" . | grep -v node_modules | grep -v graphify-out | grep -v "^./wiki/" | grep -v "^./odd/tasks/"
./scripts/rapso-sync.sh:106:    # `cortex-init` is deliberately absent. Its rename target, `/rapso-init`, has been retired:
```

The single remaining hit is the comment T07 added, which exists to stop a future reader restoring the
rewrite. `rapso-init.sh` and `commands/rapso-init.md` are deleted, the repo-local installed copy
`.opencode/commands/rapso-init.md` is removed, and the `.gitignore` backup pattern is gone.

### T03 — the machine-global command is uninstalled

```
$ ls ~/.config/opencode/commands/
sdd-apply.md  sdd-archive.md  sdd-continue.md  sdd-explore.md  sdd-ff.md  sdd-init.md
sdd-new.md  sdd-onboard.md  sdd-research.md  sdd-status.md  sdd-verify.md
skill-creator.md  skill-registry.md
```

13 files, no `rapso-init.md` and no `cortex-init.md`.

### T04 — the guard, exercised with the real hook

Run in a throwaway repository whose `core.hooksPath` points at this worktree's `.githooks`, so the
hook under test is the real file and no state in either real worktree is touched. The directory
property is confirmed there first, since it is what makes the guard active:

```
git-dir:        .git
git-common-dir: .git          → equal, so the guard is active
```

| Case | Staged path | Result |
|------|-------------|--------|
| A | `wiki/log.md` | `[master a56118f] local state` — exit 0 |
| B | `cli/src/index.ts` | `Main worktree guard: direct commits are only allowed for local regenerable state (.rapsodia-code/**, wiki/**, .atl/**)` — exit 1 |
| C | `.atl/skill-registry.md`, `.rapsodia-code/sessions/s.md` | `[master 2e8c87d] sessions and atl` — exit 0 |

Case B is the control: the widen did not turn the guard into a passthrough.

### T05 / T06 — the command ships and reaches a generated project

```
$ cd cli && npm pack --dry-run | grep new-project
npm notice 1.2kB src/template/.opencode/commands/new-project.md

$ node cli/dist/index.js init surface-check --no-git --yes
$ ls surface-check/.opencode/commands/
new-project.md
$ grep -n bootstrap surface-check/AGENTS.md
102:| `skill({name:"bootstrap"})` | Specializing this template for the project — interview, research, agent team. Reached with `/new-project` |
```

The tarball total is 44 files both before and after, which is not a rounding error: this change adds
`new-project.md` and the file list differs in exactly two entries. See *Follow-ups* 5 for the
untracked `.gitkeep` that accounts for the other.

### Syntax and build

```
$ bash -n .githooks/pre-commit    → exit 0
$ bash -n scripts/rapso-sync.sh   → exit 0
$ cd cli && npm run typecheck     → exit 0
$ cd cli && npm run build         → exit 0
```

No `.ts` file is in the change set, so `gga` reported `⚠️ No matching files staged for commit` on
each commit. That is its real output, not a pass it granted.

## Follow-ups found, NOT fixed (out of scope)

1. **`scripts/rapso-sync.sh` is referenced by a shipped skill and ships nowhere.** The template
   ships `engram-export-wiki.sh`, `install-deps.sh`, `setup.sh` — not `rapso-sync.sh`. Yet
   `cli/src/template/.opencode/skills/rapso-session/SKILL.md` L149 and L159 both instruct the reader
   that `scripts/rapso-sync.sh` performs the `.cortex-sessions/ready-for-sdd/` → `ready-for-odd/`
   migration "for every project on the list". Same defect class as `/new-project`. T07 removed only
   the rewrite that pointed at the retired command; this reference, and the script's own future,
   are untouched.
2. **`wiki/` is tracked while gitignored.** `.gitignore` L5 ignores `/wiki/`; 108 files under it are
   tracked anyway. Whether the snapshot is versioned or purely local is unresolved.
3. **The guard is the only gate, and it is soft.** `main` is not branch-protected, `.github/workflows`
   does not exist, and `--no-verify` bypasses the hook.
4. **`.opencode/skills/rapso-*` and `/ponytail-*` are gitignored in this repository** while the
   equivalent skills are tracked in `cli/src/template/.opencode/skills/`. The dogfooding story is
   inconsistent.
5. **A tarball file exists only on one developer's disk.**
   `cli/src/template/.opencode/tools/node_modules/.gitkeep` is **untracked** (see `.gitignore` L12
   and L14) yet appears in `npm pack --dry-run` run from the main worktree, because npm includes
   what is on disk. A linked worktree has no copy, so the same command from a worktree omits it.
   The published package therefore depends on a file no clone receives.

## Next step

Open the pull request for this branch. After it merges: bump `cli/package.json` to `1.0.3`, tag, and
`npm publish` from `cli/` — the release path is manual, since `.github/workflows` does not exist.
This branch is the second half of that release; #56 was the first.
