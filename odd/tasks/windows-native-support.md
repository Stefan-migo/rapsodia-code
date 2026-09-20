# ODD Tasks — windows-native-support

Worktree: `/home/stefan/rapsodia-code-odd-windows-native-support`
Branch: `odd/windows-native-support`
Base: `54ab8cb` (origin/main, after PR #52 merged the 1.0.1 release)

## Objective

Make the published `rapsodia-code` CLI work on **native Windows** (cmd.exe / PowerShell), with
no WSL and no Git Bash. The generated project a Windows user receives must work too.

## Problem

Rapsodia 1.0.0 was developed and verified on Linux. Two independent classes of defect block
Windows, and only one of them announces itself.

**The loud class** — external tools cannot be launched. Windows resolves `npm`, `npx`,
`gentle-ai`, `graphify`, `opencode` and `engram` to `.cmd` shims. Every one of those is invoked
through `execFileSync`/`spawn` with no shell. Node has refused to spawn `.bat`/`.cmd` without
`shell: true` since the CVE-2024-27980 fix, shipped in 18.20.2, 20.12.2, 21.17.3 and 22.0.0.
The call fails with `EINVAL`.

The trap: the obvious fix (`shell: true` everywhere) is wrong. Passing arguments alongside
`shell: true` is deprecated by DEP0190 *because the arguments are not escaped*, which is the
exact injection class the CVE patch closed. The correct approach is the one Node's own docs
name: spawn `cmd.exe` and pass the file as an argument.

**The silent class** — path separators. `relative()` returns `\` on Windows. Those values are
then compared against slash-delimited patterns. Nothing throws; the comparisons simply return
`false`. `rapso adopt` and `rapso update` misclassify files, and a freshly created project
reports itself permanently stale.

## Why

The user explicitly wants native Windows support, not a WSL/Git Bash workaround. A compatibility
path that requires the user to install a POSIX shell first is not support.

Scope is deliberately split: only surfaces that **ship to a Windows user** gate this work.
`.githooks/**` and the repository's own `scripts/**` are maintainer-only — `.githooks` is
verified absent from `cli/src/template/`, so it never reaches a generated project.

## Findings

Evidence gathered by static audit at base `2e73cbc`. **No Windows runtime was available, so
none of this is a Windows execution certificate — see T11.**

### T1 — `.cmd` shims are unlaunchable

Every site launches without a shell, so each one raises `EINVAL` on Windows:

| Site | Command |
|---|---|
| `cli/src/engine/worktree.ts:192` | `npm ci` / `npm install` |
| `cli/src/engine/worktree.ts:200` | `gentle-ai skill-registry refresh` |
| `cli/src/engine/worktree.ts:305` | `graphify . --update` |
| `cli/src/engine/worktree.ts:39-41` | `which <command>` — no `which` on Windows at all |
| `cli/src/engine/session.ts:34,78` | `engram` (via `MCPClient`) |
| `cli/src/engine/session.ts:118` | `engram obsidian-export` |
| `cli/src/engine/context.ts:110` | `engram context` |
| `cli/src/engine/context.ts:141` | `python3` (via `MCPClient`) |
| `cli/src/utils/mcp.ts:24` | every MCP command (`engram`, `python3`, `npx`) |
| `cli/src/commands/start.ts:97` | `opencode` |
| `cli/src/commands/status.ts:69` | generic — used for `engram` (127,130) and `opencode` (137) |
| `cli/src/commands/analyze.ts:78` | shell-form `engram context "…"` |

### T2 — POSIX shell constructs in string commands

- `cli/src/engine/deps.ts:38` — `which engram 2>/dev/null || command -v engram 2>/dev/null`.
  `which`, `command -v`, `2>/dev/null` and `||` are all invalid in native `cmd.exe`.
- `cli/src/engine/deps.ts:46` — `python3 -c "import graphify" 2>/dev/null`. POSIX redirection,
  and `python3` frequently does not exist on Windows (it is `python` or the `py` launcher).
- `cli/src/commands/analyze.ts:78` — `engram context "${projectName}"` interpolates a
  user-controlled name into a shell string. This is both a Windows defect and an injection
  surface; it must become an argument array.

### T3 — Path separator defects (SILENT)

- `cli/src/engine/template.ts:41-54` — `collectFiles()` returns `relative()` output, which is
  backslash-delimited on Windows.
- `cli/src/engine/adopt.ts:48-53` — `matches()` compares those values against slash-delimited
  `OWNED_PATHS` patterns. Nested template files are misclassified.
- `cli/src/engine/manifest.ts:57` — the same comparison, against `ignoredPaths`.
- `cli/src/engine/manifest.ts:29` — `f.path.startsWith('.rapsodia-code/')` and `'.git/'` never
  match a backslash path, so **the manifest includes its own state and the git directory**.
- `cli/src/utils/defect.ts:35-36` — `value.startsWith(\`${cwd}/\`)` and the `home` equivalent
  miss Windows paths. Redaction still happens via the drive-letter fallback at `defect.ts:37`,
  so this is **not** a privacy leak — it only loses the specific `<cwd>`/`<home>` marker.

### T4 — Symlinks need privileges

- `cli/src/engine/worktree.ts:246` — `symlinkSync` for skill provisioning.
- `cli/src/engine/worktree.ts:255` — `symlinkSync` for `.env.local` / `projects.txt`, and it
  builds the target as `relative(target, main) + '/' + file` instead of using `join()`.

On Windows, symlink creation requires Developer Mode or elevation. Otherwise it fails and
`rapso worktree create` rolls the whole worktree back.

### T10 — `init.ts` accepts Windows-reserved names

- `cli/src/commands/init.ts:17-24` — `validateProjectName()` rejects spaces and
  `<>:"/\|?*`, but not the reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`,
  `LPT1`-`LPT9`) nor trailing dots/spaces. Windows silently normalizes or refuses these.

### Verified already cross-platform — do NOT "fix" these

- Every `git` invocation uses an argument array; `git.exe` resolves normally. (`worktree.ts:31-37`,
  `adopt.ts:247`, `status.ts:55-61`, `init.ts:74-85`)
- `cli/src/utils/config.ts` uses `os.homedir()`, not `$HOME`.
- `cli/src/engine/worktree.ts:133` already uses `path.sep`.
- `cli/src/engine/worktree.ts:127-132` already normalizes git's slash-delimited output.
- `cli/package.json` declares a normal `bin`, so npm generates `rapso.cmd` itself.
- `cli/esbuild.config.js` emits CommonJS for Node 18 with no POSIX dependency.

## Scope

**In scope (this batch):** T1, T3, T4, T10.

**Second batch — promoted by the Windows verification (2026-09-19):** T2 (`deps.ts` native
detection) plus the `context.ts` interpreter spawn it depends on. T2 was deferred in the first
batch; real Windows execution promoted it to blocking, because `rapso install` reports Engram and
Graphify as missing on a machine where both are installed, and `init` recommends `rapso install`
as its next step — so a Windows user hits it on their first command. T11 (real Windows
verification) is done.

**Deferred to a later batch (recorded, not forgotten):** T5 (`session.ts` without `bash`), T6
(template scripts — several duplicate existing CLI commands and should be **deleted**, not ported),
T7 (template tools `execute_script.ts`, `wiki-link.ts`, `wiki-search.ts`), T8 (template
`opencode.json` MCP commands), T9 (`rapso-init.sh` → CLI subcommand).

**Out of scope entirely:** `.githooks/**` (verified not shipped in `cli/src/template/`),
repository `scripts/**`, `cli/scripts/generate-retrospective.sh` — maintainer-only surfaces.

## Constraints

- **`cross-spawn` owns command-shim handling** (human decision, after the hand-rolled alternative
  was measured against it and lost). The first implementation resolved `.cmd`/`.bat` through
  `cmd.exe /d /s /c` with a hand-written escaper. Verification against cross-spawn's `escapeArgument`
  showed it diverged in five ways — most importantly it left `"` unescaped while caret-escaping
  `(`/`)` inside those same quotes, used the batch-file `%%` rule on a `cmd /c` command line, and
  covered a smaller metacharacter set (`[&|<>^()]` against
  `[()\][%!^"`<>&|;, *?]`). `C:\Program Files (x86)\` is a standard Windows directory, so the
  divergence was not theoretical. Escaping `cmd.exe` correctly is a notorious trap and it cannot be
  verified without Windows; a maintained implementation that carries years of torture tests is worth
  one bundled dependency. `cross-spawn` is pinned at `^7.0.6`, which carries the CVE-2024-21538
  ReDoS fix.
- **Bundled, so it rides in `devDependencies`.** `cli/esbuild.config.js` sets `bundle: true` with
  `platform: 'node'` and no `external` entries, so cross-spawn is inlined into `dist/index.js`.
  `commander`, `chalk` and `ora` already live in `devDependencies` for the same reason. Verify after
  every build that `require("cross-spawn")` does **not** appear in `dist/index.js`.
- **Never pass arguments with `shell: true`** — DEP0190, and it reintroduces the unescaped-argument
  class CVE-2024-27980 closed. `exec.ts` throws if a caller passes it.
- **`execFileSync` must keep Node's contract**, because 11 call sites depend on it: it throws on a
  non-zero status or a signal, and the thrown error carries `.status`, `.stdout`, `.stderr` and
  `.signal` (`cli/src/engine/deps.ts` reads those).
- Behaviour on Linux and macOS must be **byte-identical to the base**, with one accepted exception
  recorded in the sixth pass: `template/.opencode/skills/graphify/SKILL.md:60` spelled a bare `python`
  at the base and now emits `python3` through `{PYTHON_COMMAND}`. The human accepted the delta
  (2026-09-20) because `python` does not resolve on a POSIX box that ships only `python3`. This change
  adds a Windows path; it does not otherwise alter the POSIX path.
- Path comparisons must be normalized **without** changing what is stored. Stored metadata
  (manifest entries, `opencode.json.instructions`, prelude references) keeps POSIX separators —
  see the note at `odd/tasks/rename-rapsodia.md:183-186`, where exactly this mistake was caught
  and reverted in a previous change.

## Tasks

| ID | Task | Files | Status |
|----|------|-------|--------|
| T1 | Process-launch utility that resolves `.cmd`/`.bat` on win32, plus wiring every site in the T1 table | `cli/src/utils/exec.ts` (new) + 8 call sites | [x] |
| T3 | Normalize separators at the comparison sites, without changing stored values | `template.ts`, `manifest.ts`, `adopt.ts`, `defect.ts` | [x] |
| T4 | Symlink with a copy fallback when the platform refuses; `join()` instead of `+ '/' +` | `worktree.ts` | [x] |
| T10 | Reject Windows-reserved names and trailing dots/spaces | `init.ts` | [x] |
| T2 | Delete the POSIX shell strings from dependency detection; resolve the executable instead | `deps.ts`, `utils/exec.ts` | [x] |
| T2b | Resolve the Python interpreter instead of hardcoding `python3` for the Graphify MCP server | `context.ts` | [x] |
| T5 | Reach the `engram` wiki export when `bash` is unavailable | `session.ts` | [x] |
| T8 | Resolve the Python interpreter the generated project names for the Graphify MCP server | `template/opencode.json`, `template.ts` | [x] |
| T8b | Carry `{PYTHON_COMMAND}` in the remaining template docs, skills and scripts | 7 template files | [x] |
| T12 | Serialize the captured streams in the defect payload, and scrub a quoted path as a unit | `defect.ts` | [x] |
| T13 | Route the last two `child_process` bypasses through `utils/exec` | `init.ts`, `adopt.ts` | [x] |
| T6 | Delete the template scripts the CLI already provides | `template/scripts/generate-retrospective.sh` | [x] |
| T7 | Template tools — **kept**: the CLI has no sandbox, wiki-search or wiki-link equivalent | `template/.opencode/tools/**` | [ ] kept |
| T14 | Linux/POSIX confirmation pass: build, battery and byte-identity against `54ab8cb` | — (verification only) | [x] |

## Acceptance criteria

1. A single utility owns process launching, and no `execFileSync`/`spawn` call site in
   `cli/src/**` bypasses it for a command that Windows resolves to a `.cmd`/`.bat` shim.
2. On win32 the utility routes `.cmd`/`.bat` through `cmd.exe`; on POSIX it is a pass-through
   with no behavioural change.
3. Argument arrays are preserved everywhere — the `analyze.ts:78` shell-string interpolation is
   gone.
4. Path comparisons match on both separators; **stored** values remain POSIX.
5. `rapso worktree create` does not fail solely because symlink creation is unavailable.
6. `rapso init` refuses a reserved device name with a clear message.
7. `npm run typecheck` and `npm run build` pass in `cli/`.

## Verification

Run in `cli/`:

- `npm run typecheck` — must pass.
- `npm run build` — must pass.

There is **no test harness** in this repository (`vitest` is configured, zero test files,
`npm test` exits 1). Do not claim test coverage, and do not introduce a harness in this batch.

Beyond commands, verify by inspection and report honestly:

- POSIX equivalence: the diff must not change the POSIX code path's behaviour.
- Reserved names: `rapso init CON` (and `NUL`, `COM1`) must be refused.
- Separator handling: the comparison helpers must match both `/` and `\` inputs.

**Windows execution is not verifiable in this environment.** T11 carries that, and it is the
only thing that can turn this work into a Windows support claim.

## Progress

**T1 complete** — three commits, rebased onto `54ab8cb`:

```
38fb5fc feat(cli): add a process launcher that resolves Windows command shims
7cb48b1 refactor(cli): route CLI invocations through the process launcher
d3c7cad refactor(cli): delegate Windows command-shim handling to cross-spawn
```

`npm run typecheck` and `npm run build` both pass. `cross-spawn` is bundled into `dist/index.js`
(12 matches, no `require("cross-spawn")`).

### Rebase onto 54ab8cb

The branch was originally cut from `2e73cbc` (PR #51). Main had advanced to `54ab8cb` with PR #52,
which rewrote `cli/src/utils/mcp.ts` wholesale. Git auto-merged without a conflict, which is exactly
where a silent bad merge would hide, so the result was verified explicitly: the branch differs from
main in `mcp.ts` by the import swap **only**, and all five of PR #52's fixes survive
(`stderr?.resume()`, the non-JSON warning, the `clientInfo` bump, the `callTool` guard, and
`close()` settling in-flight requests). `canonicalSkillsRoot` from #51 is untouched.

### The review gate does not block, and that is a trap

`.gga` sets `STRICT_MODE="false"`, and `.githooks/pre-commit` runs `gga run || exit 1`. Because
strict mode is off, `gga` still exits `0` when it cannot parse a verdict, so the hook prints
`Allowing commit (STRICT_MODE=false)` and lets the commit through. **A commit landing is not
evidence that the review passed.** The `STATUS:` line has to be read explicitly.

This was measured, not assumed. Direct review of the T1 diff returns `STATUS: PASSED` — but `gga`
reports `Could not determine review status`, because its parser expects the verdict within the first
30 lines and the `opencode` provider answers as a full agent, pushing `STATUS:` far past that. This
is the exact false negative the `.gga` header already documents. Note the divergence: the delegated
writer reported `STATUS: FAILED` for the same commit where a direct run returned `PASSED`. The
verdict is not stable across runs, which is itself a reason not to treat the hook as a gate.

### Integrity check that looked like a defect and is not

The reviewer flagged `sha512-xxx6M2Ip...` in `cli/package-lock.json` for `@types/node@20.19.40`, and
this repository has a documented history of forged integrity hashes breaking `npm ci`
(`odd/tasks/template-lock-integrity.md`). It is genuine: the hash of the published tarball, fetched
and hashed directly, matches it byte for byte, `npm view` returns the same value, and a real
`npm ci` exits `0`. The `xxx` prefix is a real base64 coincidence. The T1 commit does not touch that
entry — its 12 lockfile lines are purely additive.

### T3, T4 and T10 committed

```
e30b62a fix(cli): compare template paths with normalized separators
d63fd9c fix(cli): fall back to copying when symlink creation is unavailable
30b049b fix(cli): reject Windows-reserved project names
```

Verified directly, not from the writer's report:

- **T3 works.** `rapso init` into a scratch project produces a manifest with 41 entries, **0** from
  `.rapsodia-code/`, **0** from `.git/`, and **0** containing a backslash. Before this change the
  manifest included its own state directory and the git directory on Windows.
- **T10's logic is correct but was verified in isolation**, because the check is win32-gated and
  cannot fire on this Linux box. The regex accepts `CON`, `CON.txt`, `NUL`, `COM1`, `aux`, `prn`,
  `lpt9`, `con.` and accepts `COM0`, `CON2`, `console`, `content`, `my-project`. The delegated
  writer reported having seen these rejections fire, which is not possible in this environment —
  treat that report as unverified.
- **T4's fallback is plausible by inspection** (a `symlinkOrCopy` helper copying on `EACCES`/`EPERM`)
  but the privilege failure cannot be triggered here, so it is unverified.

### Windows verification returned (2026-09-19) — T2 completed

The branch was executed on real Windows (Win 11 Pro build 26200, Node 24.11.1, npm 11.6.2, git
2.51.2.windows.1, Developer Mode **off**) from a path containing both spaces and parentheses.

- **T1, T3, T4 and T10 passed.** No `EINVAL`; the manifest carried no `.rapsodia-code/` or `.git/`
  entries; `CON`, `CON.txt`, `NUL` and `COM1` were refused and `okname` accepted; `LinkType` was
  empty, proving the symlink fallback copied.
- **T2 was promoted to blocking.** `rapso install` reported Engram and Graphify as missing on a
  machine where both were installed. `deps.ts` ran `which engram 2>/dev/null || command -v engram
  2>/dev/null` and `python3 -c "import graphify" 2>/dev/null` through `cmd.exe`. The `2>/dev/null`
  alone is fatal: cmd.exe tries to write stderr to a path literally named `\dev\null`.
- One premise in the verification report was wrong and is corrected here: **spaces and parentheses
  were never the trigger** for the `npm` failure. Published 1.0.0 fails identically from a clean
  path, because Node refuses to spawn `npm.cmd` without a shell. The spaced path is a post-fix
  regression test, not a reproduction.

**The shell strings were deleted, not ported.** `deps.ts` resolves instead of asking a shell:

```
run('node', ['--version'])               // was exec('node --version')
commandAvailable('engram')               // was the which / command -v pair
run(python, ['-c', 'import graphify'])   // was python3 -c "import graphify" 2>/dev/null
```

**A hole in the proposed fix was closed at the same time.** Replacing the Graphify probe with
`commandAvailable('graphify')` — the shape the verification report suggested — would have made
`checkDeps()` report Graphify as installed on a machine where the runtime path still cannot launch.
They are not the same predicate:

| Surface | Invocation | Needs |
|---|---|---|
| `worktree.ts:311` graph refresh | `graphify . --update` | the CLI on PATH |
| `context.ts:141` MCP server | `python3 -m graphify.serve` | an importable Python module |

Verified: `graphify --help` has **no `serve` subcommand**, so the MCP path cannot be collapsed into
the CLI. And python.org's Windows installer writes `python.exe`, not `python3.exe` — the
`python3.exe` alias comes from the Microsoft Store build. A CLI-only probe would therefore have
converted a loud failure into a silent one, which is the class §5 of the verification report warns
about.

One resolver now serves both surfaces: `resolvePythonCommand()` in `utils/exec.ts` (win32:
`python3` → `python` → `py`; POSIX: `python3`, deliberately unchanged so the POSIX path stays
byte-identical). `context.ts` uses it, and warns plus falls back to the static snapshot when no
interpreter exists instead of failing silently.

**Verified locally:** `npm run typecheck` and `npm run build` pass. `rapso install` reports all
three dependencies found. With an isolated PATH holding only `node`, it reports Node found and
Engram/Graphify missing without crashing. The bundle inlines `cross-spawn` (12 references, zero
`require("cross-spawn")`) and contains no `which engram`.

**Fixed in the second Windows pass:** `cli/src/template/opencode.json:48` hardcoded
`["python3", "-m", "graphify.serve", ...]`, the copy a **generated project** receives — the
Windows-facing half of this same defect, then still deferred as T8. The template now carries
`{PYTHON_COMMAND}` and the generator resolves it, so `checkDeps()` and the generated project agree.
See the second Windows pass above.

### Reported, not fixed

- **T4's copy fallback is not refreshed on a later provision.** The skills loop treats a real
  directory as project-owned and skips it, so a copy made because symlinks were unavailable is
  indistinguishable from a tracked project directory. A Windows user without Developer Mode gets
  copies on first provision and never gets a refresh. The ownership model was deliberately not
  redesigned here — this is the human's call.
- **T10 is win32-gated on purpose**, to keep POSIX behaviour unchanged. A project named `CON`
  created on Linux therefore still breaks when cloned to Windows. Whether the check should be
  universal is the human's call.

### The review gate cannot be trusted as a gate

See the section above: `gga` verdicts are not reproducible. Three commits were reported `FAILED` by
the delegated writers and returned `PASSED` on direct re-run, including one where the reviewer
stated "Found no coding-standard violations". **A writer's self-reported gga verdict must be
re-run, never accepted.**

### Second Windows pass (2026-09-19) — T2, T2b, T5 and T8 completed

Run on real Windows from `C:\Users\El Mismisimo\rapso (x86) test\` (spaces and parentheses), Node
24.11.1, npm 11.6.2, git 2.51.2.windows.1, Developer Mode off, no `SeCreateSymbolicLinkPrivilege`,
non-elevated. `npm run typecheck` and `npm run build` pass; `cross-spawn` stays bundled (12
references, zero `require("cross-spawn")`) and `which engram` is absent from `dist/index.js`.

**T2 did not pass on Windows, and the failure was the candidate ORDER, not the access check.** The
risk recorded below was wrong: `accessSync(path, X_OK)` does **not** refuse the Store reparse point
— measured `X_OK = OK` on `WindowsApps\python3.exe`, because Node's `X_OK` behaves like `F_OK` on
Windows. The real cause is that `python3` is tried first and resolves to the Store App Execution
Alias, which exists and resolves and then fails at launch with exit 49 ("Python was not found; run
without arguments to install from the Microsoft Store"). python.org installs `python.exe` only, so
on such a machine `python3` can never reach the real interpreter. `resolvePythonCommand()` now
**runs** a candidate before selecting it. Verified: `rapso install` reports all three dependencies
found, where the same tree reported `Graphify — not found` before the change.

**T2b was the same defect on the MCP path.** `context.ts` shares the resolver, so the MCP spawn was
equally dead — and the `!python` branch could never fire, because a resolved-but-dead alias is
non-null. The `"Graphify needs a Python interpreter on PATH"` warning is now reachable only when no
candidate runs at all.

**T8's template half is fixed, and the design decision is recorded.** The generated `opencode.json`
shipped `["python3", "-m", "graphify.serve", "graphify-out/graph.json"]` to every project — the
copy a Windows user receives. Option taken (resolver-at-generation, chosen by the human over a CLI
subcommand entrypoint and over a bare `python` literal): the template carries `{PYTHON_COMMAND}`
and `substituteVariables` resolves it. **That placement is the point.** `copyTemplate` and
`hashTemplateFile` both route through `substituteVariables`, so the manifest hash matches the bytes
actually written and `rapspo update` does not report the resolved value as drift — the failure mode
that made resolving after the copy unsafe. Verified: a fresh project writes `["python", ...]`, leaves
no placeholder behind, and `rapso update --dry-run` answers "Template is already up to date". POSIX
is byte-identical for the eight sites the base already spelled `python3`: the resolver returns
`python3` there, and so does the fallback when nothing resolves. **Corrected in the sixth pass:** the
ninth site, `graphify/SKILL.md:60`, was the one the base spelled `python`, so its POSIX output does
change — one accepted delta. The replacement is a function replacer on purpose — it runs only on a
match, so the interpreter probe costs one spawn instead of one per template file per loop.

**T5 is fixed and executed, not inferred.** The `engram obsidian-export` fallback was gated on the
script's existence, so a Windows box that carries the template script but no `bash` fell through to
the catch and degraded to a warning. The gate now also requires `commandAvailable('bash')`.
Verified by running `rapso close` with `PATH` reduced to node and engram alone — no `bash` visible
to node, WSL's `System32\bash.exe` included — and the export completed through the `engram` path.
With the normal PATH the script path is still taken, so the POSIX behaviour is unchanged.

**Battery, second pass.** `install` reports all three found; `init wprobe` and `init okname` exit 0;
the manifest carries no `.rapsodia-code/` or `.git/` entries; `CON`, `CON.txt`, `NUL` and `COM1` are
each refused with exit 1; `adopt --dry-run` on an empty directory reports `Created (17)`;
`worktree create wintest --yes` returns `created: true` and its `rapso-persona` skill has an empty
`LinkType` (`Attributes: Directory`), i.e. the copy fallback ran; `start --no-open` exits 0 and
writes the prelude.

**The pre-commit hook is not installed in a fresh clone.** `core.hooksPath` is unset and
`.git/hooks/` holds only `.sample` files, so the Atomicity Gate, the main-worktree guard and
`gga run` do not execute. Nothing in the repository wires it — `scripts/gga-pre-commit.sh` is a
separate legacy checker, not an installer. The main-worktree guard is therefore a convention in
practice, not the hard block it is documented as. Commits made during this pass landed without the
gate; they were verified by `typecheck`, `build` and live Windows execution instead. Wiring it is a
human decision: `core.hooksPath` is repository-wide, so enabling it would also block every staged
commit in the main worktree, not only code.

**`worktree create` cannot run from a linked worktree.** It refuses with "Worktree creation must
start from the main worktree" (`isMainWorktree` at `worktree.ts:172`), so the battery step that
exercises it has to run from a main worktree — this pass ran it from a main worktree checked out on
the branch. Worth knowing before following the "work only in `..\wt`" instruction literally, since
the two instructions conflict.

### Third Windows pass (2026-09-19) — the remaining template interpreter sites (T8b)

The template carried seven more hardcoded `python3` literals, plus an eighth site the inventory had
missed: `template/.opencode/skills/graphify/SKILL.md:60` named a bare `python`, which is wrong in the
opposite direction — it does not resolve on a POSIX box that ships only `python3`. All eight sites now
carry `{PYTHON_COMMAND}` through the T8 mechanism, with no new machinery:
`.opencode/agents/rapso-developer.md` (two occurrences), `.opencode/skills/bootstrap/SKILL.md`,
`.opencode/skills/graphify/SKILL.md`, `AGENTS.md`, `SYSTEM-MAP.md`, `USER-GUIDE.md` and
`scripts/install-deps.sh` — the last of which is short-lived if T6 deletes the script.

**The probe had to be memoized, and the count is why.** A function replacer runs once per match, and
both `copyTemplate` and the manifest route through `substituteVariables`, so the eight occurrences
asked for the interpreter sixteen times per `init`. Each probe spawns twice on this machine, because
`python3` is tried first and fails: the Store App Execution Alias takes 0.339s to exit 49, against
0.136s for the real `python`. `resolvePythonCommand` now caches its result for the process, so the
cost is one probe instead of sixteen. `rapso init` measures 2.48s.

**Verified by execution, from `C:\Users\El Mismisimo\rapso (x86) test\`.** `init pprobe1` exits 0 and
all eight generated sites read `python`; no `{PYTHON_COMMAND}` survives anywhere in the project;
`update --dry-run` answers "Template is already up to date" and the generated repository's
`git status` is clean, so the manifest still matches the bytes that were written — the property T8's
placement exists to protect, now holding for eight files instead of one; `install` still reports all
three dependencies found; `adopt --dry-run` still reports `Created (17)`. `npm run typecheck` and
`npm run build` pass. POSIX is unchanged by construction, because the resolver returns `python3`
there and the fallback does too — but the Linux confirmation pass is still owed, see below.

### Fourth Windows pass (2026-09-19) — the defect payload, the scrub gap and the last two bypasses

**T12 — the report dropped the one line that explains the failure.** `exec.ts` attaches `status`,
`stdout` and `stderr` to the error it throws, and `formatDefectReport` serialized only `message`.
Baseline measured on Windows, in a directory that is not a repository: `rapso worktree create
shimprobe --yes` printed `"message": "Command failed: git"` and nothing else. The payload now carries
`exitStatus`, `signal`, `stdout` and `stderr` — both streams scrubbed, capped at 4000 characters
each, omitted when empty — and the same run reports `"exitStatus": 128` with
`"stderr": "fatal: not a git repository (or any of the parent directories): .git\n"`.

**Adding stderr surfaced a real gap in `scrub`, and it is closed.** git quotes a path that contains a
space, and the flag-shaped `QUOTED_VALUE` pass only reaches a quoted value that follows a flag — so
`fatal: not a git repository: 'C:\Users\El Mismisimo\...'` was split on whitespace, its head redacted
as a whitespace-delimited absolute path and its tail left readable in a public issue body. The
contract lists "absolute paths ... embedded in a quoted value" as something `scrub` must redact, so
this was a violation of the written contract, not a request for a wider one. A `QUOTED_RUN` pass now
redacts a quoted run as a unit, opening only at the start of a word so the apostrophe in `it's` cannot
pair with the quote that opens a path after it. URLs and already-redacted values are skipped, because
the token pass would otherwise append a second `<redacted>`.

**Still outside the contract, deliberately.** A path with a space that git did *not* quote, and a
`cwd`/`HOME` prefix that contains a space, still split and keep only their head redacted:
`cannot change to C:\Users\El Mismisimo\x.txt` becomes `cannot change to <path> Mismisimo\x.txt`. The
contract scopes path redaction to "a whitespace-delimited value" and embraces bounded false
negatives, so this is recorded rather than fixed, and a `ponytail:` comment names the ceiling. `-p`
is not redacted either: the contract names the credential words explicitly and `p` is not one.

**T13 — the last two `child_process` bypasses.** `init.ts` passed shell strings to `execSync`
(`git commit -m "Initial commit from Rapsodia template"` and four more) and `adopt.ts` imported
`execFileSync` from `child_process` directly. Both now route through `utils/exec` with argument
arrays, so acceptance criterion 1 holds: the only `child_process` imports left in `cli/src/**` are the
two type-only ones in `utils/exec.ts` and `utils/mcp.ts`.

The port had one trap. `execSync` folds stdout and stderr into `message`, so
`msg.includes('nothing to commit')` worked; the utility keeps the streams on the error, where
`message` is only `Command failed: git`. The check now searches both streams, and the branch was
finally exercised rather than assumed: with `GIT_CONFIG_GLOBAL` pointing at a config whose
`core.excludesFile` ignores everything, `git add -A` stages nothing, `git commit` exits 1, and `init`
correctly answers "Git repository already initialized" instead of warning.

**Battery, fourth pass.** `init gitinit` exits 0 and creates the initial commit under the
`Rapsodia Template` author; `init nogit --no-git` exits 0 and writes no `.git`; the ignore-all run
above exits 0; `adopt --dry-run` resolves `isDirty` inside a repository (no warning) and still reports
"Could not determine whether the working tree is dirty" outside one; `npm run typecheck` and
`npm run build` pass; `cross-spawn` stays bundled (12 references, zero `require("cross-spawn")`).

### Fifth Windows pass (2026-09-19) — T6 scoped to the one file that was actually redundant

**The task premise was wrong, and the measurement is the record.** T6 recorded that "several" template
scripts duplicate existing CLI commands. Reading all seven files in T6/T7 scope and searching every
reference found **one** that is pure redundancy: `scripts/generate-retrospective.sh`, whose entire body
is `rapso close --retrospective "$@"` — a wrapper that re-invokes the CLI, under a header comment
("Called by: rapso close --retrospective") that inverts the relationship, because the CLI never calls
it. It is deleted. The other six are kept, because each is the only provider of something:

| File | Why it stays |
|------|--------------|
| `scripts/engram-export-wiki.sh` | the export is duplicated (`session.ts:121`) but the `wiki/log.md` append is not, and 6 shipped files reference it |
| `scripts/install-deps.sh` | `rapso install` only *detects* (`install.ts:49-61`); nothing in the CLI runs `pip install graphifyy` |
| `scripts/setup.sh` | the only writer of `.planning/` |
| `.opencode/tools/execute_script.ts` | no CLI sandbox; referenced by 4 shipped docs |
| `.opencode/tools/wiki-link.ts` | no CLI link-graph analysis |
| `.opencode/tools/wiki-search.ts` | no CLI wiki search |

T7 is therefore closed as "kept", not as "deleted".

**Verified by execution.** `init afterdel` exits 0 and copies 40 files (was 41); `afterdel/scripts/`
holds the three remaining scripts; no shipped file references the deleted one (`grep -rn
generate-retrospective cli/src/template/` is empty). `update --check` on a project generated *before*
the deletion reports `3 file(s) removed from template (not deleted from project)` — one more than the
two it reported before, which is exactly this deletion — and nothing is removed from the project.

**Two pre-existing reporting defects, surfaced here and deliberately not fixed.** They are why the
deletion above is hard to see, and neither is caused by it:

- `detectChanges` (`manifest.ts:111-115`) flags every manifest path absent from the template, and
  `init` tracks `.gitignore` and `.opencode/.gitignore` — files the CLI writes itself (`init.ts:72`,
  because npm cannot publish a file named `.gitignore`). So **every** generated project reports 2
  phantom removals on every run, forever, and a real removal drowns in that noise.
- `update --dry-run` short-circuits at `update.ts:114` when nothing was added, modified or
  user-modified, before the removal block at `:142`, so it answers "Template is already up to date"
  while `--check` prints the removals. `--check` is the mode that reports them.

Also surfaced and not actioned: `template/.opencode/skills/rapso-session/SKILL.md:149,159` instructs
every generated project to use `scripts/rapso-sync.sh`, which does not ship in the template (only the
repository root has it) and has no `rapso sync` subcommand to replace it — a dangling instruction in
every generated project. And `rapso close --no-export` is cosmetic: `close.ts:83` calls `closeSession`
unconditionally and `session.ts:107-130` always exports, so the flag only gates a console step.

### Sixth pass (Linux confirmation, 2026-09-19) — the owed POSIX pass, and one accepted delta

The Linux confirmation the fifth pass left owed ran at `38c31e7` on Linux (Node 22.22.2, npm 10.9.7,
git 2.55.0). `npm ci`, `npm run typecheck` and `npm run build` all exit 0.

| Command | Exit | Result |
|---|---|---|
| `rapso init probe1` | 0 | Copied 40 files, initial commit created |
| `rapso init probe2 --no-git` | 0 | no `.git` written |
| `rapso install` | 0 | Node, Engram, Graphify all found |
| `rapso adopt --dry-run` (empty dir) | 0 | Created (17), Conflicting (0) |
| `rapso update --check` | 0 | 40 tracked, "2 file(s) removed", up to date |
| `rapso worktree create t --yes` | 1 | see below — pre-existing, not a regression |
| `rapso start --no-open` | 0 | `prelude.md` written (1193 bytes) |
| `rapso close --message "linux"` | 0 | wiki exported |
| `rapso init CON CON.txt NUL COM1` | 0 | all four accepted on Linux |
| `init` with `git add -A` staging nothing | 0 | "Git repository already initialized", no warning |

**Byte-identity does not hold. Exactly one content delta.** `git worktree add /tmp/base 54ab8cb`,
both builds generated the same project name on the same day, and `diff -r -x .git` reports three
differences, all from one cause:

- `.opencode/skills/graphify/SKILL.md:60` — base emits `python`, the branch emits `python3`.
- `.rapsodia-code/manifest.json` — the recorded hash of that file, a consequence of the same delta.
- `scripts/generate-retrospective.sh` — absent, exactly as the fifth pass declared.

**The sentence "POSIX is byte-identical" (third pass) is wrong for that one site, and this doc already
carried the evidence.** The third pass named it: "*an eighth site the inventory had missed ...
`graphify/SKILL.md:60` named a bare `python`*". A site the base spelled `python` cannot emit `python3`
and stay byte-identical. The claim held only for the **eight** occurrences the base already spelled
`python3`; this ninth one necessarily changes.

**Accepted by the human on 2026-09-20: the delta stays.** `python` does not resolve on a POSIX box
that ships only `python3` — the exact defect the third pass recorded for this site. Reverting would
preserve the invariant by keeping the template broken on Linux. The constraint is amended below; the
criterion is now "byte-identical except this one accepted normalization", not "byte-identical".

**Why POSIX emits `python3` — measured, and the recorded mechanism was not the reason.**
`resolvePythonCommand()` does not return the resolved path. `candidates.find(usable)` returns the
**element**, so it yields the candidate *name*:

```
resolveExecutable('python3')  ->  "/usr/bin/python3"
resolvePythonCommand()        ->  "python3"
```

That is neither the doc's "the resolver returns `python3` there" nor a leak of the absolute path. The
`?? 'python3'` fallback is unreachable on POSIX whenever the resolver runs, and a Windows run that
resolves `python` emits `python` — so the memo added by the third pass is real but inert on POSIX as a
consequence of `find`'s return value, not of the resolver "returning `python3`". A bundled esbuild
probe against `src/utils/exec.ts` produced both lines above on this machine; a first hypothesis that
POSIX would leak `/usr/bin/python3` into `opencode.json` was refuted by the same probe.

**`worktree create` exits 1 in a fresh project, on both builds.** The generated project has no
`origin`, and the command runs `git fetch origin main`. Measured against the base build at
`/tmp/base`: identical failure, identical exit code. **Pre-existing, not a regression.** With a remote
present it returns exit 0 and creates the worktree on `odd/t`. The fifth pass's note that it refuses
from a linked worktree still holds; this is a second, independent precondition.

**One diagnostics regression, recorded not fixed.** `exec.ts` throws
`new Error('Command failed: ' + command)`, dropping argv: the same git failure reads
`Command failed: git -C <cwd> fetch origin main` at the base and `Command failed: git` on the branch.
The fourth pass deliberately added structured `exitStatus`/`stderr` to the payload, so the explaining
line survives there — but a caller reading `error.message` alone loses the subcommand. Small, and the
human's call.

**Merge state.** The branch is 1 commit behind `origin/main` (`c650dc1`). `git merge-tree --write-tree
HEAD origin/main` is clean — no conflicts — even though main's `c650dc1` touched four of the same
template files (`AGENTS.md`, `.opencode/agents/rapso-developer.md`, `SYSTEM-MAP.md`, `USER-GUIDE.md`).
Main added no new bare `python` literal, so placeholder coverage stays complete after the merge.

**Correction to the earlier count.** The third pass recorded "eight sites"; the inventory is **nine
occurrences across eight files** (`rapso-developer.md` carries two). The base spelled eight of them
`python3` and one `python`.

## Next step

**Windows verification is done and this branch is a Windows support claim** for T1, T2, T2b, T3,
T4, T5, T8 and T10 (T11).

The branch is pushed: `odd/windows-native-support` at `2aa6202` on
https://github.com/Stefan-migo/rapsodia-code. Note that this clone's `origin` still carries the
retired `Stefan-migo/Cortex.git` URL, which GitHub redirects to `rapsodia-code`; the push therefore
used the canonical URL explicitly rather than let a write depend on a redirect. The local remote URL
has not been changed.

**Re-verification required for T2.** Run the Windows battery on the release build, from a path with
spaces and parentheses (still the post-fix cross-spawn quoting regression test). The two new
surfaces are `rapso install` and the `context.ts` interpreter resolution.

One risk was recorded here and has since been measured and **refuted**: `resolveExecutable` tests
each candidate with `accessSync(path, X_OK)`, but that call does **not** reject the Microsoft Store
App Execution Alias reparse points — Node's `X_OK` behaves like `F_OK` on Windows. The interpreter
failure came from the candidate order instead. See the second Windows pass above.

**Remaining scope, deferred and still open:** T9 (`rapso-init.sh` to a CLI subcommand), and the two
pre-existing reporting defects recorded in the fifth pass (the phantom `.gitignore` removals and
`--dry-run` hiding removals). T2, T2b, T5, T6, T8, T8b, T12 and T13 are closed; T7 is closed as
"kept, because the CLI does not cover those capabilities". Maintainer-only surfaces (`.githooks/**`,
`scripts/**`) stay out of scope.

**POSIX confirmation pass: done (sixth pass).** `npm ci`, `npm run typecheck`, `npm run build` and the
full battery ran on Linux at `38c31e7`, all green, and a generated project was diffed against the base
build. The result is **not** byte-identical: exactly one file differs, by the accepted `python` →
`python3` normalization recorded in the sixth pass. The claim above — "byte-identical by construction,
because the resolver returns `python3` on POSIX" — named the wrong mechanism: the resolver returns the
candidate *name*, which happens to be `python3`, and the base site that carried a bare `python` could
therefore not match.

**Surfaced by the Windows run, not yet actioned — none of these are in scope for T2:**

- `installDependencies` discards the underlying cause in a bare `catch {}` (`worktree.ts:199`), so
  an operator gets no way to diagnose a failure.
- `adopt.ts:1` is the last module importing `execFileSync` from `child_process` rather than
  `utils/exec`. It only calls `git`, which resolves as `git.exe`, so it works today.
- The `ini@7.0.0` `EBADENGINE` warning traces to `.opencode/tools/package.json` declaring
  `"@opencode-ai/plugin": "latest"` — an unpinned range that lets a fresh install resolve past the
  committed lockfile. `cli/package-lock.json` contains no `ini` at all, so the `cli` engines range
  is not the cause.
- `worktree.ts:177` bases a new worktree on `origin/main` explicitly. That is intentional, not an
  accident; the verification report asked for it to be confirmed.
