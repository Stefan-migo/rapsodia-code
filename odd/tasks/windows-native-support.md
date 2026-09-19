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
- Behaviour on Linux and macOS must be **byte-identical to the base**. This change adds a Windows
  path; it does not alter the POSIX path.
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
| T2 | Delete the POSIX shell strings from dependency detection; resolve the executable instead | `deps.ts`, `utils/exec.ts` | [~] |
| T2b | Resolve the Python interpreter instead of hardcoding `python3` for the Graphify MCP server | `context.ts` | [~] |

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

**Reported, not fixed:** `cli/src/template/opencode.json:48` still hardcodes
`["python3", "-m", "graphify.serve", ...]`. That is the copy a **generated project** receives, so
it is the Windows-facing half of this same defect — and it is T8, still deferred. `checkDeps()` now
honestly reports Graphify as installed on a Windows machine whose generated project still carries a
broken MCP command.

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

## Next step

**Windows verification is done, and this branch is now a Windows support claim** for T1, T3, T4
and T10 (T11). One re-check remains: T2's own fix has not run on Windows.

The branch is pushed: `odd/windows-native-support` at `2aa6202` on
https://github.com/Stefan-migo/rapsodia-code. Note that this clone's `origin` still carries the
retired `Stefan-migo/Cortex.git` URL, which GitHub redirects to `rapsodia-code`; the push therefore
used the canonical URL explicitly rather than let a write depend on a redirect. The local remote URL
has not been changed.

**Re-verification required for T2.** Run the Windows battery on the release build, from a path with
spaces and parentheses (still the post-fix cross-spawn quoting regression test). The two new
surfaces are `rapso install` and the `context.ts` interpreter resolution.

One risk is unverifiable here and worth a deliberate look: `resolveExecutable` tests each candidate
with `accessSync(path, X_OK)`, and the Microsoft Store installs `python.exe`/`python3.exe` as App
Execution Alias reparse points, which that call can refuse. If it does, `resolvePythonCommand()`
reports a missing interpreter that `where python` can see. Report Node, git and Windows versions,
Developer Mode state, and the exit code plus full output of each step.

**Remaining scope, deferred and still open:** T5 (`session.ts` without `bash`), T6 (template
scripts — delete the redundant ones rather than port), T7 (template tools), T8 (template
`opencode.json` MCP commands — now the highest-value deferred item, see above), T9
(`rapso-init.sh` to a CLI subcommand). Maintainer-only surfaces (`.githooks/**`, `scripts/**`)
stay out of scope.

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
