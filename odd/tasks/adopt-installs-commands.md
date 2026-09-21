# adopt-installs-commands

**Branch:** `odd/adopt-installs-commands` · **Worktree:** `../rapsodia-code-odd-adopt-installs-commands`

**TDD:** OFF — this repository has no test harness (`npm test` exits 1: "No test files found").

## Objective

Make `rapso adopt` install the pack's `.opencode/commands/**`, so an existing project receives the
same command surface a project created by `rapso init` receives.

## Problem

`#57` shipped `cli/src/template/.opencode/commands/new-project.md` — the door to the `bootstrap`
skill, which until then was promised by shipped documentation and installed nowhere.

That PR verified the command reached a project created by **`rapso init`**. It never ran **`rapso
adopt`**. `adopt` installs only what `OWNED_PATHS` names, and `.opencode/commands/**` is named in
neither `OWNED_PATHS` nor `NEVER_PATHS` — it is simply unclassified, so the install loop skipped it.

The consequence lands exactly on the reader who already had a directory: `rapso adopt .` is the only
way to bring an existing project onto the pack, and it delivered the `bootstrap` skill (skills are
owned) without the command that reaches it.

Observed on a scratch project before the change: `Created (19)` listing
`.opencode/skills/bootstrap/SKILL.md` and no `.opencode/commands/new-project.md`.

## Why

Two setup paths must not disagree about what the pack contains. `init` and `adopt` are the same
product reaching the same reader by two routes, and a surface that exists on one route and not the
other is a coin flip for whoever picks the other.

`bootstrap` is a headline template feature — it turns the generic two-agent template into a
project-specific team. Reaching it required knowing to ask for the skill by name; the command is what
makes it discoverable. Half-shipping it is worse than not shipping it, because the documentation now
promises something only some readers receive.

## Scope

In scope:

- `cli/src/engine/adopt.ts` — add `.opencode/commands/**` to `OWNED_PATHS`.
- `odd/tasks/adopt-installs-commands.md` — this document.

Out of scope (unchanged, deliberately):

- Retirement of a stale `.opencode/commands/rapso-init.md` left by the retired `rapso-init.sh`.
  `adopt` can only remove a file it can prove is ours, and the old installer wrote that directory
  without any manifest recording it, so no hash evidence exists. A linked-manifest migration would
  be its own change.
- The five follow-ups recorded in `odd/tasks/setup-surface-cleanup.md`.

## Constraints

- No test harness and no lint script. Verification is `npm run typecheck`, `npm run build` (both from
  `cli/`), and real `adopt` runs on throwaway projects.
- Classification behaviour is not being changed. The install loop iterates **template** files, so
  adding a path to `OWNED_PATHS` cannot reach a file that is not in the template.

## Tasks

- [x] **T01** — Add `.opencode/commands/**` to `OWNED_PATHS` in `cli/src/engine/adopt.ts`.

## Acceptance criteria

1. `adopt --dry-run` on a project with no `.opencode/` lists `.opencode/commands/new-project.md`
   under `Created`.
2. A real `adopt` writes the file.
3. A second `adopt` is idempotent: `Created (0)`.
4. A user-authored command in `.opencode/commands/` is never mentioned in any plan category.
5. A **user-edited** `new-project.md` is reported `Conflicting` and its content survives.
6. The manifest records the path.

## Verification

1. `cd cli && npm run typecheck` and `npm run build` → exit codes.
2. `node cli/dist/index.js adopt . --dry-run` on a scratch project seeded with `AGENTS.md`,
   `.gitignore`, a git repo, and a user-authored `.opencode/commands/mi-comando.md`.
3. `adopt . --yes`, then inspect the directory and the user's file.
4. `adopt . --dry-run` again for idempotence.
5. Edit `new-project.md`, re-run, confirm `Conflicting` and that the content survives.
6. Read `.rapsodia-code/manifest.json`.
7. `git status --short` → only the intended paths.

## Evidence

### Typecheck and build

```
$ cd cli && npm run typecheck   → exit 0
$ cd cli && npm run build       → exit 0
```

### A — the command is now planned

```
ℹ Created (19):
ℹ   .opencode/agents/rapso-developer.md
ℹ   .opencode/agents/rapso-planner.md
ℹ   .opencode/commands/new-project.md
...
ℹ Conflicting (0):
ℹ Skipped (0):
```

The user's own command is invisible to the plan:

```
$ node cli/dist/index.js adopt . --dry-run | grep -c "mi-comando"
0
```

### B — a real adoption, and the user's file survives

```
$ node cli/dist/index.js adopt . --yes
ℹ Created (19):
✔ Rapsodia adopted successfully.

$ ls .opencode/commands/
mi-comando.md   new-project.md

$ cat .opencode/commands/mi-comando.md
mi comando propio
```

### C — idempotent

```
$ node cli/dist/index.js adopt . --yes
ℹ Created (0):
ℹ Skipped (26):
$ node cli/dist/index.js adopt . --dry-run | grep -E "Skipped \("
ℹ Skipped (26):
```

### D — a user-edited command is kept, not clobbered

```
$ echo "MI VERSION PERSONALIZADA" > .opencode/commands/new-project.md
$ node cli/dist/index.js adopt . --dry-run | grep -E "Conflicting|new-project"
ℹ Conflicting (1):
ℹ   .opencode/commands/new-project.md
⚠ Conflicting files are project-owned. Re-run with --force to overwrite them.

$ node cli/dist/index.js adopt . --yes >/dev/null
$ cat .opencode/commands/new-project.md
MI VERSION PERSONALIZADA
```

### E — the manifest records it

```
$ python3 -c "import json;d=json.load(open('.rapsodia-code/manifest.json'));print([f['path'] for f in d['files'] if 'commands' in f['path']])"
['.opencode/commands/new-project.md']
```

### Note on the tarball count

The plan lists 19 files both before and after this change, which is not a no-op: `new-project.md`
entered and `.opencode/tools/node_modules/.gitkeep` left. That `.gitkeep` is **untracked**, so it
exists on the main worktree's disk and not in a linked worktree — follow-up 5 of
`setup-surface-cleanup`. It means this worktree's template under-represents the one `main` builds,
and the verification above is honest about what it ran against.

## Follow-ups found, NOT fixed (out of scope)

1. **A stale `.opencode/commands/rapso-init.md` is not retired.** A project that ran the old
   `rapso-init.sh` carries it, and `#57` retired the command it installs. `adopt` cannot remove it:
   the old installer never recorded the directory in a manifest, so there is no hash proving the file
   is ours, and removing an unprovable file would be worse than leaving it. The reader deletes it by
   hand.

## Next step

Open the pull request for this branch. It is a patch on top of `1.0.3`; whether it becomes `1.0.4`
or rides along with the next change is a release decision, not this document's.
